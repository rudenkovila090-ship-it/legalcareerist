"""Telegram-бот @LegalcareeristBot: сам принимает заявки (long polling: домен и HTTPS не нужны).

    python -m bridge.tgbot                  # запустить бота
    python -m bridge.tgbot --check          # проверить настройку, ничего не запуская
    python -m bridge.tgbot --check --test-message   # + тестовое сообщение в чат менеджеров
    python -m bridge.tgbot --find-chat      # узнать ID группы менеджеров (до первого запуска)

Клиент пишет боту (например, по ссылке из Instagram t.me/LegalcareeristBot?start=post_oct17),
проходит меню и вопросы, заявка приходит карточкой в чат менеджеров. Менеджер отвечает на карточку,
и ответ уходит клиенту. Команды в чате менеджеров: /leads, /export. В любом чате: /chatid.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import io
import logging
import re
import sys
import time
from typing import Any

import httpx

from .cards import channel_of, format_card
from .config import TelegramSettings
from .doctor import FAIL, OK, WARN
from .engine import Action, Engine
from .flows import Flows, load_flows
from .logging_setup import setup_logging
from .store import Conversation, Store
from .webhook import DmEvent

log = logging.getLogger("tgbot")

SOURCE_MAX = 64
UNSAFE_SOURCE = re.compile(r"[^A-Za-z0-9_-]")
COMMAND = re.compile(r"^/(\w+)(?:@\w+)?(?:\s+(.*))?$", re.DOTALL)
MEDIA_KEYS = ("photo", "document", "voice", "video", "video_note", "audio", "sticker", "animation")

MANAGER_HELP = (
    "Как работать с заявками:\n"
    "• Ответьте (reply) на карточку клиента: ваш ответ уйдёт ему от имени бота. Можно слать текст, фото, файлы, голосовые.\n"
    "• /leads: последние 10 заявок\n"
    "• /export: все заявки файлом CSV (открывается в Excel и Google Таблицах)\n"
    "• /chatid: узнать ID чата"
)


class TelegramError(Exception):
    pass


class TelegramAPI:
    """Тонкий клиент Bot API. В сообщениях об ошибках нет URL: в нём токен бота."""

    def __init__(self, token: str, http: httpx.AsyncClient, api_base: str = "https://api.telegram.org") -> None:
        self._base = f"{api_base}/bot{token}"
        self._http = http

    async def call(
        self,
        method: str,
        payload: dict | None = None,
        *,
        files: dict | None = None,
        timeout: float = 20,
        attempts: int = 3,
    ) -> Any:
        last = "неизвестная ошибка"
        for attempt in range(1, attempts + 1):
            try:
                if files:
                    resp = await self._http.post(f"{self._base}/{method}", data=payload, files=files, timeout=timeout)
                else:
                    resp = await self._http.post(f"{self._base}/{method}", json=payload or {}, timeout=timeout)
            except httpx.HTTPError as exc:
                last = f"сетевая ошибка {type(exc).__name__}"
            else:
                try:
                    data = resp.json()
                except ValueError:
                    data = {}
                if resp.status_code == 200 and data.get("ok"):
                    return data.get("result")
                last = f"{data.get('description') or resp.text[:150]} (HTTP {resp.status_code})"
                if resp.status_code == 429:
                    await asyncio.sleep(min(float((data.get("parameters") or {}).get("retry_after", 2)), 10))
                    continue
                if resp.status_code < 500:
                    break  # 4xx: повтор не поможет (неверный chat_id, бот заблокирован и т.п.)
            if attempt < attempts:
                await asyncio.sleep(2**attempt)
        raise TelegramError(f"{method}: {last}")

    async def get_me(self) -> dict:
        return await self.call("getMe")

    async def get_chat(self, chat_id: str) -> dict:
        return await self.call("getChat", {"chat_id": chat_id})

    async def get_webhook_info(self) -> dict:
        return await self.call("getWebhookInfo")

    async def delete_webhook(self) -> None:
        await self.call("deleteWebhook", {"drop_pending_updates": False})

    async def get_updates(self, offset: int, timeout: int = 25) -> list[dict]:
        return await self.call(
            "getUpdates",
            {"offset": offset, "timeout": timeout, "allowed_updates": ["message"]},
            timeout=timeout + 10,
            attempts=1,
        )

    async def send_message(
        self,
        chat_id: str,
        text: str,
        *,
        html: bool = False,
        reply_markup: dict | None = None,
        reply_to: int | None = None,
    ) -> dict:
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text[:4096], "disable_web_page_preview": True}
        if html:
            payload["parse_mode"] = "HTML"
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        if reply_to:
            payload["reply_parameters"] = {"message_id": reply_to, "allow_sending_without_reply": True}
        return await self.call("sendMessage", payload)

    async def copy_message(self, chat_id: str, from_chat_id: str, message_id: int) -> dict:
        return await self.call(
            "copyMessage", {"chat_id": chat_id, "from_chat_id": from_chat_id, "message_id": message_id}
        )

    async def send_document(self, chat_id: str, filename: str, content: bytes, caption: str = "") -> dict:
        return await self.call(
            "sendDocument",
            {"chat_id": str(chat_id), "caption": caption},
            files={"document": (filename, content, "text/csv")},
            timeout=60,
        )


def keyboard(options: list[str] | None) -> dict:
    """Кнопки быстрых ответов; без options клавиатуру убираем, чтобы старые кнопки не висели."""
    if options:
        return {"keyboard": [[{"text": o}] for o in options], "resize_keyboard": True, "one_time_keyboard": True}
    return {"remove_keyboard": True}


def _safe_cell(value: Any) -> str:
    """Защита от CSV-инъекции: ячейка, начинающаяся с = + - @, в Excel выполнилась бы как формула."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _date(ts: float) -> str:
    return time.strftime("%Y-%m-%d %H:%M", time.gmtime(ts))


