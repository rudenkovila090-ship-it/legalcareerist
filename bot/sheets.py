"""Google Sheets layer.

The journal spreadsheet is the bot's only memory. This module is split in two:
pure functions that parse sheet values and plan writes (unit-tested without Google),
and `Journal`, a thin gspread wrapper that executes those plans.

Conventions that come from the existing spreadsheet:
- dates are stored as serial numbers formatted dd.mm.yyyy, and the locale is en_US,
  so a "16.10.2026" string would NOT be parsed as a date: always write serials;
- Продажи!H:I are ARRAYFORMULA columns: never write there;
- Сводка counts overdue steps as COUNTIF(Обращения!J, "просрочен").
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date

import gspread
from google.oauth2.service_account import Credentials
from gspread.utils import ValueRenderOption, rowcol_to_a1

from .dates import fmt, parse_date, short, to_serial
from .models import (
    METRICS, STEP_DONE, STEP_OVERDUE, TERMINAL_STAGES, ActionChange, Contact, ContactChange,
    Goal, Lists, ParsedReport, Sale, SaleChange, SummaryRow, Task,
)

log = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

SHEET_ACTIONS = "Действия"
SHEET_CONTACTS = "Обращения"
SHEET_SALES = "Продажи"
SHEET_PLANS = "Планы"
SHEET_SUMMARY = "Сводка"
CONTACT_INPUT_COLS = tuple(range(9))                # A:I, J is bot-maintained
SALES_INPUT_COLS = (0, 1, 2, 3, 4, 5, 6, 9)         # A:G and J; H:I are formulas
SHEET_YEAR = "План года"
SHEET_TASKS = "Задачи"

CONTACT_COLS = ["Дата", "Источник", "Кто обратился", "Имя или ник", "Запрос", "Этап",
                "Следующий шаг", "Срок шага", "Комментарий", "Статус шага"]
SALES_COLS = ["Дата", "Направление", "Клиент", "Что продано", "Сумма, ₽", "Оплачено, ₽",
              "Источник", "Статус оплаты", "Долг, ₽", "Комментарий"]
TASK_COLS = ["ID", "Срок", "Задача", "Направление", "Цель (ID)", "Статус", "Источник", "Результат"]
GOAL_COLS = ["ID", "Период", "Направление", "Цель", "Метрика", "Целевое значение", "Единица",
             "Приоритет", "Комментарий"]

DATE_FORMAT = {"numberFormat": {"type": "DATE", "pattern": "dd.mm.yyyy"}}
COMMENT_LIMIT = 1000


class SheetError(RuntimeError):
    """A problem with the spreadsheet that the user can act on."""


# --- tiny helpers ------------------------------------------------------------------------

def _s(v) -> str:
    return "" if v is None else str(v).strip()


def number(v) -> float:
    if isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[\s ₽]", "", _s(v)).replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _num_out(x: float):
    return int(x) if float(x).is_integer() else round(x, 2)


def _a1(row: int, col: int) -> str:
    return rowcol_to_a1(row, col)


def _pad(row: list, n: int) -> list:
    return list(row) + [""] * (n - len(row))


def last_used_row(values: list[list], cols: tuple[int, ...] = (0,)) -> int:
    """1-based number of the last row with a value in any of `cols` (header is row 1).
    Callers pass only user-typed columns, never formula columns."""
    last = 1
    for r, row in enumerate(values[1:], start=2):
        if any(c < len(row) and _s(row[c]) != "" for c in cols):
            last = r
    return last


def _norm_name(s: str) -> str:
    return re.sub(r"[\s@_\-.]+", "", _s(s).casefold())


def same_person(a: str, b: str) -> bool:
    x, y = _norm_name(a), _norm_name(b)
    return bool(x) and bool(y) and (x in y or y in x)


@dataclass
class Write:
    range: str
    values: list[list]


@dataclass
class Plan:
    writes: list[Write] = field(default_factory=list)
    date_cells: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)  # human-readable outcome lines
    warnings: list[str] = field(default_factory=list)


# --- parsing -----------------------------------------------------------------------------

def parse_contacts(values: list[list]) -> list[Contact]:
    out = []
    for r, row in enumerate(values[1:], start=2):
        row = _pad(row, len(CONTACT_COLS))
        if not any(_s(x) for x in row[:9]):
            continue
        out.append(Contact(
            row=r, date=parse_date(row[0]), source=_s(row[1]), who=_s(row[2]), name=_s(row[3]),
            request=_s(row[4]), stage=_s(row[5]), next_step=_s(row[6]), due=parse_date(row[7]),
            comment=_s(row[8]), step_status=_s(row[9]),
        ))
    return out


def parse_sales(values: list[list]) -> list[Sale]:
    out = []
    for r, row in enumerate(values[1:], start=2):
        row = _pad(row, len(SALES_COLS))
        if not any(_s(x) for x in row[:7]):
            continue
        amount, paid = number(row[4]), number(row[5])
        debt = number(row[8]) if _s(row[8]) != "" else amount - paid
        out.append(Sale(r, parse_date(row[0]), _s(row[1]), _s(row[2]), _s(row[3]), amount, paid, debt))
    return out


def parse_tasks(values: list[list]) -> list[Task]:
    out = []
    for r, row in enumerate(values[1:], start=2):
        row = _pad(row, len(TASK_COLS))
        if _s(row[0]) == "" or not _s(row[2]):
            continue
        out.append(Task(id=int(number(row[0])), due=parse_date(row[1]), title=_s(row[2]),
                        direction=_s(row[3]), goal_id=_s(row[4]), status=_s(row[5]) or "Открыта",
                        source=_s(row[6]), result=_s(row[7]), row=r))
    return out


def parse_goals(values: list[list]) -> list[Goal]:
    out = []
    for row in values[1:]:
        row = _pad(row, len(GOAL_COLS))
        if not _s(row[3]):
            continue
        out.append(Goal(*[_s(x) for x in row[:9]]))
    return out


def parse_lists(values: list[list]) -> Lists:
    """Dropdown lists live in Планы, under the headers in row 2."""
    header = [_s(x) for x in (values[1] if len(values) > 1 else [])]

    def column(title: str) -> list[str]:
        if title not in header:
            return []
        c, items = header.index(title), []
        for row in values[2:]:
            v = _s(row[c]) if c < len(row) else ""
            if not v:
                break
            items.append(v)
        return items

    return Lists(sources=column("Источник"), who=column("Кто обратился"),
                 stages=column("Этап"), directions=column("Направление"))


@dataclass
class Target:
    row: int
    label: str
    value: str
    good_when: str


def parse_targets(values: list[list]) -> list[Target]:
    """Monthly plan: Планы!A:C from row 3 until the first blank label."""
    out = []
    for r, row in enumerate(values[2:], start=3):
        row = _pad(row, 3)
        if not _s(row[0]):
            break
        out.append(Target(r, _s(row[0]), _s(row[1]), _s(row[2])))
    return out


def parse_summary(values: list[list]) -> tuple[list[SummaryRow], dict[str, dict[str, str]]]:
    """Returns metric rows (formatted strings as shown) and the people funnel by stage."""
    rows: list[SummaryRow] = []
    funnel: dict[str, dict[str, str]] = {}
    start = next((i for i, r in enumerate(values) if r and _s(r[0]) == "Показатель"), None)
    if start is None:
        return rows, funnel
    in_funnel, cols = False, []
    for row in values[start + 1:]:
        row = _pad(row, 9)
        label = _s(row[0])
        if not label:
            continue
        if label.startswith("Воронка по людям"):
            in_funnel = True
            continue
        if in_funnel:
            if label == "Этап":
                cols = [_s(x) for x in row[1:4]]
            elif cols:
                funnel[label] = dict(zip(cols, [_s(x) for x in row[1:4]]))
            continue
        rows.append(SummaryRow(label, *[_s(x) for x in row[1:9]]))
    return rows, funnel


def is_section(row: SummaryRow) -> bool:
    return not any((row.today, row.week, row.month, row.plan, row.pct, row.per_day, row.light))


# --- write planning ----------------------------------------------------------------------

def plan_actions(values: list[list], changes: list[ActionChange]) -> Plan:
    """Per-day numbers: 'add' accumulates onto the day's row, 'set' overwrites (corrections)."""
    plan = Plan()
    header = [_s(x) for x in (values[0] if values else [])]
    col_of = {k: header.index(h) for k, h in METRICS.items() if h in header}
    row_of: dict[date, int] = {}
    for r, row in enumerate(values[1:], start=2):
        d = parse_date(row[0]) if row else None
        if d and d not in row_of:
            row_of[d] = r
    last = last_used_row(values)
    running: dict[tuple[int, int], float] = {}
    for ch in sorted(changes, key=lambda c: c.day):
        if ch.metric not in col_of:
            raise SheetError(f"В листе «{SHEET_ACTIONS}» нет колонки «{METRICS[ch.metric]}»")
        if ch.day not in row_of:
            last += 1
            row_of[ch.day] = last
            plan.writes.append(Write(_a1(last, 1), [[to_serial(ch.day)]]))
            plan.date_cells.append(_a1(last, 1))
        r, c = row_of[ch.day], col_of[ch.metric]
        if (r, c) not in running:
            existing = values[r - 1] if r - 1 < len(values) else []
            running[(r, c)] = number(existing[c]) if c < len(existing) else 0.0
        running[(r, c)] = ch.value if ch.mode == "set" else running[(r, c)] + ch.value
    plan.writes += [Write(_a1(r, c + 1), [[_num_out(v)]]) for (r, c), v in running.items()]
    return plan


