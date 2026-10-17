from datetime import date

import pytest

from bot import sheets
from bot.dates import parse_date, to_serial
from bot.models import ActionChange, ContactChange, NewTask, ParsedReport, SaleChange
from bot.sheets import Journal, SheetError, plan_actions, plan_contacts, plan_overdue_flags, plan_sales
from tests.conftest import D, TODAY, FakeSpreadsheet


def test_serial_matches_the_real_sheet():
    assert to_serial(date(2026, 10, 16)) == 46311  # value seen in Действия!A2
    assert parse_date(46311) == date(2026, 10, 16)
    assert parse_date("16.10.2026") == date(2026, 10, 16)
    assert parse_date("2026-10-16") == date(2026, 10, 16)
    assert parse_date("") is None and parse_date("не дата") is None and parse_date(5) is None


def test_parse_contacts_keeps_sheet_row_numbers(contacts_values):
    cs = sheets.parse_contacts(contacts_values)
    assert [c.row for c in cs] == [2, 3, 4, 5]
    assert cs[3].due == date(2026, 10, 17) and cs[3].name == "Полина (ИИ Стриж)"


def test_effective_due_uses_followup_for_legacy_rows(contacts_values):
    cs = sheets.parse_contacts(contacts_values)
    # row without a deadline: contact date 16.10 + 5 days
    assert cs[1].due is None and cs[1].effective_due(5) == date(2026, 10, 21)
    assert cs[2].effective_due(5) == date(2026, 10, 24)


# --- Действия ----------------------------------------------------------------------------

def test_actions_add_accumulates_on_existing_day(actions_values):
    p = plan_actions(actions_values, [ActionChange("touches", 15, "add", date(2026, 10, 16))])
    assert [(w.range, w.values) for w in p.writes] == [("B2", [[17]])]
    assert p.date_cells == []


def test_actions_set_overwrites_for_corrections(actions_values):
    p = plan_actions(actions_values, [ActionChange("touches", 20, "set", date(2026, 10, 16))])
    assert p.writes[0].values == [[20]]


def test_actions_fill_prepared_empty_day_row(actions_values):
    p = plan_actions(actions_values, [ActionChange("replies", 3, "add", TODAY), ActionChange("calls", 1, "add", TODAY)])
    assert {w.range: w.values[0][0] for w in p.writes} == {"C3": 3, "D3": 1}


def test_actions_new_day_appends_row_with_serial_date(actions_values):
    p = plan_actions(actions_values, [ActionChange("posts", 2, "add", date(2026, 10, 18))])
    assert p.writes[0].range == "A4" and p.writes[0].values == [[to_serial(date(2026, 10, 18))]]
    assert p.date_cells == ["A4"]


def test_actions_two_adds_to_same_cell_sum_up(actions_values):
    ch = [ActionChange("touches", 5, "add", TODAY), ActionChange("touches", 4, "add", TODAY)]
    p = plan_actions(actions_values, ch)
    assert [w.values for w in p.writes] == [[[9]]]


def test_actions_missing_column_is_a_clear_error():
    with pytest.raises(SheetError, match="нет колонки"):
        plan_actions([["Дата"]], [ActionChange("touches", 1, "add", TODAY)])


# --- Обращения ---------------------------------------------------------------------------

def test_new_contact_row_uses_serials_and_marks_overdue(contacts_values):
    ch = ContactChange("new", None, TODAY, "Иван Петров", source="Телеграм", who="Работодатель",
                       request="Вакансия юриста", stage="В работе", next_step="Созвониться",
                       due=date(2026, 10, 15), comment="Откликнулся")
    p = plan_contacts(contacts_values, [ch], TODAY)
    (w,) = p.writes
    assert w.range == "A6:J6"
    assert w.values[0][:8] == [D(17, 10), "Телеграм", "Работодатель", "Иван Петров", "Вакансия юриста",
                               "В работе", "Созвониться", D(15, 10)]
    assert w.values[0][9] == "просрочен"  # Сводка counts exactly this word
    assert p.date_cells == ["A6", "H6"]


