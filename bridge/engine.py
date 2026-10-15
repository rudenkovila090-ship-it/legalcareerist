from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from .config import Settings
from .flows import Flows, normalize
from .store import Conversation, Store
from .webhook import CommentEvent, DmEvent


@dataclass
class Action:
    kind: str  # dm | private_reply | public_reply | notify
    to: str = ""  # igsid (dm) или comment_id (private_reply / public_reply)
    text: str = ""
    card: dict | None = None  # для notify


class Engine:
    """Чистая логика: вебхук-событие -> новое состояние диалога + список действий.

    Состояние сохраняется до отправки сообщений, а сама отправка (сеть) выполняется диспетчером.
    Метод синхронный и без await, поэтому два одновременных вебхука одного пользователя не перемешают шаги.
    """

    def __init__(self, flows: Flows, store: Store, settings: Settings, clock: Callable[[], float] = time.time) -> None:
        self._flows = flows
        self._store = store
        self._settings = settings
        self._clock = clock

    # ------------------------------------------------------------------ комментарии
    def on_comment(self, ev: CommentEvent) -> list[Action]:
        if ev.parent_id or ev.from_id == self._settings.ig_account_id:
            return []  # ответы в ветках и наши собственные комментарии игнорируем (защита от петель)
        if self._store.seen(f"c:{ev.id}"):
            return []
        rule = self._flows.match_comment(ev.text, ev.media_id)
        if rule is None:
            return []

        dm = rule.dm
        conv = self._store.get_conv(ev.from_id) or Conversation(ev.from_id)
        if ev.username:
            conv.username = ev.username
        if self._human_active(conv):
            dm = rule.dm_plain  # менеджер уже ведёт диалог: не сбиваем состояние, без вопросов бота
        elif rule.start == "menu":
            conv.state, conv.segment, conv.step, conv.answers = "menu", None, 0, []
        elif rule.start is not None:
            conv.state, conv.segment, conv.step, conv.answers = "question", rule.start, 0, []
        self._store.save_conv(conv)

        actions = [Action("private_reply", ev.id, dm)]
        public = rule.pick_public_reply(ev.id)
        if public:
            actions.append(Action("public_reply", ev.id, public))
        if self._settings.notify_comment_leads:
            actions.append(
                Action(
                    "notify",
                    card={
                        "type": "comment",
                        "igsid": ev.from_id,
                        "username": ev.username,
                        "rule": rule.id,
                        "text": ev.text,
                    },
                )
            )
        return actions

    # ------------------------------------------------------------------ личные сообщения
    def on_dm(self, ev: DmEvent) -> list[Action]:
        if ev.sender_id == self._settings.ig_account_id:
            return []
        if ev.mid and self._store.seen(f"m:{ev.mid}"):
            return []

        flows, texts = self._flows, self._flows.texts
        now = self._clock()
        conv = self._store.get_conv(ev.sender_id) or Conversation(ev.sender_id)
        text = (ev.text or "").strip()
        norm = normalize(text)

        def reply(msg: str) -> Action:
            return Action("dm", ev.sender_id, msg)

        def save_and(*actions: Action) -> list[Action]:
            self._store.save_conv(conv)
            return list(actions)

        def card(kind: str, **extra) -> Action:
            return Action(
                "notify",
                card={"type": kind, "igsid": conv.igsid, "username": conv.username, **extra},
            )

        if conv.state == "human" and now >= conv.human_until:
            conv.state = "idle"  # режим «ведёт менеджер» истёк

        # --- «стоп»: полностью отключаем автоматику
        if conv.state == "optout":
            if flows.menu.search_short(norm):
                conv.state, conv.segment, conv.step, conv.answers = "menu", None, 0, []
                return save_and(reply(flows.menu_text()))
            return []
        if flows.optout.search_short(norm):
            conv.state = "optout"
            return save_and(reply(texts["optout"]))

        # --- менеджер ведёт диалог: бот молчит, а сообщения клиента пересылаем в Telegram
        if conv.state == "human":
            return [card("message", text=text or "[вложение без текста]")]

        # --- «позовите человека» из любого шага
        if flows.handoff.search_short(norm):
            qa = self._qa(conv)
            conv.state, conv.human_until = "human", now + self._settings.human_mode_hours * 3600
            return save_and(
                reply(texts["handoff"]),
                card("handoff", segment=self._segment_label(conv), qa=qa, text=text),
            )

        # --- «меню»: начать сначала
        if flows.menu.search_short(norm):
            conv.state, conv.segment, conv.step, conv.answers = "menu", None, 0, []
            return save_and(reply(flows.menu_text()))

        if conv.state == "done":
            return [reply(texts["done_followup"]), card("message", segment=self._segment_label(conv), text=text or "[вложение без текста]")]

        if conv.state == "question":
            if not text:
                return [reply(texts["non_text"])]
            segment = flows.segments[conv.segment]  # type: ignore[index]
            conv.answers.append(text[:1000])
            conv.step += 1
            if conv.step < len(segment.questions):
                return save_and(reply(segment.questions[conv.step]))
            conv.state = "done"
            qa = self._qa(conv)
            self._store.add_lead(conv.igsid, conv.username, conv.segment, {"qa": qa})
            return save_and(
                reply(texts["done"]),
                card("lead", segment=segment.label, qa=qa),
            )

        if conv.state == "menu":
            choice = flows.choose_segment(norm)
            if choice is None:
                return save_and(reply(f"{texts['menu_retry']}\n\n{flows.menu_text()}"))
            conv.state, conv.segment, conv.step, conv.answers = "question", choice, 0, []
            return save_and(reply(flows.segments[choice].questions[0]))

        # idle (первое сообщение / состояние сброшено)
        conv.state, conv.segment, conv.step, conv.answers = "menu", None, 0, []
        return save_and(reply(flows.menu_text()))

    # ------------------------------------------------------------------ вспомогательное
    def _human_active(self, conv: Conversation) -> bool:
        return conv.state == "human" and self._clock() < conv.human_until

    def _segment_label(self, conv: Conversation) -> str | None:
        segment = self._flows.segments.get(conv.segment or "")
        return segment.label if segment else None

    def _qa(self, conv: Conversation) -> list[list[str]]:
        segment = self._flows.segments.get(conv.segment or "")
        if segment is None:
            return []
        return [[q, a] for q, a in zip(segment.questions, conv.answers)]