def stamp_comment(old: str, new: str, day: date) -> str:
    line = f"{short(day)}: {new.strip()}"
    lines = [x for x in _s(old).split("\n") if x]
    lines.append(line)
    while len("\n".join(lines)) > COMMENT_LIMIT and len(lines) > 1:
        lines.pop(0)
    return "\n".join(lines)


def step_status(stage: str, next_step: str, due: date | None, done: bool, today: date) -> str:
    """Status written to Обращения!J. Only 'сделано' and 'просрочен' have meaning."""
    if done and not next_step:
        return STEP_DONE
    if stage not in TERMINAL_STAGES and due and due < today and next_step:
        return STEP_OVERDUE
    return ""


def plan_contacts(values: list[list], changes: list[ContactChange], today: date) -> Plan:
    plan = Plan()
    last = last_used_row(values, CONTACT_INPUT_COLS)
    for ch in changes:
        existing = None
        if ch.action == "update" and ch.row and 2 <= ch.row <= len(values):
            cand = _pad(values[ch.row - 1], len(CONTACT_COLS))
            if same_person(cand[3], ch.name):
                existing = (ch.row, cand)
            else:
                plan.warnings.append(
                    f"Строка {ch.row} в «{SHEET_CONTACTS}» теперь не «{ch.name}» — добавил как новую запись")
        elif ch.action == "update":
            plan.warnings.append(f"Не нашёл «{ch.name}» в «{SHEET_CONTACTS}» — добавил как новую запись")

        if existing is None:
            last += 1
            r = last
            stage = ch.stage or "Новый"
            next_step = ch.next_step or ""
            row = [to_serial(ch.day), ch.source or "Другое", ch.who or "Другое", ch.name,
                   ch.request or "", stage, next_step, to_serial(ch.due) if ch.due else "",
                   ch.comment or "", step_status(stage, next_step, ch.due, ch.step_done, today)]
            plan.writes.append(Write(f"A{r}:J{r}", [row]))
            plan.date_cells += [_a1(r, 1), _a1(r, 8)]
            plan.notes.append(f"новая запись: {ch.name}")
            continue

        r, cur = existing
        stage = ch.stage or _s(cur[5])
        if ch.next_step is not None:
            next_step, due = ch.next_step, ch.due
        elif ch.step_done:  # step finished and nothing new was named
            next_step, due = "", ch.due
        else:
            next_step, due = _s(cur[6]), ch.due or parse_date(cur[7])
        status = step_status(stage, next_step, due, ch.step_done, today)
        cell = lambda col, v: plan.writes.append(Write(_a1(r, col), [[v]]))  # noqa: E731
        if ch.stage:
            cell(6, stage)
        if ch.next_step is not None or ch.step_done:
            cell(7, next_step)
        if ch.next_step is not None or ch.step_done or ch.due:
            cell(8, to_serial(due) if due else "")
            plan.date_cells.append(_a1(r, 8))
        if ch.request:
            cell(5, ch.request)
        if ch.source:
            cell(2, ch.source)
        if ch.who:
            cell(3, ch.who)
        if ch.comment:
            cell(9, stamp_comment(_s(cur[8]), ch.comment, today))
        cell(10, status)
        plan.notes.append(f"обновил: {_s(cur[3]) or ch.name}")
    return plan


