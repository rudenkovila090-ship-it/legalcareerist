"""Воронки выдачи материалов в Telegram-боте (аналог «ключевых слов» и «приветствия» в конструкторах чат-ботов).

Кодовое слово или диплинк → вступление → вопросы кнопками → проверка подписки на канал → выдача материала →
напоминание неподписавшимся → опрос «почему не подписались» → дожим после выдачи. Всё настраивается в config/funnels.json.
Модуль не ходит в сеть: возвращает планы (сообщения и отложенные задачи), а выполняет их бот (tgbot.py).
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Callable

from .engine import Action
from .flows import Matcher, normalize, render
from .store import Store

log = logging.getLogger(__name__)

KEYWORD_MAX_WORDS = 6  # кодовое слово ищем только в коротких сообщениях, чтобы не перехватывать обычную переписку
FUNNEL_ID = re.compile(r"[a-z0-9]{1,12}")

DEFAULT_TEXTS = {
    "subscribe_button": "👉 Подписаться на канал",
    "check_button": "✅ Я подписался(лась)",
    "decline_button": "🚫 Не хочу подписываться",
    "other_button": "💬 Другой вопрос",
    "gate_text": "Чтобы получить материал, подпишитесь на наш канал и нажмите «Я подписался(лась)».",
    "not_subscribed": "🙈 Пока не вижу вашей подписки. Подпишитесь на канал и нажмите «Я подписался(лась)».",
    "reminder": "А вы уже подписались на канал? Подпишитесь, и мы сразу пришлём материал.",
    "farewell": "Поняли, спасибо за ответ. Если передумаете, просто напишите кодовое слово ещё раз.",
    "welcome_new": "Здравствуйте, {first_name}! Выберите, что вам интересно:",
    "welcome_back": "С возвращением, {first_name}! Что вам интересно сегодня?",
}


class _Disabled(Exception):
    """Воронка не готова к работе (не заполнена ссылка): она отключается, остальные работают."""


@dataclass(frozen=True)
class Button:
    label: str
    url: str | None = None  # кнопка-ссылка
    funnel: str | None = None  # или переход в другую воронку


@dataclass(frozen=True)
class QuizQuestion:
    text: str
    options: tuple[str, ...]


@dataclass(frozen=True)
class Survey:
    question: str
    options: tuple[str, ...]
    thanks: str


@dataclass(frozen=True)
class Followup:
    after_minutes: int
    text: str
    buttons: tuple[Button, ...]


@dataclass(frozen=True)
class Funnel:
    id: str
    title: str
    button: str  # подпись кнопки в приветствии; пусто — в приветствии не показывать
    matcher: Matcher
    keywords: tuple[str, ...]  # как записаны в конфиге (для справки и подсказок)
    payloads: tuple[str, ...]
    gate: bool
    intro: str
    quiz: tuple[QuizQuestion, ...]
    gate_text: str
    not_subscribed: str
    reminder_minutes: int
    reminder: str
    survey: Survey | None
    text: str
    document_url: str | None
    buttons: tuple[Button, ...]
    followup: Followup | None
    then_segment: str | None


@dataclass
class FunnelConfig:
    funnels: dict[str, Funnel]
    disabled: dict[str, str]  # id → причина
    texts: dict[str, str]


@dataclass
class Plan:
    funnel_id: str
    actions: list[Action] = field(default_factory=list)
    jobs: list[tuple[str, int]] = field(default_factory=list)  # (вид задачи, через сколько минут)
    then_segment: str | None = None  # после выдачи запустить анкету этого сегмента


# ---------------------------------------------------------------------------------------------- загрузка
def _text(value: str, links: dict[str, str], what: str) -> str:
    rendered = render(value, links)
    if rendered is None:
        raise _Disabled(f"{what}: не задана нужная ссылка (например SUBSCRIBE_CHANNEL или PRIVACY_URL)")
    return rendered


def _url(value: str | None, what: str) -> str:
    if not value or not re.fullmatch(r"https?://[^\s<>]+", value):
        raise _Disabled(f"{what}: заполните ссылку (сейчас {str(value)[:40]!r})")
    return value


def _buttons(raw: list[dict] | None, links: dict[str, str], ids: set[str], what: str) -> tuple[Button, ...]:
    out = []
    for item in raw or []:
        label = _text(item["label"], links, what)
        if "funnel" in item:
            if item["funnel"] not in ids:
                raise ValueError(f"{what}: кнопка ведёт в несуществующую воронку {item['funnel']!r}")
            out.append(Button(label, funnel=item["funnel"]))
        else:
            out.append(Button(label, url=_url(item.get("url"), what)))
    return tuple(out)


def _options(raw: list[str], what: str, low: int = 2, high: int = 8) -> tuple[str, ...]:
    if not low <= len(raw) <= high:
        raise ValueError(f"{what}: нужно от {low} до {high} вариантов ответа")
    if any(len(o) > 60 for o in raw):
        raise ValueError(f"{what}: вариант ответа длиннее 60 символов")
    return tuple(raw)


def _build(raw: dict, texts: dict[str, str], links: dict[str, str], ids: set[str], segments: set[str]) -> Funnel:
    fid = raw["id"]
    what = f"воронка {fid!r}"
    deliver = raw["deliver"]
    then_segment = raw.get("then_segment")
    if then_segment and then_segment not in segments:
        raise ValueError(f"{what}: неизвестный сегмент then_segment={then_segment!r}")

    quiz = tuple(
        QuizQuestion(_text(q["question"], links, what), _options(q["options"], f"{what}, вопрос {i + 1}", high=6))
        for i, q in enumerate(raw.get("quiz", []))
    )
    survey = None
    if raw.get("survey"):
        s = raw["survey"]
        survey = Survey(
            _text(s["question"], links, what),
            _options(s["options"], f"{what}, опрос"),
            _text(s.get("thanks", texts["farewell"]), links, what),
        )
    followup = None
    if raw.get("followup"):
        fu = raw["followup"]
        followup = Followup(
            int(fu["after_minutes"]),
            _text(fu["text"], links, what),
            _buttons(fu.get("buttons"), links, ids, what),
        )
    document_url = deliver.get("document_url") or None
    return Funnel(
        id=fid,
        title=raw.get("title", fid),
        button=raw.get("button", ""),
        matcher=Matcher(raw["keywords"]),
        keywords=tuple(raw["keywords"]),
        payloads=tuple({fid, *(p.lower() for p in raw.get("payloads", []))}),
        gate=bool(raw.get("gate", False)),
        intro=_text(raw.get("intro", ""), links, what) if raw.get("intro") else "",
        quiz=quiz,
        gate_text=_text(raw.get("gate_text", texts["gate_text"]), links, what),
        not_subscribed=_text(raw.get("not_subscribed", texts["not_subscribed"]), links, what),
        reminder_minutes=int(raw.get("reminder_minutes", 0)),
        reminder=_text(raw.get("reminder", texts["reminder"]), links, what),
        survey=survey,
        text=_text(deliver["text"], links, what),
        document_url=_url(document_url, what) if document_url else None,
        buttons=_buttons(deliver.get("buttons"), links, ids, what),
        followup=followup,
        then_segment=then_segment,
    )


def load_funnels(path: str, links: dict[str, str], segment_keys: set[str]) -> FunnelConfig:
    """Нет файла — воронки выключены. Воронка с незаполненной ссылкой отключается, остальные работают."""
    if not os.path.exists(path):
        return FunnelConfig({}, {}, {})
    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)
    texts = {k: _text(v, links, "texts") for k, v in {**DEFAULT_TEXTS, **raw.get("texts", {})}.items()}
    ids = [f["id"] for f in raw.get("funnels", [])]
    if len(set(ids)) != len(ids):
        raise ValueError("в funnels.json повторяются id воронок")
    for fid in ids:
        if not FUNNEL_ID.fullmatch(fid):
            raise ValueError(f"id воронки {fid!r}: допустимы латиница и цифры, до 12 символов")
    funnels: dict[str, Funnel] = {}
    disabled: dict[str, str] = {}
    for item in raw.get("funnels", []):
        try:
            funnels[item["id"]] = _build(item, texts, links, set(ids), segment_keys)
        except _Disabled as exc:
            disabled[item["id"]] = str(exc).split(": ", 1)[-1]  # без повтора «воронка 'x':»
            log.warning("Воронка %r отключена: %s", item["id"], disabled[item["id"]])
    return FunnelConfig(funnels, disabled, texts)


# ---------------------------------------------------------------------------------------------- кнопки
def cb(funnel_id: str, *parts: object) -> str:
    return ":".join(("f", funnel_id, *map(str, parts)))


def _rows(buttons: list[dict], per_row: int = 1) -> list[list[dict]]:
    return [buttons[i : i + per_row] for i in range(0, len(buttons), per_row)]


# ---------------------------------------------------------------------------------------------- логика
class FunnelEngine:
    def __init__(
        self,
        config: FunnelConfig,
        store: Store,
        *,
        channel: str = "",
        channel_url: str = "",
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.config = config
        self.store = store
        self.channel = channel  # «@имя» или числовой ID канала; пусто — подписку не проверяем
        self.channel_url = channel_url
        self._clock = clock

    @property
    def enabled(self) -> bool:
        return bool(self.config.funnels)

    def get(self, funnel_id: str) -> Funnel | None:
        return self.config.funnels.get(funnel_id)

    def gated(self, f: Funnel) -> bool:
        return f.gate and bool(self.channel)

    # --- как пользователь попадает в воронку ---
    def match(self, text: str) -> Funnel | None:
        norm = normalize(text)
        if not norm or len(norm.split()) > KEYWORD_MAX_WORDS:
            return None
        return next((f for f in self.config.funnels.values() if f.matcher.search(norm)), None)

    def by_payload(self, payload: str) -> tuple[Funnel, str | None] | None:
        """Диплинк ?start=guide или ?start=guide__ig_story: воронка и (необязательно) источник после «__»."""
        head, _, source = payload.partition("__")
        head = head.lower()
        for f in self.config.funnels.values():
            if head in f.payloads:
                return f, source or None
        return None

    # --- построение сообщений ---
    def _buttons(self, buttons: tuple[Button, ...]) -> list[list[dict]] | None:
        rows = []
        for b in buttons:
            if b.url:
                rows.append({"text": b.label, "url": b.url})
            elif b.funnel and b.funnel in self.config.funnels:  # кнопки в отключённые воронки молча пропускаем
                rows.append({"text": b.label, "callback_data": cb(b.funnel, "go")})
        return _rows(rows) or None

    def _subscribe_rows(self, f: Funnel, with_decline: bool) -> list[list[dict]]:
        texts = self.config.texts
        rows = [[{"text": texts["subscribe_button"], "url": self.channel_url}]] if self.channel_url else []
        rows.append([{"text": texts["check_button"], "callback_data": cb(f.id, "chk")}])
        if with_decline:
            rows.append([{"text": texts["decline_button"], "callback_data": cb(f.id, "no")}])
        return rows

    def _question(self, f: Funnel, cid: str, n: int) -> Action:
        q = f.quiz[n]
        rows = _rows([{"text": o, "callback_data": cb(f.id, "q", n, i)} for i, o in enumerate(q.options)])
        return Action("dm", cid, q.text, buttons=rows)

    def _gate_or_deliver(self, f: Funnel, cid: str, subscribed: bool | None) -> Plan:
        if self.gated(f) and subscribed is False:
            self.store.log_event(cid, f.id, "gate_shown")
            return Plan(f.id, [Action("dm", cid, f.gate_text, buttons=self._subscribe_rows(f, with_decline=False))])
        return self.deliver(f, cid, subscribed)

    def on_start(self, f: Funnel, cid: str, subscribed: bool | None) -> Plan:
        """Запуск воронки кодовым словом, диплинком или кнопкой. subscribed: None — не проверяли или не смогли проверить."""
        self.store.log_event(cid, f.id, "start")
        actions: list[Action] = []
        if f.intro:
            actions.append(Action("dm", cid, f.intro))
        if f.quiz:
            actions.append(self._question(f, cid, 0))
            return Plan(f.id, actions)
        plan = self._gate_or_deliver(f, cid, subscribed)
        plan.actions = actions + plan.actions
        return plan

    def quiz_answer(self, f: Funnel, cid: str, n: int, i: int, subscribed: bool | None) -> Plan:
        if not (0 <= n < len(f.quiz) and 0 <= i < len(f.quiz[n].options)):
            return Plan(f.id)
        self.store.add_tag(cid, f"{f.id}:{f.quiz[n].options[i]}")
        if n + 1 < len(f.quiz):
            return Plan(f.id, [self._question(f, cid, n + 1)])
        return self._gate_or_deliver(f, cid, subscribed)

    def check(self, f: Funnel, cid: str, subscribed: bool | None) -> Plan:
        """Кнопка «Я подписался(лась)»."""
        if self.gated(f) and subscribed is False:
            self.store.log_event(cid, f.id, "not_subscribed")
            plan = Plan(f.id, [Action("dm", cid, f.not_subscribed, buttons=self._subscribe_rows(f, with_decline=True))])
            if f.reminder_minutes and not self.store.has_event(cid, f.id, "reminder_scheduled"):
                self.store.log_event(cid, f.id, "reminder_scheduled")
                plan.jobs.append(("reminder", f.reminder_minutes))
            return plan
        return self.deliver(f, cid, subscribed)

    def deliver(self, f: Funnel, cid: str, subscribed: bool | None) -> Plan:
        if subscribed is True:
            self.store.add_tag(cid, "subscriber")
            self.store.log_event(cid, f.id, "subscribed")
        actions = [Action("dm", cid, f.text, buttons=self._buttons(f.buttons))]
        if f.document_url:
            actions.append(Action("document", cid, url=f.document_url))
        self.store.log_event(cid, f.id, "delivered")
        self.store.add_tag(cid, f"got:{f.id}")
        self.store.cancel_jobs(cid, f.id, ("reminder",))
        plan = Plan(f.id, actions, then_segment=f.then_segment)
        if f.followup:
            plan.jobs.append(("followup", f.followup.after_minutes))
        return plan

    def decline(self, f: Funnel, cid: str) -> Plan:
        """Кнопка «Не хочу подписываться»: опрос о причине, если он настроен."""
        self.store.cancel_jobs(cid, f.id, ("reminder",))
        self.store.log_event(cid, f.id, "declined")
        if f.survey:
            rows = _rows([{"text": o, "callback_data": cb(f.id, "sv", i)} for i, o in enumerate(f.survey.options)])
            return Plan(f.id, [Action("dm", cid, f.survey.question, buttons=rows)])
        return Plan(f.id, [Action("dm", cid, self.config.texts["farewell"])])

    def survey_answer(self, f: Funnel, cid: str, i: int) -> Plan:
        if not f.survey or not 0 <= i < len(f.survey.options) or self.store.has_event(cid, f.id, "survey"):
            return Plan(f.id)
        self.store.log_event(cid, f.id, "survey")
        self.store.add_tag(cid, f"opros:{f.id}:{f.survey.options[i]}")
        return Plan(f.id, [Action("dm", cid, f.survey.thanks)])

    def run_job(self, job: dict, f: Funnel, subscribed: bool | None) -> Plan:
        cid, kind = job["user_id"], job["kind"]
        if kind == "reminder":
            if any(self.store.has_event(cid, f.id, e) for e in ("delivered", "declined", "survey")):
                return Plan(f.id)
            if subscribed is True:  # подписался сам, не нажав кнопку: выдаём материал
                return self.deliver(f, cid, True)
            self.store.log_event(cid, f.id, "reminder_sent")
            return Plan(f.id, [Action("dm", cid, f.reminder, buttons=self._subscribe_rows(f, with_decline=True))])
        if kind == "followup" and f.followup and self.store.has_event(cid, f.id, "delivered"):
            self.store.log_event(cid, f.id, "followup_sent")
            return Plan(f.id, [Action("dm", cid, f.followup.text, buttons=self._buttons(f.followup.buttons))])
        return Plan(f.id)

    def welcome(self, is_new: bool) -> Action | None:
        """Приветствие на /start: личное обращение и кнопки воронок. Нет воронок — None (покажем обычное меню)."""
        shown = [f for f in self.config.funnels.values() if f.button]
        if not shown:
            return None
        texts = self.config.texts
        buttons = [{"text": f.button, "callback_data": cb(f.id, "go")} for f in shown]
        rows = _rows(buttons, per_row=2) + [[{"text": texts["other_button"], "callback_data": "m:menu"}]]
        return Action("dm", "", texts["welcome_new" if is_new else "welcome_back"], buttons=rows)
