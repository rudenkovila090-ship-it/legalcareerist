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
    state: str = "idle"  # idle | menu | support | consent | question | done | human | optout
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
                CREATE TABLE IF NOT EXISTS user_tags (
                    user_id TEXT NOT NULL,
                    tag TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (user_id, tag)
                );
                CREATE TABLE IF NOT EXISTS funnel_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    funnel_id TEXT NOT NULL,
                    event TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_funnel_events ON funnel_events (user_id, funnel_id, event);
                CREATE TABLE IF NOT EXISTS jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    chat_id TEXT NOT NULL,
                    funnel_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    run_at REAL NOT NULL,
                    done INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs (done, run_at);
                CREATE TABLE IF NOT EXISTS contacts (
                    user_id TEXT PRIMARY KEY,
                    username TEXT,
                    name TEXT,
                    first_name TEXT,
                    source TEXT,
                    first_seen REAL NOT NULL,
                    last_seen REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS exit_surveys (
                    user_id TEXT PRIMARY KEY,
                    selected TEXT NOT NULL DEFAULT '[]',
                    other_text TEXT,
                    awaiting_other INTEGER NOT NULL DEFAULT 0,
                    message_id INTEGER,
                    updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS exit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    reasons TEXT NOT NULL,
                    other_text TEXT,
                    decision TEXT NOT NULL,
                    created_at REAL NOT NULL
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

    # --- метки клиентов (как «Новый подписчик» в конструкторах чат-ботов) ---
    def add_tag(self, user_id: str, tag: str) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT OR IGNORE INTO user_tags (user_id, tag, created_at) VALUES (?, ?, ?)",
                (user_id, tag[:100], time.time()),
            )

    def tags(self, user_id: str) -> list[str]:
        with self._lock:
            rows = self._db.execute(
                "SELECT tag FROM user_tags WHERE user_id = ? ORDER BY created_at, rowid", (user_id,)
            ).fetchall()
        return [r[0] for r in rows]

    # --- события воронок (для статистики и защиты от повторных напоминаний) ---
    def log_event(self, user_id: str, funnel_id: str, event: str) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO funnel_events (user_id, funnel_id, event, created_at) VALUES (?, ?, ?, ?)",
                (user_id, funnel_id, event, time.time()),
            )

    def has_event(self, user_id: str, funnel_id: str, event: str) -> bool:
        with self._lock:
            return (
                self._db.execute(
                    "SELECT 1 FROM funnel_events WHERE user_id = ? AND funnel_id = ? AND event = ? LIMIT 1",
                    (user_id, funnel_id, event),
                ).fetchone()
                is not None
            )

    def funnel_stats(self) -> dict[str, dict[str, int]]:
        """{воронка: {событие: число разных людей}}."""
        with self._lock:
            rows = self._db.execute(
                "SELECT funnel_id, event, COUNT(DISTINCT user_id) FROM funnel_events GROUP BY funnel_id, event"
            ).fetchall()
        stats: dict[str, dict[str, int]] = {}
        for funnel_id, event, count in rows:
            stats.setdefault(funnel_id, {})[event] = count
        return stats

    # --- отложенные сообщения (напоминания, дожим) ---
    def add_job(self, user_id: str, chat_id: str, funnel_id: str, kind: str, run_at: float) -> None:
        """Одна ожидающая задача такого вида на человека и воронку: повторный запуск воронки её не дублирует."""
        with self._lock, self._db:
            pending = self._db.execute(
                "SELECT 1 FROM jobs WHERE user_id = ? AND funnel_id = ? AND kind = ? AND done = 0",
                (user_id, funnel_id, kind),
            ).fetchone()
            if pending is None:
                self._db.execute(
                    "INSERT INTO jobs (user_id, chat_id, funnel_id, kind, run_at) VALUES (?, ?, ?, ?, ?)",
                    (user_id, chat_id, funnel_id, kind, run_at),
                )

    def due_jobs(self, now: float) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, user_id, chat_id, funnel_id, kind FROM jobs WHERE done = 0 AND run_at <= ? ORDER BY run_at, id",
                (now,),
            ).fetchall()
        return [{"id": r[0], "user_id": r[1], "chat_id": r[2], "funnel_id": r[3], "kind": r[4]} for r in rows]

    def finish_job(self, job_id: int) -> None:
        with self._lock, self._db:
            self._db.execute("UPDATE jobs SET done = 1 WHERE id = ?", (job_id,))

    def cancel_jobs(self, user_id: str, funnel_id: str, kinds: tuple[str, ...]) -> None:
        with self._lock, self._db:
            for kind in kinds:
                self._db.execute(
                    "UPDATE jobs SET done = 1 WHERE user_id = ? AND funnel_id = ? AND kind = ? AND done = 0",
                    (user_id, funnel_id, kind),
                )

    # --- контакты: все, кто писал боту ---
    def touch_contact(
        self,
        user_id: str,
        username: str | None,
        name: str | None,
        first_name: str | None = None,
        source: str | None = None,
    ) -> bool:
        """Обновляет карточку контакта. Возвращает True, если человек написал боту впервые."""
        now = time.time()
        with self._lock, self._db:
            is_new = self._db.execute("SELECT 1 FROM contacts WHERE user_id = ?", (user_id,)).fetchone() is None
            self._db.execute(
                "INSERT INTO contacts (user_id, username, name, first_name, source, first_seen, last_seen) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET username=COALESCE(excluded.username, username), "
                "name=COALESCE(excluded.name, name), first_name=COALESCE(excluded.first_name, first_name), "
                "source=COALESCE(source, excluded.source), last_seen=excluded.last_seen",
                (user_id, username, name, first_name, source, now, now),
            )
        return is_new

    def first_name(self, user_id: str) -> str | None:
        with self._lock:
            row = self._db.execute("SELECT first_name FROM contacts WHERE user_id = ?", (user_id,)).fetchone()
        return row[0] if row else None

    def contacts(self) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT user_id, username, name, source, first_seen, last_seen FROM contacts ORDER BY first_seen"
            ).fetchall()
        return [
            {"user_id": r[0], "username": r[1], "name": r[2], "source": r[3], "first_seen": r[4], "last_seen": r[5]}
            for r in rows
        ]

    # --- анкета ухода из сообщества: промежуточное состояние и итоговый журнал ---
    def exit_get(self, user_id: str) -> dict | None:
        with self._lock:
            row = self._db.execute(
                "SELECT selected, other_text, awaiting_other, message_id FROM exit_surveys WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return {"selected": json.loads(row[0]), "other_text": row[1], "awaiting_other": bool(row[2]), "message_id": row[3]}

    def exit_save(
        self, user_id: str, selected: list[int], other_text: str | None, awaiting_other: bool, message_id: int | None
    ) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO exit_surveys (user_id, selected, other_text, awaiting_other, message_id, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET selected=excluded.selected, "
                "other_text=excluded.other_text, awaiting_other=excluded.awaiting_other, "
                "message_id=excluded.message_id, updated_at=excluded.updated_at",
                (user_id, json.dumps(sorted(selected)), other_text, int(awaiting_other), message_id, time.time()),
            )

    def exit_clear(self, user_id: str) -> None:
        with self._lock, self._db:
            self._db.execute("DELETE FROM exit_surveys WHERE user_id = ?", (user_id,))

    def exit_log_add(self, user_id: str, reasons: list[str], other_text: str | None, decision: str) -> None:
        """Причины хранятся текстом, а не номерами: переставили пункты в конфиге, старые ответы не поплывут."""
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO exit_log (user_id, reasons, other_text, decision, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, json.dumps(reasons, ensure_ascii=False), other_text, decision, time.time()),
            )

    def exit_log(self) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, user_id, reasons, other_text, decision, created_at FROM exit_log ORDER BY id"
            ).fetchall()
        return [
            {"id": r[0], "user_id": r[1], "reasons": json.loads(r[2]), "other_text": r[3], "decision": r[4], "created_at": r[5]}
            for r in rows
        ]

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
