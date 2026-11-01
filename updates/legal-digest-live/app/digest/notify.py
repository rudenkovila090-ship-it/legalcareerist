"""Отправка сводки через бота из @BotFather (Bot API Telegram, бесплатно)."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request


def _description(body: str) -> str:
    try:
        return json.loads(body).get("description", body[:200])
    except ValueError:
        return body[:200]


# Сразу после пробуждения ноутбука сеть бывает ещё не готова: даём ей время, а не теряем запуск.
NETWORK_ATTEMPTS = 4
NETWORK_RETRY_SECONDS = 15


def _post(request: urllib.request.Request) -> None:
    for attempt in range(1, NETWORK_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                response.read()
            return
        except urllib.error.HTTPError as exc:
            # `from None`: в тексте ошибки не должно оказаться адреса с токеном бота
            detail = _description(exc.read().decode("utf-8", "replace"))
            hint = " Откройте своего бота в Telegram и нажмите Start." if exc.code in (400, 403) else ""
            raise RuntimeError(f"Telegram отклонил отправку ({exc.code}): {detail}.{hint}") from None
        except urllib.error.URLError as exc:
            if attempt == NETWORK_ATTEMPTS:
                raise RuntimeError(f"Нет связи с api.telegram.org: {exc.reason}") from None
            time.sleep(NETWORK_RETRY_SECONDS)


def send_via_bot(token: str, chat_id: int, messages: list[str]) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    for n, text in enumerate(messages):
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "link_preview_options": {"is_disabled": True},
        }
        _post(urllib.request.Request(
            url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
        ))
        if n < len(messages) - 1:
            time.sleep(0.5)
