import asyncio
import csv
import io
import logging

import httpx
import pytest

from bridge.config import TelegramSettings
from bridge.engine import Engine
from bridge.flows import load_flows
from bridge.logging_setup import setup_logging
from bridge.store import Store
from bridge.tgbot import FAIL, LeadBot, TelegramAPI, TelegramError, leads_csv, preflight
from conftest import ROOT

MANAGERS = "-100500"
CLIENT = 777


class FakeAPI:
    """Подмена Bot API: запоминает вызовы, ничего не отправляет."""

    def __init__(self):
        self.calls: list[tuple] = []
        self._ids = iter(range(1000, 9999))
        self.fail_copy = False

    async def send_message(self, chat_id, text, *, html=False, reply_markup=None, reply_to=None):
        self.calls.append(("send", str(chat_id), text, reply_markup, reply_to, html))
        return {"message_id": next(self._ids)}

    async def copy_message(self, chat_id, from_chat_id, message_id):
        if self.fail_copy:
            raise TelegramError("copyMessage: Forbidden: bot was blocked by the user (HTTP 403)")
        self.calls.append(("copy", str(chat_id), str(from_chat_id), message_id))
        return {"message_id": next(self._ids)}

    async def send_document(self, chat_id, filename, content, caption=""):
        self.calls.append(("doc", str(chat_id), filename, content, caption))
        return {"message_id": next(self._ids)}

    def sent_to(self, chat_id):
        return [c for c in self.calls if c[0] == "send" and c[1] == str(chat_id)]


def make_settings(privacy_url="", **kw):
    return TelegramSettings(
        bot_token="123:secret-token",
        manager_chat_id=MANAGERS,
        flows_path=str(ROOT / "config" / "flows.json"),
        privacy_url=privacy_url,
        **kw,
    )


@pytest.fixture(params=["no-consent", "consent"])
def bot_env(request, clock):
    settings = make_settings(privacy_url="https://example.com/privacy" if request.param == "consent" else "")
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    store = Store(":memory:")
    engine = Engine(flows, store, human_mode_hours=settings.human_mode_hours, clock=clock)
    api = FakeAPI()
    bot = LeadBot(settings, api, engine, flows, store, clock)
    bot.consent = request.param == "consent"
    return bot, api, store


_update_id = iter(range(1, 10_000))


def private(text=None, *, user_id=CLIENT, username="ivan", first="Иван", **extra):
    msg = {
        "message_id": next(_update_id),
        "chat": {"id": user_id, "type": "private"},
        "from": {"id": user_id, "first_name": first, "username": username, "is_bot": False},
        **extra,
    }
    if text is not None:
        msg["text"] = text
    return {"update_id": next(_update_id), "message": msg}


def from_managers(text=None, *, reply_to=None, **extra):
    msg = {
        "message_id": next(_update_id),
        "chat": {"id": int(MANAGERS), "type": "supergroup"},
        "from": {"id": 42, "first_name": "Менеджер", "is_bot": False},
        **extra,
    }
    if text is not None:
        msg["text"] = text
    if reply_to is not None:
        msg["reply_to_message"] = {"message_id": reply_to}
    return {"update_id": next(_update_id), "message": msg}


def run(bot, *updates):
    async def go():
        for update in updates:
            await bot.handle_update(update)

    asyncio.run(go())


def walk_to_lead(bot, api, segment_button="Ищу работу юристом", answers=("Корпоративное право, 7 лет", "Москва, гибрид", "здесь")):
    run(bot, private("/start ig_post_oct17"), private(segment_button))
    if bot.consent:
        run(bot, private("Да, согласен(а)"))
    for answer in answers:
        run(bot, private(answer))


# ---------------------------------------------------------------- клиентский сценарий
def test_start_shows_menu_with_buttons_and_records_source(bot_env):
    bot, api, store = bot_env
    run(bot, private("/start ig_post_oct17"))
    _, chat, text, markup, _, _ = api.calls[-1]
    assert chat == str(CLIENT) and "Чем можем помочь" in text
    assert [b[0]["text"] for b in markup["keyboard"]][:2] == ["Юридическая помощь (для себя или бизнеса)", "Подбор юриста в команду"]
    assert store.get_conv(f"tg:{CLIENT}").source == "ig_post_oct17"


def test_source_payload_is_sanitized(bot_env):
    bot, _, store = bot_env
    run(bot, private("/start ev<b>il&x=1"))
    assert store.get_conv(f"tg:{CLIENT}").source == "evbilx1"