def plan_sales(values: list[list], changes: list[SaleChange]) -> Plan:
    plan = Plan()
    last = last_used_row(values, SALES_INPUT_COLS)
    for ch in changes:
        target = None
        if ch.action == "add_payment" and ch.row and 2 <= ch.row <= len(values):
            cand = _pad(values[ch.row - 1], len(SALES_COLS))
            if same_person(cand[2], ch.client):
                target = (ch.row, cand)
            else:
                plan.warnings.append(f"Строка {ch.row} в «{SHEET_SALES}» теперь не «{ch.client}» — платёж не записан")
                continue
        elif ch.action == "add_payment":
            plan.warnings.append(f"Не нашёл продажу «{ch.client}» — платёж не записан")
            continue
        if target:
            r, cur = target
            plan.writes.append(Write(_a1(r, 6), [[_num_out(number(cur[5]) + (ch.paid or 0))]]))
            plan.notes.append(f"доплата {_num_out(ch.paid or 0)} ₽: {ch.client}")
            continue
        last += 1
        r = last
        # Only A:G and J: H:I are formulas
        plan.writes.append(Write(f"A{r}:G{r}", [[
            to_serial(ch.day), ch.direction or "Другое", ch.client, ch.what or "",
            _num_out(ch.amount or 0), _num_out(ch.paid or 0), ch.source or "Другое"]]))
        if ch.comment:
            plan.writes.append(Write(_a1(r, 10), [[ch.comment]]))
        plan.date_cells.append(_a1(r, 1))
        plan.notes.append(f"продажа {_num_out(ch.amount or 0)} ₽: {ch.client}")
    return plan


