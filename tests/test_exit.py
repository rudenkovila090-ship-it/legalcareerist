import csv
import io
import json

import pytest

from bridge.engine import Engine
from bridge.exitflow import ExitFlow, load_exit
from bridge.flows import load_flows
from bridge.store import Store
from bridge.tgbot import LeadBot, TelegramError
from conftest import ROOT, Clock
from test_funnels import FunnelAPI, make_bot
from test_tgbot import CLIENT, MANAGERS, from_managers, make_settings, private, run, _update_id

COMMUNITY = "-100777"


class ExitAPI(FunnelAPI):
    def __init__(self):
        super().__init__()
        self.answers: list[tuple] = []
        self.fail_ban = False

    async def answer_callback_query(self, callback_query_id, text=None, alert=False):
        self.answers.append((callback_query_id, text, alert))

    async def edit_message_reply_markup(self, chat_id, message_id, rows):
        self.calls.append(("edit", str(chat_id), message_id, rows))

    async def ban_chat_member(self, chat_id, user_id):
        if self.fail_ban:
            raise TelegramError("banChatMember: Bad Request: not enough rights (HTTP 400)")
        self.calls.append(("ban", str(chat_id), user_id))

    async def unban_chat_member(self, chat_id, user_id):
        self.calls.append(("unban", str(chat_id), user_id))


def press_msg(data, message_id=500, user_id=CLIENT):
    return {
        "update_id": next(_update_id),
        "callback_query": {
            "id": f"cq{next(_update_id)}",
            "from": {"id": user_id, "first_name": "Иван", "username": "ivan", "is_bot": False},
            "message": {"message_id": message_id, "chat": {"id": user_id, "type": "private"}},
            "data": data,
        },
    }


def make_exit_bot(community=COMMUNITY, with_exit=True):
    settings = make_settings(community_chat_id=community)
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    store, api, clock = Store(":memory:"), ExitAPI(), Clock()
    engine = Engine(flows, store, human_mode_hours=12, clock=clock)
    cfg = load_exit(str(ROOT / "config" / "exit_survey.json"))
    bot = LeadBot(settings, api, engine, flows, store, clock, exit_flow=ExitFlow(cfg) if with_exit else None)
    return bot, api, store, clock


def keyboard_texts(rows):
    return [b["text"] for row in rows for b in row]


def last_edit(api):
    return [c for c in api.calls if c[0] == "edit"][-1]


def start_survey(bot, api):
    run(bot, private("/unsubscribe"))
    return api.sent_to(CLIENT)[-1]


# ---------------------------------------------------------------- конфигурация и запуск
def test_shipped_survey_has_the_agreed_reasons():
    cfg = load_exit(str(ROOT / "config" / "exit_survey.json"))
    assert len(cfg.reasons) == 14 and cfg.other_index == 13 and cfg.reasons[13] == "Другое"
    assert cfg.reasons[0] == "Не нашёл подходящих вакансий среди закрытых"
    assert cfg.reasons[7] == "Не хочу платить, слишком дорого за то, что получаю"
    assert cfg.reasons[12] == "Меняю сферу и ухожу из юридической карьеры"


def test_bad_survey_config_is_rejected(tmp_path):
    raw = json.loads((ROOT / "config" / "exit_survey.json").read_text(encoding="utf-8"))
    raw["other_index"] = 99
    path = tmp_path / "x.json"
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match="other_index"):
        load_exit(str(path))
    raw["enabled"] = False
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    assert load_exit(str(path)) is None
    assert load_exit(str(tmp_path / "missing.json")) is None


def test_command_shows_full_numbered_list_and_compact_number_keyboard():
    bot, api, store, _ = make_exit_bot()
    message = start_survey(bot, api)
    assert "1. Не нашёл подходящих вакансий среди закрытых" in message[2] and "14. Другое" in message[2]
    rows = message[3]["inline_keyboard"]
    assert [len(r) for r in rows] == [5, 5, 4, 1]  # номера по 5 в ряд и «Продолжить» отдельно
    assert rows[-1][0]["callback_data"] == "x:c" and rows[0][0] == {"text": "1", "callback_data": "x:t:0"}
    assert store.exit_get(f"tg:{CLIENT}")["message_id"]


def test_deeplink_unsub_starts_the_survey_and_is_off_without_config():
    bot, api, *_ = make_exit_bot()
    run(bot, private("/start unsub__ig_bio"))
    assert "Помогите понять, что пошло не так" in api.sent_to(CLIENT)[-1][2]
    off, api2, *_ = make_exit_bot(with_exit=False)
    run(off, private("/unsubscribe"))
    assert not any("x:" in str(c[3]) for c in api2.sent_to(CLIENT))  # без конфига путь выключен, обычное меню


