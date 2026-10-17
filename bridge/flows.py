from __future__ import annotations

import json
import logging
import re
import string
import zlib
from dataclasses import dataclass

from .graph import MAX_DM_BYTES

log = logging.getLogger(__name__)

# Служебные слова («менеджер», «стоп», «меню», выбор цифрой) считаем командой, только если сообщение короткое:
# иначе «у меня человек 5 лет в профессии» из ответа на вопрос ушло бы в обработчик «позвать человека».
SHORT_MESSAGE_WORDS = 4

REQUIRED_TEXTS = (
    "menu_intro",
    "menu_outro",
    "menu_retry",
    "handoff",
    "done",
    "done_followup",
    "optout",
    "non_text",
)


def normalize(text: str) -> str:
    """Нижний регистр, ё->е, пунктуация и эмодзи -> пробелы, схлопнутые пробелы."""
    text = text.lower().replace("ё", "е")
    text = re.sub(r"[^\w\s]|_", " ", text)
    return " ".join(text.split())


class Matcher:
    """Совпадение по целым словам/фразам. «слово*» — совпадение по началу слова («ивент*» → «ивенты»)."""

    def __init__(self, keywords: list[str]) -> None:
        self._patterns = [self._compile(k) for k in keywords]

    @staticmethod
    def _compile(keyword: str) -> re.Pattern[str]:
        prefix = keyword.strip().endswith("*")
        core = normalize(keyword.rstrip("*"))
        if not core:
            raise ValueError(f"пустое ключевое слово: {keyword!r}")
        return re.compile(r"(?<!\w)" + re.escape(core) + ("" if prefix else r"(?!\w)"))

    def search(self, normalized_text: str) -> bool:
        return any(p.search(normalized_text) for p in self._patterns)

    def search_short(self, normalized_text: str) -> bool:
        return len(normalized_text.split()) <= SHORT_MESSAGE_WORDS and self.search(normalized_text)


# {first_name} подставляется при отправке конкретному человеку, поэтому здесь остаётся как есть.
RUNTIME_PLACEHOLDERS = {"first_name"}


def render(template: str, links: dict[str, str]) -> str | None:
    """Подставляет {bot_url}/{site_url}/{payment_url}/{privacy_url}/{channel_url}. None — если нужная ссылка не задана;
    ValueError — если опечатка в имени плейсхолдера. {first_name} не трогает."""
    try:
        fields = {name for _, name, _, _ in string.Formatter().parse(template) if name}
    except ValueError as exc:
        raise ValueError(f"некорректные фигурные скобки в тексте {template[:40]!r}: {exc}") from None
    unknown = fields - set(links) - RUNTIME_PLACEHOLDERS
    if unknown:
        raise ValueError(f"неизвестные плейсхолдеры {sorted(unknown)} в тексте {template[:40]!r}")
    if any(not links[name] for name in fields - RUNTIME_PLACEHOLDERS):
        return None
    return template.format_map({**links, "first_name": "{first_name}"})


def fill_name(text: str, first_name: str | None) -> str:
    """Подставляет имя клиента. Если имени нет, «Здравствуйте, {first_name}!» превращается в «Здравствуйте!»."""
    if first_name:
        return text.replace("{first_name}", first_name)
    cleaned = re.sub(r"\{first_name\},\s*", "", text)  # «{first_name}, перед записью…» → «перед записью…»
    cleaned = re.sub(r",?\s*\{first_name\}", "", cleaned)  # «Привет, {first_name}!» → «Привет!»
    if cleaned != text and cleaned[:1].islower():
        cleaned = cleaned[:1].upper() + cleaned[1:]
    return cleaned


def parse_phone(text: str) -> str | None:
    """Телефон в свободной записи → нормализованный вид; None, если на телефон не похоже."""
    stripped = text.strip()
    if not re.fullmatch(r"\+?[\d\s\-().]{10,25}", stripped):
        return None
    digits = re.sub(r"\D", "", stripped)
    if not 10 <= len(digits) <= 15:
        return None
    if len(digits) == 11 and digits[0] in "78":
        return "+7" + digits[1:]
    if len(digits) == 10 and digits[0] == "9":
        return "+7" + digits
    return ("+" if stripped.startswith("+") else "") + digits


