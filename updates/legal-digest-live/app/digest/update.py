"""Обновление программы одной командой из скачанного и распакованного архива.

Архив скачивают в «Загрузки» и распаковывают (двойной щелчок). Команда сама находит там самую новую версию
и копирует поверх текущей. Ваши файлы (.env, channels.txt, contacted.txt, папка data, вход в Telegram,
виртуальное окружение) не затрагиваются.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

FOLDERS = ("digest",)
FILES = (
    "schedule-mac.sh", "requirements.txt", "channels.example.txt", "contacted.example.txt", ".env.example",
    "README.md", "ROADMAP.md",
)
_VERSION = re.compile(r'__version__ = "([\d.]+)"')


def read_version(init: Path) -> tuple[int, ...] | None:
    try:
        match = _VERSION.search(init.read_text(encoding="utf-8"))
    except OSError:
        return None
    return tuple(int(part) for part in match[1].split(".")) if match else None


def show(version: tuple[int, ...]) -> str:
    return ".".join(str(part) for part in version)


def candidates(downloads: Path) -> list[tuple[tuple[int, ...], Path]]:
    """Распакованные папки программы в «Загрузках» (на один и два уровня вглубь) с их версиями."""
    found = []
    for pattern in ("telegram-digest*/digest/__init__.py", "*/telegram-digest*/digest/__init__.py"):
        for init in downloads.glob(pattern):
            version = read_version(init)
            if version:
                found.append((version, init.parent.parent))
    return sorted(found, key=lambda item: item[0], reverse=True)


def apply(source: Path, root: Path) -> list[str]:
    """Скопировать файлы программы из `source` в `root`; вернуть, какие файлы изменились."""
    changed: list[str] = []
    for folder in FOLDERS:
        for path in sorted((source / folder).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                target = root / path.relative_to(source)
                if not target.exists() or target.read_bytes() != path.read_bytes():
                    changed.append(str(path.relative_to(source)))
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, target)
    for name in FILES:
        path = source / name
        if path.is_file():
            target = root / name
            if not target.exists() or target.read_bytes() != path.read_bytes():
                changed.append(name)
            shutil.copy2(path, target)
    return changed


def run(root: Path, source: Path | None = None, downloads: Path | None = None, echo=print) -> int:
    """Код возврата: 0 обновлено или уже самая новая версия, 1 архив не найден."""
    current = read_version(root / "digest" / "__init__.py")
    if source is None:
        found = candidates(downloads or Path.home() / "Downloads")
        if not found:
            echo("Не нашёл распакованный архив программы в «Загрузках». Скачайте архив и дважды щёлкните по нему, "
                 "чтобы распаковать, затем повторите команду.")
            return 1
        version, source = found[0]
    else:
        version = read_version(source / "digest" / "__init__.py")
        if version is None:
            echo(f"В папке {source} нет программы (не нашёл digest/__init__.py).")
            return 1
    if current and version <= current:
        echo(f"Уже установлена самая новая версия: {show(current)}. В «Загрузках» лежит {show(version)}.")
        return 0
    old_requirements = (root / "requirements.txt").read_bytes() if (root / "requirements.txt").exists() else b""
    old_schedule = (root / "schedule-mac.sh").read_bytes() if (root / "schedule-mac.sh").exists() else b""
    changed = apply(source, root)
    echo(f"Обновлено: {show(current) if current else 'нет'} → {show(version)} (изменено файлов: {len(changed)}).")
    if (root / "requirements.txt").read_bytes() != old_requirements:
        echo("Список библиотек изменился, ставлю недостающие...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", str(root / "requirements.txt")], check=False)
    if "schedule-mac.sh" in changed or (root / "schedule-mac.sh").read_bytes() != old_schedule:
        echo("Изменился скрипт расписания. Чтобы новые настройки вступили в силу, выполните:  bash schedule-mac.sh")
    echo("Проверить, что всё работает:  .venv/bin/python -m digest status")
    return 0