def leads_csv(leads: list[dict], flows: Flows) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["№", "Дата (UTC)", "Канал", "Источник", "Сегмент", "Username", "ID клиента", "Ответы"])
    for lead in reversed(leads):  # старые сверху
        data = lead["data"]
        segment = flows.segments.get(lead["segment"] or "")
        writer.writerow(
            [
                lead["id"],
                _date(lead["created_at"]),
                channel_of(lead["client_id"]),
                _safe_cell(data.get("source")),
                _safe_cell(segment.label if segment else lead["segment"]),
                _safe_cell(lead["username"]),
                lead["client_id"].removeprefix("tg:"),
                _safe_cell(" | ".join(f"{q}: {a}" for q, a in data.get("qa", []))),
            ]
        )
    return ("﻿" + buf.getvalue()).encode("utf-8")  # BOM, чтобы Excel не ломал кириллицу


class LeadBot:
    def __init__(
        self,
        settings: TelegramSettings,
        api: TelegramAPI,
        engine: Engine,
        flows: Flows,
        store: Store,
        clock=time.time,
    ) -> None:
        self.s, self.api, self.engine, self.flows, self.store, self._clock = settings, api, engine, flows, store, clock

    # ------------------------------------------------------------------ маршрутизация
    async def handle_update(self, update: dict) -> None:
        msg = update.get("message")
        if not msg or "chat" not in msg:
            return
        chat_id = str(msg["chat"]["id"])
        text = (msg.get("text") or "").strip()
        match = COMMAND.match(text)
        cmd = match.group(1).lower() if match else None
        arg = (match.group(2) or "").strip() if match else ""

        if cmd == "chatid":
            await self.api.send_message(chat_id, f"ID этого чата: {chat_id}")
        elif chat_id == self.s.manager_chat_id:
            await self._manager(msg, cmd)
        elif msg["chat"].get("type") == "private":
            await self._client(update.get("update_id", 0), msg, cmd, arg)
        # группы и каналы, кроме чата менеджеров, игнорируем: бот не должен отвечать посторонним

    # ------------------------------------------------------------------ клиент
    async def _client(self, update_id: int, msg: dict, cmd: str | None, arg: str) -> None:
        user = msg.get("from") or {}
        if user.get("is_bot") or "id" not in user:
            return
        client_id = f"tg:{user['id']}"
        text = msg.get("text") or msg.get("caption")
        if cmd == "start":
            source = UNSAFE_SOURCE.sub("", arg)[:SOURCE_MAX] or None
            if source:
                conv = self.store.get_conv(client_id) or Conversation(client_id)
                conv.source = source
                self.store.save_conv(conv)
            text = "/start"  # payload не передаём движку: длинный параметр не должен сорвать распознавание команды
        elif "contact" in msg:
            text = msg["contact"].get("phone_number") or ""
        name = " ".join(p for p in (user.get("first_name"), user.get("last_name")) if p) or None
        event = DmEvent(
            sender_id=client_id,
            mid=f"tg{update_id}",
            text=text,
            has_attachment=any(k in msg for k in MEDIA_KEYS),
            username=user.get("username"),
            name=name,
        )
        await self._run(self.engine.on_dm(event), chat_id=str(msg["chat"]["id"]))

    async def _run(self, actions: list[Action], chat_id: str) -> None:
        for action in actions:
            try:
                if action.kind == "dm":
                    await self.api.send_message(chat_id, action.text, reply_markup=keyboard(action.options))
                elif action.kind == "notify":
                    card = action.card or {}
                    sent = await self.api.send_message(self.s.manager_chat_id, format_card(card), html=True)
                    self.store.add_card_message(self.s.manager_chat_id, sent["message_id"], card["igsid"])
            except TelegramError as exc:
                if action.kind == "notify":
                    log.error(
                        "Карточка клиента %s не доставлена менеджерам: %s (заявки сохранены в базе, см. /export)",
                        (action.card or {}).get("igsid"),
                        exc,
                    )
                else:
                    log.warning("Сообщение клиенту не отправлено: %s", exc)

    # ------------------------------------------------------------------ менеджеры
    async def _manager(self, msg: dict, cmd: str | None) -> None:
        chat_id = str(msg["chat"]["id"])
        if cmd == "leads":
            await self._send_leads(chat_id)
        elif cmd == "export":
            leads = self.store.leads()
            await self.api.send_document(
                chat_id, "leads.csv", leads_csv(leads, self.flows), caption=f"Заявок: {len(leads)}"
            )
        elif cmd in ("start", "help"):
            await self.api.send_message(chat_id, MANAGER_HELP)
        elif cmd is None and msg.get("reply_to_message"):
            await self._forward_reply(msg, chat_id)

    async def _send_leads(self, chat_id: str) -> None:
        leads = self.store.leads(limit=10)
        if not leads:
            await self.api.send_message(chat_id, "Заявок пока нет.")
            return
        lines = []
        for lead in leads:
            segment = self.flows.segments.get(lead["segment"] or "")
            who = f"@{lead['username']}" if lead["username"] else lead["client_id"].removeprefix("tg:")
            source = lead["data"].get("source") or "—"
            lines.append(f"#{lead['id']} · {_date(lead['created_at'])} UTC · {segment.label if segment else '—'} · {who} · {source}")
        await self.api.send_message(chat_id, "Последние заявки:\n" + "\n".join(lines))

    async def _forward_reply(self, msg: dict, chat_id: str) -> None:
        client_id = self.store.client_for_card(chat_id, msg["reply_to_message"]["message_id"])
        if client_id is None:
            return  # ответ на сообщение, не связанное с клиентом
        if channel_of(client_id) != "Telegram":
            await self.api.send_message(
                chat_id, "Это клиент из Instagram: ответьте ему в самом Instagram.", reply_to=msg["message_id"]
            )
            return
        try:
            await self.api.copy_message(client_id.removeprefix("tg:"), chat_id, msg["message_id"])
        except TelegramError as exc:
            await self.api.send_message(chat_id, f"❌ Не доставлено клиенту: {exc}", reply_to=msg["message_id"])
            return
        conv = self.store.get_conv(client_id) or Conversation(client_id)
        if conv.state != "optout":  # менеджер ответил лично: бот не вмешивается, пока диалог ведёт человек
            conv.state = "human"
            conv.human_until = self._clock() + self.s.human_mode_hours * 3600
            self.store.save_conv(conv)
        ack = await self.api.send_message(chat_id, "✅ Отправлено клиенту", reply_to=msg["message_id"])
        self.store.add_card_message(chat_id, ack["message_id"], client_id)  # можно продолжать ответами в той же ветке

    # ------------------------------------------------------------------ основной цикл
    async def run(self) -> None:
        offset = int(self.store.kv_get("tg_offset") or 0)
        failures = 0
        while True:
            try:
                updates = await self.api.get_updates(offset)
            except TelegramError as exc:
                failures += 1
                conflict = "Conflict" in str(exc)
                log.error(
                    "getUpdates: %s%s",
                    exc,
                    " (токен бота уже использует другой процесс или webhook)" if conflict else "",
                )
                await asyncio.sleep(30 if conflict else min(5 * failures, 60))
                continue
            failures = 0
            for update in updates:
                try:
                    await self.handle_update(update)
                except Exception:
                    log.exception("Сбой обработки обновления %s", update.get("update_id"))
                offset = update["update_id"] + 1
                self.store.kv_set("tg_offset", str(offset))


