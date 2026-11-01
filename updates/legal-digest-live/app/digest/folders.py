"""Выбор папки Telegram («Мониторинг») среди папок аккаунта. Чистая логика, без обращения к сети."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Folder:
    ids: frozenset[int]
    all_channels: bool  # в папке включена галочка «Каналы» целиком
    excluded: frozenset[int]

    def wants(self, channel_id: int) -> bool:
        if channel_id in self.excluded:
            return False
        return self.all_channels or channel_id in self.ids


class FolderNotFound(Exception):
    def __init__(self, name: str, available: list[str]):
        have = ", ".join(f"«{a}»" for a in available) if available else "папок у вас нет"
        super().__init__(
            f"Папка «{name}» не найдена ({have}). Создайте её в Telegram "
            "(Настройки → Папки с чатами) или поставьте FOLDER_NAME=* в .env, чтобы читать все каналы."
        )


def _title(folder) -> str | None:
    title = getattr(folder, "title", None)
    title = getattr(title, "text", title)  # в новых версиях Telegram заголовок — объект с полем text
    return title.strip() if isinstance(title, str) else None


def _channel_ids(peers) -> frozenset[int]:
    return frozenset(p.channel_id for p in peers if hasattr(p, "channel_id"))


def pick(filters, name: str) -> Folder:
    """`filters` — ответ GetDialogFiltersRequest (список или объект с полем .filters)."""
    filters = getattr(filters, "filters", filters)
    wanted = name.strip().casefold()
    available = []
    for f in filters:
        title = _title(f)
        if title is None:  # «Все чаты» — служебная папка без названия
            continue
        available.append(title)
        if title.casefold() == wanted:
            included = list(getattr(f, "include_peers", [])) + list(getattr(f, "pinned_peers", []))
            return Folder(
                ids=_channel_ids(included),
                all_channels=bool(getattr(f, "broadcasts", False)),
                excluded=_channel_ids(getattr(f, "exclude_peers", [])),
            )
    raise FolderNotFound(name, available)
