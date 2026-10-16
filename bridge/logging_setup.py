from __future__ import annotations

import logging


def setup_logging(level: str = "INFO") -> None:
    """Логи сервиса. Библиотеки httpx/httpcore на уровне INFO пишут полный URL запроса,
    а в URL есть токен бота Telegram (и access_token при продлении токена Instagram) — поэтому глушим их."""
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
