"""Telegram side: commands, the report flow, scheduled messages.

The bot serves exactly one person (the owner) and keeps no database: the spreadsheet is the
memory. Short-lived confirmation state (a parsed report waiting for the OK button) lives in
memory and is simply lost on restart, which is harmless.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

import anthropic
import gspread
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import BadRequest
from telegram.ext import (
    Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters,
)

from . import brief
from .config import Settings
from .dates import fmt, iso_week_label, monday, weekday_name
from .llm import Claude, ModelRefused
from .models import Goal, ParsedReport
from .sheets import Journal, SheetError, number

log = logging.getLogger(__name__)

# python-telegram-bot numbers weekdays from Sunday: 0=Sun, 1=Mon ... 6=Sat
PTB_SUNDAY, PTB_MONDAY = 0, 1
MAX_FILE_BYTES = 10 * 1024 * 1024

HELP = """<b>Я — личный ассистент «Карьерного юриста».</b>

<b>Как работать</b>
Пиши отчёт свободным текстом, днём или вечером. Например:
«Написал 15 работодателям, 3 ответили, 1 созвон. Написал кандидат из инсты, ищет работу. Продал резидентство за 3500, оплачено полностью».
Я разнесу по таблице (Действия, Обращения, Продажи), покажу, что понял, и запишу после твоего «Записать».
Можно: «поправь вчера: касаний было 20, а не 15», «Полина согласна, созвон в пятницу», «сделал задачу 12».

<b>Сам напишу</b>
☀️ утром — кому и по какому вопросу писать, задачи дня, что отстаёт
🌙 вечером — итоги дня и напоминание про отчёт
🗓 в понедельник — план недели из плана года
📈 в воскресенье — разбор недели; в конце месяца — разбор месяца
🎯 1-го числа — предложу цели месяца

