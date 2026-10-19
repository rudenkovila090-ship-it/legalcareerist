import asyncio
import csv
import io
import json

import pytest

from bridge.engine import Engine
from bridge.flows import fill_name, load_flows, parse_phone
from bridge.funnels import load_funnels
from bridge.store import Store
from bridge.tgbot import LeadBot, TelegramError, build_funnels
from conftest import ROOT
from test_tgbot import CLIENT, MANAGERS, FakeAPI, from_managers, make_settings, private, run, _update_id

CHANNEL = "@career_channel"


class FunnelAPI(FakeAPI):
    def __init__(self):
        super().__init__()
        self.members: dict[int, str] = {}
        self.member_error = False
        self.answered: list[str] = []

    async def get_chat_member(self, chat_id, user_id):
        if self.member_error:
            raise TelegramError("getChatMember: Bad Request: chat not found (HTTP 400)")
        return {"status": self.members.get(user_id, "left")}

    async def answer_callback_query(self, callback_query_id):
        self.answered.append(callback_query_id)

    async def send_document_url(self, chat_id, url, caption=""):
        self.calls.append(("docurl", str(chat_id), url))


def press(data, user_id=CLIENT, chat_type="private"):
    return {
        "update_id": next(_update_id),
        "callback_query": {
            "id": f"cq{next(_update_id)}",
            "from": {"id": user_id, "first_name": "Иван", "username": "ivan", "is_bot": False},
            "message": {"message_id": 1, "chat": {"id": user_id, "type": chat_type}},
            "data": data,
        },
    }


def filled_funnels(tmp_path, fill=True, top=None, **mutate):
    """Копия config/funnels.json: вместо «<ссылка…>» подставлены настоящие адреса (fill), верхние ключи переопределены (top)."""
    raw = json.loads((ROOT / "config" / "funnels.json").read_text(encoding="utf-8"))

    def fill_links(node):
        if isinstance(node, dict):
            return {k: fill_links(v) for k, v in node.items()}
        if isinstance(node, list):
            return [fill_links(v) for v in node]
        if isinstance(node, str) and node.startswith("<") and node.endswith(">"):
            return "https://example.com/material"
        return node

    if fill:
        raw = fill_links(raw)
    raw.update(top or {})
    for funnel in raw["funnels"]:
        for key, value in mutate.get(funnel["id"], {}).items():
            funnel[key] = value
    path = tmp_path / "funnels.json"
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    return str(path)


def make_bot(tmp_path, *, channel=CHANNEL, filled=True, privacy="", keywords=True, **mutate):
    funnels_path = filled_funnels(tmp_path, fill=filled, top={"keywords_enabled": keywords}, **mutate)
    settings = make_settings(privacy_url=privacy, subscribe_channel=channel, funnels_path=funnels_path)
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    store, api = Store(":memory:"), FunnelAPI()
    from conftest import Clock

    clock = Clock()
    engine = Engine(flows, store, human_mode_hours=12, clock=clock)
    funnels = build_funnels(settings, flows, store, clock=clock)
    bot = LeadBot(settings, api, engine, flows, store, clock, funnels=funnels)
    return bot, api, store, clock


def texts(api, chat=CLIENT):
    return [c[2] for c in api.sent_to(chat)]


def last(api, chat=CLIENT):
    return api.sent_to(chat)[-1]


def button_data(message):
    markup = message[3]
    return [b.get("callback_data") or b.get("url") for row in markup.get("inline_keyboard", []) for b in row]


# ---------------------------------------------------------------- загрузка и отключение
def test_shipped_funnels_disable_those_with_unfilled_links(tmp_path):
    settings = make_settings()
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    config = load_funnels(settings.funnels_path, settings.links, set(flows.segments))
    assert set(config.funnels) == {"career", "event", "community", "consult"}
    assert set(config.disabled) == {"guide", "longlist", "vacancies"}
    assert "заполните ссылку" in config.disabled["guide"]


def test_filled_funnels_all_work_and_cross_buttons_skip_disabled(tmp_path):
    bot, api, *_ = make_bot(tmp_path, filled=False)
    run(bot, private("карьера"))
    assert button_data(last(api)) == ["f:consult:go"]  # гайд, лонглист и вакансии отключены, кнопки на них не показываем
    bot2, api2, *_ = make_bot(tmp_path, filled=True)
    run(bot2, private("карьера"))
    assert button_data(last(api2)) == ["f:guide:go", "f:longlist:go", "f:vacancies:go", "f:consult:go"]