def test_update_contact_changes_only_named_fields(contacts_values):
    ch = ContactChange("update", 5, TODAY, "Полина", stage="Интервью", next_step="Созвон про партнёрство",
                       due=date(2026, 10, 20), comment="Согласна обсудить")
    p = plan_contacts(contacts_values, [ch], TODAY)
    cells = {w.range: w.values[0][0] for w in p.writes}
    assert cells["F5"] == "Интервью" and cells["G5"] == "Созвон про партнёрство"
    assert cells["H5"] == D(20, 10) and cells["J5"] == ""
    assert cells["I5"].endswith("17.10: Согласна обсудить") and "Посмотрит вечером" in cells["I5"]
    assert "A5" not in cells and "D5" not in cells  # identity columns untouched


def test_update_with_wrong_row_falls_back_to_new_with_warning(contacts_values):
    ch = ContactChange("update", 2, TODAY, "Совсем другой человек", next_step="x", due=TODAY)
    p = plan_contacts(contacts_values, [ch], TODAY)
    assert p.writes[0].range == "A6:J6" and "теперь не" in p.warnings[0]


def test_step_done_without_new_step_clears_deadline(contacts_values):
    ch = ContactChange("update", 5, TODAY, "Полина", step_done=True)
    cells = {w.range: w.values[0][0] for w in plan_contacts(contacts_values, [ch], TODAY).writes}
    assert cells["G5"] == "" and cells["H5"] == "" and cells["J5"] == "сделано"


def test_only_due_moves_the_deadline(contacts_values):
    ch = ContactChange("update", 4, TODAY, "Ориана", due=date(2026, 10, 31))
    cells = {w.range: w.values[0][0] for w in plan_contacts(contacts_values, [ch], TODAY).writes}
    assert cells["H4"] == D(31, 10) and "G4" not in cells


def test_overdue_sync_never_touches_done_or_manual_status(contacts_values):
    cs = sheets.parse_contacts(contacts_values)
    cs[3].due = date(2026, 10, 10)            # Полина: overdue now
    cs[0].step_status = "сделано"             # must stay
    cs[1].step_status = "жду письма"          # user's own text must stay
    cs[1].due = date(2026, 10, 1)
    p = plan_overdue_flags(cs, TODAY)
    assert [(w.range, w.values) for w in p.writes] == [("J5", [["просрочен"]])]


# --- Продажи -----------------------------------------------------------------------------

def test_sale_never_writes_formula_columns(sales_values):
    ch = SaleChange("new", None, TODAY, "Сообщество", "Анна", "Резидентство", 3500, 3500, "Инстаграм", "полностью")
    p = plan_sales(sales_values, [ch])
    ranges = [w.range for w in p.writes]
    assert ranges == ["A2:G2", "J2"]  # H:I are ARRAYFORMULA columns
    assert p.writes[0].values == [[D(17, 10), "Сообщество", "Анна", "Резидентство", 3500, 3500, "Инстаграм"]]


def test_add_payment_increments_paid(sales_values):
    sales_values.append([D(16, 10), "Сообщество", "Анна", "Резидентство", 3500, 1000, "Другое"])
    p = plan_sales(sales_values, [SaleChange("add_payment", 2, TODAY, None, "Анна", None, None, 2500)])
    assert p.writes[0].range == "F2" and p.writes[0].values == [[3500]]


def test_payment_for_wrong_client_is_refused(sales_values):
    sales_values.append([D(16, 10), "Сообщество", "Анна", "Резидентство", 3500, 1000, "Другое"])
    p = plan_sales(sales_values, [SaleChange("add_payment", 2, TODAY, None, "Борис", None, None, 500)])
    assert not p.writes and p.warnings


# --- parsing the rest --------------------------------------------------------------------

def test_lists_are_read_from_planes(planes_values):
    lists = sheets.parse_lists(planes_values)
    assert lists.sources == ["Инстаграм", "Телеграм", "Сарафан", "Другое"]
    assert lists.who[0] == "Кандидат" and lists.stages[-1] == "Выход" and lists.directions[0] == "Кадры"


def test_targets_stop_at_blank_row(planes_values):
    ts = sheets.parse_targets(planes_values)
    assert [t.label for t in ts][-1] == "Расходы, не больше, ₽" and ts[0].row == 3


def test_summary_and_funnel_parsing():
    values = [["КЮ: сводка"], [], ["Показатель", "Сегодня", "7 дней", "Месяц", "План на месяц", "% плана", "Нужно в день", "Светофор", "Хорошо когда"],
              ["Деньги"], ["Выручка итого (по дате продажи)", "0", "0", "0", "195,000", "0%", "13,000", "🔴", "↑"],
              ["Воронка по людям: сколько сейчас на каждом этапе"], ["Этап", "Кандидаты", "Работодатели", "Резиденты"],
              ["Новый", "0", "0", "0"], ["В работе", "1", "2", "0"]]
    rows, funnel = sheets.parse_summary(values)
    assert sheets.is_section(rows[0]) and rows[1].light == "🔴" and rows[1].per_day == "13,000"
    assert funnel["В работе"] == {"Кандидаты": "1", "Работодатели": "2", "Резиденты": "0"}


