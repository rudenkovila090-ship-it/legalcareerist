from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from .flows import Flows, Segment, normalize, parse_phone
from .store import Conversation, Store
from .webhook import CommentEvent, DmEvent


@dataclass
class Action:
    kind: str  # dm | document | private_reply | public_reply | notify
    to: str = ""  # id клиента (dm) или comment_id (private_reply / public_reply)
    text: str = ""
    card: dict | None = None  # для notify
    options: list[str] | None = None  # быстрые кнопки ответа (только Telegram; Instagram их игнорирует)
    buttons: list[list[dict]] | None = None  # кнопки под сообщением: ссылки и переходы (только Telegram)
    url: str | None = None  # для document: адрес файла


class Engine:
    """Чистая логика: событие -> новое состояние диалога + список действий.

    Одна и та же логика обслуживает и Telegram-бота, и Instagram-мост.
    Состояние сохраняется до отправки сообщений, а сама отправка (сеть) выполняется диспетчером.
    Метод синхронный и без await, поэтому два одновременных события одного пользователя не перемешают шаги.
    """

    def __init__(
        self,
        flows: Flows,
        store: Store,
        *,
        self_id: str = "",
        human_mode_hours: int = 12,
        notify_comment_leads: bool = False,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._flows = flows
        self._store = store
        self._self_id = self_id  # наш собственный Instagram-аккаунт: его сообщения и комментарии игнорируем
        self._human_mode_hours = human_mode_hours
        self.notify_comment_leads = notify_comment_leads
        self._clock = clock

    # ------------------------------------------------------------------ комментарии (Instagram)
    def on_comment(self, ev: CommentEvent) -> list[Action]:
        if ev.parent_id or (self._self_id and ev.from_id == self._self_id):
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
            first = "consent" if self._flows.consent else "question"
            conv.state, conv.segment, conv.step, conv.answers = first, rule.start, 0, []
        self._store.save_conv(conv)

        actions = [Action("private_reply", ev.id, dm)]
        public = rule.pick_public_reply(ev.id)
        if public:
            actions.append(Action("public_reply", ev.id, public))
        if self.notify_comment_leads:
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
        if self._self_id and ev.sender_id == self._self_id:
            return []
        if ev.mid and self._store.seen(f"m:{ev.mid}"):
            return []

        flows, texts = self._flows, self._flows.texts
        now = self._clock()
        conv = self._store.get_conv(ev.sender_id) or Conversation(ev.sender_id)
        if ev.username:
            conv.username = ev.username
        text = (ev.text or "").strip()
        norm = normalize(text)
        no_text = "[вложение без текста]"

        def reply(msg: str, options: list[str] | None = None) -> Action:
            return Action("dm", ev.sender_id, msg, options=options)

        def save_and(*actions: Action) -> list[Action]:
            self._store.save_conv(conv)
            return list(actions)

        def card(kind: str, **extra) -> Action:
            return Action(
                "notify",
                card={
                    "type": kind,
                    "igsid": conv.igsid,
                    "username": conv.username,
                    "name": ev.name,
                    "source": conv.source,
                    **extra,
                },
            )

        def reset(state: str, segment: str | None = None) -> None:
            conv.state, conv.segment, conv.step, conv.answers = state, segment, 0, []

        def menu() -> Action:
            return reply(flows.menu_text(), options=flows.menu_options())

        def ask(segment: Segment, step: int, prefix: str = "") -> Action:
            spec = segment.specs[step] if step < len(segment.specs) else None
            options = list(spec.options) if spec and spec.kind == "choice" else None
            question = segment.questions[step]
            return reply(f"{prefix}\n\n{question}" if prefix else question, options=options)

        if conv.state == "human" and now >= conv.human_until:
            conv.state = "idle"  # режим «ведёт менеджер» истёк

        # --- «стоп»: полностью отключаем автоматику
        if conv.state == "optout":
            if flows.menu.search_short(norm):
                reset("menu")
                return save_and(menu())
            return []
        if flows.optout.search_short(norm):
            conv.state = "optout"
            return save_and(reply(texts["optout"]))

        # --- менеджер ведёт диалог: бот молчит, а сообщения клиента пересылаем в Telegram
        if conv.state == "human":
            self._store.save_conv(conv)
            return [card("message", text=text or no_text)]

        # --- «позовите человека» из любого шага
        if flows.handoff.search_short(norm):
            qa = self._qa(conv)
            conv.state, conv.human_until = "human", now + self._human_mode_hours * 3600
            return save_and(
                reply(texts["handoff"]),
                card("handoff", segment=self._segment_label(conv), qa=qa, text=text),
            )

        # --- «меню»: начать сначала
        if flows.menu.search_short(norm):
            reset("menu")
            return save_and(menu())

        if conv.state == "done":
            return [
                reply(texts["done_followup"]),
                card("message", segment=self._segment_label(conv), text=text or no_text),
            ]

        if conv.state == "consent":
            if flows.no.search_short(norm):
                reset("idle")
                return save_and(reply(flows.consent_declined or texts["optout"]))
            if flows.yes.search_short(norm):
                segment = flows.segments[conv.segment]  # type: ignore[index]
                conv.state, conv.step, conv.answers = "question", 0, []
                return save_and(ask(segment, 0))
            return save_and(reply(flows.consent or "", options=list(flows.consent_buttons)))

        if conv.state == "question":
            if not text:
                return [reply(texts["non_text"])]
            segment = flows.segments[conv.segment]  # type: ignore[index]
            spec = segment.specs[conv.step] if conv.step < len(segment.specs) else None
            answer = text[:1000]
            if spec and spec.kind == "choice":
                chosen = next((o for o in spec.options if normalize(o) == norm), None)
                if chosen is None:  # ответ не из списка: повторяем вопрос с кнопками, шаг не засчитываем
                    return [ask(segment, conv.step, prefix=spec.invalid)]
                answer = chosen
            elif spec and spec.kind == "phone":
                phone = parse_phone(text)
                if phone is None:
                    return [reply(spec.invalid)]
                answer = phone
            conv.answers.append(answer)
            conv.step += 1
            if conv.step < len(segment.questions):
                return save_and(ask(segment, conv.step))
            conv.state = "done"
            qa = self._qa(conv)
            self._store.add_lead(conv.igsid, conv.username, conv.segment, {"qa": qa, "source": conv.source})
            return save_and(
                reply(texts["done"]),
                card("lead", segment=segment.label, qa=qa),
            )

        if conv.state == "menu":
            choice = flows.choose_segment(norm)
            if choice is None:
                return save_and(
                    reply(f"{texts['menu_retry']}\n\n{flows.menu_text()}", options=flows.menu_options())
                )
            if flows.consent:
                reset("consent", choice)
                return save_and(reply(flows.consent, options=list(flows.consent_buttons)))
            reset("question", choice)
            return save_and(ask(flows.segments[choice], 0))

        # idle (первое сообщение / состояние сброшено)
        reset("menu")
        return save_and(menu())

    def start_segment(self, client_id: str, segment: str, username: str | None = None) -> list[Action]:
        """Запускает квалификацию по сегменту (например, после кодового слова «консультация»)."""
        conv = self._store.get_conv(client_id) or Conversation(client_id)
        if username:
            conv.username = username
        if self._human_active(conv):
            return []  # менеджер ведёт диалог: бот не перебивает
        first = "consent" if self._flows.consent else "question"
        conv.state, conv.segment, conv.step, conv.answers = first, segment, 0, []
        self._store.save_conv(conv)
        if first == "consent":
            return [Action("dm", client_id, self._flows.consent or "", options=list(self._flows.consent_buttons))]
        seg = self._flows.segments[segment]
        options = list(seg.specs[0].options) if seg.specs and seg.specs[0].kind == "choice" else None
        return [Action("dm", client_id, seg.questions[0], options=options)]

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
