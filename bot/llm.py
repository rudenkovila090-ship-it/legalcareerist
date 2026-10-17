"""Claude calls: free-text report -> structured journal changes, plans, reviews.

Structured outputs (`output_config.format`) guarantee schema-valid JSON, but the model can
still pick a wrong row or an impossible date, so everything is validated again in
`to_parsed_report` before the human sees the preview.
"""
from __future__ import annotations

import base64
import json
import logging
import re
from datetime import date, timedelta

import anthropic

from .dates import parse_date, weekday_name
from .models import (
    METRICS, ActionChange, Contact, ContactChange, Goal, Lists, NewTask, ParsedReport, Sale,
    SaleChange, Task,
)

log = logging.getLogger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"
PERIOD_RE = re.compile(r"^\d{4}(-Q[1-4]|-(0[1-9]|1[0-2]))?$")


class ModelRefused(RuntimeError):
    """Safety classifiers declined the request (and so did the fallback)."""


# --- schema helpers ----------------------------------------------------------------------

def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def _enum(values: list[str]) -> dict:
    return {"type": "string", "enum": list(values)} if values else {"type": "string"}


def _opt_enum(values: list[str]) -> dict:
    """Enum that also allows "" for 'no value' (no anyOf/null: keeps the schema union-free,
    which stays well inside structured-output complexity limits)."""
    return _enum([""] + list(values)) if values else {"type": "string"}


_STR = {"type": "string"}
_OPT_STR = {"type": "string", "description": "пустая строка, если нет"}
_INT = {"type": "integer"}
_OPT_INT = {"type": "integer", "description": "0, если не применимо"}
_NUM = {"type": "number"}
_OPT_NUM = {"type": "number", "description": "0, если не применимо"}
_ISO = {"type": "string", "description": "дата YYYY-MM-DD"}
_OPT_ISO = {"type": "string", "description": "дата YYYY-MM-DD или пустая строка, если нет"}


def report_schema(lists: Lists) -> dict:
    return _obj({
        "actions": {"type": "array", "items": _obj({
            "metric": _enum(list(METRICS)), "value": _NUM, "mode": _enum(["add", "set"]), "date": _ISO})},
        "contacts": {"type": "array", "items": _obj({
            "action": _enum(["new", "update"]), "row": _OPT_INT, "date": _ISO, "name": _STR,
            "source": _opt_enum(lists.sources), "who": _opt_enum(lists.who),
            "request": _OPT_STR, "stage": _opt_enum(lists.stages),
            "next_step": _OPT_STR, "next_step_due": _OPT_ISO,
            "step_done": {"type": "boolean"}, "comment": _OPT_STR})},
        "sales": {"type": "array", "items": _obj({
            "action": _enum(["new", "add_payment"]), "row": _OPT_INT, "date": _ISO,
            "direction": _opt_enum(lists.directions), "client": _STR, "what": _OPT_STR,
            "amount": _OPT_NUM, "paid": _OPT_NUM, "source": _opt_enum(lists.sources),
            "comment": _OPT_STR})},
        "tasks_done": {"type": "array", "items": _INT},
        "tasks_cancelled": {"type": "array", "items": _INT},
        "tasks_moved": {"type": "array", "items": _obj({"id": _INT, "due": _ISO})},
        "tasks_new": {"type": "array", "items": _obj({
            "title": _STR, "due": _OPT_ISO, "direction": _opt_enum(lists.directions)})},
        "questions": {"type": "array", "items": _STR},
    })


def goals_schema(lists: Lists) -> dict:
    return _obj({
        "goals": {"type": "array", "items": _obj({
            "period": _STR, "direction": _enum(lists.directions), "goal": _STR,
            "metric": _OPT_STR, "target": _OPT_STR, "unit": _OPT_STR,
            "priority": _enum(["высокий", "средний", "низкий"]), "comment": _OPT_STR})},
        "questions": {"type": "array", "items": _STR},
    })


def week_schema(lists: Lists) -> dict:
    return _obj({
        "focus": _STR,
        "tasks": {"type": "array", "items": _obj({
            "title": _STR, "due": _ISO, "direction": _opt_enum(lists.directions),
            "goal_id": _OPT_STR})},
    })


