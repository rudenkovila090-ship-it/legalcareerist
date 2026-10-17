"""Messages the bot sends on its own, and the data digests handed to Claude.

Everything countable (overdue steps, deadlines, traffic lights) is computed here in code;
Claude only words conclusions about numbers it is given.
"""
from __future__ import annotations

import html
from dataclasses import dataclass, field
from datetime import date, timedelta

from .dates import fmt, monday, short, weekday_name
from .models import METRICS, Contact, Goal, ParsedReport, SummaryRow, Task
from .sheets import Journal, Target, is_section

ACTIVE_STAGES = {"Новый", "В работе", "Интервью", "Оффер"}
SECTION_CAP = 8
TG_LIMIT = 3900  # Telegram caps a message at 4096 characters


@dataclass
class Snapshot:
    today: date
    followup_days: int
    contacts: list[Contact] = field(default_factory=list)
    tasks: list[Task] = field(default_factory=list)
    goals: list[Goal] = field(default_factory=list)
    summary: list[SummaryRow] = field(default_factory=list)
    funnel: dict = field(default_factory=dict)
    targets: list[Target] = field(default_factory=list)


def load(journal: Journal, today: date, followup_days: int, *parts: str) -> Snapshot:
    """Reads only the sheets that were asked for (Sheets API quota is 60 reads/min)."""
    s = Snapshot(today, followup_days)
    if "contacts" in parts:
        s.contacts = journal.contacts()
    if "tasks" in parts:
        s.tasks = journal.tasks()
    if "goals" in parts:
        s.goals = journal.goals()
    if "summary" in parts:
        s.summary, s.funnel = journal.summary()
    if "targets" in parts:
        s.targets = journal.targets()
    return s


def esc(s) -> str:
    return html.escape(str(s), quote=False)


def cut(s: str, n: int = 110) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


# --- buckets -----------------------------------------------------------------------------

def contact_buckets(snap: Snapshot):
    """(overdue, due today, due tomorrow, open but without a next step), each sorted by due."""
    overdue, today_, tomorrow, no_step = [], [], [], []
    for c in snap.contacts:
        if not c.is_open:
            continue
        due = c.effective_due(snap.followup_days)
        if due is None:
            if c.stage in ACTIVE_STAGES and not c.next_step:
                no_step.append(c)
        elif due < snap.today:
            overdue.append(c)
        elif due == snap.today:
            today_.append(c)
        elif due == snap.today + timedelta(days=1):
            tomorrow.append(c)
    key = lambda c: c.effective_due(snap.followup_days) or snap.today  # noqa: E731
    return sorted(overdue, key=key), sorted(today_, key=key), sorted(tomorrow, key=key), no_step


def contact_line(c: Contact, snap: Snapshot) -> str:
    due = c.effective_due(snap.followup_days)
    who = f" ({esc(c.who)})" if c.who else ""
    step = esc(cut(c.next_step, 80)) if c.next_step else "определить следующий шаг"
    topic = f" · <i>{esc(cut(c.request, 90))}</i>" if c.request else ""
    tail = ""
    if due and due < snap.today:
        tail = f" — просрочено на {(snap.today - due).days} дн."
    if c.due is None and due:
        tail += " (срок не задан)"
    return f"• <b>{esc(cut(c.name, 60))}</b>{who} — {step}{topic}{tail}"


def _capped(lines: list[str]) -> list[str]:
    if len(lines) <= SECTION_CAP:
        return lines
    return lines[:SECTION_CAP] + [f"…и ещё {len(lines) - SECTION_CAP}"]


def task_line(t: Task, today: date) -> str:
    late = f" (с {short(t.due)})" if t.due and t.due < today else ""
    d = f" [{esc(t.direction)}]" if t.direction else ""
    return f"• #{t.id} {esc(cut(t.title, 120))}{d}{late}"


def lagging_rows(summary: list[SummaryRow]) -> list[SummaryRow]:
    """Metrics the traffic light marks red or yellow, red first."""
    bad = [r for r in summary if not is_section(r) and r.light in ("🔴", "🟡")]
    return sorted(bad, key=lambda r: r.light != "🔴")


def metric_line(r: SummaryRow) -> str:
    need = f", нужно {r.per_day}/день" if r.per_day else ""
    plan = f" из {r.plan}" if r.plan else ""
    pct = f" ({r.pct})" if r.pct else ""
    arrow = " (лимит)" if r.good_when == "↓" else ""
    return f"{r.light} {esc(r.label.strip())}{arrow}: {esc(r.month)}{plan}{pct}{need}"


# --- messages ----------------------------------------------------------------------------

