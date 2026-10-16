from __future__ import annotations

import asyncio
import logging

import httpx

log = logging.getLogger(__name__)

TG_LIMIT = 4096


class TelegramNotifier:
    """Отправка карточек менеджеру через @LegalcareeristBot (только sendMessage, без getUpdates).

    Поэтому не конфликтует с уже работающим ботом: тот же токен, но мост лишь отправляет сообщения.
    """

    def __init__(self, bot_token: str, chat_id: str, http: httpx.AsyncClient) -> None:
        self._url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        self._chat_id = chat_id
        self._http = http

    async def send(self, html_text: str, attempts: int = 3) -> int | None:
        """Отправляет HTML-сообщение в чат менеджеров. Возвращает message_id (0, если id не удалось прочитать)
        или None, если сообщение не доставлено."""
        payload = {
            "chat_id": self._chat_id,
            "text": html_text[: TG_LIMIT - 1],
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        for attempt in range(1, attempts + 1):
            try:
                resp = await self._http.post(self._url, json=payload, timeout=15)
            except httpx.HTTPError as exc:  # без repr(exc): в URL есть токен бота
                log.warning("Telegram: сетевая ошибка %s (попытка %d)", type(exc).__name__, attempt)
            else:
                if resp.status_code == 200:
                    try:
                        return int(resp.json()["result"]["message_id"])
                    except (ValueError, KeyError, TypeError):
                        return 0
                log.warning("Telegram: HTTP %s %s (попытка %d)", resp.status_code, resp.text[:200], attempt)
                if resp.status_code < 500 and resp.status_code != 429:
                    break  # 4xx (кроме 429) повторять бессмысленно: неверный chat_id/токен
            if attempt < attempts:
                await asyncio.sleep(2**attempt)
        log.error("Telegram: сообщение менеджеру НЕ доставлено:\n%s", html_text)
        return None
