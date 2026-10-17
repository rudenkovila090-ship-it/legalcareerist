"""Pre-flight check: `python -m bot.selfcheck [--llm] [--init]`.

Reads only. --init creates the two bot tabs («План года», «Задачи») if they are missing.
--llm makes one real Claude call on a sample report and prints the preview (costs a few cents).
"""
from __future__ import annotations

import asyncio
import sys

from telegram import Bot

from .brief import preview_text
from .config import ConfigError, Settings
from .dates import fmt
from .llm import Claude
from .main import load_dotenv
from .sheets import Journal

SAMPLE = ("Сегодня написал 12 работодателям, 3 ответили, 1 созвон. Написал кандидат из инсты, "
          "ищет первую работу юристом. Продал резидентство за 3500, оплачено полностью.")


def ok(msg: str) -> None:
    print(f"✅ {msg}")


def bad(msg: str) -> None:
    print(f"❌ {msg}")


async def main(argv: list[str]) -> int:
    load_dotenv()
    failed = False
    try:
        s = Settings.from_env()
        ok("Переменные окружения заданы")
    except ConfigError as e:
        bad(str(e))
        return 1

    try:
        me = await Bot(s.telegram_token).get_me()
        ok(f"Telegram: бот @{me.username}; отвечать буду пользователю {s.owner_id}")
    except Exception as e:  # noqa: BLE001
        bad(f"Telegram: {e}")
        failed = True

    journal = None
    try:
        journal = Journal.from_settings(s)
        ok(f"Google: таблица «{journal.sh.title}» открыта (сервис-аккаунт {s.google_credentials.get('client_email')})")
        problems = journal.ensure_schema() if "--init" in argv else journal.schema_problems()
        for p in problems:
            bad(f"Структура таблицы: {p}")
        if not problems:
            ok("Структура таблицы совпадает с ожидаемой")
        elif "--init" not in argv:
            print("   (вкладки «План года» и «Задачи» бот создаст сам при первом запуске или с --init)")
        failed |= bool(problems)
        lists = journal.lists()
        ok(f"Списки из «Планы»: источников {len(lists.sources)}, этапов {len(lists.stages)}, направлений {len(lists.directions)}")
        contacts = journal.contacts()
        ok(f"Обращений в журнале: {len(contacts)}, открытых: {sum(c.is_open for c in contacts)}")
    except Exception as e:  # noqa: BLE001
        bad(f"Google: {e}")
        failed = True

    if "--llm" in argv and journal:
        try:
            from datetime import datetime
            today = datetime.now(s.tz).date()
            claude = Claude(s.model, s.use_fallbacks)
            parsed = await claude.parse_report(SAMPLE, today, lists, contacts, journal.sales(), [])
            ok(f"Claude ({s.model}) разобрал тестовый отчёт на {fmt(today)}. Ничего не записано. Превью:\n")
            print(preview_text(parsed))
        except Exception as e:  # noqa: BLE001
            bad(f"Claude: {type(e).__name__}: {e}")
            failed = True
    elif "--llm" not in argv:
        print("ℹ️  Проверку Claude пропустил (добавь --llm, это один платный запрос).")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
