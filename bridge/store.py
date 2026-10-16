from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass, field


@dataclass
class Conversation:
    igsid: str  # id клиента: Instagram-scoped ID или "tg:<user_id>" для Telegram
    state: str = "idle"  # idle | menu | consent | question | done | human | optout
    segment: str | None = None
    step: int = 0
    answers: list[str] = field(default_factory=list)
    username: str | None = None
    human_until: float = 0.0
    source: str | None = None  # откуда пришёл клиент (start-параметр ссылки на бота)


class Store:
    """SQLite: состояние диалогов, дедупликация событий, заявки и служебные значения."""

    def __init__(self, path: str) -> None:
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock, self._db:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    igsid TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    segment TEXT,
                    step INTEGER NOT NULL DEFAULT 0,
                    answers TEXT NOT NULL DEFAULT '[]',
                    username TEXT,
                    human_until REAL NOT NULL DEFAULT 0,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS seen_events (key TEXT PRIMARY KEY, ts REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS leads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    igsid TEXT NOT NULL,
                    username TEXT,
                    segment TEXT,
                    data TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS card_messages (
                    chat_id TEXT NOT NULL,
                    message_id INTEGER NOT NULL,
                    client_id TEXT NOT NULL,
                    PRIMARY KEY (chat_id, message_id)
                );
                """
            )
            columns = {row[1] for row in self._db.execute("PRAGMA table_info(conversations)")}
            if "source" not in columns:  # миграция БД, созданной до появления Telegram-бота
                self._db.execute("ALTER TABLE conversations ADD COLUMN source TEXT")

    # --- дедупликация (повторные доставки вебхуков/обновлений) ---
    def seen(self, key: str) -> bool:
        """True, если событие уже обрабатывалось; иначе запоминает его и возвращает False."""
        with self._lock, self._db:
            cur = self._db.execute(
                "INSERT OR IGNORE INTO seen_events (key, ts) VALUES (?, ?)", (key, time.time())
            )
            return cur.rowcount == 0

    def purge_seen(self, older_than_seconds: float = 7 * 86400) -> None:
        with self._lock, self._db:
            self._db.execute("DELETE FROM seen_events WHERE ts < ?", (time.time() - older_than_seconds,))

    # --- диалоги ---
    def get_conv(self, igsid: str) -> Conversation | None:
        with self._lock:
            row = self._db.execute(
                "SELECT igsid, state, segment, step, answers, username, human_until, source "
                "FROM conversations WHERE igsid = ?",
                (igsid,),
            ).fetchone()
        if row is None:
            return None
        return Conversation(row[0], row[1], row[2], row[3], json.loads(row[4]), row[5], row[6], row[7])

    def save_conv(self, conv: Conversation) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO conversations "
                "(igsid, state, segment, step, answers, username, human_until, source, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(igsid) DO UPDATE SET state=excluded.state, segment=excluded.segment, "
                "step=excluded.step, answers=excluded.answers, username=excluded.username, "
                "human_until=excluded.human_until, source=excluded.source, updated_at=excluded.updated_at",
                (
                    conv.igsid,
                    conv.state,
                    conv.segment,
                    conv.step,
                    json.dumps(conv.answers, ensure_ascii=False),
                    conv.username,
                    conv.human_until,
                    conv.source,
                    time.time(),
                ),
            )

    def set_username(self, igsid: str, username: str) -> None:
        with self._lock, self._db:
            self._db.execute("UPDATE conversations SET username = ? WHERE igsid = ?", (username, igsid))

    # --- заявки ---
    def add_lead(self, igsid: str, username: str | None, segment: str | None, data: dict) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO leads (igsid, username, segment, data, created_at) VALUES (?, ?, ?, ?, ?)",
                (igsid, username, segment, json.dumps(data, ensure_ascii=False), time.time()),
            )

    def count_leads(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM leads").fetchone()[0]

    def leads(self, limit: int | None = None) -> list[dict]:
        """Заявки от новых к старым."""
        query = "SELECT id, igsid, username, segment, data, created_at FROM leads ORDER BY id DESC"
        params: tuple = ()
        if limit is not None:
            query += " LIMIT ?"
            params = (limit,)
        with self._lock:
            rows = self._db.execute(query, params).fetchall()
        return [
            {"id": r[0], "client_id": r[1], "username": r[2], "segment": r[3], "data": json.loads(r[4]), "created_at": r[5]}
            for r in rows
        ]

    # --- карточки менеджеру: чтобы ответ на карточку уходил нужному клиенту ---
    def add_card_message(self, chat_id: str, message_id: int, client_id: str) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT OR REPLACE INTO card_messages (chat_id, message_id, client_id) VALUES (?, ?, ?)",
                (str(chat_id), message_id, client_id),
            )

    def client_for_card(self, chat_id: str, message_id: int) -> str | None:
        with self._lock:
            row = self._db.execute(
                "SELECT client_id FROM card_messages WHERE chat_id = ? AND message_id = ?",
                (str(chat_id), message_id),
            ).fetchone()
        return row[0] if row else None

    # --- служебные значения ---
    def kv_get(self, key: str) -> str | None:
        with self._lock:
            row = self._db.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None

    def kv_set(self, key: str, value: str) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