def test_stamp_comment_trims_oldest_lines():
    old = "\n".join(f"01.01: {'x' * 90}" for _ in range(20))
    out = sheets.stamp_comment(old, "новое", TODAY)
    assert len(out) <= sheets.COMMENT_LIMIT and out.endswith("17.10: новое")


# --- end to end through Journal on a fake spreadsheet -------------------------------------

def test_apply_report_end_to_end(journal_sheets):
    sh = FakeSpreadsheet(journal_sheets)
    j = Journal(sh)
    parsed = ParsedReport(
        actions=[ActionChange("touches", 15, "add", TODAY), ActionChange("replies", 3, "add", TODAY)],
        contacts=[ContactChange("new", None, TODAY, "+7 999 000-11-22 Мария", source="Инстаграм", who="Кандидат",
                                request="Ищет работу", stage="Новый", next_step="Ответить", due=date(2026, 10, 18))],
        sales=[SaleChange("new", None, TODAY, "Сообщество", "Анна", "Резидентство", 3500, 3500)],
        tasks_new=[NewTask("Написать в Сбер", date(2026, 10, 19), "Кадры")],
    )
    res = j.apply_report(parsed, TODAY)
    assert not res.errors, res.errors
    acts = sh.sheets["Действия"].grid
    assert acts[2][:3] == [D(17, 10), 15, 3]
    assert sh.sheets["Обращения"].grid[5][3] == "+7 999 000-11-22 Мария"  # not eaten as a formula
    assert sh.sheets["Продажи"].grid[1][:6] == [D(17, 10), "Сообщество", "Анна", "Резидентство", 3500, 3500]
    assert sh.sheets["Задачи"].grid[1][:3] == [1, D(19, 10), "Написать в Сбер"]
    assert any("A6" in r for r, _ in sh.sheets["Обращения"].formats)


def test_one_failing_part_does_not_lose_the_rest(journal_sheets):
    journal_sheets["Действия"] = [["Дата"]]  # broken header: no metric columns
    j = Journal(FakeSpreadsheet(journal_sheets))
    parsed = ParsedReport(actions=[ActionChange("touches", 1, "add", TODAY)],
                          sales=[SaleChange("new", None, TODAY, "Кадры", "ООО", "Рекрутинг", 100, 0)])
    res = j.apply_report(parsed, TODAY)
    assert any("Действия" in e for e in res.errors)
    assert any("Продажи" in line for line in res.lines)


def test_task_lifecycle(journal_sheets):
    j = Journal(FakeSpreadsheet(journal_sheets))
    ids = j.add_tasks([(date(2026, 10, 19), "A", "Кадры", ""), (date(2026, 10, 20), "B", "Другое", "g1")], "неделя 2026-W43")
    assert ids == [1, 2]
    res = j.apply_report(ParsedReport(tasks_done=[1], tasks_moved=[(2, date(2026, 10, 25))]), TODAY)
    assert not res.errors
    tasks = {t.id: t for t in j.tasks()}
    assert tasks[1].status == "Сделано" and tasks[2].due == date(2026, 10, 25)
    assert j.cancel_open_tasks("неделя 2026-W43") == 1
    assert {t.id: t.status for t in j.tasks()} == {1: "Сделано", 2: "Отменена"}


def test_next_row_is_after_rows_that_have_no_date(contacts_values):
    contacts_values.append(["", "", "", "Человек без даты", "запрос"])   # typed by hand, no date
    ch = ContactChange("new", None, TODAY, "Новый", next_step="x", due=TODAY)
    assert plan_contacts(contacts_values, [ch], TODAY).writes[0].range == "A7:J7"


def test_sales_next_row_ignores_formula_columns(sales_values):
    sales_values.append([D(16, 10), "Сообщество", "Анна", "Резидентство", 3500, 0, "Другое", "не оплачено", 3500])
    ch = SaleChange("new", None, TODAY, "Кадры", "ООО", "Рекрутинг", 100, 0)
    assert plan_sales(sales_values, [ch]).writes[0].range == "A3:G3"