<b>Команды</b>
/today — утренний список сейчас
/tasks — задачи недели
/plan — составить план недели заново
/stats — сводка и светофор
/review — разбор недели сейчас
/month — разбор месяца сейчас
/year — загрузить план на год (текст или PDF)
/targets — предложить цели месяца из плана года
/myid — твой Telegram ID"""


@dataclass
class PendingReport:
    text: str
    parsed: ParsedReport
    awaiting_fix: bool = False


@dataclass
class State:
    report: PendingReport | None = None
    awaiting_plan: bool = False
    plan_buffer: list[str] = field(default_factory=list)
    goals: list[Goal] | None = None
    targets: dict | None = None


def shifted(t: time, minutes: int) -> time:
    """t + minutes, keeping the time zone (rolls over the hour correctly)."""
    return (datetime.combine(date(2000, 1, 1), t) + timedelta(minutes=minutes)).timetz()


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton(t, callback_data=d) for t, d in buttons]])


def friendly_error(e: Exception) -> str:
    if isinstance(e, SheetError | ModelRefused):
        return str(e)
    if isinstance(e, gspread.exceptions.APIError):
        code = getattr(e.response, "status_code", 0)
        if code == 429:
            return "Google ограничил число запросов к таблице. Подожди минуту и повтори."
        if code in (401, 403):
            return "Нет доступа к таблице. Проверь, что она открыта сервис-аккаунту на редактирование."
        return f"Google Таблицы вернули ошибку {code}."
    if isinstance(e, anthropic.AuthenticationError):
        return "Claude отклонил ключ API. Проверь ANTHROPIC_API_KEY."
    if isinstance(e, anthropic.RateLimitError):
        return "Claude временно ограничил запросы. Повтори через минуту."
    if isinstance(e, anthropic.APIConnectionError | anthropic.APITimeoutError):
        return "Не достучался до Claude (сеть). Повтори через минуту."
    if isinstance(e, anthropic.APIStatusError):
        return f"Claude вернул ошибку {e.status_code}: {e.message}"
    return f"Что-то пошло не так ({type(e).__name__}). Подробности в логе сервера."


class Assistant:
    def __init__(self, settings: Settings, journal: Journal, claude: Claude):
        self.s = settings
        self.journal = journal
        self.claude = claude
        self.state = State()
        self._lock = asyncio.Lock()  # gspread's session is not safe to share across threads

    # --- plumbing ------------------------------------------------------------------------
    def today(self) -> date:
        return datetime.now(self.s.tz).date()

    async def io(self, fn, *args):
        async with self._lock:
            return await asyncio.to_thread(fn, *args)

    async def load(self, *parts: str) -> brief.Snapshot:
        return await self.io(brief.load, self.journal, self.today(), self.s.followup_days, *parts)

    async def send(self, bot, text: str, *, markup=None, plain: bool = False) -> None:
        parts = brief.split_message(text)
        for i, part in enumerate(parts):
            extra = {"reply_markup": markup} if markup and i == len(parts) - 1 else {}
            try:
                await bot.send_message(self.s.owner_id, part, parse_mode=None if plain else ParseMode.HTML, **extra)
            except BadRequest:  # broken HTML must never swallow a message
                await bot.send_message(self.s.owner_id, re.sub(r"<[^>]+>", "", part), **extra)

    async def typing(self, bot) -> None:
        await bot.send_chat_action(self.s.owner_id, "typing")

    async def guarded(self, bot, what: str, coro) -> None:
        try:
            await coro
        except Exception as e:  # noqa: BLE001 - shown to the user, logged with traceback
            log.exception("%s failed", what)
            await self.send(bot, f"⚠️ {what}: {friendly_error(e)}", plain=True)

    # --- simple commands -----------------------------------------------------------------
    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await self.send(context.bot, HELP)

    async def cmd_myid(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(f"Твой Telegram ID: {update.effective_user.id}")

    async def cmd_today(self, update, context):
        await self.guarded(context.bot, "Утренний список", self._morning(context.bot))

    async def cmd_tasks(self, update, context):
        async def run():
            snap = await self.load("tasks")
            await self.send(context.bot, brief.tasks_message(snap.tasks, snap.today))
        await self.guarded(context.bot, "Задачи", run())

    async def cmd_stats(self, update, context):
        async def run():
            snap = await self.load("summary")
            await self.send(context.bot, brief.stats_message(snap))
        await self.guarded(context.bot, "Сводка", run())

    async def cmd_plan(self, update, context):
        await self.guarded(context.bot, "План недели", self._week_plan(context.bot))

    async def cmd_review(self, update, context):
        await self.guarded(context.bot, "Разбор недели", self._review(context.bot, "week"))

    async def cmd_month(self, update, context):
        await self.guarded(context.bot, "Разбор месяца", self._review(context.bot, "month"))

    async def cmd_targets(self, update, context):
        await self.guarded(context.bot, "Цели месяца", self._targets(context.bot))

    # --- report flow ---------------------------------------------------------------------
    async def on_text(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        text = update.message.text.strip()
        st = self.state
        if st.awaiting_plan:
            st.plan_buffer.append(text)
            await update.message.reply_text(
                f"Принял часть {len(st.plan_buffer)} ({len(text)} знаков). Пришли ещё или нажми «Готово».",
                reply_markup=kb(("Готово, разобрать", "plan:go"), ("Отмена", "plan:no")))
            return
        pend = st.report
        if pend and (pend.parsed.questions or pend.awaiting_fix):
            text = f"{pend.text}\n\nУточнение: {text}"
        await self.guarded(context.bot, "Не смог разобрать отчёт", self._preview_report(context.bot, text))

    async def _preview_report(self, bot, text: str):
        await self.typing(bot)
        today = self.today()

        def read():
            return (self.journal.lists(), self.journal.contacts(), self.journal.sales(), self.journal.tasks())

        lists, contacts, sales, tasks = await self.io(read)
        parsed = await self.claude.parse_report(text, today, lists, contacts, sales, tasks)
        if parsed.is_empty:
            self.state.report = PendingReport(text, parsed)
            msg = "Не нашёл в сообщении ничего, что можно записать."
            if parsed.questions:
                msg += "\n\n❓ " + "\n❓ ".join(parsed.questions)
            await self.send(bot, brief.esc(msg))
            return
        self.state.report = PendingReport(text, parsed)
        buttons = [("✅ Записать", "rep:ok"), ("✏️ Поправить", "rep:fix"), ("✖️ Отмена", "rep:no")]
        await self.send(bot, brief.preview_text(parsed), markup=kb(*buttons))

    async def _commit_report(self, bot):
        pend, self.state.report = self.state.report, None  # pop first: a double tap must not write twice
        if pend is None:
            await self.send(bot, "Нечего записывать — пришли отчёт заново.", plain=True)
            return
        await self.typing(bot)
        result = await self.io(self.journal.apply_report, pend.parsed, self.today())
        out = ["<b>✅ Записано</b>" if not result.errors else "<b>Записал частично</b>"]
        out += [f"• {brief.esc(x)}" for x in result.lines]
        if result.errors:
            out += ["", "<b>⚠️ Не получилось / проверь</b>"] + [f"• {brief.esc(x)}" for x in result.errors]
        await self.send(bot, "\n".join(out))

    # --- year plan -----------------------------------------------------------------------
    async def cmd_year(self, update, context):
        st = self.state
        st.awaiting_plan, st.plan_buffer = True, []
        have = ""
        try:
            n = len(await self.io(self.journal.goals))
            have = f"\nСейчас в листе «План года» целей: {n}. Новый план заменит их." if n else ""
        except Exception:  # noqa: BLE001 - the hint is optional
            log.exception("could not count goals")
        await update.message.reply_text(
            "Пришли план на год: текстом (можно несколькими сообщениями) или файлом PDF / TXT / MD / CSV. "
            "Чем конкретнее цифры и сроки, тем точнее будут задачи недели." + have,
            reply_markup=kb(("Готово, разобрать", "plan:go"), ("Отмена", "plan:no")))

    async def on_document(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        doc = update.message.document
        if not self.state.awaiting_plan:
            await update.message.reply_text("Файлы принимаю только для плана на год: сначала команда /year.")
            return
        if doc.file_size and doc.file_size > MAX_FILE_BYTES:
            await update.message.reply_text("Файл больше 10 МБ — сократи или пришли текстом.")
            return
        name = (doc.file_name or "").lower()
        is_pdf = doc.mime_type == "application/pdf" or name.endswith(".pdf")
        is_text = (doc.mime_type or "").startswith("text/") or name.endswith((".txt", ".md", ".csv"))
        if not (is_pdf or is_text):
            await update.message.reply_text(
                "Пока читаю PDF, TXT, MD и CSV. Word или Excel: сохрани как PDF либо вставь текст сообщением.")
            return
        raw = bytes(await (await doc.get_file()).download_as_bytearray())
        if is_pdf:
            await self.guarded(context.bot, "План года", self._parse_plan(context.bot, raw))
        else:
            self.state.plan_buffer.append(raw.decode("utf-8", errors="replace"))
            await self.guarded(context.bot, "План года", self._parse_plan(context.bot))

    async def _parse_plan(self, bot, pdf: bytes | None = None):
        st = self.state
        text = "\n\n".join(st.plan_buffer).strip() or None
        if not text and not pdf:
            await self.send(bot, "Пока нечего разбирать — пришли план.", plain=True)
            return
        await self.typing(bot)
        lists = await self.io(self.journal.lists)
        goals, questions = await self.claude.parse_year_plan(text, pdf, self.today(), lists)
        st.awaiting_plan, st.plan_buffer, st.goals = False, [], goals
        if not goals:
            await self.send(bot, "Не нашёл в плане конкретных целей. Пришли подробнее: /year", plain=True)
            return
        out = [f"<b>Нашёл целей: {len(goals)}</b>. Проверь:"]
        for period in sorted({g.period for g in goals}):
            out += ["", f"<b>{brief.esc(period)}</b>"]
            for g in (x for x in goals if x.period == period):
                measure = " ".join(x for x in (g.metric, g.target, g.unit) if x)
                out.append(f"• {brief.esc(g.direction)}: {brief.esc(brief.cut(g.goal, 130))}"
                           + (f" ({brief.esc(measure)})" if measure else ""))
        if questions:
            out += ["", "<b>❓ Уточни</b>"] + [f"• {brief.esc(q)}" for q in questions]
        out += ["", "Сохраню в лист «План года» (текущие цели будут заменены)."]
        await self.send(bot, "\n".join(out), markup=kb(("✅ Сохранить", "goals:ok"), ("✖️ Отмена", "goals:no")))

    # --- planning & analysis -------------------------------------------------------------
    async def _morning(self, bot):
        await self.typing(bot)
        snap = await self.load("contacts", "tasks", "goals", "summary")
        try:
            await self.io(self.journal.sync_overdue, snap.today, snap.contacts)
        except Exception:  # noqa: BLE001 - flags are a nicety; the list must still go out
            log.exception("overdue sync failed")
        focus = ""
        try:
            focus = await self.claude.focus(brief.focus_context(snap))
        except Exception:  # noqa: BLE001 - the list itself is more important than the comment
            log.exception("focus failed")
        await self.send(bot, brief.morning_message(snap, focus))

    async def _evening(self, bot):
        snap = await self.load("contacts", "tasks", "summary")
        await self.send(bot, brief.evening_message(snap))

    async def _week_plan(self, bot):
        await self.typing(bot)
        snap = await self.load("contacts", "tasks", "goals", "summary")
        lists = await self.io(self.journal.lists)
        focus, tasks = await self.claude.plan_week(brief.week_context(snap), snap.today, lists)
        source = f"неделя {iso_week_label(snap.today)}"
        replaced = await self.io(self.journal.cancel_open_tasks, source)
        items = [(t["due"], t["title"], t["direction"] or "", t["goal_id"] or "") for t in tasks]
        ids = await self.io(self.journal.add_tasks, items, source)
        out = ["<b>🗓 План недели</b>", "", brief.esc(focus), ""]
        cur = None
        for tid, (due, title, direction, _goal) in sorted(zip(ids, items), key=lambda x: (x[1][0], x[0])):
            if due != cur:
                cur = due
                out += ["", f"<b>{weekday_name(due).capitalize()}, {fmt(due)}</b>"]
            out.append(f"• #{tid} {brief.esc(title)}" + (f" [{brief.esc(direction)}]" if direction else ""))
        if not snap.goals:
            out += ["", "ℹ️ План года не загружен (/year). С ним задачи будут привязаны к целям."]
        if replaced:
            out += [f"(заменил {replaced} невыполненных задач прошлого плана этой недели)"]
        out += ["", "Когда сделаешь — напиши в отчёте, например «сделал 3 и 5», и я отмечу."]
        await self.send(bot, "\n".join(out))

    async def _review(self, bot, kind: str):
        await self.typing(bot)
        snap = await self.load("tasks", "goals", "summary", "contacts")
        t = snap.today
        if kind == "week":
            start, end, title = monday(t), monday(t) + timedelta(days=6), "📈 Итоги недели"
        else:
            start, end, title = t.replace(day=1), t, "📈 Итоги месяца"
        rows = await self.io(self.journal.action_rows, start)
        text = await self.claude.review(brief.review_context(snap, "неделя" if kind == "week" else "месяц", start, end, rows))
        await self.send(bot, f"{title}, {fmt(start)}–{fmt(end)}\n\n{text}", plain=True)

    async def _targets(self, bot):
        await self.typing(bot)
        snap = await self.load("goals", "summary", "targets")
        if not snap.goals:
            await self.send(bot, "Сначала загрузи план на год: /year — цели месяца строятся из него.", plain=True)
            return
        proposal = await self.claude.propose_targets(brief.targets_context(snap), [x.label for x in snap.targets])
        current = {x.label: x.value for x in snap.targets}
        changes = [x for x in proposal["targets"] if number(current.get(x["label"], "")) != x["new_value"]]
        if not changes:
            await self.send(bot, f"Менять цели месяца не нужно.\n\n{proposal['summary']}", plain=True)
            return
        self.state.targets = {"changes": changes}
        out = ["<b>🎯 Предлагаю цели месяца</b>", "", brief.esc(proposal["summary"]), ""]
        out += [f"• {brief.esc(x['label'])}: {brief.esc(current.get(x['label'], '-'))} → <b>{brief.num(x['new_value'])}</b>"
                f" — {brief.esc(x['reason'])}" for x in changes]
        out += ["", "Это жёлтые клетки листа «Планы»: от них зависит светофор. Применить?"]
        await self.send(bot, "\n".join(out), markup=kb(("✅ Применить", "tg:ok"), ("✖️ Отмена", "tg:no")))

    # --- buttons -------------------------------------------------------------------------
    async def on_button(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        q = update.callback_query
        if q.from_user.id != self.s.owner_id:
            await q.answer()
            return
        await q.answer()
        bot, action, st = context.bot, q.data, self.state

        async def finish(note: str):
            await q.edit_message_reply_markup(reply_markup=None)  # no second tap
            if note:
                await self.send(bot, note, plain=True)

        if action == "rep:ok":
            await q.edit_message_reply_markup(reply_markup=None)
            await self.guarded(bot, "Не удалось записать", self._commit_report(bot))
        elif action == "rep:no":
            st.report = None
            await finish("Отменил. Ничего не записано.")
        elif action == "rep:fix":
            if st.report:
                st.report.awaiting_fix = True
            await finish("Напиши, что поправить, — я учту это вместе с исходным отчётом.")
        elif action == "plan:no":
            st.awaiting_plan, st.plan_buffer = False, []
            await finish("Отменил.")
        elif action == "plan:go":
            await q.edit_message_reply_markup(reply_markup=None)
            await self.guarded(bot, "План года", self._parse_plan(bot))
        elif action == "goals:ok":
            goals, st.goals = st.goals, None
            await q.edit_message_reply_markup(reply_markup=None)
            if goals:
                await self.guarded(bot, "Не удалось сохранить план", self._save_goals(bot, goals))
        elif action == "goals:no":
            st.goals = None
            await finish("Отменил, план года не менял.")
        elif action == "tg:ok":
            pending, st.targets = st.targets, None
            await q.edit_message_reply_markup(reply_markup=None)
            if pending:
                await self.guarded(bot, "Не удалось применить цели", self._apply_targets(bot, pending["changes"]))
        elif action == "tg:no":
            st.targets = None
            await finish("Оставил цели месяца без изменений.")

    async def _save_goals(self, bot, goals: list[Goal]):
        await self.io(self.journal.replace_goals, goals)
        await self.send(bot, f"✅ Сохранил целей: {len(goals)} (лист «План года»).\n"
                             "Дальше: /plan — задачи недели, /targets — цели месяца.", plain=True)

    async def _apply_targets(self, bot, changes: list[dict]):
        for x in changes:
            await self.io(self.journal.set_target, x["label"], x["new_value"])
        await self.send(bot, f"✅ Обновил целей месяца: {len(changes)} (лист «Планы»).", plain=True)

    # --- scheduled jobs ------------------------------------------------------------------
    async def job_morning(self, context):
        await self.guarded(context.bot, "Утренний список", self._morning(context.bot))

    async def job_evening(self, context):
        await self.guarded(context.bot, "Вечернее напоминание", self._evening(context.bot))

    async def job_week_plan(self, context):
        await self.guarded(context.bot, "План недели", self._week_plan(context.bot))

    async def job_week_review(self, context):
        await self.guarded(context.bot, "Разбор недели", self._review(context.bot, "week"))

    async def job_month_review(self, context):
        await self.guarded(context.bot, "Разбор месяца", self._review(context.bot, "month"))

    async def job_targets(self, context):
        await self.guarded(context.bot, "Цели месяца", self._targets(context.bot))

    async def on_error(self, update, context: ContextTypes.DEFAULT_TYPE):
        log.error("unhandled error", exc_info=context.error)

    async def post_init(self, app: Application):
        problems = await self.io(self.journal.ensure_schema)
        s = self.s
        msg = (f"🤖 Ассистент запущен.\nРасписание ({s.tz.key}): утро {s.morning:%H:%M}, вечер {s.evening:%H:%M}, "
               f"план недели — пн {s.week_plan:%H:%M}, разбор — вс {s.week_review:%H:%M}.\nМодель: {s.model}.\n/help — что я умею.")
        if problems:
            msg += "\n\n⚠️ Проверь таблицу:\n- " + "\n- ".join(problems)
        await self.send(app.bot, msg, plain=True)


def build_application(settings: Settings, journal: Journal, claude: Claude) -> Application:
    a = Assistant(settings, journal, claude)
    app = Application.builder().token(settings.telegram_token).post_init(a.post_init).build()
    owner = filters.User(user_id=settings.owner_id)

    # /myid is open to anyone on purpose: it only reveals the asker's own ID, needed for setup.
    app.add_handler(CommandHandler("myid", a.cmd_myid))
    for name, fn in (("start", a.cmd_help), ("help", a.cmd_help), ("today", a.cmd_today), ("tasks", a.cmd_tasks),
                     ("stats", a.cmd_stats), ("plan", a.cmd_plan), ("review", a.cmd_review), ("month", a.cmd_month),
                     ("year", a.cmd_year), ("targets", a.cmd_targets)):
        app.add_handler(CommandHandler(name, fn, filters=owner))
    app.add_handler(MessageHandler(owner & filters.TEXT & ~filters.COMMAND, a.on_text))
    app.add_handler(MessageHandler(owner & filters.Document.ALL, a.on_document))
    app.add_handler(CallbackQueryHandler(a.on_button))
    app.add_error_handler(a.on_error)

    jq = app.job_queue
    jq.run_daily(a.job_morning, settings.morning, name="morning")
    jq.run_daily(a.job_evening, settings.evening, name="evening")
    jq.run_daily(a.job_week_plan, settings.week_plan, days=(PTB_MONDAY,), name="week_plan")
    jq.run_daily(a.job_week_review, settings.week_review, days=(PTB_SUNDAY,), name="week_review")
    jq.run_monthly(a.job_month_review, shifted(settings.week_review, 30), day=-1, name="month_review")
    jq.run_monthly(a.job_targets, shifted(settings.week_plan, 15), day=1, name="targets")
    return app
