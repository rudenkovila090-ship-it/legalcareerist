"""Plain data types shared across the bot."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

TERMINAL_STAGES = {"Выход", "Отказ", "Закрыто"}
STEP_DONE = "сделано"
STEP_OVERDUE = "просрочен"  # the exact word Сводка counts with COUNTIF

# Действия columns: metric key -> header in row 1 of the sheet.
METRICS: dict[str, str] = {
    "touches": "Касания работодателям",
    "replies": "Ответы работодателей",
    "calls": "Созвоны и встречи",
    "proposals": "КП отправлено",
    "contracts": "Договоры подписаны (новые клиенты)",
    "new_residents": "Новые резиденты",
    "left_residents": "Ушло резидентов",
    "events_held": "Мероприятий проведено",
    "attendees": "Участников пришло",
    "posts": "Посты и контент, шт",
    "expenses": "Расходы за день, ₽",
    "hours_total": "Часы работы",
    "hours_sales": "Часы на продажи",
}


@dataclass
class Contact:
    """One row of Обращения: a person and the current next step with them."""
    row: int
    date: date | None
    source: str = ""
    who: str = ""
    name: str = ""
    request: str = ""
    stage: str = ""
    next_step: str = ""
    due: date | None = None
    comment: str = ""
    step_status: str = ""

    @property
    def is_open(self) -> bool:
        return self.stage not in TERMINAL_STAGES and self.step_status.strip().lower() != STEP_DONE

    def effective_due(self, followup_days: int) -> date | None:
        """Real deadline, or an implied one for legacy rows that never got a deadline."""
        if not self.is_open:
            return None
        if self.due:
            return self.due
        if self.date and self.next_step:
            return self.date + timedelta(days=followup_days)
        return None


@dataclass
class Sale:
    row: int
    date: date | None
    direction: str
    client: str
    what: str
    amount: float
    paid: float
    debt: float


@dataclass
class Task:
    id: int
    due: date | None
    title: str
    direction: str = ""
    goal_id: str = ""
    status: str = "Открыта"
    source: str = ""
    result: str = ""
    row: int = 0

    @property
    def is_open(self) -> bool:
        return self.status == "Открыта"


@dataclass
class Goal:
    id: str
    period: str
    direction: str
    goal: str
    metric: str = ""
    target: str = ""
    unit: str = ""
    priority: str = ""
    comment: str = ""


@dataclass
class SummaryRow:
    label: str
    today: str = ""
    week: str = ""
    month: str = ""
    plan: str = ""
    pct: str = ""
    per_day: str = ""
    light: str = ""
    good_when: str = ""


@dataclass
class Lists:
    """Dropdown values read live from the Планы sheet, so edits there are followed."""
    sources: list[str] = field(default_factory=list)
    who: list[str] = field(default_factory=list)
    stages: list[str] = field(default_factory=list)
    directions: list[str] = field(default_factory=list)


# --- result of parsing a free-text report -------------------------------------------------

@dataclass
class ActionChange:
    metric: str  # key of METRICS
    value: float
    mode: str  # "add" | "set"
    day: date


@dataclass
class ContactChange:
    action: str  # "new" | "update"
    row: int | None
    day: date
    name: str
    source: str | None = None
    who: str | None = None
    request: str | None = None
    stage: str | None = None
    next_step: str | None = None
    due: date | None = None
    step_done: bool = False
    comment: str | None = None


@dataclass
class SaleChange:
    action: str  # "new" | "add_payment"
    row: int | None
    day: date
    direction: str | None
    client: str
    what: str | None
    amount: float | None
    paid: float | None  # for add_payment: the extra payment received now
    source: str | None = None
    comment: str | None = None


@dataclass
class NewTask:
    title: str
    due: date | None
    direction: str = ""


@dataclass
class ParsedReport:
    actions: list[ActionChange] = field(default_factory=list)
    contacts: list[ContactChange] = field(default_factory=list)
    sales: list[SaleChange] = field(default_factory=list)
    tasks_done: list[int] = field(default_factory=list)
    tasks_cancelled: list[int] = field(default_factory=list)
    tasks_moved: list[tuple[int, date]] = field(default_factory=list)
    tasks_new: list[NewTask] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not (self.actions or self.contacts or self.sales or self.tasks_done
                    or self.tasks_cancelled or self.tasks_moved or self.tasks_new)