def test_full_flow_ends_with_lead_card_for_managers(bot_env):
    bot, api, store = bot_env
    walk_to_lead(bot, api)
    cards = api.sent_to(MANAGERS)
    assert len(cards) == 1
    _, _, card, _, _, html = cards[0]
    assert html and "Новая заявка из Telegram" in card
    assert "Кандидат" in card and "ig_post_oct17" in card
    assert "Корпоративное право, 7 лет" in card
    assert 'href="https://t.me/ivan"' in card and "tg://user?id=777" in card
    assert store.count_leads() == 1
    # клиенту ушло подтверждение, клавиатура убрана
    _, chat, text, markup, _, _ = api.sent_to(CLIENT)[-1]
    assert "Заявка передана менеджеру" in text and markup == {"remove_keyboard": True}


def test_consent_step_only_when_privacy_url_is_set(bot_env):
    bot, api, store = bot_env
    run(bot, private("/start"), private("Ищу работу юристом"))
    last = api.sent_to(CLIENT)[-1]
    if bot.consent:
        assert "https://example.com/privacy" in last[2]
        assert [b[0]["text"] for b in last[3]["keyboard"]] == ["Да, согласен(а)", "Нет"]
        assert store.get_conv(f"tg:{CLIENT}").state == "consent"
    else:
        assert "специализация" in last[2] and store.get_conv(f"tg:{CLIENT}").state == "question"


def test_declining_consent_stores_nothing():
    settings = make_settings(privacy_url="https://example.com/privacy")
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    store = Store(":memory:")
    api = FakeAPI()
    bot = LeadBot(settings, api, Engine(flows, store), flows, store)
    run(bot, private("/start"), private("1"), private("Нет"))
    assert "ничего не сохраняем" in api.sent_to(CLIENT)[-1][2]
    assert store.count_leads() == 0 and store.get_conv(f"tg:{CLIENT}").state == "idle"


def test_shared_contact_counts_as_answer(bot_env):
    bot, api, store = bot_env
    run(bot, private("/start"), private("Сообщество и мероприятия"))
    if bot.consent:
        run(bot, private("Да, согласен(а)"))
    run(bot, private("Мероприятия"), private(None, contact={"phone_number": "+79990000000"}))
    assert "+79990000000" in api.sent_to(MANAGERS)[-1][2]


def test_group_chats_and_bots_are_ignored(bot_env):
    bot, api, _ = bot_env
    stranger = private("привет")
    stranger["message"]["chat"] = {"id": -999, "type": "group"}
    robot = private("привет", user_id=5)
    robot["message"]["from"]["is_bot"] = True
    run(bot, stranger, robot)
    assert api.calls == []


def test_chatid_works_anywhere(bot_env):
    bot, api, _ = bot_env
    update = private("/chatid@LegalcareeristBot")
    update["message"]["chat"] = {"id": -777, "type": "group"}
    run(bot, update)
    assert api.calls == [("send", "-777", "ID этого чата: -777", None, None, False)]


# ---------------------------------------------------------------- менеджеры
def test_manager_reply_reaches_client_and_pauses_bot(bot_env, clock):
    bot, api, store = bot_env
    walk_to_lead(bot, api)
    card_id = bot.store.client_for_card  # noqa: F841 (проверяем маппинг ниже)
    card_message_id = next(i for i in range(1000, 1100) if store.client_for_card(MANAGERS, i))
    api.calls.clear()

    run(bot, from_managers("Здравствуйте! Давайте созвонимся", reply_to=card_message_id))
    copies = [c for c in api.calls if c[0] == "copy"]
    assert copies == [("copy", str(CLIENT), MANAGERS, copies[0][3])]
    assert "✅ Отправлено клиенту" in api.sent_to(MANAGERS)[-1][2]
    conv = store.get_conv(f"tg:{CLIENT}")
    assert conv.state == "human" and conv.human_until > clock.now

    # клиент отвечает: бот молчит, менеджер получает сообщение с кнопкой ответа
    api.calls.clear()
    run(bot, private("Хорошо, в 15:00"))
    assert api.sent_to(CLIENT) == []
    forwarded = api.sent_to(MANAGERS)
    assert len(forwarded) == 1 and "Хорошо, в 15:00" in forwarded[0][2]

    # можно продолжать ответом на подтверждение бота
    ack_id = next(i for i in range(1000, 1100) if store.client_for_card(MANAGERS, i) and i != card_message_id)
    api.calls.clear()
    run(bot, from_managers("Отлично", reply_to=ack_id))
    assert any(c[0] == "copy" for c in api.calls)


