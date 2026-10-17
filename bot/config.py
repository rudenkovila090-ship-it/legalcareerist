"""Settings come from environment variables (see .env.example)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import time
from zoneinfo import ZoneInfo


class ConfigError(RuntimeError):
    pass


def _need(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise ConfigError(f"Не задана переменная окружения {name} (см. .env.example)")
    return v


def _hhmm(name: str, default: str) -> time:
    raw = os.environ.get(name, default).strip()
    try:
        h, m = raw.split(":")
        return time(int(h), int(m))
    except ValueError as e:
        raise ConfigError(f"{name} должен быть в формате ЧЧ:ММ, получено {raw!r}") from e


def _service_account() -> dict:
    inline = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    if inline:
        try:
            return json.loads(inline)
        except json.JSONDecodeError as e:
            raise ConfigError("GOOGLE_SERVICE_ACCOUNT_JSON — невалидный JSON") from e
    if path:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    raise ConfigError("Задай GOOGLE_SERVICE_ACCOUNT_JSON или GOOGLE_SERVICE_ACCOUNT_FILE")


@dataclass(frozen=True)
class Settings:
    telegram_token: str
    owner_id: int
    spreadsheet_id: str
    google_credentials: dict
    model: str
    use_fallbacks: bool
    tz: ZoneInfo
    morning: time
    evening: time
    week_plan: time
    week_review: time
    followup_days: int

    @classmethod
    def from_env(cls) -> "Settings":
        try:
            owner = int(_need("OWNER_TELEGRAM_ID"))
        except ValueError as e:
            raise ConfigError("OWNER_TELEGRAM_ID должен быть числом") from e
        try:
            followup = int(os.environ.get("FOLLOWUP_DAYS", "5"))
            tz = ZoneInfo(os.environ.get("TIMEZONE", "Europe/Moscow"))
        except ValueError as e:
            raise ConfigError("FOLLOWUP_DAYS должен быть целым числом") from e
        except Exception as e:  # unknown time zone name
            raise ConfigError(f"Неизвестный TIMEZONE: {os.environ.get('TIMEZONE')}") from e
        return cls(
            telegram_token=_need("TELEGRAM_BOT_TOKEN"),
            owner_id=owner,
            spreadsheet_id=_need("SPREADSHEET_ID"),
            google_credentials=_service_account(),
            model=os.environ.get("CLAUDE_MODEL", "claude-opus-5-5").strip(),
            use_fallbacks=os.environ.get("CLAUDE_FALLBACKS", "1").strip() not in ("0", "false", ""),
            tz=tz,
            morning=_hhmm("MORNING_TIME", "09:00").replace(tzinfo=tz),
            evening=_hhmm("EVENING_TIME", "21:00").replace(tzinfo=tz),
            week_plan=_hhmm("WEEK_PLAN_TIME", "09:05").replace(tzinfo=tz),
            week_review=_hhmm("WEEK_REVIEW_TIME", "20:00").replace(tzinfo=tz),
            followup_days=followup,
        )