def morning_message(snap: Snapshot, focus: str = "") -> str:
    t = snap.today
    overdue, due_today, tomorrow, no_step = contact_buckets(snap)
    out = [f"<b>☀️ Доброе утро! {weekday_name(t).capitalize()}, {fmt(t)}</b>"]

    if overdue:
        out += ["", f"<b>🔴 Просрочено ({len(overdue)})</b>"] + _capped([contact_line(c, snap) for c in overdue])
    if due_today:
        out += ["", f"<b>📌 Написать / сделать сегодня ({len(due_today)})</b>"] + _capped([contact_line(c, snap) for c in due_today])
    tasks = sorted((x for x in snap.tasks if x.is_open and x.due and x.due <= t), key=lambda x: x.due)
    if tasks:
        out += ["", f"<b>✅ Задачи на сегодня ({len(tasks)})</b>"] + _capped([task_line(x, t) for x in tasks])
    if not (overdue or due_today or tasks):
        out += ["", "На сегодня срочных шагов нет. Хороший день для новых касаний и контента."]
    if tomorrow:
        out += ["", f"Завтра в очереди: {len(tomorrow)} " + ", ".join(esc(cut(c.name, 30)) for c in tomorrow[:4])]
    if no_step:
        out += ["", f"<b>❓ Нет следующего шага ({len(no_step)})</b>",
                ", ".join(esc(cut(c.name, 30)) for c in no_step[:6]) + ("…" if len(no_step) > 6 else "")]
    lag = lagging_rows(snap.summary)
    if lag:
        out += ["", "<b>📊 Темп месяца: отстаём</b>"] + [metric_line(r) for r in lag[:6]]
    if focus:
        out += ["", "<b>🎯 Фокус дня</b>", esc(focus)]
    return "\n".join(out)


NUMBER_ROWS = ("Касания работодателям", "Ответы работодателей", "Созвоны и встречи", "КП отправлено",
               "Новые клиенты", "Новые резиденты", "Новые обращения всего", "Выручка итого", "Часы на продажи")


def evening_message(snap: Snapshot) -> str:
    t = snap.today
    done = [r for r in snap.summary if not is_section(r) and r.today not in ("", "0", "0%")
            and any(r.label.strip().startswith(p) for p in NUMBER_ROWS)]
    out = [f"<b>🌙 Вечер, {fmt(t)}. Подведём день</b>", ""]
    if done:
        out.append("В журнале за сегодня: " + "; ".join(f"{esc(r.label.strip())} — {esc(r.today)}" for r in done))
    else:
        out.append("За сегодня в журнале пока пусто.")
    overdue, due_today, _, _ = contact_buckets(snap)
    open_tasks = [x for x in snap.tasks if x.is_open and x.due and x.due <= t]
    if due_today or overdue or open_tasks:
        out += ["", "<b>Не закрыто:</b>"]
        out += _capped([contact_line(c, snap) for c in (overdue + due_today)] + [task_line(x, t) for x in open_tasks])
    out += ["", "Пришли отчёт одним сообщением в свободной форме: кому писал, кто ответил, что продал, "
                "что сделал по задачам. Я разнесу всё по таблице."]
    return "\n".join(out)


def stats_message(snap: Snapshot) -> str:
    out = [f"<b>📊 Сводка на {fmt(snap.today)}</b>", ""]
    for r in snap.summary:
        if is_section(r):
            out += ["", f"<b>{esc(r.label)}</b>"]
        else:
            nums = [f"сег {r.today}", f"7д {r.week}", f"мес {r.month}"]
            if r.plan:
                nums.append(f"план {r.plan} ({r.pct})")
            out.append(f"{r.light} {esc(r.label.strip())}: " + ", ".join(esc(n) for n in nums))
    if snap.funnel:
        out += ["", "<b>Воронка (кандидаты / работодатели / резиденты)</b>"]
        for stage, v in snap.funnel.items():
            out.append(f"{esc(stage)}: " + " / ".join(esc(x) for x in v.values()))
    return "\n".join(out)


def tasks_message(tasks: list[Task], today: date) -> str:
    week_end = monday(today) + timedelta(days=6)
    mine = sorted((t for t in tasks if t.is_open and t.due and t.due <= week_end), key=lambda t: (t.due, t.id))
    if not mine:
        return "Открытых задач на эту неделю нет. /week — составить план недели."
    out, cur = [f"<b>🗓 Задачи до конца недели ({len(mine)})</b>"], None
    for t in mine:
        if t.due != cur:
            cur = t.due
            mark = " — просрочено" if cur < today else (" — сегодня" if cur == today else "")
            out += ["", f"<b>{weekday_name(cur).capitalize()}, {short(cur)}{mark}</b>"]
        out.append(task_line(t, cur))
    return "\n".join(out)


