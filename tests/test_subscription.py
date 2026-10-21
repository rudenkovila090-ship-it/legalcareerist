import datetime as dt
import json

import pytest

from bridge.engine import Engine
from bridge.flows import load_flows
from bridge.store import Store
from bridge.subscription import compose, load_subscription, sample_messages
from bridge.tgbot import LeadBot, TelegramError
from conftest import ROOT
from test_tgbot import CLIENT, MANAGERS, FakeAPI, from_managers, make_settings, private, run

PATH = str(ROOT / "config" / "subscription.json")
ME = 42  # id менеджера в from_managers
TODAY = dt.date(2026, 10, 21)


class StrictAPI(FakeAPI):
    """Telegram не даёт писать тому, кто не нажимал «Старт» у бота."""

    def __init__(self, blocked=(), managers=()):
        super().__init__()
        self.blocked = {str(b) for b in blocked}
        self.managers = {str(m) for m in managers}

    async def get_chat_member(self, chat_id, user_id):
        if str(user_id) not in self.managers:
            raise TelegramError("getChatMember: Bad Request: user not found (HTTP 400)")
        return {"status": "member"}

    async def send_message(self, chat_id, text, **kw):
        if str(chat_id) in self.blocked:
            raise TelegramError("sendMessage: Forbidden: bot can't initiate conversation with a user (HTTP 403)")
        return await super().send_message(chat_id, text, **kw)


def make_bot(clock, api, path=PATH):
    settings = make_settings(subscription_path=path)
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    store = Store(":memory:")
    return LeadBot(settings, api, Engine(flows, store, clock=clock), flows, store, clock)


def test_shipped_texts_are_valid_and_filled_in():
    texts = load_subscription(PATH)
    paid, reminder, charged = sample_messages(texts, "Иван", TODAY)
    assert "оплата прошла" in paid and "Иван" in paid and "до 20.11.2026" in paid and "350 ₽" in paid
    assert "24.10.2026" in reminder and "/unsubscribe" in reminder and "350 ₽" in reminder
    assert "Списали 350 ₽" in charged and "20.11.2026" in charged
    for message in (paid, reminder, charged):
        assert "{" not in message and "}" not in message


def test_name_with_braces_cannot_break_the_text():
    text = compose("{first_name}, спишем {amount}", "{plan}{x}", "П", "100 ₽", "д", "у")
    assert text == "{plan}{x}, спишем 100 ₽"


def test_missing_name_still_reads_well():
    assert compose("{first_name}, оплата прошла", None, "П", "1 ₽", "д", "у") == "Оплата прошла"


def test_load_rejects_typos_and_missing_texts(tmp_path):
    good = json.loads(open(PATH, encoding="utf-8").read())
    bad_field = tmp_path / "a.json"
    bad_field.write_text(json.dumps({**good, "paid": "Оплата {amout}"}), encoding="utf-8")
    with pytest.raises(ValueError, match="amout"):
        load_subscription(str(bad_field))
    missing = tmp_path / "b.json"
    missing.write_text(json.dumps({"paid": "x"}), encoding="utf-8")
    with pytest.raises(ValueError, match="reminder"):
        load_subscription(str(missing))


def test_testsub_sends_three_messages_to_the_manager_in_private(clock):
    api = StrictAPI()
    run(make_bot(clock, api), from_managers("/testsub"))
    private = [c[2] for c in api.sent_to(ME)]
    assert len(private) == 4 and private[0].startswith("Тест:")  # пояснение и три сообщения
    assert "оплата прошла" in private[1] and "Менеджер" in private[1]
    assert "/unsubscribe" in private[2] and "Списали" in private[3]
    assert api.sent_to(MANAGERS)[-1][2] == "Тест отправлен вам в личные сообщения."


def test_testsub_explains_what_to_do_if_manager_never_started_the_bot(clock):
    api = StrictAPI(blocked=[ME])
    run(make_bot(clock, api), from_managers("/testsub"))
    assert "нажмите «Старт»" in api.sent_to(MANAGERS)[-1][2]


def test_testsub_reports_broken_texts_instead_of_crashing(clock, tmp_path):
    broken = tmp_path / "s.json"
    broken.write_text("{}", encoding="utf-8")
    api = StrictAPI()
    run(make_bot(clock, api, str(broken)), from_managers("/testsub"))
    assert "Не удалось прочитать тексты" in api.sent_to(MANAGERS)[-1][2] and api.sent_to(ME) == []


def test_testsub_also_works_in_private_chat_for_managers(clock):
    api = StrictAPI(managers=[CLIENT])
    run(make_bot(clock, api), private("/testsub"))
    texts = [c[2] for c in api.sent_to(CLIENT)]
    assert len(texts) == 4 and "оплата прошла" in texts[1] and "Списали" in texts[3]  # без лишнего «тест отправлен»


def test_testsub_in_private_chat_is_ignored_for_strangers(clock):
    api = StrictAPI()
    run(make_bot(clock, api), private("/testsub"))
    assert not any("оплата прошла" in c[2] or "Тест:" in c[2] for c in api.sent_to(CLIENT))