# ---------------------------------------------------------------- путь «Отписаться»
def test_full_leave_path_requires_reasons_and_continue_before_unsubscribe():
    bot, api, store, _ = make_exit_bot()
    survey = start_survey(bot, api)
    message_id = 500

    run(bot, press_msg("x:t:2", message_id), press_msg("x:t:7", message_id))
    marks = keyboard_texts(last_edit(api)[3])
    assert "✅ 3" in marks and "✅ 8" in marks and "✅ 1" not in marks
    run(bot, press_msg("x:t:2", message_id))  # повторное нажатие снимает отметку
    assert "✅ 3" not in keyboard_texts(last_edit(api)[3])

    # пока не нажали «Продолжить», кнопки «Отписаться» нет вообще
    assert not any("x:u" in str(c[3]) for c in api.sent_to(CLIENT))
    run(bot, press_msg("x:c", message_id))
    assert last_edit(api)[3] == []  # кнопки причин убраны
    final = api.sent_to(CLIENT)[-1]
    assert [b["callback_data"] for row in final[3]["inline_keyboard"] for b in row] == ["x:u", "x:s"]

    api.calls.clear()
    run(bot, press_msg("x:u", message_id))
    assert "Заявка на отписку принята" in api.sent_to(CLIENT)[-1][2]
    card = api.sent_to(MANAGERS)[-1][2]
    assert "Просит отписаться от сообщества" in card and "Не хочу платить, слишком дорого" in card
    assert "Бот удалил клиента из чата сообщества" in card
    assert ("ban", COMMUNITY, CLIENT) in api.calls and ("unban", COMMUNITY, CLIENT) in api.calls
    assert "exit:left" in store.tags(f"tg:{CLIENT}")
    log = store.exit_log()
    assert len(log) == 1 and log[0]["decision"] == "left" and log[0]["reasons"] == ["Не хочу платить, слишком дорого за то, что получаю"]
    assert store.exit_get(f"tg:{CLIENT}") is None

    before = len(api.calls)
    run(bot, press_msg("x:u", message_id))  # повторное нажатие ничего не делает
    assert len(api.calls) == before and len(store.exit_log()) == 1


def test_continue_without_any_reason_shows_an_alert_and_does_not_advance():
    bot, api, store, _ = make_exit_bot()
    start_survey(bot, api)
    count = len(api.sent_to(CLIENT))
    run(bot, press_msg("x:c"))
    assert api.answers[-1][1] == "Отметьте хотя бы одну причину, чтобы продолжить." and api.answers[-1][2] is True
    assert len(api.sent_to(CLIENT)) == count


def test_other_reason_asks_for_text_and_the_text_is_not_treated_as_a_menu_message():
    bot, api, store, _ = make_exit_bot()
    start_survey(bot, api)
    run(bot, press_msg("x:t:13"), press_msg("x:c"))
    assert "своими словами" in api.sent_to(CLIENT)[-1][2]
    assert store.exit_get(f"tg:{CLIENT}")["awaiting_other"] is True
    run(bot, private("Переезжаю в другую страну, а сообщество про Россию"))
    saved = api.sent_to(CLIENT)[-1]
    assert "Проверьте отмеченные причины" in saved[2] and "✅ 14" in keyboard_texts(saved[3]["inline_keyboard"])
    assert "1 — " not in saved[2]  # движок меню не вмешался
    run(bot, press_msg("x:c", 501), press_msg("x:u", 502))
    card = api.sent_to(MANAGERS)[-1][2]
    assert "Переезжаю в другую страну" in card and "Другое: ответ клиента" in card


def test_deselecting_other_drops_the_text():
    bot, api, store, _ = make_exit_bot()
    start_survey(bot, api)
    run(bot, press_msg("x:t:13"), press_msg("x:c"), private("текст"), press_msg("x:t:13"), press_msg("x:t:0"), press_msg("x:c"), press_msg("x:u"))
    assert store.exit_log()[0]["other_text"] is None and store.exit_log()[0]["reasons"] == ["Не нашёл подходящих вакансий среди закрытых"]


def test_stay_path_thanks_and_does_not_remove_from_the_community():
    bot, api, store, _ = make_exit_bot()
    start_survey(bot, api)
    api.calls.clear()
    run(bot, press_msg("x:t:4"), press_msg("x:c"), press_msg("x:s"))
    assert "Рады, что вы остаётесь" in api.sent_to(CLIENT)[-1][2]
    assert "остаётся" in api.sent_to(MANAGERS)[-1][2] and "exit:stayed" in store.tags(f"tg:{CLIENT}")
    assert not any(c[0] in ("ban", "unban") for c in api.calls)
    assert store.exit_log()[0]["decision"] == "stayed"


def test_without_community_chat_the_card_asks_managers_to_do_it_by_hand():
    bot, api, *_ = make_exit_bot(community="")
    start_survey(bot, api)
    api.calls.clear()
    run(bot, press_msg("x:t:0"), press_msg("x:c"), press_msg("x:u"))
    assert not any(c[0] == "ban" for c in api.calls)
    assert "отключите оплату и доступ" in api.sent_to(MANAGERS)[-1][2]


def test_removal_failure_is_reported_but_user_still_gets_confirmation():
    bot, api, store, _ = make_exit_bot()
    api.fail_ban = True
    start_survey(bot, api)
    run(bot, press_msg("x:t:0"), press_msg("x:c"), press_msg("x:u"))
    assert "Заявка на отписку принята" in api.sent_to(CLIENT)[-1][2]
    assert "Не удалось удалить клиента из чата сообщества" in api.sent_to(MANAGERS)[-1][2]
    assert store.exit_log()[0]["decision"] == "left"


