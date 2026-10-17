from datetime import date

from bot import brief, sheets
from bot.models import ActionChange, ContactChange, NewTask, ParsedReport, SaleChange, SummaryRow, Task
from tests.conftest import TODAY


def snap(contacts_values, **kw):
    s = brief.Snapshot(TODAY, 5, contacts=sheets.parse_contacts(contacts_values))
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def test_buckets_split_by_deadline(contacts_values):
    s = snap(contacts_values)
    s.contacts[0].due = date(2026, 10, 10)      # overdue
    s.contacts[1].due = date(2026, 10, 18)      # tomorrow
    overdue, today, tomorrow, no_step = brief.contact_buckets(s)
    assert [c.name for c in overdue] == ["khaustovasya"]
    assert [c.name for c in today] == ["Полина (ИИ Стриж)"]
    assert [c.name for c in tomorrow] == ["@katushusta"] and no_step == []


def test_closed_contacts_are_never_listed(contacts_values):
    s = snap(contacts_values)
    s.contacts[3].stage = "Отказ"
    assert brief.contact_buckets(s)[1] == []


def test_morning_names_who_to_write_and_why(contacts_values):
    s = snap(contacts_values)
    msg = brief.morning_message(s, focus="Главное — ответы работодателей")
    assert "Суббота, 17.10.2026" in msg
    assert "Написать / сделать сегодня (1)" in msg
    assert "<b>Полина (ИИ Стриж)</b> (Партнёр) — Получить ответ · <i>Партнёр Legal Night Jazz 2</i>" in msg
    assert "Фокус дня" in msg and "Главное — ответы работодателей" in msg


def test_legacy_row_without_deadline_is_flagged(contacts_values):
    s = snap(contacts_values)
    s.contacts[0].date = date(2026, 10, 1)       # 5-day follow-up window long gone
    s.contacts[0].due = None
    msg = brief.morning_message(s)
    assert "просрочено на 11 дн." in msg and "(срок не задан)" in msg


def test_user_text_cannot_break_html(contacts_values):
    s = snap(contacts_values)
    s.contacts[3].name = "<b>Ольга & Ко"
    s.contacts[3].request = "x < y"
    msg = brief.morning_message(s)
    assert "&lt;b&gt;Ольга &amp; Ко" in msg and "x &lt; y" in msg


def test_quiet_day_message(contacts_values):
    msg = brief.morning_message(snap([sheets.CONTACT_COLS]))
    assert "срочных шагов нет" in msg


def test_lagging_metrics_red_first_and_limits_marked():
    rows = [SummaryRow("Касания работодателям", "0", "2", "2", "200", "1%", "13", "🟡", "↑"),
            SummaryRow("Выручка итого", "0", "0", "0", "195,000", "0%", "13,000", "🔴", "↑"),
            SummaryRow("Расходы", "0", "0", "30,000", "25,000", "120%", "", "🔴", "↓"),
            SummaryRow("Деньги"), SummaryRow("Новые резиденты", light="🟢")]
    lag = brief.lagging_rows(rows)
    assert [r.light for r in lag] == ["🔴", "🔴", "🟡"]
    assert "нужно 13,000/день" in brief.metric_line(lag[0]) and "(лимит)" in brief.metric_line(lag[1])


def test_period_covers():
    d = date(2026, 10, 17)
    assert brief.period_covers("2026", d) and brief.period_covers("2026-Q4", d) and brief.period_covers("2026-10", d)
    assert not brief.period_covers("2026-Q3", d) and not brief.period_covers("2026-11", d)
    assert not brief.period_covers("2025", d) and not brief.period_covers("осенью", d) and not brief.period_covers("", d)


def test_split_message_respects_limit_and_keeps_lines():
    text = "\n".join(f"строка {i} " + "я" * 90 for i in range(200))
    parts = brief.split_message(text, limit=1000)
    assert all(len(p) <= 1000 for p in parts) and "\n".join(parts) == text


def test_evening_lists_numbers_and_open_items(contacts_values):
    s = snap(contacts_values, summary=[SummaryRow("Касания работодателям", "15"), SummaryRow("Ответы работодателей", "0")],
             tasks=[Task(7, TODAY, "Позвонить в Сбер", "Кадры")])
    msg = brief.evening_message(s)
    assert "Касания работодателям — 15" in msg and "Ответы работодателей" not in msg
    assert "#7 Позвонить в Сбер" in msg and "Полина" in msg


def test_tasks_message_groups_by_day():
    tasks = [Task(1, date(2026, 10, 17), "A"), Task(2, date(2026, 10, 18), "B"), Task(3, date(2026, 10, 16), "C", status="Сделано")]
    msg = brief.tasks_message(tasks, TODAY)
    assert "Суббота, 17.10 — сегодня" in msg and "Воскресенье, 18.10" in msg and "#3" not in msg


def test_preview_covers_every_part_and_escapes():
    p = ParsedReport(
        actions=[ActionChange("touches", 15, "add", TODAY), ActionChange("replies", 20, "set", date(2026, 10, 16))],
        contacts=[ContactChange("new", None, TODAY, "Иван <Test>", "Телеграм", "Работодатель", "Вакансия", "В работе",
                                "Позвонить", date(2026, 10, 20)),
                  ContactChange("update", 5, TODAY, "Полина", stage="Интервью", step_done=True, comment="согласна")],
        sales=[SaleChange("new", None, TODAY, "Сообщество", "Анна", "Резидентство", 3500, 3500),
               SaleChange("add_payment", 2, TODAY, None, "Борис", None, None, 1500)],
        tasks_done=[3], tasks_moved=[(4, date(2026, 10, 21))], tasks_new=[NewTask("Позвонить", date(2026, 10, 19))],
        warnings=["w"], questions=["сколько?"])
    t = brief.preview_text(p)
    for needle in ("+15", "= 20 (исправление)", "Иван &lt;Test&gt;", "Обновляю", "этап → Интервью", "прошлый шаг выполнен",
                   "3 500 ₽", "Доплата Борис: +1 500", "выполнена #3", "#4 → 21.10.2026", "новая «Позвонить»",
                   "Обрати внимание", "Нужно уточнить"):
        assert needle in t, needle
