"""Entry point: `python -m bot`."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from .config import ConfigError, Settings
from .handlers import build_application
from .llm import Claude
from .sheets import Journal, SheetError


def load_dotenv(path: str = ".env") -> None:
    """Minimal .env reader for local runs; real environment variables always win."""
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # httpx logs full request URLs at INFO, and Telegram's URL contains the bot token
    for noisy in ("httpx", "httpcore", "telegram.ext.Application"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def main() -> None:
    load_dotenv()
    setup_logging()
    try:
        settings = Settings.from_env()
        journal = Journal.from_settings(settings)
    except (ConfigError, SheetError) as e:
        raise SystemExit(f"Не могу запуститься: {e}") from e
    app = build_application(settings, journal, Claude(settings.model, settings.use_fallbacks))
    app.run_polling()


if __name__ == "__main__":
    main()