Line = tuple[str, str]


async def preflight(settings: TelegramSettings, api: TelegramAPI, flows: Flows) -> list[Line]:
    """Проверки перед запуском. Любой FAIL означает, что бот не стартует."""
    lines: list[Line] = []
    try:
        me = await api.get_me()
    except TelegramError as exc:
        return [(FAIL, f"токен бота не принят: {exc}")]
    lines.append((OK, f"бот: @{me.get('username')}"))

    try:
        info = await api.get_webhook_info()
        if not info.get("url"):
            lines.append((OK, "webhook не используется, можно запускать polling"))
        elif settings.force_polling:
            await api.delete_webhook()
            lines.append((WARN, "у бота был включён webhook, он удалён (TG_FORCE_POLLING=1)"))
        else:
            lines.append(
                (
                    FAIL,
                    "у бота включён webhook: токен уже использует другой процесс. Остановите его, возьмите у BotFather "
                    "новый токен для этого бота или запустите с TG_FORCE_POLLING=1 (старый процесс перестанет получать сообщения)",
                )
            )
    except TelegramError as exc:
        lines.append((FAIL, f"не удалось прочитать webhook: {exc}"))

    try:
        chat = await api.get_chat(settings.manager_chat_id)
        lines.append((OK, f"чат менеджеров: {chat.get('title') or 'личный чат'}"))
    except TelegramError as exc:
        lines.append((FAIL, f"чат менеджеров недоступен боту (проверьте ID и что бот добавлен в группу): {exc}"))

    if flows.consent is None:
        lines.append((WARN, "PRIVACY_URL не задан: согласие на обработку персональных данных не запрашивается"))
    else:
        lines.append((OK, "согласие на обработку персональных данных запрашивается"))
    return lines