DEFAULT_INVALID = {
    "choice": "Выберите, пожалуйста, один из вариантов кнопкой ниже.",
    "phone": "Это не похоже на номер телефона. Введите его ещё раз, например +7 900 123-45-67.",
}


@dataclass(frozen=True)
class Question:
    """Тип вопроса: text (любой ответ), choice (только из кнопок), phone (номер телефона с проверкой)."""

    text: str
    kind: str = "text"
    options: tuple[str, ...] = ()
    invalid: str = ""


@dataclass(frozen=True)
class Segment:
    key: str
    label: str
    menu_title: str
    questions: tuple[str, ...]
    aliases: Matcher
    specs: tuple[Question, ...] = ()
    hidden: bool = False  # скрытый сегмент не виден в меню: запускается воронкой или диплинком


@dataclass(frozen=True)
class CommentRule:
    id: str
    matcher: Matcher
    media_ids: frozenset[str]
    dm: str  # уже с подставленными ссылками и (если нужно) первым вопросом/согласием/меню
    dm_plain: str  # то же без вопроса/меню: для диалогов, которые сейчас ведёт менеджер
    start: str | None  # None | "menu" | ключ сегмента
    public_replies: tuple[str, ...]

    def pick_public_reply(self, comment_id: str) -> str | None:
        """Разные варианты публичного ответа по хешу комментария — меньше похоже на спам."""
        if not self.public_replies:
            return None
        return self.public_replies[zlib.crc32(comment_id.encode()) % len(self.public_replies)]


@dataclass(frozen=True)
class Flows:
    texts: dict[str, str]
    segments: dict[str, Segment]
    rules: tuple[CommentRule, ...]
    handoff: Matcher
    optout: Matcher
    menu: Matcher
    yes: Matcher
    no: Matcher
    consent: str | None = None  # None — согласие не запрашиваем (нет PRIVACY_URL)
    consent_declined: str | None = None
    consent_buttons: tuple[str, str] = ("Да, согласен(а)", "Нет")

    def visible(self) -> dict[str, "Segment"]:
        return {k: s for k, s in self.segments.items() if not s.hidden}

    def menu_text(self) -> str:
        options = "\n".join(f"{i} — {s.menu_title}" for i, s in enumerate(self.visible().values(), start=1))
        return f"{self.texts['menu_intro']}\n{options}\n\n{self.texts['menu_outro']}"

    def menu_options(self) -> list[str]:
        """Подписи кнопок меню (для Telegram)."""
        return [s.menu_title for s in self.visible().values()]

    def choose_segment(self, normalized_text: str) -> str | None:
        """Выбор пункта меню: цифра, точное название кнопки или слово-синоним (в коротком сообщении)."""
        visible = self.visible()
        keys = list(visible)
        if normalized_text.isdigit() and 1 <= int(normalized_text) <= len(keys):
            return keys[int(normalized_text) - 1]
        for key, segment in visible.items():
            if normalized_text and normalized_text == normalize(segment.menu_title):
                return key
        for key, segment in visible.items():
            if segment.aliases.search_short(normalized_text):
                return key
        return None

    def match_comment(self, text: str, media_id: str | None) -> CommentRule | None:
        norm = normalize(text)
        for rule in self.rules:
            if rule.media_ids and (media_id or "") not in rule.media_ids:
                continue
            if rule.matcher.search(norm):
                return rule
        return None