def plan_overdue_flags(contacts: list[Contact], today: date) -> Plan:
    """Keeps Обращения!J in sync so Сводка's COUNTIF('просрочен') is right.
    Never touches 'сделано' or any status the user typed by hand."""
    plan = Plan()
    for c in contacts:
        if c.step_status.strip().lower() not in ("", STEP_OVERDUE):
            continue
        want = step_status(c.stage, c.next_step, c.due, False, today)
        if want != c.step_status:
            plan.writes.append(Write(_a1(c.row, 10), [[want]]))
    return plan


# --- gspread wrapper ---------------------------------------------------------------------

@dataclass
class ApplyResult:
    lines: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class Journal:
    def __init__(self, spreadsheet):
        self.sh = spreadsheet

    @classmethod
    def from_settings(cls, settings) -> "Journal":
        creds = Credentials.from_service_account_info(settings.google_credentials, scopes=SCOPES)
        try:
            return cls(gspread.authorize(creds).open_by_key(settings.spreadsheet_id))
        except gspread.SpreadsheetNotFound as e:
            raise SheetError(
                "Таблица не найдена или нет доступа: дай сервис-аккаунту "
                f"({settings.google_credentials.get('client_email')}) права редактора") from e

    # low-level
    def _ws(self, name: str):
        try:
            return self.sh.worksheet(name)
        except gspread.WorksheetNotFound as e:
            raise SheetError(f"В таблице нет листа «{name}»") from e

    def _values(self, name: str, formatted: bool = False) -> list[list]:
        mode = ValueRenderOption.formatted if formatted else ValueRenderOption.unformatted
        return self._ws(name).get_all_values(value_render_option=mode)

    def _apply(self, name: str, plan: Plan) -> None:
        if not plan.writes:
            return
        ws = self._ws(name)
        needed = max(int(re.search(r"(\d+)$", w.range.split(":")[-1]).group(1)) for w in plan.writes)
        if needed > ws.row_count:
            ws.add_rows(needed - ws.row_count + 50)
        ws.batch_update([{"range": w.range, "values": w.values} for w in plan.writes], raw=True)
        if plan.date_cells:
            ws.batch_format([{"range": c, "format": DATE_FORMAT} for c in plan.date_cells])

    # schema
    def schema_problems(self) -> list[str]:
        """Read-only check of the sheets the bot depends on."""
        problems = []
        required = {SHEET_ACTIONS: (1, ["Дата", *METRICS.values()]), SHEET_CONTACTS: (1, CONTACT_COLS),
                    SHEET_SALES: (1, SALES_COLS), SHEET_PLANS: (2, ["Показатель", "План на месяц"]),
                    SHEET_SUMMARY: (1, [])}
        for name, (header_row, cols) in required.items():
            try:
                header = [_s(x) for x in self.sh.worksheet(name).row_values(header_row)]
            except gspread.WorksheetNotFound:
                problems.append(f"нет листа «{name}»")
                continue
            miss = [c for c in cols if c not in header]
            if miss:
                problems.append(f"в листе «{name}» нет колонок: {', '.join(miss)}")
        return problems

    def ensure_schema(self) -> list[str]:
        """Creates the two bot-owned tabs if missing; returns problems with the existing ones."""
        for name, cols, date_col in ((SHEET_YEAR, GOAL_COLS, None), (SHEET_TASKS, TASK_COLS, "B")):
            try:
                self.sh.worksheet(name)
            except gspread.WorksheetNotFound:
                ws = self.sh.add_worksheet(title=name, rows=500, cols=len(cols) + 2)
                ws.batch_update([{"range": "A1", "values": [cols]}], raw=True)
                ws.freeze(rows=1)
                ws.format(f"A1:{_a1(1, len(cols))}", {"textFormat": {"bold": True}})
                if date_col:
                    ws.format(f"{date_col}2:{date_col}", DATE_FORMAT)
                log.info("created sheet %s", name)
        return self.schema_problems()

    # reads
    def lists(self) -> Lists:
        return parse_lists(self._values(SHEET_PLANS, formatted=True))

    def targets(self) -> list[Target]:
        return parse_targets(self._values(SHEET_PLANS, formatted=True))

    def summary(self):
        return parse_summary(self._values(SHEET_SUMMARY, formatted=True))

    def contacts(self) -> list[Contact]:
        return parse_contacts(self._values(SHEET_CONTACTS))

    def sales(self) -> list[Sale]:
        return parse_sales(self._values(SHEET_SALES))

    def tasks(self) -> list[Task]:
        return parse_tasks(self._values(SHEET_TASKS))

    def goals(self) -> list[Goal]:
        return parse_goals(self._values(SHEET_YEAR, formatted=True))

    def action_rows(self, since: date) -> list[tuple[date, dict[str, float]]]:
        values = self._values(SHEET_ACTIONS)
        header = [_s(x) for x in values[0]] if values else []
        out = []
        for row in values[1:]:
            d = parse_date(row[0]) if row else None
            if d and d >= since:
                out.append((d, {k: number(row[header.index(h)]) for k, h in METRICS.items()
                                if h in header and header.index(h) < len(row)}))
        return sorted(out)

    # writes
    def apply_report(self, parsed: ParsedReport, today: date) -> ApplyResult:
        """Writes each part independently so one failure does not lose the others."""
        res = ApplyResult()

        def step(label: str, fn):
            try:
                fn()
            except Exception as e:  # noqa: BLE001 - reported to the user, not swallowed
                log.exception("apply %s failed", label)
                res.errors.append(f"{label}: {e}")

        if parsed.actions:
            def do_actions():
                plan = plan_actions(self._values(SHEET_ACTIONS), parsed.actions)
                self._apply(SHEET_ACTIONS, plan)
                res.lines.append(f"цифры дня: {len(parsed.actions)} показ.")
            step("Действия", do_actions)
        if parsed.contacts:
            def do_contacts():
                plan = plan_contacts(self._values(SHEET_CONTACTS), parsed.contacts, today)
                self._apply(SHEET_CONTACTS, plan)
                res.lines += [f"{SHEET_CONTACTS}: {n}" for n in plan.notes]
                res.errors += plan.warnings
            step("Обращения", do_contacts)
        if parsed.sales:
            def do_sales():
                plan = plan_sales(self._values(SHEET_SALES), parsed.sales)
                self._apply(SHEET_SALES, plan)
                res.lines += [f"{SHEET_SALES}: {n}" for n in plan.notes]
                res.errors += plan.warnings
            step("Продажи", do_sales)
        if parsed.tasks_done or parsed.tasks_cancelled or parsed.tasks_moved or parsed.tasks_new:
            def do_tasks():
                res.lines += self._apply_task_changes(parsed, today)
            step("Задачи", do_tasks)
        return res

    def _apply_task_changes(self, parsed: ParsedReport, today: date) -> list[str]:
        values = self._values(SHEET_TASKS)
        tasks = {t.id: t for t in parse_tasks(values)}
        plan, lines = Plan(), []
        for tid in parsed.tasks_done:
            if tid in tasks:
                plan.writes.append(Write(_a1(tasks[tid].row, 6), [["Сделано"]]))
                lines.append(f"задача #{tid} выполнена")
        for tid in parsed.tasks_cancelled:
            if tid in tasks:
                plan.writes.append(Write(_a1(tasks[tid].row, 6), [["Отменена"]]))
                lines.append(f"задача #{tid} отменена")
        for tid, new_due in parsed.tasks_moved:
            if tid in tasks:
                plan.writes.append(Write(_a1(tasks[tid].row, 2), [[to_serial(new_due)]]))
                plan.date_cells.append(_a1(tasks[tid].row, 2))
                lines.append(f"задача #{tid} перенесена на {fmt(new_due)}")
        if parsed.tasks_new:
            nxt, last = max(tasks, default=0) + 1, last_used_row(values)
            for t in parsed.tasks_new:
                last += 1
                plan.writes.append(Write(f"A{last}:H{last}", [[
                    nxt, to_serial(t.due) if t.due else "", t.title, t.direction, "", "Открыта",
                    "из отчёта", ""]]))
                if t.due:
                    plan.date_cells.append(_a1(last, 2))
                lines.append(f"новая задача #{nxt}: {t.title}")
                nxt += 1
        self._apply(SHEET_TASKS, plan)
        return lines

    def add_tasks(self, items: list[tuple[date, str, str, str]], source: str) -> list[int]:
        """items: (due, title, direction, goal_id). Returns the new task ids."""
        values = self._values(SHEET_TASKS)
        nxt, last = max((t.id for t in parse_tasks(values)), default=0) + 1, last_used_row(values)
        plan, ids = Plan(), []
        for due, title, direction, goal_id in items:
            last += 1
            plan.writes.append(Write(f"A{last}:H{last}", [[
                nxt, to_serial(due), title, direction, goal_id, "Открыта", source, ""]]))
            plan.date_cells.append(_a1(last, 2))
            ids.append(nxt)
            nxt += 1
        self._apply(SHEET_TASKS, plan)
        return ids

    def cancel_open_tasks(self, source: str) -> int:
        values = self._values(SHEET_TASKS)
        plan = Plan(writes=[Write(_a1(t.row, 6), [["Отменена"]])
                            for t in parse_tasks(values) if t.is_open and t.source == source])
        self._apply(SHEET_TASKS, plan)
        return len(plan.writes)

    def replace_goals(self, goals: list[Goal]) -> None:
        ws = self._ws(SHEET_YEAR)
        ws.batch_clear([f"A2:{_a1(ws.row_count, len(GOAL_COLS))}"])
        rows = [[g.id, g.period, g.direction, g.goal, g.metric, g.target, g.unit, g.priority, g.comment]
                for g in goals]
        if rows:
            self._apply(SHEET_YEAR, Plan(writes=[Write(f"A2:{_a1(1 + len(rows), len(GOAL_COLS))}", rows)]))

    def set_target(self, label: str, value: float) -> None:
        for t in self.targets():
            if t.label == label:
                self._apply(SHEET_PLANS, Plan(writes=[Write(_a1(t.row, 2), [[_num_out(value)]])]))
                return
        raise SheetError(f"В листе «{SHEET_PLANS}» нет показателя «{label}»")

    def sync_overdue(self, today: date, contacts: list[Contact] | None = None) -> int:
        plan = plan_overdue_flags(contacts if contacts is not None else self.contacts(), today)
        self._apply(SHEET_CONTACTS, plan)
        return len(plan.writes)