def test_stale_buttons_restart_or_are_ignored():
    bot, api, store, _ = make_exit_bot()
    run(bot, press_msg("x:t:1"))  # анкеты нет (бот перезапускали): начинаем заново
    assert "Помогите понять" in api.sent_to(CLIENT)[-1][2]
    other, api2, store2, _ = make_exit_bot()
    run(other, press_msg("x:u"), press_msg("x:s"), press_msg("x:zzz"), press_msg("x:t:abc"))
    assert api2.sent_to(CLIENT) == [] and store2.exit_log() == []


def test_restart_closes_the_old_survey_keyboard():
    bot, api, store, _ = make_exit_bot()
    start_survey(bot, api)
    first_id = store.exit_get(f"tg:{CLIENT}")["message_id"]
    run(bot, private("/unsubscribe"))
    assert ("edit", str(CLIENT), first_id, []) in api.calls


# ---------------------------------------------------------------- статистика для менеджеров
def test_stats_and_exits_export_show_reasons():
    bot, api, store, _ = make_exit_bot()
    for decision in ("x:u", "x:s"):
        start_survey(bot, api)
        run(bot, press_msg("x:t:7"), press_msg("x:t:9"), press_msg("x:c"), press_msg(decision))
    start_survey(bot, api)
    run(bot, press_msg("x:t:13"), press_msg("x:c"), private("=HYPERLINK(\"http://evil\")"), press_msg("x:c"), press_msg("x:u"))
    api.calls.clear()
    run(bot, from_managers("/stats"), from_managers("/exits"))
    stats = api.sent_to(MANAGERS)[-1][2]
    assert "отписались 2, остались 1" in stats
    assert "• Не хочу платить, слишком дорого за то, что получаю: 2" in stats
    doc = next(c for c in api.calls if c[0] == "doc")
    rows = list(csv.reader(io.StringIO(doc[3].decode("utf-8-sig"))))
    assert rows[0] == ["Дата (UTC)", "Username", "ID", "Решение", "Причины", "Другое (текст клиента)"]
    assert [r[3] for r in rows[1:]] == ["отписался", "остался", "отписался"]
    assert rows[3][5].startswith("'=")  # защита от формул в Excel


# ---------------------------------------------------------------- «используй кнопки» и передача в техподдержку
def test_nudge_after_two_misses_then_question_goes_to_support():
    bot, api, store, clock = make_exit_bot(with_exit=False)
    run(bot, private("/start"))
    run(bot, private("абракадабра"))  # первый промах: повторяем меню
    assert "Не получилось распознать" in api.sent_to(CLIENT)[-1][2]
    run(bot, private("ещё какой-то текст"))  # второй промах: подсказка про кнопки
    nudge = api.sent_to(CLIENT)[-1]
    assert "используй кнопки" in nudge[2] and "передадим обращение в техподдержку" in nudge[2]
    assert nudge[3]["keyboard"]  # кнопки меню остаются под рукой
    run(bot, private("Подскажите по договору аренды"))
    assert "Передали обращение в техподдержку" in api.sent_to(CLIENT)[-1][2]
    card = api.sent_to(MANAGERS)[-1][2]
    assert "Обращение в техподдержку" in card and "договору аренды" in card
    assert store.get_conv(f"tg:{CLIENT}").state == "human"  # бот молчит, дальше отвечает человек
    before = len(api.sent_to(CLIENT))
    run(bot, private("и ещё вопрос"))
    assert len(api.sent_to(CLIENT)) == before and "и ещё вопрос" in api.sent_to(MANAGERS)[-1][2]


def test_pressing_a_menu_button_after_the_nudge_still_works():
    bot, api, store, _ = make_exit_bot(with_exit=False)
    run(bot, private("/start"), private("раз"), private("два"))
    run(bot, private("Ищу работу юристом"))
    assert "специализация" in api.sent_to(CLIENT)[-1][2]
    assert store.get_conv(f"tg:{CLIENT}").segment == "candidate"


def test_a_correct_choice_resets_the_miss_counter():
    bot, api, store, _ = make_exit_bot(with_exit=False)
    run(bot, private("/start"), private("раз"), private("1"), private("/menu"))
    run(bot, private("снова мимо"))
    assert "Не получилось распознать" in api.sent_to(CLIENT)[-1][2]  # счётчик начался заново, подсказки ещё нет


# ---------------------------------------------------------------- кодовые слова выключены
def test_keywords_are_off_in_the_shipped_config_but_deeplinks_and_buttons_work(tmp_path):
    bot, api, store, _ = make_bot(tmp_path, keywords=False)
    run(bot, private("консультация"))
    assert store.funnel_stats() == {}  # слово ничего не запускает: обычный путь через меню
    run(bot, private("/start consult"))
    assert "Какая тема" in api.sent_to(CLIENT)[-1][2] and store.funnel_stats()["consult"]["start"] == 1