# --- digests for Claude ------------------------------------------------------------------

def period_covers(period: str, d: date) -> bool:
    """'2026' = whole year, '2026-Q4' = quarter, '2026-11' = month."""
    if not period or not period[:4].isdigit() or int(period[:4]) != d.year:
        return False
    rest = period[4:]
    if not rest:
        return True
    if rest.startswith("-Q"):
        return rest[2:].isdigit() and (d.month - 1) // 3 + 1 == int(rest[2:])
    return rest[1:].isdigit() and d.month == int(rest[1:])


def summary_digest(summary: list[SummaryRow]) -> str:
    lines = ["показатель | сегодня | 7 дней | месяц | план | % плана | нужно в день | светофор"]
    for r in summary:
        if not is_section(r):
            lines.append(" | ".join([r.label.strip(), r.today, r.week, r.month, r.plan or "-", r.pct or "-",
                                     r.per_day or "-", r.light or "-"]))
    return "\n".join(lines)


def goals_digest(goals: list[Goal], today: date) -> str:
    if not goals:
        return "(план года не загружен)"
    lines = ["id | период | направление | цель | метрика/цель | приоритет | действует сейчас"]
    for g in goals:
        measure = " ".join(x for x in (g.metric, g.target, g.unit) if x) or "-"
        lines.append(f"{g.id} | {g.period} | {g.direction} | {cut(g.goal, 140)} | {measure} | {g.priority} | "
                     f"{'да' if period_covers(g.period, today) else 'нет'}")
    return "\n".join(lines)


def people_digest(snap: Snapshot) -> str:
    overdue, due_today, tomorrow, no_step = contact_buckets(snap)
    funnel = "; ".join(f"{stage}: " + "/".join(v.values()) for stage, v in snap.funnel.items()) or "-"
    return (f"Шагов по людям: просрочено {len(overdue)}, на сегодня {len(due_today)}, на завтра {len(tomorrow)}, "
            f"без следующего шага {len(no_step)}.\nВоронка (кандидаты/работодатели/резиденты) — {funnel}")


def tasks_digest(tasks: list[Task], start: date, end: date) -> str:
    inside = [t for t in tasks if t.due and start <= t.due <= end]
    by = {s: sum(1 for t in inside if t.status == s) for s in ("Сделано", "Открыта", "Отменена")}
    carried = [t for t in tasks if t.is_open and t.due and t.due < start]
    lines = [f"Задач со сроком {fmt(start)}–{fmt(end)}: сделано {by['Сделано']}, открыто {by['Открыта']}, "
             f"отменено {by['Отменена']}. Просрочено с прошлых периодов: {len(carried)}."]
    lines += [f"- ОТКРЫТА #{t.id} до {short(t.due)}: {cut(t.title, 100)}" for t in inside if t.is_open][:15]
    lines += [f"- СДЕЛАНО #{t.id}: {cut(t.title, 100)}" for t in inside if t.status == "Сделано"][:15]
    return "\n".join(lines)


def targets_digest(targets: list[Target]) -> str:
    return "\n".join(f"{t.label} | {t.value} | хорошо когда {t.good_when}" for t in targets)


def focus_context(snap: Snapshot) -> str:
    t = snap.today
    return (f"Сегодня {fmt(t)}, {weekday_name(t)}.\n\nТЕМП МЕСЯЦА\n{summary_digest(snap.summary)}\n\n"
            f"ЛЮДИ\n{people_digest(snap)}\n\nЗАДАЧИ\n{tasks_digest(snap.tasks, t, t)}\n\n"
            f"ЦЕЛИ ГОДА\n{goals_digest(snap.goals, t)}")


def week_context(snap: Snapshot) -> str:
    t = snap.today
    return (f"Сегодня {t.isoformat()} ({weekday_name(t)}). Конец недели: {(monday(t) + timedelta(days=6)).isoformat()}.\n\n"
            f"ЦЕЛИ ГОДА\n{goals_digest(snap.goals, t)}\n\nТЕМП МЕСЯЦА\n{summary_digest(snap.summary)}\n\n"
            f"ЛЮДИ\n{people_digest(snap)}\n\nНЕЗАКРЫТОЕ С ПРОШЛЫХ ДНЕЙ\n"
            f"{tasks_digest(snap.tasks, monday(t) - timedelta(days=7), t)}")


