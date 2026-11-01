"""Чтение каналов от имени вашего аккаунта (Telethon). Ничего не отправляет и не отмечает посты прочитанными."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime

from telethon import TelegramClient
from telethon.tl.functions.messages import GetDialogFiltersRequest
from telethon.tl.types import Channel, MessageEntityUrl

from . import folders

PER_CHANNEL_LIMIT = 300  # за один запуск; при ежедневном запуске этого с запасом
PAUSE_SECONDS = 0.3  # пауза между каналами, чтобы не дёргать Telegram слишком часто


@dataclass(frozen=True)
class Source:
    id: int
    title: str
    username: str | None
    entity: Channel

    def link(self, msg_id: int) -> str:
        if self.username:
            return f"https://t.me/{self.username}/{msg_id}"
        return f"https://t.me/c/{self.id}/{msg_id}"


@dataclass(frozen=True)
class Post:
    source: Source
    msg_id: int
    text: str
    date: datetime  # с часовым поясом (UTC)
    # Ссылки поста, которых нет в тексте открытым видом: спрятанные за словами («Откликнуться»), на кнопках
    # под постом и записанные без «https://» (hh.ru/vacancy/1).
    urls: tuple[str, ...] = ()


def _message_urls(message) -> tuple[str, ...]:
    urls: list[str] = []
    for entity in getattr(message, "entities", None) or []:
        if getattr(entity, "url", None):  # ссылка, спрятанная за словами
            urls.append(entity.url)
    get_entities_text = getattr(message, "get_entities_text", None)
    if get_entities_text:  # открытая ссылка в тексте: Telegram находит и такие, где нет «https://»
        for _entity, text in get_entities_text(MessageEntityUrl):
            urls.append(text if "://" in text else "https://" + text)
    for row in getattr(getattr(message, "reply_markup", None), "rows", None) or []:
        for button in getattr(row, "buttons", None) or []:
            # Кнопка со ссылкой: в старых версиях Telethon адрес лежит в самой кнопке, в новых в её типе.
            url = getattr(button, "url", None) or getattr(getattr(button, "type", None), "url", None)
            if isinstance(url, str) and url:
                urls.append(url)
    return tuple(dict.fromkeys(urls))


async def list_sources(client: TelegramClient, folder_names: str) -> list[Source]:
    """Каналы (не чаты и не группы) из указанных папок. Папки перечисляются через запятую;
    "*" или пустое значение — все ваши каналы. Канал из нескольких папок читается один раз."""
    names = [n.strip() for n in folder_names.split(",") if n.strip()]
    selected = None
    if names and "*" not in names:
        response = await client(GetDialogFiltersRequest())
        selected = [folders.pick(response, name) for name in names]
    sources = []
    async for dialog in client.iter_dialogs():
        entity = dialog.entity
        if not isinstance(entity, Channel) or not entity.broadcast:
            continue
        if selected is None or any(f.wants(entity.id) for f in selected):
            sources.append(Source(entity.id, entity.title, entity.username, entity))
    return sources


async def fetch_posts(
    client: TelegramClient, source: Source, since_id: int, cutoff: datetime
) -> tuple[list[Post], int]:
    """Новые посты канала (id больше since_id) и самый свежий id.

    Если канал читаем впервые (since_id == 0), берём посты не старше cutoff.
    """
    posts: list[Post] = []
    newest = since_id
    async for message in client.iter_messages(source.entity, min_id=since_id, limit=PER_CHANNEL_LIMIT):
        newest = max(newest, message.id)
        if since_id == 0 and message.date < cutoff:
            break
        if message.message:
            posts.append(Post(source, message.id, message.message, message.date, _message_urls(message)))
    await asyncio.sleep(PAUSE_SECONDS)
    return posts, newest
