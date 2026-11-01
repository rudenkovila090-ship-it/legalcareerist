"""Настройки из переменных окружения и файла .env."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

from .rules import normalize

ROOT = Path(__file__).resolve().parent.parent

# Режимы канала в channels.txt: что с него брать.
MODES = ("all", "events", "vacancies", "news", "law", "agency", "off")


@dataclass(frozen=True)
class Config:
    api_id: int
    api_hash: str
    bot_token: str | None
    owner_chat_id: int | None
    folder_name: str
    backfill_days: int
    horizon_days: int
    only_keywords: tuple[str, ...]
    exclude_keywords: tuple[str, ...]
    data_dir: Path
    vacancy_scope: str = "legal"  # "legal": только юридические вакансии (и офисные роли в юрсфере); "all": любые
    channel_modes: dict = field(default_factory=dict)
    news_days: int = 3  # новости о людях и о законодательстве старше этого срока не берём (сводка про свежее)
    vacancy_days: int = 7  # вакансии старше этого срока обычно уже закрыты: не берём
    contacted: frozenset = frozenset()  # работодатели и контакты, которым вы уже писали (contacted.txt)

    law_scope: str = "all"

    @property
    def session_path(self) -> Path:
        return self.data_dir / "session"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "digest.sqlite3"


def _csv(value: str) -> tuple[str, ...]:
    return tuple(normalize(x.strip()) for x in value.split(",") if x.strip())


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        raise SystemExit(f"В .env {name} должно быть целым числом, сейчас: {raw!r}") from None


def load_channel_modes(path: Path) -> dict[str, str]:
    """Читает channels.txt: строки вида «режим: название канала» (или «режим: @ник»), # начинает комментарий."""
    modes: dict[str, str] = {}
    if not path.exists():
        return modes
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        mode, sep, name = line.partition(":")
        mode, name = mode.strip().lower(), name.strip()
        if not sep or mode not in MODES or not name:
            raise SystemExit(
                f"channels.txt, строка {number}: нужен вид «режим: название канала», режим один из: {', '.join(MODES)}"
            )
        modes[normalize(name).strip()] = mode
    return modes


def load_contacted(path: Path) -> frozenset[str]:
    """Читает contacted.txt: по строке на работодателя (название компании), @ник или e-mail; # начинает комментарий.
    Вакансии таких работодателей помечаются «уже писали» и уходят вниз списка."""
    found: set[str] = set()
    if not path.exists():
        return frozenset()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        found.add(line.lower() if line.startswith("@") or "@" in line else re.sub(r"[\W_]+", " ", normalize(line)).strip())
    return frozenset(found)


def channel_mode(modes: dict[str, str], title: str, username: str | None) -> str:
    """Режим канала: по точному названию или по @нику; по умолчанию «all»."""
    return modes.get(normalize(title).strip()) or (username and modes.get("@" + username.lower())) or "all"


def load() -> Config:
    load_dotenv(ROOT / ".env")
    scope = os.getenv("VACANCY_SCOPE", "legal").strip().lower() or "legal"
    if scope not in ("legal", "all"):
        raise SystemExit(f"В .env VACANCY_SCOPE должно быть legal или all, сейчас: {scope!r}")
    missing = [k for k in ("TG_API_ID", "TG_API_HASH") if not os.getenv(k, "").strip()]
    if missing:
        raise SystemExit("В файле .env не заполнено: " + ", ".join(missing) + " (см. README.md, шаг 1)")
    law_scope = os.getenv("LAW_SCOPE", "all").strip().lower() or "all"
    if law_scope not in ("all", "labor"):
        raise SystemExit("LAW_SCOPE должно быть all или labor")
    owner = os.getenv("OWNER_CHAT_ID", "").strip()
    return Config(
        api_id=_int("TG_API_ID", 0),
        api_hash=os.environ["TG_API_HASH"].strip(),
        bot_token=os.getenv("BOT_TOKEN", "").strip() or None,
        owner_chat_id=int(owner) if owner else None,
        folder_name=os.getenv("FOLDER_NAME", "Мониторинг").strip(),
        backfill_days=_int("BACKFILL_DAYS", 14),
        horizon_days=_int("HORIZON_DAYS", 14),
        only_keywords=_csv(os.getenv("ONLY_KEYWORDS", "")),
        exclude_keywords=_csv(os.getenv("EXCLUDE_KEYWORDS", "")),
        data_dir=ROOT / (os.getenv("DATA_DIR", "").strip() or "data"),
        vacancy_scope=scope,
        law_scope=law_scope,
        channel_modes=load_channel_modes(ROOT / "channels.txt"),
        news_days=_int("NEWS_DAYS", 3),
        vacancy_days=_int("VACANCY_DAYS", 7),
        contacted=load_contacted(ROOT / "contacted.txt"),
    )
