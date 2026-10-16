from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass


@dataclass
class CommentEvent:
    id: str
    text: str
    from_id: str
    username: str | None
    media_id: str | None
    parent_id: str | None


@dataclass
class DmEvent:
    sender_id: str
    mid: str | None
    text: str | None
    has_attachment: bool
    username: str | None = None  # Telegram: известен сразу; Instagram: подтягивается по ID при отправке карточки
    name: str | None = None


def verify_signature(app_secret: str, body: bytes, header: str | None) -> bool:
    """Проверка X-Hub-Signature-256: HMAC-SHA256 от сырого тела запроса секретом приложения Meta.

    app_secret может содержать несколько секретов через запятую: у приложения Meta есть «секрет приложения»
    и отдельный «секрет Instagram-приложения»; подходит любой из них."""
    if not header or not header.startswith("sha256="):
        return False
    received = header[len("sha256=") :]
    secrets = [s.strip() for s in app_secret.split(",") if s.strip()]
    return any(
        hmac.compare_digest(hmac.new(secret.encode(), body, hashlib.sha256).hexdigest(), received)
        for secret in secrets
    )


def _dm_from(item: dict) -> DmEvent | None:
    message = item.get("message")
    if not message or message.get("is_echo") or message.get("is_deleted"):
        return None  # эхо наших же сообщений, удалённые сообщения, статусы прочтения и т.п.
    sender = (item.get("sender") or {}).get("id")
    if not sender:
        return None
    return DmEvent(
        sender_id=str(sender),
        mid=message.get("mid"),
        text=message.get("text"),
        has_attachment=bool(message.get("attachments")),
    )


def parse_events(payload: dict) -> tuple[list[CommentEvent], list[DmEvent]]:
    """Достаёт комментарии и личные сообщения из тела вебхука Instagram."""
    comments: list[CommentEvent] = []
    dms: list[DmEvent] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            field = change.get("field")
            if field == "comments" and value.get("id"):
                author = value.get("from") or {}
                comments.append(
                    CommentEvent(
                        id=str(value["id"]),
                        text=value.get("text") or "",
                        from_id=str(author.get("id", "")),
                        username=author.get("username"),
                        media_id=(value.get("media") or {}).get("id"),
                        parent_id=value.get("parent_id"),
                    )
                )
            elif field == "messages":  # формат тестового вебхука из панели Meta
                dm = _dm_from(value)
                if dm:
                    dms.append(dm)
        for item in entry.get("messaging") or []:
            dm = _dm_from(item)
            if dm:
                dms.append(dm)
    return comments, dms
