import asyncio
from datetime import date, datetime, time
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from bot import handlers
from bot.config import Settings
from bot.models import ActionChange, ContactChange, ParsedReport
from bot.sheets import Journal
from tests.conftest import D, TODAY, FakeSpreadsheet

TZ = ZoneInfo("Europe/Moscow")
OWNER = 42


def settings():
    t = lambda h, m=0: time(h, m, tzinfo=TZ)  # noqa: E731
    return Settings("1:x", OWNER, "sheet", {}, "claude-opus-5-5", True, TZ, t(9), t(21), t(9, 5), t(20), 5)


class FakeBot:
    def __init__(self):
        self.sent = []

    async def send_message(self, chat_id, text, **kw):
        self.sent.append((chat_id, text, kw))

    async def send_chat_action(self, *a, **k):
        pass

    @property
    def texts(self):
        return "\n".join(t for _, t, _ in self.sent)


class FakeClaude:
    def __init__(self, parsed=None, fail_focus=False):
        self.parsed, self.fail_focus, self.texts = parsed, fail_focus, []

    async def parse_report(self, text, *a):
        self.texts.append(text)
        return self.parsed

    async def focus(self, ctx):
        if self.fail_focus:
            raise RuntimeError("boom")
        return "Фокус: ответы работодателей"


def make(journal_sheets, claude=None):
    sh = FakeSpreadsheet(journal_sheets)
    a = handlers.Assistant(settings(), Journal(sh), claude or FakeClaude())
    a.today = lambda: TODAY
    return a, sh, FakeBot()


def run(coro):
    return asyncio.run(coro)


def report():
    return ParsedReport(actions=[ActionChange("touches", 15, "add", TODAY)],
                        contacts=[ContactChange("update", 5, TODAY, "Полина", stage="Интервью", next_step="Созвон",
                                                due=date(2026, 10, 20), comment="согласна")])


def test_preview_then_commit_writes_once(journal_sheets):
    a, sh, bot = make(journal_sheets, FakeClaude(report()))

    async def flow():
        await a._preview_report(bot, "написал 15, Полина согласна")
        assert "Разобрал отчёт" in bot.texts and bot.sent[-1][2]["reply_markup"] is not None
        assert len(sh.sheets["Действия"].grid[2]) < 2  # nothing is written before the OK button
        await a._commit_report(bot)
        await a._commit_report(bot)  # double tap on the button

    run(flow())
    assert sh.sheets["Действия"].grid[2][:2] == [D(17, 10), 15]
    assert sh.sheets["Обращения"].grid[4][5] == "Интервью"
    assert bot.texts.count("Записано") == 1 and "Нечего записывать" in bot.texts


def test_questions_make_the_next_message_a_clarification(journal_sheets):
    parsed = ParsedReport(actions=[ActionChange("touches", 5, "add", TODAY)], questions=["Кому именно?"])
    claude = FakeClaude(parsed)
    a, _, bot = make(journal_sheets, claude)
    update = SimpleNamespace(message=SimpleNamespace(text="написал нескольким", reply_text=None))

    async def flow():
        await a.on_text(update, SimpleNamespace(bot=bot))
        update.message.text = "пяти"
        await a.on_text(update, SimpleNamespace(bot=bot))

    run(flow())
    assert claude.texts[0] == "написал нескольким"
    assert claude.texts[1] == "написал нескольким\n\nУточнение: пяти"


def test_morning_flags_overdue_in_sheet_and_survives_focus_failure(journal_sheets):
    journal_sheets["Обращения"][1][7] = D(10, 10)  # khaustovasya overdue
    a, sh, bot = make(journal_sheets, FakeClaude(fail_focus=True))
    run(a._morning(bot))
    assert "Просрочено (1)" in bot.texts and "khaustovasya" in bot.texts and "Фокус дня" not in bot.texts
    assert sh.sheets["Обращения"].grid[1][9] == "просрочен"  # what Сводка counts


