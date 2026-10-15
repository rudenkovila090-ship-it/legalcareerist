from __future__ import annotations

import hashlib
import logging
import time

import httpx

from .config import Settings
from .store import Store

log = logging.getLogger(__name__)

BASE = "https://graph.instagram.com"
# Лимит текста Instagram DM — 1000 байт UTF-8 (кириллица = 2 байта/символ). Берём запас.
MAX_DM_BYTES = 900
TOKEN_REFRESH_AFTER = 30 * 86400  # долгоживущий токен живёт 60 дней, продлеваем на 30-й


class GraphError(Exception):
    def __init__(self, message: str, status: int | None = None, code: int | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def chunk_text(text: str, limit: int = MAX_DM_BYTES) -> list[str]:
    """Режет текст на части <= limit байт UTF-8: по абзацам, затем по строкам, затем по символам."""
    text = text.strip()
    if len(text.encode()) <= limit:
        return [text]
    chunks: list[str] = []
    current = ""

    def push(piece: str) -> None:
        nonlocal current
        candidate = f"{current}\n\n{piece}" if current else piece
        if len(candidate.encode()) <= limit:
            current = candidate
            return
        if current:
            chunks.append(current)
            current = ""
        if len(piece.encode()) <= limit:
            current = piece
            return
        buf = ""  # слишком длинный кусок режем по символам
        for ch in piece:
            if len((buf + ch).encode()) > limit:
                chunks.append(buf)
                buf = ""
            buf += ch
        current = buf

    for paragraph in text.split("\n\n"):
        push(paragraph)
    if current:
        chunks.append(current)
    return chunks


class TokenManager:
    """Хранит актуальный долгоживущий токен Instagram и продлевает его (в БД, не в env)."""

    def __init__(self, settings: Settings, store: Store, http: httpx.AsyncClient) -> None:
        self._settings = settings
        self._store = store
        self._http = http

    def current(self) -> str:
        # Если токен в env сменили вручную — он главнее сохранённого в БД.
        env_token = self._settings.ig_access_token
        fingerprint = hashlib.sha256(env_token.encode()).hexdigest()[:16]
        if self._store.kv_get("ig_token_env_fp") != fingerprint:
            self._store.kv_set("ig_token", env_token)
            self._store.kv_set("ig_token_env_fp", fingerprint)
            self._store.kv_set("ig_token_refreshed_at", "0")  # возраст неизвестен -> продлить при первой проверке
        return self._store.kv_get("ig_token") or env_token

    def due(self) -> bool:
        self.current()
        refreshed_at = float(self._store.kv_get("ig_token_refreshed_at") or 0)
        return time.time() - refreshed_at > TOKEN_REFRESH_AFTER

    async def refresh(self) -> None:
        token = self.current()
        try:
            resp = await self._http.get(
                f"{BASE}/refresh_access_token",
                params={"grant_type": "ig_refresh_token", "access_token": token},
                timeout=20,
            )
        except httpx.HTTPError as exc:  # без repr(exc): в нём может быть URL с токеном
            raise GraphError(f"refresh: сетевая ошибка {type(exc).__name__}") from None
        if resp.status_code >= 400:
            raise GraphError(f"refresh: {_error_text(resp)}", resp.status_code)
        new_token = resp.json().get("access_token")
        if not new_token:
            raise GraphError("refresh: в ответе нет access_token", resp.status_code)
        self._store.kv_set("ig_token", new_token)
        self._store.kv_set("ig_token_refreshed_at", str(time.time()))
        log.info("Токен Instagram продлён")


def _error_text(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error", {})
        return f"{err.get('message', resp.text[:200])} (code={err.get('code')}, subcode={err.get('error_subcode')})"
    except ValueError:
        return resp.text[:200]


class InstagramClient:
    """Instagram API with Instagram Login (graph.instagram.com): DM, private reply, ответ на комментарий."""

    def __init__(self, settings: Settings, tokens: TokenManager, http: httpx.AsyncClient) -> None:
        self._account_id = settings.ig_account_id
        self._version = settings.graph_version
        self._tokens = tokens
        self._http = http

    def _url(self, path: str) -> str:
        return f"{BASE}/{self._version}/{path}"

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        headers = {"Authorization": f"Bearer {self._tokens.current()}"}
        try:
            resp = await self._http.request(method, self._url(path), headers=headers, timeout=15, **kwargs)
        except httpx.HTTPError as exc:
            raise GraphError(f"{path}: сетевая ошибка {type(exc).__name__}") from None
        if resp.status_code >= 400:
            code = None
            try:
                code = resp.json().get("error", {}).get("code")
            except ValueError:
                pass
            raise GraphError(f"{path}: {_error_text(resp)}", resp.status_code, code)
        return resp.json()

    async def send_dm(self, igsid: str, text: str) -> None:
        """Обычное сообщение: работает в течение 24 часов после последнего сообщения пользователя."""
        for part in chunk_text(text):
            await self._request(
                "POST",
                f"{self._account_id}/messages",
                json={"recipient": {"id": igsid}, "message": {"text": part}},
            )

    async def private_reply(self, comment_id: str, text: str) -> None:
        """Личный ответ на комментарий: одно сообщение, в течение 7 дней после комментария."""
        if len(text.encode()) > MAX_DM_BYTES:
            raise GraphError("private reply длиннее лимита, сообщение не отправлено")
        await self._request(
            "POST",
            f"{self._account_id}/messages",
            json={"recipient": {"comment_id": comment_id}, "message": {"text": text}},
        )

    async def reply_to_comment(self, comment_id: str, text: str) -> None:
        await self._request("POST", f"{comment_id}/replies", json={"message": text})

    async def get_username(self, igsid: str) -> str | None:
        try:
            data = await self._request("GET", igsid, params={"fields": "username"})
        except GraphError as exc:
            log.info("Не удалось получить username для %s: %s", igsid, exc)
            return None
        return data.get("username")
