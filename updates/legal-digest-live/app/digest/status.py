"""Проверка «всё ли настроено»: одна команда вместо угадывания, почему не пришла сводка."""
from __future__ import annotations

import os
import plistlib
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from . import __version__
from .config import Config
from .store import Store

LABEL = "ru.careerlawyer.digest"
MORNING_CHECK_HOUR = 10  # после этого часа утренняя сводка уже должна была прийти


def _launchctl_loaded(label: str) -> bool:
    try:
        result = subprocess.run(["launchctl", "print", f"gui/{os.getuid()}/{label}"], capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def _times(interval) -> str:
    entries = interval if isinstance(interval, list) else [interval]
    return ", ".join(f"{e.get('Hour', 0)}:{e.get('Minute', 0):02d}" for e in entries if isinstance(e, dict))


def _schedule(home: Path, root: Path, is_mac: bool, loaded) -> tuple[str, str | None]:
    """Строка о расписании и, если что-то не так, что исправить."""
    if not is_mac:
        return "не macOS: расписание проверьте вручную (cron или Планировщик заданий, см. README)", None
    path = home / "Library" / "LaunchAgents" / f"{LABEL}.plist"
    if not path.exists():
        return "НЕ включён", "Автозапуск не включён: выполните  bash schedule-mac.sh"
    try:
        plist = plistlib.loads(path.read_bytes())
    except (OSError, plistlib.InvalidFileException, ValueError):
        return "файл расписания повреждён", "Файл расписания повреждён: выполните  bash schedule-mac.sh"
    times = _times(plist.get("StartCalendarInterval", {})) or "время не задано"
    folder = Path(plist.get("WorkingDirectory", ""))
    try:
        same_folder = folder.resolve() == root.resolve()
    except OSError:
        same_folder = False
    if not same_folder:
        return (
            f"включён, но запускает ДРУГУЮ папку ({folder})",
            f"Расписание запускает другую папку ({folder}), а не эту ({root}). Выполните в этой папке:  bash schedule-mac.sh",
        )
    if not loaded(LABEL):
        return f"файл есть ({times}), но macOS его не загрузила", "Расписание не загружено: выполните  bash schedule-mac.sh"
    return f"включён, каждый день в {times}", None


def collect(
    cfg: Config, root: Path, now: datetime | None = None, home: Path | None = None, is_mac: bool | None = None,
    loaded=None,
) -> tuple[list[str], list[str]]:
    """Строки отчёта и список того, что нужно исправить (пусто, если всё в порядке)."""
    now = now or datetime.now()
    home = home or Path.home()
    is_mac = sys.platform == "darwin" if is_mac is None else is_mac
    loaded = loaded or _launchctl_loaded
    problems: list[str] = []
    lines = [f"Версия программы: {__version__}"]
    if (cfg.data_dir / "session.session").exists():
        lines.append("Вход в Telegram: выполнен")
    else:
        lines.append("Вход в Telegram: НЕ выполнен")
        problems.append("Нет входа в Telegram: выполните  .venv/bin/python -m digest login")
    if cfg.bot_token:
        lines.append("Бот: подключён")
    else:
        lines.append("Бот: не подключён (сводка придёт в «Избранное» без уведомления)")
    last_full = None
    try:
        store = Store(cfg.db_path)
        channels = store.db.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
        lines.append(f"Каналов прочитано хотя бы раз: {channels}")
        last_full = store.get_meta("last_full_digest")
        lines.append(f"Последняя полная сводка: {last_full or 'ещё не было'}")
        lines.append(f"Последнее чтение каналов: {store.get_meta('last_run') or 'ещё не было'}")
        lines.append(f"Последняя отправка: {store.get_meta('last_sent') or 'ещё не было'}")
        last_error = store.get_meta("last_error")
        lines.append(f"Последняя ошибка: {last_error or 'нет'}")
        if last_error:
            problems.append(f"Последний запуск закончился ошибкой: {last_error}")
        store.close()
    except sqlite3.DatabaseError:
        lines.append("База данных (data/digest.sqlite3): ПОВРЕЖДЕНА")
        problems.append(
            "Файл базы data/digest.sqlite3 повреждён. Переименуйте его, и программа создаст новый "
            "(тогда придут и старые вакансии за последние дни):  mv data/digest.sqlite3 data/digest-сломанная.sqlite3"
        )

    schedule, fix = _schedule(home, root, is_mac, loaded)
    lines.append(f"Автозапуск: {schedule}")
    if fix:
        problems.append(fix)

    if now.hour >= MORNING_CHECK_HOUR and last_full != now.date().isoformat():
        problems.append(
            "Сегодняшней утренней сводки не было (Mac мог спать или быть выключен в 9:00). "
            "Получить её сейчас:  .venv/bin/python -m digest run"
        )

    log = cfg.data_dir / "run.log"
    if log.exists():
        tail = [line for line in log.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip()][-4:]
        lines.append("Журнал (последние строки data/run.log):")
        lines += [f"    {line[:160]}" for line in tail]
    else:
        lines.append("Журнал data/run.log: ещё не создан (автозапуск ни разу не срабатывал)")
    return lines, problems


def report(cfg: Config, root: Path, **kwargs) -> str:
    lines, problems = collect(cfg, root, **kwargs)
    if problems:
        lines += ["", "ЧТО ИСПРАВИТЬ:"] + [f"  {n}. {p}" for n, p in enumerate(problems, 1)]
    else:
        lines += ["", "Всё в порядке: сводка приходит автоматически."]
    return "\n".join(lines)