def test_manager_message_without_reply_or_with_unknown_reply_is_ignored(bot_env):
    bot, api, _ = bot_env
    run(bot, from_managers("обсуждаем между собой"), from_managers("ответ на чужое", reply_to=123456))
    assert api.calls == []


def test_manager_reply_to_blocked_client_reports_failure(bot_env):
    bot, api, store = bot_env
    walk_to_lead(bot, api)
    card_message_id = next(i for i in range(1000, 1100) if store.client_for_card(MANAGERS, i))
    api.fail_copy = True
    api.calls.clear()
    run(bot, from_managers("Здравствуйте", reply_to=card_message_id))
    assert "❌ Не доставлено" in api.sent_to(MANAGERS)[-1][2]
    assert store.get_conv(f"tg:{CLIENT}").state == "done"  # состояние не тронуто


def test_commands_work_only_in_manager_chat(bot_env):
    bot, api, _ = bot_env
    run(bot, private("/export"), private("/leads"))
    assert not [c for c in api.calls if c[0] == "doc"]
    assert all("Последние заявки" not in c[2] for c in api.calls if c[0] == "send")


def test_leads_and_export_commands(bot_env):
    bot, api, _ = bot_env
    run(bot, from_managers("/leads"))
    assert api.sent_to(MANAGERS)[-1][2] == "Заявок пока нет."
    walk_to_lead(bot, api)
    api.calls.clear()
    run(bot, from_managers("/leads"), from_managers("/export"))
    assert "Кандидат" in api.sent_to(MANAGERS)[-1][2] and "ig_post_oct17" in api.sent_to(MANAGERS)[-1][2]
    doc = next(c for c in api.calls if c[0] == "doc")
    rows = list(csv.reader(io.StringIO(doc[3].decode("utf-8-sig"))))
    assert rows[0][:5] == ["№", "Дата (UTC)", "Канал", "Источник", "Сегмент"]
    assert rows[1][2:6] == ["Telegram", "ig_post_oct17", "Кандидат (ищет работу юристом)", "ivan"]


def test_csv_export_neutralizes_formula_injection(flows):
    lead = {
        "id": 1,
        "client_id": "tg:1",
        "username": "=HYPERLINK(\"http://evil\")",
        "segment": "client",
        "data": {"source": "@x", "qa": [["Тема", "=1+1"]]},
        "created_at": 0,
    }
    row = list(csv.reader(io.StringIO(leads_csv([lead], flows).decode("utf-8-sig"))))[1]
    assert row[3] == "'@x" and row[5].startswith("'=")
    assert row[7] == "Тема: =1+1"  # ячейка начинается с текста вопроса, формулой в Excel не станет


# ---------------------------------------------------------------- ответ менеджера клиенту в Instagram
@pytest.fixture
def ig_bot(clock):
    from conftest import FakeIG

    settings = make_settings()
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    store = Store(":memory:")
    engine = Engine(flows, store, self_id="111", clock=clock)
    api, ig = FakeAPI(), FakeIG()
    store.add_card_message(MANAGERS, 900, "222")  # карточка Instagram-клиента 222
    return LeadBot(settings, api, engine, flows, store, clock, ig=ig), api, ig, store


def test_manager_reply_to_instagram_card_is_sent_as_instagram_dm(ig_bot, clock):
    bot, api, ig, store = ig_bot
    run(bot, from_managers("Здравствуйте! Когда вам удобно созвониться?", reply_to=900))
    assert ig.calls == [("dm", "222", "Здравствуйте! Когда вам удобно созвониться?")]
    assert "✅ Отправлено клиенту" in api.sent_to(MANAGERS)[-1][2]
    conv = store.get_conv("222")
    assert conv.state == "human" and conv.human_until > clock.now


def test_instagram_reply_failure_explains_the_24h_window(ig_bot):
    bot, api, ig, store = ig_bot
    ig.fail_dm = True
    run(bot, from_managers("Добрый день", reply_to=900))
    text = api.sent_to(MANAGERS)[-1][2]
    assert "❌ Не доставлено в Instagram" in text and "24 часов" in text
    assert store.get_conv("222") is None  # состояние диалога не тронуто


def test_instagram_reply_accepts_text_only(ig_bot):
    bot, api, ig, _ = ig_bot
    run(bot, from_managers(None, reply_to=900, photo=[{"file_id": "x"}]))
    assert ig.calls == [] and "только текст" in api.sent_to(MANAGERS)[-1][2]