def review_context(snap: Snapshot, kind: str, start: date, end: date, daily_rows: list) -> str:
    daily = "\n".join(f"{fmt(d)}: " + ", ".join(f"{k}={v:g}" for k, v in vals.items() if v) for d, vals in daily_rows)
    return (f"Разбор: {kind} ({fmt(start)}–{fmt(end)}). Сегодня {fmt(snap.today)}.\n\n"
            f"СВОДКА\n{summary_digest(snap.summary)}\n\nПО ДНЯМ (цифры из журнала)\n{daily or '(пусто)'}\n\n"
            f"ЗАДАЧИ\n{tasks_digest(snap.tasks, start, end)}\n\nЛЮДИ\n{people_digest(snap)}\n\n"
            f"ЦЕЛИ ГОДА\n{goals_digest(snap.goals, snap.today)}")


def targets_context(snap: Snapshot) -> str:
    return (f"Сегодня {fmt(snap.today)}.\n\nЦЕЛИ ГОДА\n{goals_digest(snap.goals, snap.today)}\n\n"
            f"ТЕКУЩИЕ МЕСЯЧНЫЕ ЦЕЛИ (показатель | значение | направление)\n{targets_digest(snap.targets)}\n\n"
            f"ФАКТ\n{summary_digest(snap.summary)}")


# --- sending -----------------------------------------------------------------------------

def split_message(text: str, limit: int = TG_LIMIT) -> list[str]:
    """Splits on line breaks so HTML tags (always closed within a line) stay intact."""
    parts, cur = [], ""
    for line in text.split("\n"):
        if cur and len(cur) + len(line) + 1 > limit:
            parts.append(cur)
            cur = ""
        cur = f"{cur}\n{line}" if cur else line
    if cur:
        parts.append(cur)
    return parts or [""]


# --- report preview ----------------------------------------------------------------------

def num(x: float) -> str:
    if float(x).is_integer():
        return f"{int(x):,}".replace(",", "\u00a0")
    return f"{x:.2f}".rstrip("0").rstrip(".")


def preview_text(p: ParsedReport) -> str:
    out = ["<b>Разобрал отчёт. Проверь и подтверди запись:</b>"]
    if p.actions:
        out += ["", "<b>📊 Цифры дня</b>"]
        for a in p.actions:
            op = f"+{num(a.value)}" if a.mode == "add" else f"= {num(a.value)} (исправление)"
            out.append(f"• {short(a.day)} · {esc(METRICS[a.metric])}: {op}")
    if p.contacts:
        out += ["", "<b>👤 Люди</b>"]
        for c in p.contacts:
            step = ""
            if c.next_step:
                step = f" → «{esc(cut(c.next_step, 80))}»" + (f" до {fmt(c.due)}" if c.due else "")
            if c.action == "new":
                meta = ", ".join(esc(x) for x in (c.source, c.who) if x)
                out.append(f"• <b>Новый</b> — {esc(c.name)}" + (f" ({meta})" if meta else "")
                           + (f" · {esc(cut(c.request or '', 90))}" if c.request else "") + step)
            else:
                bits = [f"этап → {esc(c.stage)}" if c.stage else "", "прошлый шаг выполнен ✔" if c.step_done else "",
                        step.strip(" →") and f"новый шаг{step}", esc(cut(c.comment, 80)) if c.comment else ""]
                out.append(f"• <b>Обновляю</b> — {esc(c.name)}: " + "; ".join(b for b in bits if b))
    if p.sales:
        out += ["", "<b>💰 Продажи</b>"]
        for s in p.sales:
            if s.action == "new":
                out.append(f"• {esc(s.client)} — {esc(s.what or '')}, {num(s.amount or 0)} ₽ "
                           f"(оплачено {num(s.paid or 0)}), {esc(s.direction or 'Другое')}")
            else:
                out.append(f"• Доплата {esc(s.client)}: +{num(s.paid or 0)} ₽")
    task_bits = ([f"выполнена #{i}" for i in p.tasks_done] + [f"отменена #{i}" for i in p.tasks_cancelled]
                 + [f"#{i} → {fmt(d)}" for i, d in p.tasks_moved]
                 + [f"новая «{esc(cut(t.title, 70))}»" + (f" до {fmt(t.due)}" if t.due else "") for t in p.tasks_new])
    if task_bits:
        out += ["", "<b>✅ Задачи</b>"] + [f"• {b}" for b in task_bits]
    if p.warnings:
        out += ["", "<b>⚠️ Обрати внимание</b>"] + [f"• {esc(w)}" for w in p.warnings]
    if p.questions:
        out += ["", "<b>❓ Нужно уточнить</b> (ответь сообщением — я учту)"] + [f"• {esc(q)}" for q in p.questions]
    return "\n".join(out)