async def find_chats(api: TelegramAPI, store: Store, seconds: int = 60) -> list[dict]:
    """Подсматривает, из каких чатов боту писали, не подтверждая обновления: после этого основной запуск
    обработает те же сообщения как обычно. Нужен, чтобы узнать ID группы менеджеров до первого старта."""
    offset = int(store.kv_get("tg_offset") or 0)
    deadline = time.monotonic() + seconds
    found: dict[int, dict] = {}
    while time.monotonic() < deadline:
        updates = await api.get_updates(offset, timeout=max(1, min(25, int(deadline - time.monotonic()))))
        for update in updates:
            chat = (update.get("message") or {}).get("chat")
            if chat:
                found[chat["id"]] = chat
        if updates:
            await asyncio.sleep(1)  # offset не двигаем, поэтому те же обновления вернутся снова
    return sorted(found.values(), key=lambda c: c.get("type") == "private")  # группы первыми


async def _find_chat(settings: TelegramSettings) -> int:
    store = Store(settings.db_path)
    async with httpx.AsyncClient() as http:
        api = TelegramAPI(settings.bot_token, http, settings.api_base)
        try:
            me = await api.get_me()
        except TelegramError as exc:
            print(f"{FAIL} токен бота не принят: {exc}")
            return 1
        print(f"Бот @{me.get('username')}. Добавьте его в группу менеджеров и напишите там /chatid (60 секунд)…")
        try:
            chats = await find_chats(api, store)
        except TelegramError as exc:
            print(f"{FAIL} {exc}")
            return 1
    if not chats:
        print(f"{WARN} сообщений боту не было. Проверьте, что бот в группе и вы написали /chatid.")
        return 1
    for chat in chats:
        title = chat.get("title") or chat.get("first_name") or "личный чат"
        print(f"{OK} {chat['type']}: {title}, ID: {chat['id']}")
    print("Значение ID группы (оно начинается с -100…) запишите в TELEGRAM_MANAGER_CHAT_ID.")
    return 0


async def _amain(settings: TelegramSettings, args: argparse.Namespace) -> int:
    if args.find_chat:
        return await _find_chat(settings)
    flows = load_flows(settings.flows_path, settings.links, with_comment_rules=False)
    store = Store(settings.db_path)
    engine = Engine(flows, store, human_mode_hours=settings.human_mode_hours)
    async with httpx.AsyncClient() as http:
        api = TelegramAPI(settings.bot_token, http, settings.api_base)
        lines = await preflight(settings, api, flows)
        for icon, text in lines:
            print(f"{icon} {text}")
        if any(icon == FAIL for icon, _ in lines):
            return 1
        if args.check:
            if args.test_message:
                await api.send_message(settings.manager_chat_id, "✅ Проверка связи: бот @LegalcareeristBot настроен.")
                print(f"{OK} тестовое сообщение отправлено")
            return 0
        store.purge_seen()
        log.info("Бот запущен: сегментов %d, заявок в базе %d", len(flows.segments), store.count_leads())
        await LeadBot(settings, api, engine, flows, store).run()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Telegram-бот приёма заявок")
    parser.add_argument("--check", action="store_true", help="проверить настройку и выйти")
    parser.add_argument("--test-message", action="store_true", help="с --check: отправить тестовое сообщение менеджерам")
    parser.add_argument("--find-chat", action="store_true", help="узнать ID группы менеджеров (бот должен быть в ней)")
    args = parser.parse_args(argv)
    try:
        settings = TelegramSettings.from_env(require_chat=not args.find_chat)
    except RuntimeError as exc:
        print(f"{FAIL} {exc}")
        return 1
    setup_logging(settings.log_level)
    try:
        return asyncio.run(_amain(settings, args))
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError) as exc:  # нет/испорчен config/flows.json
        print(f"{FAIL} {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