def targets_schema(labels: list[str]) -> dict:
    return _obj({
        "summary": _STR,
        "targets": {"type": "array", "items": _obj({
            "label": _enum(labels), "new_value": _NUM, "reason": _STR})},
    })


# --- prompts -----------------------------------------------------------------------------

BUSINESS = ("«Карьерный юрист» — кадровое агентство для юристов, сообщество резидентов, "
            "мероприятия и карьерные консультации. Пользователь — основатель.")

REPORT_SYSTEM = f"""Ты — учётчик личного ассистента основателя. {BUSINESS}
Основатель присылает отчёт о дне свободным текстом. Разнеси его по журналу строго по схеме.
В таблицу запись пойдёт только после подтверждения человеком, поэтому лучше задать вопрос, чем угадать.

ОБЩЕЕ
- Ничего не выдумывай. Нет числа или факта в тексте — не добавляй. Если неясно, сколько именно («написал нескольким»), о ком речь или к какому дню относится, не включай спорное в данные, а задай короткий вопрос в questions.
- Даты: «сегодня», «вчера», «в пятницу» считай от даты в сообщении пользователя. Формат YYYY-MM-DD. День не назван — это сегодня.
- Пустые массивы допустимы: нет продаж в тексте — sales = [].
- Если значения нет, ставь пустую строку (для чисел и row — 0). В update пустое значение означает «не менять».

ЦИФРЫ ДНЯ (actions)
- Один элемент = один показатель за один день. mode="add" по умолчанию: число прибавится к уже записанному за день.
- mode="set" только когда человек поправляет прошлые цифры («поправь вчера: касаний было 20, а не 15»): value — итог за день.
- «Касания работодателям» — сколько работодателей человек написал или обзвонил. Названы имена без числа — посчитай по именам. Одно сообщение одному работодателю = одно касание.
- Созвоны и встречи, КП, договоры, резиденты, мероприятия — считай, только если сказано прямо. Расходы — рубли, часы — число.

ЛЮДИ (contacts) — лист «Обращения» хранит каждого человека одной строкой с текущим следующим шагом.
- Новый человек → action="new". Тот, кто уже есть в списке открытых обращений ниже → action="update" и row = номер строки из списка. Не создавай дубль: сначала ищи по имени, нику или организации.
- В update null означает «не менять». step_done=true, если предыдущий шаг выполнен.
- Если из текста ясно, что делать дальше, всегда указывай next_step и next_step_due. Срок не назван — поставь разумный: ждём ответа — через 3 дня, «напомнить через неделю» — через 7 дней. Срок не в прошлом.
- stage: «Новый» — человек только обратился, вы ещё не отвечали; «В работе» — идёт диалог или вы сделали предложение; остальное по смыслу допустимых значений.
- request — суть запроса одной фразой; comment — что произошло сейчас, одной фразой.

ПРОДАЖИ (sales)
- Новая продажа → action="new": amount — полная сумма, paid — оплачено сейчас (0, если не оплачено). Направление из допустимых.
- Клиент доплатил по продаже из списка «Продажи с долгом» → action="add_payment", row из списка, paid — сумма новой оплаты.
- «Обсуждаем цену» — это обращение, а не продажа.

ЗАДАЧИ
- В списке открытых задач есть id и срок. Сообщил, что сделал задачу, — tasks_done; отказался — tasks_cancelled; просит перенести — tasks_moved; новое поручение себе («завтра надо написать X») — tasks_new.
- Отмечай задачу выполненной, только если из текста ясно, что она сделана."""

GOALS_SYSTEM = f"""Ты помогаешь основателю превратить его планы на год в структурированный список целей. {BUSINESS}
- Разбей текст на отдельные цели. period: "2026" (весь год), "2026-Q4" (квартал) или "2026-11" (месяц) — выбери самый точный период, который назван в тексте. Период не назван — весь год.
- goal — одна ясная фраза. Если у цели есть измеримый результат, заполни metric (что измеряем), target (число) и unit.
- Ничего не добавляй от себя: только то, что есть в плане. Неясное — в questions.
- priority: по формулировкам человека; нет подсказок — «средний»."""