def test_funnels_config_errors_are_reported(tmp_path):
    settings = make_settings()
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"funnels": [{"id": "x", "keywords": ["x"], "deliver": {"text": "t", "buttons": [{"label": "b", "funnel": "nope"}]}}]}))
    with pytest.raises(ValueError, match="несуществующую воронку"):
        load_funnels(str(bad), settings.links, set(flows.segments))
    bad.write_text(json.dumps({"funnels": [{"id": "Bad_ID", "keywords": ["x"], "deliver": {"text": "t"}}]}))
    with pytest.raises(ValueError, match="id воронки"):
        load_funnels(str(bad), settings.links, set(flows.segments))


def test_missing_funnels_file_means_funnels_are_off(tmp_path):
    settings = make_settings()
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    assert load_funnels(str(tmp_path / "none.json"), settings.links, set(flows.segments)).funnels == {}


# ---------------------------------------------------------------- приветствие и диплинки
def test_welcome_is_personal_and_changes_for_returning_user(tmp_path):
    bot, api, *_ = make_bot(tmp_path)
    run(bot, private("/start"))
    first = last(api)
    assert first[2].startswith("Здравствуйте, Иван!")
    assert "f:guide:go" in button_data(first) and "m:menu" in button_data(first)
    run(bot, private("/start"))
    assert last(api)[2].startswith("С возвращением, Иван!")


def test_welcome_without_a_name_has_no_dangling_comma(tmp_path):
    bot, api, *_ = make_bot(tmp_path)
    update = private("/start")
    del update["message"]["from"]["first_name"]
    run(bot, update)
    assert last(api)[2].startswith("Здравствуйте!")