def test_stranger_cannot_press_buttons(journal_sheets):
    a, sh, bot = make(journal_sheets, FakeClaude(report()))
    run(a._preview_report(bot, "x"))

    async def press(uid):
        answered = []

        async def answer():
            answered.append(1)

        async def edit(**k):
            pass
        q = SimpleNamespace(from_user=SimpleNamespace(id=uid), data="rep:ok", answer=answer, edit_message_reply_markup=edit)
        await a.on_button(SimpleNamespace(callback_query=q), SimpleNamespace(bot=bot))

    run(press(1))                       # not the owner
    assert a.state.report is not None and len(sh.sheets["Действия"].grid[2]) < 2
    run(press(OWNER))
    assert a.state.report is None and sh.sheets["Действия"].grid[2][1] == 15


def test_week_plan_replaces_only_this_weeks_open_tasks(journal_sheets):
    class PlanClaude(FakeClaude):
        async def plan_week(self, ctx, today, lists):
            return "Упор на ответы", [{"title": "Позвонить в Сбер", "due": date(2026, 10, 18),
                                        "direction": "Кадры", "goal_id": "G1"}]
    a, sh, bot = make(journal_sheets, PlanClaude())
    run(a._week_plan(bot))
    run(a._week_plan(bot))  # run twice: second run must replace, not duplicate
    tasks = a.journal.tasks()
    assert [(t.id, t.status) for t in tasks] == [(1, "Отменена"), (2, "Открыта")]
    assert "Упор на ответы" in bot.texts and "План года не загружен" in bot.texts


def test_shifted_rolls_over_the_hour():
    assert handlers.shifted(time(20, 45, tzinfo=TZ), 30) == time(21, 15, tzinfo=TZ)


def test_schedule_fires_on_the_right_weekdays():
    from bot.handlers import build_application
    app = build_application(settings(), Journal(FakeSpreadsheet({})), FakeClaude())
    now = datetime(2026, 10, 17, 12, 0, tzinfo=TZ)  # Saturday
    nxt = {j.name: j.job.trigger.get_next_fire_time(None, now) for j in app.job_queue.jobs()}
    assert nxt["morning"] == datetime(2026, 10, 18, 9, 0, tzinfo=TZ)
    assert nxt["week_plan"].weekday() == 0 and nxt["week_plan"].date() == date(2026, 10, 19)    # Monday
    assert nxt["week_review"].weekday() == 6 and nxt["week_review"].date() == date(2026, 10, 18)  # Sunday
    assert nxt["month_review"].date() == date(2026, 10, 31) and nxt["targets"].date() == date(2026, 11, 1)


def test_every_command_except_myid_is_owner_only():
    from telegram.ext import CommandHandler
    from bot.handlers import build_application
    app = build_application(settings(), Journal(FakeSpreadsheet({})), FakeClaude())
    cmds = [h for h in app.handlers[0] if isinstance(h, CommandHandler)]
    open_ones = {next(iter(h.commands)) for h in cmds if not str(h.filters).count(str(OWNER))}
    assert open_ones == {"myid"}


def test_bad_config_values_give_readable_errors(monkeypatch):
    from bot.config import ConfigError
    base = {"TELEGRAM_BOT_TOKEN": "1:x", "OWNER_TELEGRAM_ID": "42", "SPREADSHEET_ID": "s",
            "GOOGLE_SERVICE_ACCOUNT_JSON": "{}"}
    for k, v in base.items():
        monkeypatch.setenv(k, v)
    assert Settings.from_env().followup_days == 5
    monkeypatch.setenv("FOLLOWUP_DAYS", "пять")
    with pytest.raises(ConfigError, match="FOLLOWUP_DAYS"):
        Settings.from_env()
    monkeypatch.setenv("FOLLOWUP_DAYS", "5")
    monkeypatch.setenv("TIMEZONE", "Mars/Olympus")
    with pytest.raises(ConfigError, match="TIMEZONE"):
        Settings.from_env()
    monkeypatch.setenv("TIMEZONE", "Europe/Moscow")
    monkeypatch.setenv("OWNER_TELEGRAM_ID", "abc")
    with pytest.raises(ConfigError, match="OWNER_TELEGRAM_ID"):
        Settings.from_env()


def test_morning_still_goes_out_when_overdue_sync_fails(journal_sheets):
    a, _, bot = make(journal_sheets)

    def boom(*_):
        raise RuntimeError("sheet is read-only")
    a.journal.sync_overdue = boom
    run(a._morning(bot))
    assert "Доброе утро" in bot.texts