WEEK_SYSTEM = f"""Ты — личный ассистент-планировщик основателя. {BUSINESS}
Составь задачи на оставшиеся дни недели.
- 6–12 конкретных задач: каждая — действие, которое можно выполнить за день, начинается с глагола.
- Опирайся на цели года (укажи goal_id), на показатели месяца, где факт отстаёт от плана (используй «нужно в день»), и на воронку людей.
- Следующие шаги по конкретным людям и так попадут в утренний список; не дублируй каждый, можно одной задачей «разобрать просроченные шаги».
- Распредели по дням от сегодняшнего (включительно) до воскресенья, не больше 3–4 задач в день; в выходные — только лёгкое или стратегическое.
- focus — 2–3 предложения: на чём главный упор недели и почему.
- Не выдумывай факты о бизнесе и цифры."""

TARGETS_SYSTEM = f"""Ты помогаешь основателю выставить месячные цели. {BUSINESS}
На входе: цели года, прошлые и текущие месячные цели, фактический темп. Предложи новые значения месячных целей на ближайший месяц так, чтобы вести к целям года, оставаясь достижимыми по фактическому темпу.
- Меняй только те показатели, где есть основание; для каждого объясни причину одной фразой.
- Показатели, где «хорошо, когда меньше», — лимиты (расходы, уходы): не завышай.
- summary — 2–3 предложения. Не выдумывай числа, которых нет в данных."""

TEXT_STYLE = ("Пиши по-русски, коротко и конкретно, без воды, без Markdown и без звёздочек. "
              "Можно использовать эмодзи и короткие абзацы. Опирайся только на данные ниже: "
              "не выдумывай цифры и факты. Объёмом не больше 1500 знаков.")

FOCUS_SYSTEM = f"""Ты — личный ассистент основателя. {BUSINESS}
Данные: темп месяца, задачи и шаги по людям на сегодня, цели года. Напиши блок «Фокус дня»: 2–3 предложения о том, чему уделить главное время сегодня и почему, и одну строку про самый отстающий показатель. {TEXT_STYLE}"""

REVIEW_SYSTEM = f"""Ты — личный ассистент-аналитик основателя. {BUSINESS}
Сделай разбор периода по данным ниже в четырёх блоках:
1) Итоги: 3–4 факта с цифрами (факт против плана);
2) Что получилось;
3) Что отстаёт и вероятные причины (помечай гипотезы словом «вероятно»);
4) Упор на следующий период: 3 конкретных действия.
{TEXT_STYLE}"""


# --- client ------------------------------------------------------------------------------

