from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping

REQUIRED = (
    "IG_ACCOUNT_ID",
    "IG_ACCESS_TOKEN",
    "IG_APP_SECRET",
    "IG_VERIFY_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_MANAGER_CHAT_ID",
)


@dataclass(frozen=True)
class Settings:
    ig_account_id: str
    ig_access_token: str
    ig_app_secret: str
    ig_verify_token: str
    telegram_bot_token: str
    telegram_manager_chat_id: str
    graph_version: str = "v23.0"
    db_path: str = "data/bridge.db"
    flows_path: str = "config/flows.json"
    bot_url: str = "https://t.me/LegalcareeristBot"
    site_url: str = ""
    payment_url: str = ""
    human_mode_hours: int = 12
    notify_comment_leads: bool = False
    log_level: str = "INFO"

    @property
    def links(self) -> dict[str, str]:
        """Значения для плейсхолдеров {bot_url}, {site_url}, {payment_url} в config/flows.json."""
        return {
            "bot_url": self.bot_url,
            "site_url": self.site_url,
            "payment_url": self.payment_url,
        }

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        missing = [name for name in REQUIRED if not env.get(name, "").strip()]
        if missing:
            raise RuntimeError("Не заданы переменные окружения: " + ", ".join(missing))

        def get(name: str, default: str = "") -> str:
            return env.get(name, default).strip() or default

        return cls(
            ig_account_id=get("IG_ACCOUNT_ID"),
            ig_access_token=get("IG_ACCESS_TOKEN"),
            ig_app_secret=get("IG_APP_SECRET"),
            ig_verify_token=get("IG_VERIFY_TOKEN"),
            telegram_bot_token=get("TELEGRAM_BOT_TOKEN"),
            telegram_manager_chat_id=get("TELEGRAM_MANAGER_CHAT_ID"),
            graph_version=get("GRAPH_API_VERSION", cls.graph_version),
            db_path=get("DB_PATH", cls.db_path),
            flows_path=get("FLOWS_PATH", cls.flows_path),
            bot_url=get("BOT_URL", cls.bot_url),
            site_url=get("SITE_URL"),
            payment_url=get("PAYMENT_URL"),
            human_mode_hours=int(get("HUMAN_MODE_HOURS", str(cls.human_mode_hours))),
            notify_comment_leads=get("NOTIFY_COMMENT_LEADS").lower() in {"1", "true", "yes", "on"},
            log_level=get("LOG_LEVEL", cls.log_level).upper(),
        )
