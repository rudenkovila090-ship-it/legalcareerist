"""Накопительная выгрузка найденного в таблицы CSV (открываются в Excel, Numbers и Google Таблицах).

Строки только добавляются в конец, старые не переписываются: можно спокойно дописывать свои колонки справа
(например, «Статус: написали / ответили») и вести по ним работу с работодателями и людьми рынка.
"""
from __future__ import annotations

import csv
import re
from datetime import date
from pathlib import Path

from . import leads
from .store import Item

VACANCY_HEADER = [
    "Дата поста", "Должность", "Компания", "Город", "Зарплата", "Формат", "Контакты", "Тип", "Канал", "Ссылка",
    "Оценка лида", "Уровень", "Почему", "Статус (заполняете вы)",
]
TIER_NAME = {"hot": "горячий", "good": "хороший", "other": "обычный", "agency": "агентство"}
EVENT_HEADER = [
    "Дата", "Время", "Название", "Формат", "Город", "Цена", "Для кого", "О чём", "Регистрация до",
    "Ссылка на регистрацию", "Канал", "Ссылка на пост",
]
NEWS_HEADER = [
    "Дата поста", "Тип", "Люди", "Должность", "Компания (куда)", "Откуда", "Награда", "Заголовок",
    "Кратко", "Ссылки из поста", "Канал", "Ссылка",
]
LAW_HEADER = [
    "Дата поста", "Тип", "Орган / суд", "Документ / дело", "Вступает в силу", "Заголовок", "Суть", "Ссылки из поста",
    "Канал", "Ссылка",
]

# Ячейка, начинающаяся как формула, в Excel и Таблицах может выполниться. Тексты постов приходят снаружи,
# поэтому такие ячейки обезвреживаем апострофом; обычные «@ник» и «+7…» не трогаем.
_FORMULA = re.compile(r"^(?:=|[\t\r]|[+\-@]\s*[A-Za-z_]+\s*\()")


def _cell(value) -> str:
    text = "" if value is None else str(value)
    return "'" + text if _FORMULA.match(text) else text


def _links(item: Item) -> str:
    """Ссылки из поста через пробел (в ячейке они остаются кликабельными); у старых записей хотя бы источник."""
    return " ".join(item.links or ((item.reg_url,) if item.reg_url else ()))


def _rotate_if_header_changed(path: Path, header: list[str]) -> None:
    """Если у файла другая шапка (например, от старой версии программы), откладываем его в сторону, чтобы
    не смешивать колонки. Колонки, добавленные справа вами, не мешают: сравниваем только начало шапки."""
    if not path.exists() or path.stat().st_size == 0:
        return
    with open(path, newline="", encoding="utf-8-sig") as f:
        existing = next(csv.reader(f), [])
    if existing[: len(header)] == header:
        return
    target = path.with_name(f"{path.stem}-старый-формат-{date.today():%Y-%m-%d}{path.suffix}")
    counter = 2
    while target.exists():
        target = path.with_name(f"{path.stem}-старый-формат-{date.today():%Y-%m-%d}-{counter}{path.suffix}")
        counter += 1
    path.rename(target)


def _append(path: Path, header: list[str], rows: list[list]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    _rotate_if_header_changed(path, header)
    new = not path.exists() or path.stat().st_size == 0
    # BOM нужен Excel для кириллицы, но только в начале файла: при дозаписи его повторять нельзя.
    with open(path, "a", newline="", encoding="utf-8-sig" if new else "utf-8") as f:
        writer = csv.writer(f)
        if new:
            writer.writerow(header)
        writer.writerows([[_cell(v) for v in row] for row in rows])


def export_items(
    data_dir: Path, items: list[Item], today: date | None = None, open_vacancies: dict[str, int] | None = None,
    contacted: frozenset[str] = frozenset(),
) -> None:
    today = today or date.today()
    rated = []
    for i in (i for i in items if i.kind == "vacancy"):
        key = leads.open_vacancy_key(i.company)
        rated.append((leads.score_vacancy(i, today, (open_vacancies or {}).get(key, 1) if key else 1, 0, contacted), i))
    rated.sort(key=lambda r: (-r[0].score, r[1].posted_at))  # лучшие лиды первыми
    events = sorted((i for i in items if i.kind == "event"), key=lambda i: (i.event_date is None, i.event_date))
    news = sorted((i for i in items if i.kind == "news"), key=lambda i: i.posted_at)
    laws = sorted((i for i in items if i.kind == "law"), key=lambda i: i.posted_at)
    _append(data_dir / "vacancies.csv", VACANCY_HEADER, [
        [
            f"{i.posted_at:%Y-%m-%d}", i.title, i.company, i.city, i.salary, i.work_format, ", ".join(i.contacts),
            "агентство" if i.via_agency else "работодатель", i.channel_title, i.link,
            lead.score, TIER_NAME[lead.tier], "; ".join(lead.reasons), "",
        ]
        for lead, i in rated
    ])
    _append(data_dir / "events.csv", EVENT_HEADER, [
        [
            i.event_date.isoformat() if i.event_date else "",
            (f"{i.event_time:%H:%M}" + (f"–{i.event_end:%H:%M}" if i.event_end else "")) if i.event_time else "",
            i.title, i.work_format, i.city, i.price, ", ".join(i.audience), i.topic,
            i.deadline.isoformat() if i.deadline else "", i.reg_url, i.channel_title, i.link,
        ]
        for i in events
    ])
    _append(data_dir / "news.csv", NEWS_HEADER, [
        [
            f"{i.posted_at:%Y-%m-%d}", i.subtype, ", ".join(i.people), i.role, i.company, i.origin, i.place,
            i.title, i.topic, _links(i), i.channel_title, i.link,
        ]
        for i in news
    ])
    _append(data_dir / "law.csv", LAW_HEADER, [
        [
            f"{i.posted_at:%Y-%m-%d}", i.subtype, i.place, i.doc_ref, i.event_date.isoformat() if i.event_date else "",
            i.title, i.topic, _links(i), i.channel_title, i.link,
        ]
        for i in laws
    ])