class Claude:
    def __init__(self, model: str, use_fallbacks: bool = True, client=None):
        self.model = model
        self.use_fallbacks = use_fallbacks
        self.client = client or anthropic.AsyncAnthropic()

    async def _call(self, system: str, content, *, schema: dict | None = None,
                    effort: str = "medium", max_tokens: int = 16000) -> str:
        output_config: dict = {"effort": effort}
        if schema:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        kwargs = dict(model=self.model, max_tokens=max_tokens, system=system,
                      messages=[{"role": "user", "content": content}], output_config=output_config)
        if self.use_fallbacks:
            resp = await self.client.beta.messages.create(
                betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
        else:
            resp = await self.client.messages.create(**kwargs)
        if resp.stop_reason == "refusal":
            raise ModelRefused("Claude отклонил запрос фильтрами безопасности. Переформулируй сообщение.")
        if resp.stop_reason == "max_tokens":
            raise RuntimeError("Ответ Claude обрезан — сообщение слишком большое, раздели его на части.")
        return "".join(b.text for b in resp.content if b.type == "text").strip()

    async def _json(self, system, content, schema, **kw) -> dict:
        return json.loads(await self._call(system, content, schema=schema, **kw))

    # --- report ------------------------------------------------------------------------
    async def parse_report(self, text: str, today: date, lists: Lists, contacts: list[Contact],
                           sales: list[Sale], tasks: list[Task]) -> ParsedReport:
        user = report_context(text, today, lists, contacts, sales, tasks)
        data = await self._json(REPORT_SYSTEM, user, report_schema(lists), effort="medium")
        return to_parsed_report(data, today, lists, contacts, sales, tasks)

    # --- year plan ---------------------------------------------------------------------
    async def parse_year_plan(self, text: str | None, pdf: bytes | None, today: date,
                              lists: Lists) -> tuple[list[Goal], list[str]]:
        intro = f"Сегодня {today.isoformat()}. Разбери план на год на цели."
        body = f"{intro}\n\nПЛАН:\n{text}" if text else intro
        content: str | list = body
        if pdf:
            content = [{"type": "document", "source": {
                "type": "base64", "media_type": "application/pdf",
                "data": base64.standard_b64encode(pdf).decode()}},
                {"type": "text", "text": body}]
        data = await self._json(GOALS_SYSTEM, content, goals_schema(lists), effort="high")
        goals, questions = [], list(data.get("questions", []))
        for i, g in enumerate(data["goals"], start=1):
            period = g["period"].strip()
            if not PERIOD_RE.match(period):
                questions.append(f"Не понял период «{period}» у цели «{g['goal']}» — укажи год, квартал или месяц")
            goals.append(Goal(f"G{i}", period, g["direction"], g["goal"], g["metric"] or "",
                              g["target"] or "", g["unit"] or "", g["priority"], g["comment"] or ""))
        return goals, questions

    # --- planning & analysis -----------------------------------------------------------
    async def plan_week(self, context: str, today: date, lists: Lists) -> tuple[str, list[dict]]:
        data = await self._json(WEEK_SYSTEM, context, week_schema(lists), effort="high")
        monday = today - timedelta(days=today.weekday())
        sunday, tasks = monday + timedelta(days=6), []
        for t in data["tasks"]:
            due = parse_date(t["due"]) or today
            tasks.append({**t, "due": min(max(due, today), sunday)})  # keep inside the week
        return data["focus"], tasks

    async def propose_targets(self, context: str, labels: list[str]) -> dict:
        return await self._json(TARGETS_SYSTEM, context, targets_schema(labels), effort="high")

    async def focus(self, context: str) -> str:
        return await self._call(FOCUS_SYSTEM, context, effort="low", max_tokens=2000)

    async def review(self, context: str) -> str:
        return await self._call(REVIEW_SYSTEM, context, effort="high", max_tokens=4000)


# --- context + validation (pure, tested) -------------------------------------------------

def _cut(s: str, n: int = 90) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def report_context(text: str, today: date, lists: Lists, contacts: list[Contact],
                   sales: list[Sale], tasks: list[Task]) -> str:
    open_contacts = [c for c in contacts if c.is_open][-150:]
    debts = [s for s in sales if s.debt > 0][-30:]
    open_tasks = [t for t in tasks if t.is_open][-60:]
    lines = [f"Сегодня: {today.isoformat()} ({weekday_name(today)}).", "",
             "Допустимые значения. Источник: " + ", ".join(lists.sources),
             "Кто обратился: " + ", ".join(lists.who),
             "Этап: " + ", ".join(lists.stages),
             "Направление: " + ", ".join(lists.directions), "",
             "ОТКРЫТЫЕ ОБРАЩЕНИЯ (row | имя | кто | этап | запрос | следующий шаг | срок):"]
    lines += [f"{c.row} | {_cut(c.name, 60)} | {c.who} | {c.stage} | {_cut(c.request)} | "
              f"{_cut(c.next_step, 60)} | {c.due.isoformat() if c.due else '-'}" for c in open_contacts] or ["(пусто)"]
    lines += ["", "ПРОДАЖИ С ДОЛГОМ (row | клиент | что | сумма | оплачено):"]
    lines += [f"{s.row} | {_cut(s.client, 50)} | {_cut(s.what, 50)} | {s.amount:g} | {s.paid:g}" for s in debts] or ["(нет)"]
    lines += ["", "ОТКРЫТЫЕ ЗАДАЧИ (id | срок | задача):"]
    lines += [f"{t.id} | {t.due.isoformat() if t.due else '-'} | {_cut(t.title)}" for t in open_tasks] or ["(нет)"]
    lines += ["", "ОТЧЁТ:", text]
    return "\n".join(lines)


def _opt(v):
    """Schema sentinels back to None: "" / 0 / whitespace mean 'no value'."""
    if isinstance(v, str):
        return v.strip() or None
    return v or None


def to_parsed_report(data: dict, today: date, lists: Lists, contacts: list[Contact],
                     sales: list[Sale], tasks: list[Task]) -> ParsedReport:
    out = ParsedReport(questions=[q for q in data.get("questions", []) if q.strip()])
    contact_rows = {c.row for c in contacts}
    sale_rows = {s.row for s in sales}
    task_ids = {t.id for t in tasks if t.is_open}

    for a in data.get("actions", []):
        day = parse_date(a["date"])
        if a["metric"] not in METRICS or day is None:
            out.warnings.append(f"Пропустил показатель с непонятным днём: {a['metric']} {a['date']}")
        elif day > today:
            out.warnings.append(f"Пропустил «{METRICS[a['metric']]}»: дата {a['date']} в будущем")
        elif a["value"] < 0:
            out.warnings.append(f"Пропустил «{METRICS[a['metric']]}»: отрицательное значение")
        else:
            out.actions.append(ActionChange(a["metric"], a["value"], a["mode"], day))

    for c in data.get("contacts", []):
        day = parse_date(c["date"]) or today
        raw_due, next_step = _opt(c["next_step_due"]), _opt(c["next_step"])
        due = parse_date(raw_due) if raw_due else None
        if raw_due and due is None:
            out.warnings.append(f"Непонятный срок у «{c['name']}»: {raw_due}")
        if due and due < today and next_step:
            out.warnings.append(f"Срок шага у «{c['name']}» в прошлом ({due.isoformat()})")
        row = c["row"] if c["row"] in contact_rows else None
        if c["action"] == "update" and row is None:
            out.warnings.append(f"«{c['name']}»: не нашёл в списке открытых — будет добавлен как новый")
        out.contacts.append(ContactChange(
            c["action"], row, day, c["name"], _opt(c["source"]), _opt(c["who"]), _opt(c["request"]),
            _opt(c["stage"]), next_step, due, bool(c["step_done"]), _opt(c["comment"])))

    for s in data.get("sales", []):
        amount, paid = s["amount"], s["paid"]
        if amount < 0 or paid < 0:
            out.warnings.append(f"Пропустил продажу «{s['client']}»: отрицательная сумма")
            continue
        row = s["row"] if s["row"] in sale_rows else None
        if s["action"] == "add_payment" and (row is None or paid == 0):
            out.warnings.append(f"Доплата «{s['client']}»: не нашёл продажу с долгом или сумма 0 — пропустил")
            continue
        if s["action"] == "new" and amount == 0:
            out.warnings.append(f"Продажа «{s['client']}»: сумма 0 — проверь или уточни")
        out.sales.append(SaleChange(s["action"], row, parse_date(s["date"]) or today, _opt(s["direction"]),
                                    s["client"], _opt(s["what"]), amount, paid, _opt(s["source"]), _opt(s["comment"])))

    for name, ids, target in (("выполнена", data.get("tasks_done", []), out.tasks_done),
                              ("отменена", data.get("tasks_cancelled", []), out.tasks_cancelled)):
        for tid in ids:
            if tid in task_ids:
                target.append(tid)
            else:
                out.warnings.append(f"Задача #{tid} ({name}): нет среди открытых — пропустил")
    for m in data.get("tasks_moved", []):
        due = parse_date(m["due"])
        if m["id"] in task_ids and due:
            out.tasks_moved.append((m["id"], due))
        else:
            out.warnings.append(f"Не смог перенести задачу #{m['id']}")
    for t in data.get("tasks_new", []):
        raw = _opt(t["due"])
        out.tasks_new.append(NewTask(t["title"], parse_date(raw) if raw else None, _opt(t["direction"]) or ""))
    return out