def test_instagram_card_without_instagram_client_gives_hint(bot_env):
    bot, api, store = bot_env
    store.add_card_message(MANAGERS, 901, "222")
    run(bot, from_managers("Здравствуйте", reply_to=901))
    assert "ответьте ему в самом Instagram" in api.sent_to(MANAGERS)[-1][2]


# ---------------------------------------------------------------- запуск и безопасность
def test_find_chats_lists_groups_first_and_does_not_acknowledge_updates():
    from bridge.tgbot import find_chats

    class PeekAPI:
        offsets = []

        async def get_updates(self, offset, timeout=25):
            self.offsets.append(offset)
            return [
                {"update_id": 1, "message": {"chat": {"id": 5, "type": "private", "first_name": "Иван"}}},
                {"update_id": 2, "message": {"chat": {"id": -100123, "type": "supergroup", "title": "Менеджеры"}}},
            ]

    store = Store(":memory:")
    store.kv_set("tg_offset", "7")
    chats = asyncio.run(find_chats(PeekAPI(), store, seconds=2))
    assert [c["id"] for c in chats] == [-100123, 5]
    assert set(PeekAPI.offsets) == {7}  # offset не сдвигался: основной запуск получит те же сообщения
    assert store.kv_get("tg_offset") == "7"


def test_find_chat_mode_does_not_require_manager_chat_id():
    assert TelegramSettings.from_env({"TELEGRAM_BOT_TOKEN": "1:x"}, require_chat=False).manager_chat_id == ""
    with pytest.raises(RuntimeError, match="TELEGRAM_MANAGER_CHAT_ID"):
        TelegramSettings.from_env({"TELEGRAM_BOT_TOKEN": "1:x"})



def test_preflight_refuses_when_webhook_is_active():
    def handler(request: httpx.Request) -> httpx.Response:
        method = request.url.path.rsplit("/", 1)[-1]
        result = {
            "getMe": {"username": "LegalcareeristBot"},
            "getWebhookInfo": {"url": "https://other.example.com/hook/secret-part"},
            "getChat": {"title": "Менеджеры"},
        }[method]
        return httpx.Response(200, json={"ok": True, "result": result})

    async def go(settings):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
            return await preflight(settings, TelegramAPI(settings.bot_token, http), flows)

    lines = asyncio.run(go(make_settings()))
    assert any(icon == FAIL and "webhook" in text for icon, text in lines)
    text = " ".join(t for _, t in lines)
    assert "other.example.com" in text and "secret-part" not in text  # показываем сайт, а не секретную часть адреса


def test_api_errors_never_contain_the_bot_token():
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            await TelegramAPI("123:secret-token", http).call("getMe", attempts=1)

    with pytest.raises(TelegramError) as info:
        asyncio.run(go())
    assert "secret-token" not in str(info.value)


def test_api_http_error_is_reported_without_retry_for_4xx():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(400, json={"ok": False, "description": "Bad Request: chat not found"})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            await TelegramAPI("123:secret-token", http).call("sendMessage", {"chat_id": 1, "text": "x"})

    with pytest.raises(TelegramError, match="chat not found"):
        asyncio.run(go())
    assert len(calls) == 1


def test_httpx_request_urls_with_tokens_are_not_logged(caplog):
    """httpx на INFO пишет полный URL, а в нём токен бота: setup_logging обязан это глушить."""
    setup_logging("INFO")

    def handler(request):
        return httpx.Response(200, json={"ok": True, "result": {"username": "x"}})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            await TelegramAPI("123:secret-token", http).get_me()

    with caplog.at_level(logging.INFO):
        asyncio.run(go())
    assert "secret-token" not in caplog.text


def test_old_database_without_source_column_is_migrated(tmp_path):
    import sqlite3

    path = tmp_path / "old.db"
    db = sqlite3.connect(path)
    db.execute(
        "CREATE TABLE conversations (igsid TEXT PRIMARY KEY, state TEXT NOT NULL, segment TEXT, step INTEGER NOT NULL DEFAULT 0, "
        "answers TEXT NOT NULL DEFAULT '[]', username TEXT, human_until REAL NOT NULL DEFAULT 0, updated_at REAL NOT NULL)"
    )
    db.execute("INSERT INTO conversations VALUES ('1', 'menu', NULL, 0, '[]', 'ivan', 0, 1)")
    db.commit()
    db.close()
    store = Store(str(path))
    conv = store.get_conv("1")
    assert conv.username == "ivan" and conv.source is None
