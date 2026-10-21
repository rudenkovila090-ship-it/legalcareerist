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
TELEGRAM_REQUIRED = ("TELEGRAM_BOT_TOKEN", "TELEGRAM_MANAGER_CHAT_ID")


def _getter(env: Mapping[str, str]):
    def get(name: str, default: str = "") -> str:
        return env.get(name, default).strip() or default

    return get


def channel_link(channel: str, explicit: str = "") -> str:
    """Ссылка на канал для кнопки «Подписаться»: явная CHANNEL_URL или https://t.me/<имя>, если канал задан как @имя."""
    if explicit:
        return explicit
    return f"https://t.me/{channel[1:]}" if channel.startswith("@") and len(channel) > 1 else ""


def _require(env: Mapping[str, str], names: tuple[str, ...]) -> None:
    missing = [name for name in names if not env.get(name, "").strip()]
    if missing:
        raise RuntimeError("Не заданы переменные окружения: " + ", ".join(missing))


@dataclass(frozen=True)
class Settings:
    """Мост Instagram -> Telegram (нужен только для официального Instagram API)."""

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
    privacy_url: str = ""
    subscribe_channel: str = ""  # «@имя» канала для проверки подписки в воронках; пусто — подписку не проверяем
    channel_url: str = ""
    funnels_path: str = "config/funnels.json"
    exit_survey_path: str = "config/exit_survey.json"
    subscription_path: str = "config/subscription.json"
    community_chat_id: str = ""  # чат сообщества: если задан, при отписке бот убирает человека из чата
    human_mode_hours: int = 12
    notify_comment_leads: bool = False
    telegram_polling: bool = True  # опрос Telegram: ответы менеджеров из Telegram уходят клиентам в Instagram
    log_level: str = "INFO"

    @property
    def links(self) -> dict[str, str]:
        """Значения для плейсхолдеров в config/flows.json."""
        return {
            "bot_url": self.bot_url,
            "site_url": self.site_url,
            "payment_url": self.payment_url,
            "privacy_url": self.privacy_url,
            "channel_url": channel_link(self.subscribe_channel, self.channel_url),
        }

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        _require(env, REQUIRED)
        get = _getter(env)
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
            privacy_url=get("PRIVACY_URL"),
            subscribe_channel=get("SUBSCRIBE_CHANNEL"),
            channel_url=get("CHANNEL_URL"),
            funnels_path=get("FUNNELS_PATH", cls.funnels_path),
            exit_survey_path=get("EXIT_SURVEY_PATH", cls.exit_survey_path),
            subscription_path=get("SUBSCRIPTION_PATH", cls.subscription_path),
            community_chat_id=get("COMMUNITY_CHAT_ID"),
            human_mode_hours=int(get("HUMAN_MODE_HOURS", str(cls.human_mode_hours))),
            notify_comment_leads=get("NOTIFY_COMMENT_LEADS").lower() in {"1", "true", "yes", "on"},
            telegram_polling=get("TELEGRAM_POLLING", "1").lower() not in {"0", "false", "no", "off"},
            log_level=get("LOG_LEVEL", cls.log_level).upper(),
        )


@dataclass(frozen=True)
class TelegramSettings:
    """Telegram-бот, который сам принимает заявки (не требует ни Instagram, ни Meta)."""

    bot_token: str
    manager_chat_id: str
    db_path: str = "data/bridge.db"
    flows_path: str = "config/flows.json"
    bot_url: str = "https://t.me/LegalcareeristBot"
    site_url: str = ""
    payment_url: str = ""
    privacy_url: str = ""
    subscribe_channel: str = ""
    channel_url: str = ""
    funnels_path: str = "config/funnels.json"
    exit_survey_path: str = "config/exit_survey.json"
    subscription_path: str = "config/subscription.json"
    community_chat_id: str = ""
    human_mode_hours: int = 12
    force_polling: bool = False
    api_base: str = "https://api.telegram.org"  # другой адрес нужен только для локального Bot API сервера и тестов
    log_level: str = "INFO"

    @property
    def links(self) -> dict[str, str]:
        return {
            "bot_url": self.bot_url,
            "site_url": self.site_url,
            "payment_url": self.payment_url,
            "privacy_url": self.privacy_url,
            "channel_url": channel_link(self.subscribe_channel, self.channel_url),
        }

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None, *, require_chat: bool = True) -> "TelegramSettings":
        """require_chat=False — для режима --find-chat, когда ID чата менеджеров ещё неизвестен."""
        env = os.environ if env is None else env
        _require(env, TELEGRAM_REQUIRED if require_chat else TELEGRAM_REQUIRED[:1])
        get = _getter(env)
        return cls(
            bot_token=get("TELEGRAM_BOT_TOKEN"),
            manager_chat_id=get("TELEGRAM_MANAGER_CHAT_ID"),
            db_path=get("DB_PATH", cls.db_path),
            flows_path=get("FLOWS_PATH", cls.flows_path),
            bot_url=get("BOT_URL", cls.bot_url),
            site_url=get("SITE_URL"),
            payment_url=get("PAYMENT_URL"),
            privacy_url=get("PRIVACY_URL"),
            subscribe_channel=get("SUBSCRIBE_CHANNEL"),
            channel_url=get("CHANNEL_URL"),
            funnels_path=get("FUNNELS_PATH", cls.funnels_path),
            exit_survey_path=get("EXIT_SURVEY_PATH", cls.exit_survey_path),
            subscription_path=get("SUBSCRIPTION_PATH", cls.subscription_path),
            community_chat_id=get("COMMUNITY_CHAT_ID"),
            human_mode_hours=int(get("HUMAN_MODE_HOURS", str(cls.human_mode_hours))),
            force_polling=get("TG_FORCE_POLLING").lower() in {"1", "true", "yes", "on"},
            api_base=get("TELEGRAM_API_BASE", cls.api_base).rstrip("/"),
            log_level=get("LOG_LEVEL", cls.log_level).upper(),
        )