def test_other_question_button_opens_the_regular_menu(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    run(bot, private("/start"), press("m:menu"))
    assert "1 — " in last(api)[2] and "Запись на консультацию" not in last(api)[2]  # скрытые сегменты в меню не видны


def test_deeplink_starts_funnel_and_records_source(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    run(bot, private("/start guide__ig_story"))
    assert "рады, что вы интересуетесь" in texts(api)[0] and "На каком вы сейчас этапе" in texts(api)[1]
    assert store.get_conv(f"tg:{CLIENT}").source == "ig_story"
    assert store.contacts()[0]["source"] == "ig_story"


def test_deeplink_to_a_questionnaire_and_unknown_payload(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    run(bot, private("/start seg_client__ig_dm"))
    assert "Какая тема" in last(api)[2]
    assert store.get_conv(f"tg:{CLIENT}").source == "ig_dm"
    run(bot, private("/start whatever"))  # неизвестная метка: приветствие, а метка сохраняется как источник
    assert last(api)[2].startswith(("С возвращением", "Здравствуйте"))
    assert store.get_conv(f"tg:{CLIENT}").source == "whatever"


# ---------------------------------------------------------------- запись на консультацию (шаблон «приём заявок»)
def test_booking_flow_choice_buttons_and_phone_validation(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    run(bot, private("консультация"))
    assert last(api)[2].startswith("Какая тема")
    topics = [b[0]["text"] for b in last(api)[3]["keyboard"]]
    assert topics == ["Договор", "Налоги", "Кадры и трудовое право", "Спор или суд", "Другое"]
    assert "Иван, поможем разобраться" in texts(api)[0]

    run(bot, private("не знаю"))  # ответ не из списка: вопрос повторяется с кнопками
    assert "один из вариантов" in last(api)[2] and last(api)[2].count("Какая тема") == 1
    run(bot, private("договор"))  # регистр не важен
    assert "какой день" in last(api)[2].lower() or "день" in last(api)[2]
    run(bot, private("Вт"))
    run(bot, private("позвоните мне"))
    assert "не похоже на номер телефона" in last(api)[2]
    run(bot, private("8 (900) 100-10-10"))
    assert "Заявка передана менеджеру" in last(api)[2]
    card = last(api, MANAGERS)[2]
    assert "Запись на консультацию" in card and "+79001001010" in card and "Договор" in card
    assert "Метки" not in card or "got:consult" in card


def test_booking_is_part_of_keyword_funnel_and_survives_consent(tmp_path):
    bot, api, store, _ = make_bot(tmp_path, privacy="https://example.com/privacy")
    run(bot, private("консультация"))
    assert "https://example.com/privacy" in last(api)[2]  # перед сбором контактов спрашиваем согласие
    run(bot, private("Да, согласен(а)"))
    assert "Какая тема" in last(api)[2]


# ---------------------------------------------------------------- воронка выдачи с проверкой подписки (шаблон «лид-магнит»)
def start_guide(bot):
    run(bot, private("Гайд!"), press("f:guide:q:0:0"), press("f:guide:q:1:1"))


def test_gated_guide_full_path_with_reminder_and_followup(tmp_path):
    bot, api, store, clock = make_bot(tmp_path)
    run(bot, private("Гайд!"))
    assert texts(api)[0].startswith("Иван, рады") and "На каком вы сейчас этапе" in texts(api)[1]
    assert button_data(last(api)) == ["f:guide:q:0:0", "f:guide:q:0:1", "f:guide:q:0:2", "f:guide:q:0:3"]
    run(bot, press("f:guide:q:0:0"))
    assert "Что для вас сейчас главное" in last(api)[2]
    run(bot, press("f:guide:q:1:1"))
    gate = last(api)
    assert "подписки" in gate[2] and button_data(gate) == ["https://t.me/career_channel", "f:guide:chk"]

    # нажал «Я подписался», но не подписан: «не вижу подписки» + напоминание через 10 минут
    run(bot, press("f:guide:chk"))
    assert "Пока не вижу вашей подписки" in last(api)[2]
    assert button_data(last(api)) == ["https://t.me/career_channel", "f:guide:chk", "f:guide:no"]
    run(bot, press("f:guide:chk"))  # повторное нажатие не плодит напоминания
    assert len(store.due_jobs(clock.now + 11 * 60)) == 1
    assert store.due_jobs(clock.now + 5 * 60) == []
    clock.now += 11 * 60
    before = len(api.sent_to(CLIENT))
    asyncio.run(bot._run_due_jobs())
    assert len(api.sent_to(CLIENT)) == before + 1 and "А вы уже подписались" in last(api)[2]
    asyncio.run(bot._run_due_jobs())  # задача выполняется один раз
    assert len(api.sent_to(CLIENT)) == before + 1

    # подписался: материал выдан, метки поставлены, через час — дожим
    api.members[CLIENT] = "member"
    run(bot, press("f:guide:chk"))
    delivered = last(api)
    assert "Ваш гайд" in delivered[2] and button_data(delivered) == ["https://example.com/material"]
    tags = store.tags(f"tg:{CLIENT}")
    assert {"subscriber", "got:guide", "guide:Студент", "guide:Сменить компанию"} <= set(tags)
    clock.now += 61 * 60
    asyncio.run(bot._run_due_jobs())
    assert "Удалось заглянуть в гайд" in last(api)[2] and button_data(last(api)) == ["f:consult:go"]
    stats = store.funnel_stats()["guide"]
    assert stats["start"] == 1 and stats["delivered"] == 1 and stats["subscribed"] == 1 and stats["reminder_sent"] == 1


def test_already_subscribed_user_gets_material_right_after_quiz(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    api.members[CLIENT] = "administrator"
    start_guide(bot)
    assert "Ваш гайд" in last(api)[2]
    assert "gate_shown" not in {e for e in store.funnel_stats().get("guide", {})}


def test_decline_goes_to_survey_once_and_cancels_reminder(tmp_path):
    bot, api, store, clock = make_bot(tmp_path)
    start_guide(bot)
    run(bot, press("f:guide:chk"), press("f:guide:no"))
    assert "почему не хотите подписываться" in last(api)[2]
    assert len(button_data(last(api))) == 4
    run(bot, press("f:guide:sv:2"))
    assert "Спасибо за ответ" in last(api)[2]
    assert "opros:guide:Не хочу подписываться" in store.tags(f"tg:{CLIENT}")
    before = len(api.sent_to(CLIENT))
    run(bot, press("f:guide:sv:0"))  # второй ответ игнорируется
    clock.now += 60 * 60
    asyncio.run(bot._run_due_jobs())  # напоминание отменено
    assert len(api.sent_to(CLIENT)) == before


def test_reminder_delivers_if_user_subscribed_without_pressing_the_button(tmp_path):
    bot, api, store, clock = make_bot(tmp_path)
    start_guide(bot)
    run(bot, press("f:guide:chk"))
    api.members[CLIENT] = "member"
    clock.now += 11 * 60
    asyncio.run(bot._run_due_jobs())
    assert "Ваш гайд" in last(api)[2]


def test_without_channel_the_gate_is_off(tmp_path):
    bot, api, *_ = make_bot(tmp_path, channel="")
    start_guide(bot)
    assert "Ваш гайд" in last(api)[2]


def test_membership_check_failure_delivers_and_warns_managers_once(tmp_path):
    bot, api, *_ = make_bot(tmp_path)
    api.member_error = True
    start_guide(bot)
    assert "Ваш гайд" in last(api)[2]
    run(bot, private("лонглист"), press("f:longlist:chk"))
    warnings = [t for t in texts(api, MANAGERS) if "бот должен быть администратором канала" in t]
    assert len(warnings) == 1


def test_funnel_with_document_sends_file_by_url(tmp_path):
    bot, api, *_ = make_bot(
        tmp_path,
        channel="",
        longlist={"deliver": {"text": "Держите лонглист", "document_url": "https://example.com/longlist.pdf"}},
    )
    run(bot, private("лонглист"))
    assert ("docurl", str(CLIENT), "https://example.com/longlist.pdf") in api.calls
    assert "Держите лонглист" in texts(api)  # вступление идёт первым сообщением, выдача вторым


# ---------------------------------------------------------------- кодовое слово не должно ломать анкеты
def test_keyword_inside_questionnaire_answer_is_an_answer_not_a_trigger(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    run(bot, private("/start"), press("m:menu"), private("1"))  # анкета «Юридическая помощь», первый вопрос про тему
    run(bot, private("консультация по договору аренды"))
    assert "городе или стране" in last(api)[2]  # засчитано как ответ, воронка не запущена
    assert store.funnel_stats() == {}


def test_menu_choice_with_keyword_in_title_selects_the_segment(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    run(bot, private("/start"), press("m:menu"), private("Сообщество и мероприятия"))
    assert "Что вам интересно" in last(api)[2] and store.funnel_stats() == {}


def test_long_message_and_manager_dialog_do_not_trigger_funnels(tmp_path):
    bot, api, store, clock = make_bot(tmp_path)
    run(bot, private("добрый день, хотела бы узнать про гайд и про всё остальное что у вас есть"))
    assert store.funnel_stats() == {}
    conv = store.get_conv(f"tg:{CLIENT}")
    conv.state, conv.human_until = "human", clock.now + 3600
    store.save_conv(conv)
    run(bot, private("гайд"))
    assert store.funnel_stats() == {}  # менеджер ведёт диалог: бот молчит, а сообщение пересылается менеджеру
    assert "гайд" in last(api, MANAGERS)[2]


def test_stale_and_foreign_callbacks_are_ignored(tmp_path):
    bot, api, store, _ = make_bot(tmp_path)
    run(bot, press("f:nosuch:go"), press("garbage"), press("f:guide:q:9:9"), press("f:guide:sv:x"), press("f:guide:go", chat_type="group"))
    assert api.sent_to(CLIENT) == [] and len(api.answered) == 5  # кнопки «отпускаем» всегда


# ---------------------------------------------------------------- команды менеджера
def test_stats_and_contacts_commands(tmp_path):
    bot, api, store, _ = make_bot(tmp_path, filled=False)
    run(bot, private("/start hello__ig_bio"), private("консультация"))
    api.calls.clear()
    run(bot, from_managers("/stats"))
    stats = last(api, MANAGERS)[2]
    assert "Консультация: запусков 1, выдано 1" in stats and "guide: ОТКЛЮЧЕНА" in stats
    run(bot, from_managers("/contacts"))
    doc = next(c for c in api.calls if c[0] == "doc")
    rows = list(csv.reader(io.StringIO(doc[3].decode("utf-8-sig"))))
    assert rows[0][1:] == ["Username", "Имя", "ID", "Источник", "Метки"]
    assert rows[1][1:5] == ["ivan", "Иван", str(CLIENT), "hello__ig_bio"] or rows[1][1:4] == ["ivan", "Иван", str(CLIENT)]
    assert "got:consult" in rows[1][5]


def test_lead_card_shows_tags(tmp_path):
    bot, api, store, _ = make_bot(tmp_path, channel="")
    start_guide(bot)
    run(bot, press("f:guide:go"))  # повторный запуск не ломает
    store.add_tag(f"tg:{CLIENT}", "vip")
    run(bot, private("консультация"), private("Договор"), private("Пн"), private("+7 900 100 10 10"))
    card = last(api, MANAGERS)[2]
    assert "Метки:" in card and "<code>got:guide</code>" in card and "<code>vip</code>" in card


# ---------------------------------------------------------------- мелкие функции
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("89001001010", "+79001001010"),
        ("+7 (900) 100-10-10", "+79001001010"),
        ("9001001010", "+79001001010"),
        ("+44 20 7946 0958", "+442079460958"),
        ("позвоните мне", None),
        ("12345", None),
        ("89001001010 доб. 5", None),
        ("", None),
    ],
)
def test_parse_phone(raw, expected):
    assert parse_phone(raw) == expected


@pytest.mark.parametrize(
    "template,name,expected",
    [
        ("Здравствуйте, {first_name}!", "Иван", "Здравствуйте, Иван!"),
        ("Здравствуйте, {first_name}!", None, "Здравствуйте!"),
        ("{first_name}, перед записью выберите день", None, "Перед записью выберите день"),
        ("Привет", None, "Привет"),
    ],
)
def test_fill_name(template, name, expected):
    assert fill_name(template, name) == expected
