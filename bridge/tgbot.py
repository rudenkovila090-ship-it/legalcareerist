"""Telegram-бот @LegalcareeristBot: сам принимает заявки (long polling: домен и HTTPS не нужны).

    python -m bridge.tgbot                  # запустить бота
    python -m bridge.tgbot --check          # проверить настройку, ничего не запуская
    python -m bridge.tgbot --check --test-message   # + тестовое сообщение в чат менеджеров
    python -m bridge.tgbot --find-chat      # узнать ID группы менеджеров (до первого запуска)
    python -m bridge.tgbot --links          # готовые диплинки для Instagram, QR и рекламы

Клиент пишет боту (например, по ссылке из Instagram t.me/LegalcareeristBot?start=guide__ig_story),
получает приветствие, материал по кодовому слову (воронки из config/funnels.json) или проходит анкету,
заявка приходит карточкой в чат менеджеров. Менеджер отвечает на карточку, и ответ уходит клиенту.
Команды в чате менеджеров: /leads, /export, /contacts, /stats. В любом чате: /chatid.
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
from collections import Counter
from dataclasses import replace
from typing import Any
from urllib.parse import urlparse

import httpx

from .cards import channel_of, format_card
from .config import TelegramSettings
from .doctor import FAIL, OK, WARN
from .engine import Action, Engine
from .exitflow import ExitFlow, load_exit
from .flows import Flows, fill_name, load_flows, normalize
from .funnels import FunnelEngine, Plan, load_funnels
from .graph import GraphError
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
    "• /contacts: все, кто писал боту, с метками и источниками (CSV)\n"
    "• /stats: статистика воронок и причины ухода из сообщества\n"
    "• /exits: ответы тех, кто хотел уйти из сообщества, файлом CSV\n"
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
            {"offset": offset, "timeout": timeout, "allowed_updates": ["message", "callback_query"]},
            timeout=timeout + 10,
            attempts=1,
        )

    async def get_chat_member(self, chat_id: str, user_id: int) -> dict:
        return await self.call("getChatMember", {"chat_id": chat_id, "user_id": user_id})

    async def answer_callback_query(self, callback_query_id: str, text: str | None = None, alert: bool = False) -> None:
        payload: dict[str, Any] = {"callback_query_id": callback_query_id}
        if text:
            payload.update({"text": text[:200], "show_alert": alert})
        await self.call("answerCallbackQuery", payload, attempts=1)

    async def edit_message_reply_markup(self, chat_id: str, message_id: int, rows: list[list[dict]]) -> None:
        await self.call(
            "editMessageReplyMarkup",
            {"chat_id": chat_id, "message_id": message_id, "reply_markup": {"inline_keyboard": rows}},
            attempts=1,
        )

    async def ban_chat_member(self, chat_id: str, user_id: int) -> None:
        await self.call("banChatMember", {"chat_id": chat_id, "user_id": user_id})

    async def unban_chat_member(self, chat_id: str, user_id: int) -> None:
        """Снимает бан сразу после удаления: человек не заблокирован навсегда и сможет вернуться по ссылке."""
        await self.call("unbanChatMember", {"chat_id": chat_id, "user_id": user_id, "only_if_banned": True})

    async def send_document_url(self, chat_id: str, url: str, caption: str = "") -> dict:
        """Файл по ссылке: Telegram скачивает его сам (до 20 МБ)."""
        return await self.call("sendDocument", {"chat_id": chat_id, "document": url, "caption": caption}, timeout=60)

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


def contacts_csv(contacts: list[dict], store: Store) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Дата первого обращения (UTC)", "Username", "Имя", "ID", "Источник", "Метки"])
    for c in contacts:
        writer.writerow(
            [
                _date(c["first_seen"]),
                _safe_cell(c["username"]),
                _safe_cell(c["name"]),
                c["user_id"].removeprefix("tg:"),
                _safe_cell(c["source"]),
                _safe_cell(", ".join(store.tags(c["user_id"]))),
            ]
        )
    return ("﻿" + buf.getvalue()).encode("utf-8")


def exits_csv(rows: list[dict], store: Store) -> bytes:
    usernames = {c["user_id"]: c["username"] for c in store.contacts()}
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Дата (UTC)", "Username", "ID", "Решение", "Причины", "Другое (текст клиента)"])
    for r in rows:
        writer.writerow(
            [
                _date(r["created_at"]),
                _safe_cell(usernames.get(r["user_id"])),
                r["user_id"].removeprefix("tg:"),
                "отписался" if r["decision"] == "left" else "остался",
                _safe_cell(" | ".join(r["reasons"])),
                _safe_cell(r["other_text"]),
            ]
        )
    return ("﻿" + buf.getvalue()).encode("utf-8")


def build_exit(settings) -> ExitFlow | None:
    config = load_exit(settings.exit_survey_path)
    return ExitFlow(config) if config else None


def build_funnels(settings, flows: Flows, store: Store, clock=time.time) -> FunnelEngine:
    config = load_funnels(settings.funnels_path, settings.links, set(flows.segments))
    return FunnelEngine(
        config,
        store,
        channel=settings.subscribe_channel,
        channel_url=settings.links["channel_url"],
        clock=clock,
    )


class LeadBot:
    def __init__(
        self,
        settings: TelegramSettings,
        api: TelegramAPI,
        engine: Engine,
        flows: Flows,
        store: Store,
        clock=time.time,
        ig: Any = None,
        funnels: FunnelEngine | None = None,
        exit_flow: ExitFlow | None = None,
    ) -> None:
        self.s, self.api, self.engine, self.flows, self.store, self._clock = settings, api, engine, flows, store, clock
        self.ig = ig  # InstagramClient: нужен, чтобы ответ менеджера из Telegram уходил клиенту в Instagram DM
        self.funnels = funnels  # воронки выдачи материалов; None — только анкеты
        self.exit = exit_flow  # путь выхода из сообщества; None — выключен
        self._gate_problem_reported = False

    # ------------------------------------------------------------------ маршрутизация
    async def handle_update(self, update: dict) -> None:
        if update.get("callback_query"):
            await self._callback(update["callback_query"])
            return
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
        chat_id = str(msg["chat"]["id"])
        text = msg.get("text") or msg.get("caption")
        name = " ".join(p for p in (user.get("first_name"), user.get("last_name")) if p) or None
        is_new = self.store.touch_contact(client_id, user.get("username"), name, user.get("first_name"))

        if self.exit and cmd is None and text:  # человек выбрал «Другое» и пишет причину своими словами
            state = self.store.exit_get(client_id)
            if state and state["awaiting_other"]:
                await self._exit_other_text(client_id, chat_id, text, state)
                return
        if self.exit and cmd == "unsubscribe":
            await self._exit_start(client_id, chat_id)
            return

        if cmd == "start":
            payload = UNSAFE_SOURCE.sub("", arg)[:SOURCE_MAX]
            head, _, rest = payload.partition("__")
            if self.exit and head == "unsub":
                await self._exit_start(client_id, chat_id)
                return
            hit = self.funnels.by_payload(payload) if self.funnels and payload else None
            segment = head[4:] if head.startswith("seg_") and head[4:] in self.flows.segments else None
            known = bool(hit or segment or head in ("hello", "menu"))
            source = (rest if known else payload) or None  # «guide__ig_story»: воронка guide, источник ig_story
            if source:
                conv = self.store.get_conv(client_id) or Conversation(client_id)
                conv.source = source
                self.store.save_conv(conv)
                self.store.touch_contact(client_id, None, None, None, source)
            if hit:
                await self._start_funnel(hit[0], client_id, chat_id, user)
                return
            if segment:
                await self._run(self.engine.start_segment(client_id, segment, user.get("username")), chat_id, client_id)
                return
            welcome = self.funnels.welcome(is_new) if self.funnels and head != "menu" else None
            if welcome and not self._human_active(client_id):
                self._reset_state(client_id)
                await self._run([replace(welcome, to=client_id)], chat_id, client_id)
                return
            text = "/start"  # payload не передаём движку: длинный параметр не должен сорвать распознавание команды
        elif "contact" in msg:
            text = msg["contact"].get("phone_number") or ""
        elif text and self.funnels and self.funnels.enabled:
            funnel = self._keyword_funnel(client_id, text)
            if funnel:
                await self._start_funnel(funnel, client_id, chat_id, user)
                return
        event = DmEvent(
            sender_id=client_id,
            mid=f"tg{update_id}",
            text=text,
            has_attachment=any(k in msg for k in MEDIA_KEYS),
            username=user.get("username"),
            name=name,
        )
        await self._run(self.engine.on_dm(event), chat_id, client_id)

    def _human_active(self, client_id: str) -> bool:
        conv = self.store.get_conv(client_id)
        return bool(conv and conv.state == "human" and conv.human_until > self._clock())

    def _reset_state(self, client_id: str) -> None:
        """«/start» начинает сначала: анкета, согласие и отказ от рассылки сбрасываются."""
        conv = self.store.get_conv(client_id)
        if conv and conv.state != "idle":
            conv.state, conv.segment, conv.step, conv.answers = "idle", None, 0, []
            self.store.save_conv(conv)

    def _keyword_funnel(self, client_id: str, text: str):
        """Кодовое слово запускает воронку, но не перехватывает ответы на вопросы анкеты и диалог с менеджером."""
        conv = self.store.get_conv(client_id)
        if conv:
            if conv.state in ("question", "consent", "optout"):
                return None
            if conv.state == "human" and conv.human_until > self._clock():
                return None
            if conv.state == "menu" and self.flows.choose_segment(normalize(text)):
                return None  # человек выбирает пункт меню, а не вводит кодовое слово
        return self.funnels.match(text)

    # ------------------------------------------------------------------ выход из сообщества
    async def _edit_keyboard(self, chat_id: str, message_id: int | None, rows: list[list[dict]]) -> None:
        if not message_id:
            return
        try:
            await self.api.edit_message_reply_markup(chat_id, message_id, rows)
        except TelegramError as exc:  # «message is not modified», сообщение удалено и т.п.: не критично
            log.info("Не удалось обновить кнопки: %s", exc)

    async def _exit_start(self, client_id: str, chat_id: str) -> None:
        old = self.store.exit_get(client_id)
        if old:  # прошлую анкету закрываем, чтобы кнопки в старом сообщении не путали
            await self._edit_keyboard(chat_id, old["message_id"], [])
        try:
            sent = await self.api.send_message(
                chat_id, self.exit.text(), reply_markup={"inline_keyboard": self.exit.keyboard([])}
            )
        except TelegramError as exc:
            log.warning("Анкета ухода не отправлена: %s", exc)
            return
        self.store.exit_save(client_id, [], None, False, sent["message_id"])

    async def _exit_other_text(self, client_id: str, chat_id: str, text: str, state: dict) -> None:
        other = text.strip()[:1000]
        sent = await self.api.send_message(
            chat_id, self.exit.cfg.other_saved, reply_markup={"inline_keyboard": self.exit.keyboard(state["selected"])}
        )
        self.store.exit_save(client_id, state["selected"], other, False, sent["message_id"])

    async def _exit_callback(self, cq: dict) -> None:
        user = cq.get("from") or {}
        message = cq.get("message") or {}
        chat = message.get("chat") or {}
        if self.exit is None or user.get("is_bot") or "id" not in user or chat.get("type") != "private":
            await self._answer(cq["id"])
            return
        cfg = self.exit.cfg
        client_id, chat_id = f"tg:{user['id']}", str(chat["id"])
        name = " ".join(p for p in (user.get("first_name"), user.get("last_name")) if p) or None
        self.store.touch_contact(client_id, user.get("username"), name, user.get("first_name"))
        parts = (cq.get("data") or "").split(":")
        action = parts[1] if len(parts) > 1 else ""
        state = self.store.exit_get(client_id)
        message_id = message.get("message_id") or (state or {}).get("message_id")

        well_formed_toggle = action == "t" and len(parts) == 3 and parts[2].isdigit()
        if action == "start" or (state is None and (action == "c" or well_formed_toggle)):
            await self._answer(cq["id"])
            await self._exit_start(client_id, chat_id)
            return
        if state is None:  # «Отписаться»/«Остаться» повторно: уже обработано
            await self._answer(cq["id"])
            return

        selected = set(state["selected"])
        if action == "t" and len(parts) == 3 and parts[2].isdigit():
            if int(parts[2]) < len(cfg.reasons):
                selected ^= {int(parts[2])}
            keep_other = cfg.other_index in selected
            self.store.exit_save(
                client_id, sorted(selected), state["other_text"] if keep_other else None,
                state["awaiting_other"] and keep_other, message_id,
            )
            await self._answer(cq["id"])
            await self._edit_keyboard(chat_id, message_id, self.exit.keyboard(sorted(selected)))
        elif action == "c":
            if not selected:
                await self._answer(cq["id"], cfg.need_one, alert=True)
                return
            await self._answer(cq["id"])
            if cfg.other_index in selected and not state["other_text"]:
                self.store.exit_save(client_id, sorted(selected), None, True, message_id)
                await self.api.send_message(chat_id, cfg.other_prompt)
                return
            await self._edit_keyboard(chat_id, message_id, [])  # причины зафиксированы, кнопки убираем
            await self.api.send_message(chat_id, cfg.final, reply_markup={"inline_keyboard": self.exit.final_keyboard()})
        elif action in ("u", "s"):
            await self._answer(cq["id"])
            if not selected:  # защита: финал возможен только после выбора причин
                await self._exit_start(client_id, chat_id)
                return
            await self._exit_finish(client_id, chat_id, user, name, "left" if action == "u" else "stayed", state)
        else:
            await self._answer(cq["id"])

    async def _exit_finish(self, client_id: str, chat_id: str, user: dict, name: str | None, decision: str, state: dict) -> None:
        cfg = self.exit.cfg
        reasons = self.exit.reasons_of(state["selected"])
        other = state["other_text"] if cfg.other_index in state["selected"] else None
        self.store.exit_log_add(client_id, reasons, other, decision)
        self.store.exit_clear(client_id)
        self.store.add_tag(client_id, f"exit:{decision}")

        note = cfg.leave_note if decision == "left" else ""
        if decision == "left" and self.s.community_chat_id:
            try:
                await self.api.ban_chat_member(self.s.community_chat_id, user["id"])
                await self.api.unban_chat_member(self.s.community_chat_id, user["id"])
                result = "Бот удалил клиента из чата сообщества."
            except TelegramError as exc:
                log.error("Не удалось удалить %s из чата сообщества: %s", client_id, exc)
                result = "Не удалось удалить клиента из чата сообщества (бот должен быть администратором): сделайте это вручную."
            note = f"{note} {result}".strip()
        qa = [["Причины", "\n".join(f"• {r}" for r in reasons)]]
        if other:
            qa.append(["Другое: ответ клиента", other])
        card = {
            "type": "exit_leave" if decision == "left" else "exit_stay",
            "igsid": client_id,
            "username": user.get("username"),
            "name": name,
            "qa": qa,
            "note": note,
        }
        await self._run([Action("dm", client_id, cfg.done_text if decision == "left" else cfg.stay_text)], chat_id, client_id)
        await self._run([Action("notify", card=card)], chat_id, client_id)

    # ------------------------------------------------------------------ воронки
    async def _subscribed(self, user_id: int) -> bool | None:
        """True/False — подписан или нет; None — проверить не удалось (бот не администратор канала и т.п.)."""
        try:
            member = await self.api.get_chat_member(self.funnels.channel, user_id)
        except TelegramError as exc:
            log.error("Проверка подписки не удалась (бот должен быть администратором канала): %s", exc)
            if not self._gate_problem_reported:
                self._gate_problem_reported = True
                try:
                    await self.api.send_message(
                        self.s.manager_chat_id,
                        "⚠️ Не удаётся проверить подписку на канал: бот должен быть администратором канала. "
                        "Пока это не исправлено, материалы выдаются без проверки.",
                    )
                except TelegramError:
                    pass
            return None
        status = member.get("status")
        return status in ("creator", "administrator", "member") or (status == "restricted" and bool(member.get("is_member")))

    async def _start_funnel(self, f, client_id: str, chat_id: str, user: dict) -> None:
        subscribed = await self._subscribed(user["id"]) if self.funnels.gated(f) else None
        await self._apply(self.funnels.on_start(f, client_id, subscribed), client_id, chat_id, user.get("username"))

    async def _apply(self, plan: Plan, client_id: str, chat_id: str, username: str | None = None) -> None:
        await self._run(plan.actions, chat_id, client_id)
        for kind, minutes in plan.jobs:
            self.store.add_job(client_id, chat_id, plan.funnel_id, kind, self._clock() + minutes * 60)
        if plan.then_segment:
            await self._run(self.engine.start_segment(client_id, plan.then_segment, username), chat_id, client_id)

    async def _answer(self, callback_id: str, text: str | None = None, alert: bool = False) -> None:
        try:
            if text:
                await self.api.answer_callback_query(callback_id, text=text, alert=alert)
            else:
                await self.api.answer_callback_query(callback_id)  # убираем «часики» на кнопке
        except TelegramError:
            pass

    async def _callback(self, cq: dict) -> None:
        if (cq.get("data") or "").startswith("x:"):
            await self._exit_callback(cq)  # подтверждает нажатие сама (иногда с текстом)
            return
        await self._answer(cq["id"])
        user = cq.get("from") or {}
        chat = (cq.get("message") or {}).get("chat") or {}
        if user.get("is_bot") or "id" not in user or chat.get("type") != "private":
            return
        client_id, chat_id, data = f"tg:{user['id']}", str(chat["id"]), cq.get("data") or ""
        name = " ".join(p for p in (user.get("first_name"), user.get("last_name")) if p) or None
        self.store.touch_contact(client_id, user.get("username"), name, user.get("first_name"))

        if data == "m:menu":  # «Другой вопрос»: обычное меню анкет
            self._reset_state(client_id)
            event = DmEvent(client_id, f"cq{cq['id']}", "меню", False, user.get("username"), name)
            await self._run(self.engine.on_dm(event), chat_id, client_id)
            return
        parts = data.split(":")
        if len(parts) < 3 or parts[0] != "f" or not self.funnels:
            return
        f = self.funnels.get(parts[1])
        if f is None:
            return
        action, args = parts[2], parts[3:]
        gated = self.funnels.gated(f)
        if action == "go":
            await self._start_funnel(f, client_id, chat_id, user)
        elif action == "chk":
            subscribed = await self._subscribed(user["id"]) if gated else None
            await self._apply(self.funnels.check(f, client_id, subscribed), client_id, chat_id, user.get("username"))
        elif action == "no":
            await self._apply(self.funnels.decline(f, client_id), client_id, chat_id)
        elif action == "sv" and len(args) == 1 and args[0].isdigit():
            await self._apply(self.funnels.survey_answer(f, client_id, int(args[0])), client_id, chat_id)
        elif action == "q" and len(args) == 2 and all(a.isdigit() for a in args):
            n, i = int(args[0]), int(args[1])
            subscribed = await self._subscribed(user["id"]) if gated and n + 1 >= len(f.quiz) else None
            await self._apply(self.funnels.quiz_answer(f, client_id, n, i, subscribed), client_id, chat_id, user.get("username"))

    async def _run_due_jobs(self) -> None:
        """Отложенные сообщения: напоминание неподписавшимся, дожим после выдачи. Каждая задача выполняется не более раза."""
        if not self.funnels:
            return
        for job in self.store.due_jobs(self._clock()):
            self.store.finish_job(job["id"])
            f = self.funnels.get(job["funnel_id"])
            if f is None:
                continue
            subscribed = None
            if job["kind"] == "reminder" and self.funnels.gated(f):
                subscribed = await self._subscribed(int(job["user_id"].removeprefix("tg:")))
            await self._apply(self.funnels.run_job(job, f, subscribed), job["user_id"], job["chat_id"])

    async def _scheduler(self) -> None:
        while True:
            try:
                await self._run_due_jobs()
            except Exception:
                log.exception("Сбой планировщика напоминаний")
            await asyncio.sleep(15)

    async def _run(self, actions: list[Action], chat_id: str, client_id: str | None = None) -> None:
        first_name = self.store.first_name(client_id) if client_id else None
        for action in actions:
            try:
                if action.kind == "dm":
                    markup = {"inline_keyboard": action.buttons} if action.buttons else keyboard(action.options)
                    await self.api.send_message(chat_id, fill_name(action.text, first_name), reply_markup=markup)
                elif action.kind == "document":
                    await self.api.send_document_url(chat_id, action.url or "")
                elif action.kind == "notify":
                    card = {**(action.card or {})}
                    card["tags"] = self.store.tags(card.get("igsid", ""))
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
                    log.warning("Сообщение клиенту не отправлено (%s): %s", action.kind, exc)

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
        elif cmd == "contacts":
            contacts = self.store.contacts()
            await self.api.send_document(
                chat_id, "contacts.csv", contacts_csv(contacts, self.store), caption=f"Контактов: {len(contacts)}"
            )
        elif cmd == "exits":
            log_rows = self.store.exit_log()
            await self.api.send_document(
                chat_id, "exits.csv", exits_csv(log_rows, self.store), caption=f"Ответов об уходе: {len(log_rows)}"
            )
        elif cmd == "stats":
            await self.api.send_message(chat_id, self._stats_text())
        elif cmd in ("start", "help"):
            await self.api.send_message(chat_id, MANAGER_HELP)
        elif cmd is None and msg.get("reply_to_message"):
            await self._forward_reply(msg, chat_id)

    def _stats_text(self) -> str:
        lines = [f"Контактов: {len(self.store.contacts())}, заявок: {self.store.count_leads()}"]
        if self.funnels and (self.funnels.config.funnels or self.funnels.config.disabled):
            stats = self.store.funnel_stats()
            lines.append("")
            for f in self.funnels.config.funnels.values():
                s = stats.get(f.id, {})
                line = f"• {f.title}: запусков {s.get('start', 0)}, выдано {s.get('delivered', 0)}"
                if self.funnels.gated(f):
                    line += (
                        f", подписались {s.get('subscribed', 0)}, не прошли проверку {s.get('not_subscribed', 0)},"
                        f" напоминаний {s.get('reminder_sent', 0)}, отказались {s.get('declined', 0)}"
                    )
                lines.append(line)
            for fid, reason in self.funnels.config.disabled.items():
                lines.append(f"• {fid}: ОТКЛЮЧЕНА, {reason}")
        exits = self.store.exit_log()
        if exits:
            left = sum(1 for e in exits if e["decision"] == "left")
            counts = Counter(r for e in exits for r in e["reasons"])
            lines += ["", f"Выход из сообщества: отписались {left}, остались {len(exits) - left}. Причины (выбор можно множественный):"]
            lines += [f"• {reason}: {n}" for reason, n in counts.most_common()]
        return "\n".join(lines)

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
        reply_to = msg["message_id"]
        if channel_of(client_id) != "Telegram":
            if self.ig is None:
                await self.api.send_message(chat_id, "Это клиент из Instagram: ответьте ему в самом Instagram.", reply_to=reply_to)
                return
            text = msg.get("text")
            if not text:
                await self.api.send_message(chat_id, "В Instagram отсюда можно отправить только текст.", reply_to=reply_to)
                return
            try:
                await self.ig.send_dm(client_id, text)
            except GraphError as exc:
                hint = " Instagram разрешает писать только в течение 24 часов после последнего сообщения клиента." if exc.code in (10, 100, 200) else ""
                await self.api.send_message(chat_id, f"❌ Не доставлено в Instagram: {exc}.{hint}", reply_to=reply_to)
                return
        else:
            try:
                await self.api.copy_message(client_id.removeprefix("tg:"), chat_id, msg["message_id"])
            except TelegramError as exc:
                await self.api.send_message(chat_id, f"❌ Не доставлено клиенту: {exc}", reply_to=reply_to)
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
        scheduler = asyncio.create_task(self._scheduler())
        try:
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
        finally:
            scheduler.cancel()


Line = tuple[str, str]


async def preflight(
    settings: TelegramSettings,
    api: TelegramAPI,
    flows: Flows,
    funnels: FunnelEngine | None = None,
    exit_flow: ExitFlow | None = None,
) -> list[Line]:
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
                    f"у бота включён webhook (сайт: {urlparse(info['url']).hostname}): токен уже использует другой процесс "
                    "или сервис. Остановите его, возьмите у BotFather "
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

    if exit_flow is not None:
        lines.append((OK, f"путь выхода из сообщества включён: причин {len(exit_flow.cfg.reasons)}, команда /unsubscribe, ссылка ?start=unsub"))
        if settings.community_chat_id:
            try:
                member = await api.get_chat_member(settings.community_chat_id, me["id"])
                if member.get("status") in ("administrator", "creator"):
                    lines.append((OK, "бот администратор чата сообщества: при отписке сможет удалить человека из чата"))
                else:
                    lines.append((WARN, "бот не администратор чата сообщества: при отписке удалить человека из чата не сможет"))
            except TelegramError as exc:
                lines.append((WARN, f"чат сообщества недоступен боту: {exc}"))
        else:
            lines.append((WARN, "COMMUNITY_CHAT_ID не задан: при отписке бот только передаёт заявку менеджеру, из чата не удаляет"))
    if funnels is not None and not funnels.config.keywords_enabled and (funnels.config.funnels or funnels.config.disabled):
        lines.append((OK, "кодовые слова выключены: воронки запускаются кнопками и диплинками"))
    if funnels is not None and (funnels.config.funnels or funnels.config.disabled):
        if funnels.config.funnels:
            lines.append((OK, "воронки работают: " + ", ".join(funnels.config.funnels)))
        for fid, reason in funnels.config.disabled.items():
            lines.append((WARN, f"воронка {fid!r} отключена: {reason}"))
        if not funnels.channel:
            lines.append((WARN, "SUBSCRIBE_CHANNEL не задан: подписку на канал не проверяем, материалы выдаются сразу"))
        else:
            try:
                member = await api.get_chat_member(funnels.channel, me["id"])
                if member.get("status") in ("administrator", "creator"):
                    lines.append((OK, f"бот администратор канала {funnels.channel}: проверка подписки работает"))
                else:
                    lines.append((FAIL, f"бот не администратор канала {funnels.channel}: без этого проверка подписки не работает"))
            except TelegramError as exc:
                lines.append((FAIL, f"канал {funnels.channel} недоступен боту (добавьте бота администратором канала): {exc}"))
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
    funnels = build_funnels(settings, flows, store)
    exit_flow = build_exit(settings)
    if args.links:
        return print_links(settings, flows, funnels)
    async with httpx.AsyncClient() as http:
        api = TelegramAPI(settings.bot_token, http, settings.api_base)
        lines = await preflight(settings, api, flows, funnels, exit_flow)
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
        await LeadBot(settings, api, engine, flows, store, funnels=funnels, exit_flow=exit_flow).run()
    return 0


def print_links(settings: TelegramSettings, flows: Flows, funnels: FunnelEngine) -> int:
    """Готовые диплинки: вставляются в Instagram (автоответ, шапка, сторис), QR-коды, рекламу."""
    base = settings.bot_url.rstrip("/")
    print(f"Диплинки бота (кликабельны и в Instagram). Суффикс «__метка» записывает источник, например guide__ig_story:\n")
    print(f"• Приветствие: {base}?start=hello__ig_bio")
    print(f"• Отписка от сообщества (путь с обратной связью): {base}?start=unsub")
    for f in funnels.config.funnels.values():
        print(f"• {f.title}: {base}?start={f.id}__ig_dm   (кодовые слова в чате: {', '.join(f.keywords)})")
    for key, seg in flows.segments.items():
        print(f"• Анкета «{seg.label}»: {base}?start=seg_{key}__ig_dm")
    for fid, reason in funnels.config.disabled.items():
        print(f"• {fid}: заработает после заполнения ссылок ({reason})")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Telegram-бот приёма заявок")
    parser.add_argument("--check", action="store_true", help="проверить настройку и выйти")
    parser.add_argument("--test-message", action="store_true", help="с --check: отправить тестовое сообщение менеджерам")
    parser.add_argument("--find-chat", action="store_true", help="узнать ID группы менеджеров (бот должен быть в ней)")
    parser.add_argument("--links", action="store_true", help="показать готовые диплинки для Instagram, QR и рекламы")
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
