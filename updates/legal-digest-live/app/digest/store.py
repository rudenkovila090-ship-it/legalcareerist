"""Хранилище состояния (SQLite): до какого поста дочитан каждый канал, что уже показано в сводке
и «отпечатки» отправленного, чтобы одно и то же не приходило повторно."""
from __future__ import annotations

import difflib
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit

# Колонки таблицы items в том порядке, в каком их читают и пишут.
COLUMNS = (
    "channel_id", "msg_id", "kind", "title", "channel_title", "link", "event_date", "event_time", "deadline",
    "posted_at", "company", "salary", "work_format", "contacts", "via_agency", "event_end", "city", "price",
    "audience", "topic", "reg_url", "subtype", "people", "role", "origin", "place", "doc_ref", "links",
)
SCHEMA = """
CREATE TABLE IF NOT EXISTS channels (
    channel_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    last_msg_id INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS items (
    channel_id INTEGER NOT NULL,
    msg_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_title TEXT NOT NULL,
    link TEXT NOT NULL,
    event_date TEXT,
    event_time TEXT,
    deadline TEXT,
    posted_at TEXT NOT NULL,
    sent_at TEXT,
    company TEXT,
    salary TEXT,
    work_format TEXT,
    contacts TEXT,
    via_agency INTEGER NOT NULL DEFAULT 0,
    event_end TEXT,
    city TEXT,
    price TEXT,
    audience TEXT,
    topic TEXT,
    reg_url TEXT,
    subtype TEXT,
    people TEXT,
    role TEXT,
    origin TEXT,
    place TEXT,
    doc_ref TEXT,
    links TEXT,
    PRIMARY KEY (channel_id, msg_id)
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""
# Поля, добавленные после первой версии: у существующей базы появляются при открытии.
ADDED_COLUMNS = {
    "company": "TEXT",
    "salary": "TEXT",
    "work_format": "TEXT",
    "contacts": "TEXT",
    "via_agency": "INTEGER NOT NULL DEFAULT 0",
    "event_end": "TEXT",
    "city": "TEXT",
    "price": "TEXT",
    "audience": "TEXT",
    "topic": "TEXT",
    "reg_url": "TEXT",
    "subtype": "TEXT",
    "people": "TEXT",
    "role": "TEXT",
    "origin": "TEXT",
    "place": "TEXT",
    "doc_ref": "TEXT",
    "links": "TEXT",
}
# Версия правил разбора новостей и законодательства. Когда она меняется, неотправленное, найденное по старым
# правилам, один раз удаляется (присланное остаётся): так в сводку не попадёт то, что новые правила отвергли бы.
RULES_VERSION = "3"
# За какой срок назад ищем уже показанное, чтобы не повторять вакансию или новость.
DUPLICATE_WINDOW_DAYS = {"vacancy": 30, "news": 14, "law": 14, "event": 3}  # для мероприятий без даты


@dataclass(frozen=True)
class Item:
    channel_id: int
    msg_id: int
    kind: str  # "event" | "vacancy" | "news" | "law"
    title: str
    channel_title: str
    link: str
    event_date: date | None  # у законодательства: дата вступления в силу
    event_time: time | None
    deadline: date | None
    posted_at: datetime
    company: str | None = None
    salary: str | None = None
    work_format: str | None = None  # у вакансии: офис / удалённо / гибрид; у мероприятия: онлайн / офлайн / гибрид
    contacts: tuple[str, ...] = ()
    via_agency: bool = False
    event_end: time | None = None
    city: str | None = None
    price: str | None = None
    audience: tuple[str, ...] = ()
    topic: str | None = None
    reg_url: str | None = None
    subtype: str | None = None
    people: tuple[str, ...] = ()
    role: str | None = None  # новости: должность
    origin: str | None = None  # новости: откуда перешёл
    place: str | None = None  # новости: какая награда; законодательство: орган или суд
    doc_ref: str | None = None  # законодательство: номер закона или дела
    links: tuple[str, ...] = ()  # ссылки из самого поста, которые ведут куда-то


def _opt(value, parse):
    return parse(value) if value else None


def _utc_iso(moment: datetime) -> str:
    return (moment.astimezone(timezone.utc) if moment.tzinfo else moment).isoformat()


def _to_row(item: Item) -> tuple:
    return (
        item.channel_id, item.msg_id, item.kind, item.title, item.channel_title, item.link,
        item.event_date and item.event_date.isoformat(),
        item.event_time and item.event_time.strftime("%H:%M"),
        item.deadline and item.deadline.isoformat(),
        _utc_iso(item.posted_at),
        item.company, item.salary, item.work_format,
        json.dumps(list(item.contacts), ensure_ascii=False),
        int(item.via_agency),
        item.event_end and item.event_end.strftime("%H:%M"),
        item.city, item.price,
        json.dumps(list(item.audience), ensure_ascii=False),
        item.topic, item.reg_url, item.subtype,
        json.dumps(list(item.people), ensure_ascii=False),
        item.role, item.origin, item.place, item.doc_ref,
        json.dumps(list(item.links), ensure_ascii=False),
    )


def _from_row(r: tuple) -> Item:
    def as_tuple(value):
        return tuple(json.loads(value)) if value else ()

    return Item(
        r[0], r[1], r[2], r[3], r[4], r[5],
        _opt(r[6], date.fromisoformat), _opt(r[7], time.fromisoformat), _opt(r[8], date.fromisoformat),
        datetime.fromisoformat(r[9]),
        company=r[10], salary=r[11], work_format=r[12], contacts=as_tuple(r[13]), via_agency=bool(r[14]),
        event_end=_opt(r[15], time.fromisoformat), city=r[16], price=r[17], audience=as_tuple(r[18]),
        topic=r[19], reg_url=r[20], subtype=r[21], people=as_tuple(r[22]),
        role=r[23], origin=r[24], place=r[25], doc_ref=r[26], links=as_tuple(r[27]),
    )


def _norm(text: str) -> str:
    return re.sub(r"[\W_]+", " ", text.lower().replace("ё", "е")).strip()


def _tokens(norm: str) -> set[str]:
    return {word[:5] for word in norm.split() if len(word) >= 4}  # основы слов: «налоговые» и «налоговых» совпадают


def _ratio(a: str, b: str, floor: float) -> float:
    """Сходство двух заголовков от 0 до 1: лучшее из похожести строк и совпадения слов (порядок слов не важен)."""
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    ta, tb = _tokens(na), _tokens(nb)
    by_words = 2 * len(ta & tb) / (len(ta) + len(tb)) if ta and tb else 0.0
    matcher = difflib.SequenceMatcher(None, na, nb)
    if matcher.real_quick_ratio() < floor or matcher.quick_ratio() < floor:
        return by_words
    return max(matcher.ratio(), by_words)


def _norm_url(url: str) -> str:
    """Ссылка без схемы, www, якоря, завершающего слеша и меток utm_*: одна и та же страница регистрации."""
    parts = urlsplit(url.strip())
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not k.lower().startswith(("utm_", "fbclid", "yclid"))])
    host = parts.netloc.lower().removeprefix("www.")
    return f"{host}{parts.path.rstrip('/')}" + (f"?{query}" if query else "")


def _split_refs(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def same_thing(a: Item, b: Item) -> bool:
    """Один и тот же анонс, вакансия или новость в разных постах и каналах."""
    if a.kind != b.kind:
        return False
    if a.kind == "event":
        if a.event_date != b.event_date:
            return False
        if a.reg_url and b.reg_url and _norm_url(a.reg_url) == _norm_url(b.reg_url):
            return True
        r = _ratio(a.title, b.title, 0.5)
        return r >= 0.75 or (a.event_time is not None and a.event_time == b.event_time and r >= 0.5)
    if a.kind == "vacancy":
        if a.company and b.company:
            # Разные работодатели с одинаковой должностью — разные вакансии.
            return _norm(a.company) == _norm(b.company) and _ratio(a.title, b.title, 0.75) >= 0.75
        if set(a.contacts) & set(b.contacts):
            return _ratio(a.title, b.title, 0.6) >= 0.6
        return len(_norm(a.title)) >= 25 and _ratio(a.title, b.title, 0.92) >= 0.92
    if a.kind == "news":
        if a.subtype == b.subtype and set(a.people) & set(b.people):
            return True
        return _ratio(a.title, b.title, 0.88) >= 0.88
    if a.kind == "law":
        refs_a, refs_b = set(_split_refs(a.doc_ref)), set(_split_refs(b.doc_ref))
        if refs_a & refs_b and a.subtype == b.subtype:
            return _ratio(a.title, b.title, 0.5) >= 0.5
        return _ratio(a.title, b.title, 0.85) >= 0.85
    return False


class Store:
    def __init__(self, path: Path | str):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path))
        self.db.executescript(SCHEMA)
        have = {row[1] for row in self.db.execute("PRAGMA table_info(items)")}
        for name, ddl in ADDED_COLUMNS.items():
            if name not in have:
                self.db.execute(f"ALTER TABLE items ADD COLUMN {name} {ddl}")
        self.db.commit()
        if self.get_meta("rules_version") != RULES_VERSION:
            self.db.execute("DELETE FROM items WHERE sent_at IS NULL AND kind IN ('news', 'law')")
            self.set_meta("rules_version", RULES_VERSION)

    def close(self) -> None:
        self.db.close()

    def get_meta(self, key: str) -> str | None:
        row = self.db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None

    def set_meta(self, key: str, value: str) -> None:
        with self.db:
            self.db.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def last_msg_id(self, channel_id: int) -> int:
        row = self.db.execute("SELECT last_msg_id FROM channels WHERE channel_id = ?", (channel_id,)).fetchone()
        return row[0] if row else 0

    def set_last_msg_id(self, channel_id: int, title: str, msg_id: int) -> None:
        with self.db:
            self.db.execute(
                "INSERT INTO channels (channel_id, title, last_msg_id) VALUES (?, ?, ?) "
                "ON CONFLICT(channel_id) DO UPDATE SET title = excluded.title, last_msg_id = excluded.last_msg_id",
                (channel_id, title, msg_id),
            )

    def add_item(self, item: Item) -> None:
        with self.db:
            self.db.execute(
                f"INSERT OR IGNORE INTO items ({', '.join(COLUMNS)}) VALUES ({', '.join('?' * len(COLUMNS))})",
                _to_row(item),
            )

    def seen_before(self, item: Item) -> bool:
        """Это мероприятие, вакансию или новость мы уже показывали, в другом канале или в другой день?
        Сравниваются только уже отправленные: ещё не отправленные повторы склеиваются при сборке сводки."""
        sql = (
            f"SELECT {', '.join(COLUMNS)} FROM items WHERE sent_at IS NOT NULL AND kind = ? "
            "AND NOT (channel_id = ? AND msg_id = ?)"
        )
        params: list = [item.kind, item.channel_id, item.msg_id]
        if item.kind == "event" and item.event_date:
            sql += " AND event_date = ?"
            params.append(item.event_date.isoformat())
        else:
            if item.kind == "event":
                sql += " AND event_date IS NULL"
            cutoff = item.posted_at - timedelta(days=DUPLICATE_WINDOW_DAYS[item.kind])
            sql += " AND posted_at >= ?"
            params.append(_utc_iso(cutoff))
        return any(same_thing(item, _from_row(row)) for row in self.db.execute(sql, params))

    def pending_items(self, today: date, horizon_days: int) -> list[Item]:
        """Ещё не показанное в сводке. Мероприятие попадает в сводку, когда до него остаётся
        не больше horizon_days; прошедшие и слишком далёкие пока не показываем."""
        rows = self.db.execute(f"SELECT {', '.join(COLUMNS)} FROM items WHERE sent_at IS NULL").fetchall()
        limit = today + timedelta(days=horizon_days)
        items = [_from_row(r) for r in rows]
        return [i for i in items if i.kind != "event" or i.event_date is None or today <= i.event_date <= limit]

    def vacancy_counts(self, today: date, days: int = 30) -> dict[str, int]:
        """Сколько разных вакансий каждого прямого работодателя встретилось за последние `days` дней (и присланных,
        и ещё нет). Работодатель с несколькими открытыми вакансиями это один разговор и несколько заказов."""
        cutoff = datetime.combine(today - timedelta(days=days), time.min).astimezone(timezone.utc).isoformat()
        rows = self.db.execute(
            "SELECT company, title FROM items WHERE kind = 'vacancy' AND via_agency = 0 AND company IS NOT NULL "
            "AND posted_at >= ?", (cutoff,),
        ).fetchall()
        titles: dict[str, set[str]] = {}
        for company, title in rows:
            titles.setdefault(_norm(company), set()).add(_norm(title)[:40])
        return {company: len(found) for company, found in titles.items()}

    def mark_sent(self, items: list[Item], when: datetime | None = None) -> None:
        stamp = (when or datetime.now()).isoformat()
        with self.db:
            self.db.executemany(
                "UPDATE items SET sent_at = ? WHERE channel_id = ? AND msg_id = ?",
                [(stamp, i.channel_id, i.msg_id) for i in items],
            )