def load_flows(path: str, links: dict[str, str], *, with_comment_rules: bool = True) -> Flows:
    with open(path, encoding="utf-8") as fh:
        raw = json.load(fh)

    texts: dict[str, str] = {}
    for name in REQUIRED_TEXTS:
        if name not in raw.get("texts", {}):
            raise ValueError(f"в {path} нет texts.{name}")
        rendered = render(raw["texts"][name], links)
        if rendered is None:
            raise ValueError(f"texts.{name} использует ссылку, которая не задана в окружении (например BOT_URL)")
        texts[name] = rendered

    # Согласие на обработку персональных данных: включается, только когда задан PRIVACY_URL.
    consent = consent_declined = None
    if raw["texts"].get("consent"):
        consent = render(raw["texts"]["consent"], links)
        if consent is None:
            log.warning("Запрос согласия на обработку данных отключён: не задан PRIVACY_URL")
        else:
            if "consent_declined" not in raw["texts"]:
                raise ValueError(f"в {path} нет texts.consent_declined")
            consent_declined = raw["texts"]["consent_declined"]
    buttons = (
        raw["texts"].get("consent_yes_button", "Да, согласен(а)"),
        raw["texts"].get("consent_no_button", "Нет"),
    )

    segments: dict[str, Segment] = {}
    for key, seg in raw.get("segments", {}).items():
        questions: list[str] = []
        specs: list[Question] = []
        for q in seg.get("questions", []):
            spec_raw = q if isinstance(q, dict) else {"text": q}
            rendered = render(spec_raw["text"], links)
            if rendered is None:
                raise ValueError(f"вопрос сегмента {key!r} использует незаданную ссылку")
            kind = spec_raw.get("type", "text")
            if kind not in ("text", "choice", "phone"):
                raise ValueError(f"вопрос сегмента {key!r}: неизвестный тип {kind!r}")
            options = tuple(spec_raw.get("options", ()))
            if kind == "choice" and not 2 <= len(options) <= 12:
                raise ValueError(f"вопрос сегмента {key!r}: для типа choice нужно от 2 до 12 вариантов")
            questions.append(rendered)
            specs.append(Question(rendered, kind, options, spec_raw.get("invalid", DEFAULT_INVALID.get(kind, ""))))
        if not questions:
            raise ValueError(f"у сегмента {key!r} нет вопросов")
        segments[key] = Segment(
            key=key,
            label=seg["label"],
            menu_title=seg.get("menu_title", seg["label"]),
            questions=tuple(questions),
            aliases=Matcher(seg.get("aliases", [])),
            specs=tuple(specs),
            hidden=bool(seg.get("hidden", False)),
        )
    if not segments:
        raise ValueError(f"в {path} нет segments")
    if not any(not s.hidden for s in segments.values()):
        raise ValueError(f"в {path} все сегменты скрыты: в меню нечего показывать")

    flows_stub = Flows(texts, segments, (), Matcher([]), Matcher([]), Matcher([]), Matcher([]), Matcher([]))
    rules: list[CommentRule] = []
    for rule in raw.get("comment_rules", []) if with_comment_rules else []:
        rid = rule["id"]
        dm = render(rule["dm"], links)
        if dm is None:
            log.warning("Правило %r отключено: в тексте нужна ссылка, которая не задана в окружении", rid)
            continue
        start = rule.get("start")
        dm_plain = dm
        if start == "menu":
            dm = f"{dm}\n\n{flows_stub.menu_text()}"
        elif start is not None:
            if start not in segments:
                raise ValueError(f"правило {rid!r}: неизвестный сегмент start={start!r}")
            dm = f"{dm}\n\n{consent or segments[start].questions[0]}"
        if len(dm.encode()) > MAX_DM_BYTES:
            raise ValueError(
                f"правило {rid!r}: личный ответ на комментарий {len(dm.encode())} байт, лимит {MAX_DM_BYTES}. Сократите текст."
            )
        replies = []
        for reply in rule.get("public_replies", []):
            rendered = render(reply, links)
            if rendered is not None:
                replies.append(rendered)
        rules.append(
            CommentRule(
                id=rid,
                matcher=Matcher(rule["keywords"]),
                media_ids=frozenset(str(m) for m in rule.get("media_ids", [])),
                dm=dm,
                dm_plain=dm_plain,
                start=start,
                public_replies=tuple(replies),
            )
        )

    return Flows(
        texts=texts,
        segments=segments,
        rules=tuple(rules),
        handoff=Matcher(raw.get("handoff_words", [])),
        optout=Matcher(raw.get("optout_words", [])),
        menu=Matcher(raw.get("menu_words", [])),
        yes=Matcher(raw.get("consent_yes_words", ["да", "согласен*", "согласна", "ок", "окей", "yes"])),
        no=Matcher(raw.get("consent_no_words", ["нет", "не согласен*", "не согласна", "отказ*", "no"])),
        consent=consent,
        consent_declined=consent_declined,
        consent_buttons=buttons,
    )
