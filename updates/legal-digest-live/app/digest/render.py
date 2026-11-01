"""Сборка текста сводки в HTML-разметке Telegram: четыре раздела (мероприятия, вакансии, новости о людях рынка,
законодательство и судебная практика), каждый отдельным сообщением или серией сообщений с разбиением по лимиту Telegram."""
from __future__ import annotations

import html
import re
from datetime import date

from . import leads
from .rules import link_key
from .store import Item

WEEKDAYS = ("пн", "вт", "ср", "чт", "пт", "сб", "вс")
MONTHS_GEN = (
    "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря",
)
MAX_LEN = 3900  # у Telegram лимит 4096, оставляем запас
# Вакансии по оценке лида (см. leads.py): сверху те, кому стоит написать первым.
TIER_EMOJI = {"hot": "🔥", "good": "⭐", "other": "▫️", "agency": "🏢"}
VACANCY_GROUPS = (
    ("hot", "🔥 Горячие лиды: пишите первыми"),
    ("good", "⭐ Хорошие лиды"),
    ("other", "Остальные вакансии работодателей"),
    ("agency", "Вакансии через агентства (посредники, возможные конкуренты)"),
)
# Новости о людях: сначала то, что важнее для охоты за людьми (переходы), потом остальное.
NEWS_GROUPS = (
    ("Карьерные переходы и назначения", ("Карьерный переход", "Назначение", "Повышение", "Понижение")),
    ("Награды и рейтинги", ("Награда",)),
    ("Новые практики и проекты", ("Открытие",)),
)
LAW_GROUPS = (
    ("Судебная практика: трудовые споры", ("Судебная практика",)),
    ("Законы и законопроекты", ("Закон", "Законопроект")),
    ("Разъяснения ведомств", ("Разъяснение ведомства",)),
)


def _esc(text: str) -> str:
    return html.escape(text, quote=False)


def _url(url: str) -> str:
    return url.replace("&", "&amp;").replace('"', "&quot;")


def _link(item: Item) -> str:
    return f'<a href="{_url(item.link)}">{_esc(item.title)}</a>'


def _short_url(url: str, limit: int = 42) -> str:
    """Адрес для показа: без схемы, «www», хвостового слеша и меток utm_*: hh.ru/vacancy/123."""
    shown = link_key(url) or url
    return shown if len(shown) <= limit else shown[: limit - 1] + "…"


def _anchor(url: str) -> str:
    return f'<a href="{_url(url)}">{_esc(_short_url(url))}</a>'


def _post_line(item: Item) -> str:
    """Ссылка на сам пост в канале, который опубликовал новость, вакансию или анонс."""
    return f"🔗 Пост: {_anchor(item.link)}"


def _post_links(item: Item) -> list[str]:
    """Ссылки из самого поста. У записей, сохранённых до появления поля `links`, берём то, что было:
    ссылку на регистрацию или источник и ссылки среди контактов вакансии."""
    candidates = [*item.links, *([item.reg_url] if item.reg_url else []), *(c for c in item.contacts if c.startswith("http"))]
    result: list[str] = []
    seen = {link_key(item.link)}
    for url in candidates:
        if link_key(url) not in seen:
            seen.add(link_key(url))
            result.append(url)
    return result


def _links_line(item: Item, skip: tuple[str, ...] = (), label: str = "В посте") -> str | None:
    """«🌐 В посте: hh.ru/vacancy/1 · forms.gle/abc»: до трёх ссылок из поста, кроме тех, что уже показаны."""
    skipped = {link_key(u) for u in skip}
    contact_handles = {c.lstrip("@").lower() for c in item.contacts if c.startswith("@")}

    def is_contact(url: str) -> bool:  # t.me/ник уже показан среди контактов вакансии
        key = link_key(url)
        return key.startswith("t.me/") and key[5:].split("/")[0].lower() in contact_handles and key.count("/") == 1

    links = [u for u in _post_links(item) if link_key(u) not in skipped and not is_contact(u)][:3]
    return f"🌐 {label}: " + " · ".join(_anchor(u) for u in links) if links else None


def _best(group: list[Item]) -> Item:
    # Самый содержательный пост группы: больше контактов, известна компания, длиннее заголовок.
    return max(group, key=lambda i: (len(i.contacts), i.company is not None, len(i.title)))


def _dedupe(items: list[Item]) -> list[tuple[Item, int]]:
    """Одно событие часто анонсируют несколькими постами одного канала и репостят в другие каналы:
    показываем один раз и считаем остальные посты."""
    by_event: dict[tuple, list[Item]] = {}
    for item in items:
        if item.kind == "event" and item.event_date:
            key = ("event", item.channel_id, item.event_date, item.event_time)
        else:
            key = ("post", item.channel_id, item.msg_id)
        by_event.setdefault(key, []).append(item)
    by_title: dict[tuple, list[Item]] = {}
    for group in by_event.values():
        best = _best(group)
        if best.kind == "news" and best.people:
            key = ("news", best.subtype, best.people[0])
        elif best.kind == "law" and best.doc_ref:
            key = ("law", best.subtype, best.doc_ref)
        else:
            key = (re.sub(r"\W+", "", best.title.lower())[:60], best.event_date)
        by_title.setdefault(key, []).extend(group)
    return [(_best(group), len(group) - 1) for group in by_title.values()]


def _tail(item: Item, extra: int, note: str = "") -> str:
    parts = [f"<i>{_esc(item.channel_title)}</i>"]
    if note:
        parts.append(note)
    if extra:
        parts.append(f"ещё постов: {extra}")
    return "  " + " · ".join(parts)


def _format_line(item: Item) -> str | None:
    fmt = (item.work_format or "").capitalize()
    if fmt == "Онлайн":
        return "🖥 Онлайн"
    place = ", ".join(p for p in (fmt, item.city) if p)
    return f"📍 {place}" if place else None


def _event_card(n: int, item: Item, extra: int) -> str:
    """Карточка мероприятия: название, когда, формат и место, цена, срок регистрации, о чём, для кого, ссылка."""
    d = item.event_date
    when = f"{d.day} {MONTHS_GEN[d.month - 1]} ({WEEKDAYS[d.weekday()]})"
    if item.event_time:
        when += f", {item.event_time:%H:%M}" + (f"–{item.event_end:%H:%M}" if item.event_end else "")
    lines = [f"<b>{n}. {_esc(item.title)}</b>", f"📅 <b>{when}</b>"]
    if _format_line(item):
        lines.append(_format_line(item))
    if item.price:
        lines.append(f"🎟 {_esc(item.price)}")
    if item.deadline:
        lines.append(f"⏰ Регистрация до {item.deadline:%d.%m}")
    if item.topic:
        lines.append(f"<b>О чём:</b> {_esc(item.topic)}")
    if item.audience:
        lines.append(f"<b>Кому будет полезно:</b> {_esc(', '.join(item.audience))}")
    if item.reg_url:
        lines.append(f'→ <a href="{_url(item.reg_url)}">Подробнее и регистрация</a>')
    lines.append(_post_line(item))
    if more := _links_line(item, skip=(item.reg_url,) if item.reg_url else ()):
        lines.append(more)
    lines.append(_channel_line(item, extra))
    return "\n".join(lines)


def _channel_line(item: Item, extra: int) -> str:
    return " · ".join([f"<i>{_esc(item.channel_title)}</i>"] + ([f"ещё постов: {extra}"] if extra else []))


def _undated_card(n: int, item: Item, extra: int) -> str:
    lines = [f"<b>{n}. {_esc(item.title)}</b>", "Дата не указана, проверьте пост", _post_line(item)]
    if more := _links_line(item):
        lines.append(more)
    lines.append(_channel_line(item, extra))
    return "\n".join(lines)


def _contact(value: str) -> str:
    return _esc(value)


def _lead_line(lead: leads.Lead) -> str:
    """«🔥 84/100 · прямой работодатель · пишите в Telegram · старшая позиция»: оценка и из чего она сложилась."""
    shown = [r for r in lead.reasons if r != "прямой работодатель"][:5]  # «прямой работодатель» видно по группе
    return f"  {TIER_EMOJI[lead.tier]} <b>{lead.score}</b>/100 · " + _esc(" · ".join(shown))


def _vacancy_block(item: Item, extra: int, lead: leads.Lead) -> str:
    """Вакансия как лид: должность со ссылкой, оценка, компания, город, формат, деньги, контакты, канал и дата."""
    lines = [f"• {_link(item)}", _lead_line(lead)]
    facts = [f"<b>{_esc(item.company)}</b>" if item.company else "", _esc(item.city) if item.city else "",
             _esc(item.work_format) if item.work_format else "", _esc(item.salary) if item.salary else ""]
    if any(facts):
        lines.append("  " + " · ".join(f for f in facts if f))
    people = [c for c in item.contacts if not c.startswith("http")]  # ссылки показаны ниже, в строке «В посте»
    if people:
        lines.append("  контакты: " + ", ".join(_contact(c) for c in people))
    lines += _link_lines(item)
    lines.append(_tail(item, extra, f"{item.posted_at:%d.%m}"))
    return "\n".join(lines)


def _link_lines(item: Item, skip: tuple[str, ...] = ()) -> list[str]:
    """Общий низ карточки: ссылка на пост в канале и ссылки из поста (с отступом, как у вакансий, новостей и законов)."""
    lines = ["  " + _post_line(item)]
    if more := _links_line(item, skip):
        lines.append("  " + more)
    return lines


def _news_block(item: Item, extra: int) -> str:
    """Новость о человеке рынка: кто, куда перешёл и откуда, должность, за что награждён, ссылка на пост,
    канал и дата. Показываем только то, что удалось найти в тексте."""
    people = ", ".join(item.people)
    lines = [f"• <b>{_esc(item.subtype or 'Новость')}</b>" + (f" — {_esc(people)}" if people else "")]
    if item.origin and item.company:
        lines.append(f"  Переход: {_esc(item.origin)} → <b>{_esc(item.company)}</b>")
    elif item.company:
        lines.append(f"  Компания: <b>{_esc(item.company)}</b>")
    elif item.origin:
        lines.append(f"  Ушёл(ушла) из: {_esc(item.origin)}")
    if item.role:
        lines.append(f"  Должность: {_esc(item.role)}")
    if item.place:
        lines.append(f"  Награда: {_esc(item.place)}")
    lines.append(f"  {_link(item)}")
    if item.topic and not (item.company or item.origin or item.role or item.place):
        lines.append("  " + _esc(item.topic))
    lines += _link_lines(item)
    lines.append(_tail(item, extra, f"{item.posted_at:%d.%m}"))
    return "\n".join(lines)


def _law_block(item: Item, extra: int, today: date) -> str:
    """Изменение в законе или практике: что это, кто принял, номер, суть, когда вступает в силу, источник."""
    who = " · ".join(part for part in (item.place, item.doc_ref) if part)
    lines = [f"• <b>{_esc(item.subtype or 'Норма')}</b>" + (f" — {_esc(who)}" if who else ""), f"  {_link(item)}"]
    if item.topic:
        lines.append("  " + _esc(item.topic))
    if item.event_date:
        lines.append(f"  ⏳ {'Вступает' if item.event_date >= today else 'Вступил(а)'} в силу: {item.event_date:%d.%m.%Y}")
    lines += _link_lines(item)
    lines.append(_tail(item, extra, f"{item.posted_at:%d.%m}"))
    return "\n".join(lines)


def _grouped(entries: list[tuple[Item, int]], groups, block) -> list[str]:
    """Блоки по подразделам: заголовок подраздела приклеен к его первому блоку."""
    order = {subtype: n for n, (_, subtypes) in enumerate(groups) for subtype in subtypes}
    entries = sorted(entries, key=lambda e: (order.get(e[0].subtype or "", len(order)), -e[0].posted_at.timestamp()))
    blocks: list[str] = []
    shown: set[int] = set()
    for item, extra in entries:
        n = order.get(item.subtype or "", len(order))
        text = block(item, extra)
        if n < len(groups) and n not in shown:
            shown.add(n)
            text = f"<b>{groups[n][0]}</b>\n{text}"
        blocks.append(text)
    return blocks


def _pack(header: str, blocks: list[str]) -> list[str]:
    """Блоки разложить по сообщениям до лимита Telegram; заголовок раздела только в первом."""
    messages: list[str] = []
    current = header
    for block in blocks:
        if len(current) + len(block) + 2 > MAX_LEN:
            messages.append(current)
            current = "<i>…продолжение</i>"
        current += "\n\n" + block
    messages.append(current)
    return messages


def _vacancy_blocks(
    entries: list[tuple[Item, int]], today: date, open_vacancies: dict[str, int] | None, contacted: frozenset[str],
) -> tuple[list[str], dict[str, int]]:
    """Вакансии по группам оценки, внутри группы от лучшей к худшей; заголовок группы приклеен к её первой карточке."""
    rated = []
    for item, extra in entries:
        key = leads.open_vacancy_key(item.company)
        open_count = (open_vacancies or {}).get(key, 1) if key else 1
        rated.append((leads.score_vacancy(item, today, open_count, extra, contacted), item, extra))
    rated.sort(key=lambda r: (-r[0].score, -r[1].posted_at.timestamp()))
    blocks: list[str] = []
    counts: dict[str, int] = {}
    for tier, heading in VACANCY_GROUPS:
        part = [r for r in rated if r[0].tier == tier]
        counts[tier] = len(part)
        for n, (lead, item, extra) in enumerate(part):
            block = _vacancy_block(item, extra, lead)
            blocks.append(f"<b>{heading}</b>\n{block}" if n == 0 else block)
    return blocks, counts


def build_digest(
    items: list[Item], today: date, update: bool = False, open_vacancies: dict[str, int] | None = None,
    contacted: frozenset[str] = frozenset(),
) -> list[str]:
    """Сводка из ещё не показанного. С update=True это дневное обновление: в заголовке пометка, а пустое
    сообщение «ничего не нашлось» не нужно (вызывающий код его просто не отправляет). `open_vacancies` и
    `contacted` нужны для оценки вакансий (см. leads.py)."""
    stamp = f"{today:%d.%m.%Y}" + (" · обновление" if update else "")
    events = _dedupe([i for i in items if i.kind == "event"])
    dated = sorted((e for e in events if e[0].event_date),
                   key=lambda e: (e[0].event_date, e[0].event_time or e[0].posted_at.time().min))
    undated = [e for e in events if not e[0].event_date]
    vacancies = _dedupe([i for i in items if i.kind == "vacancy"])
    news = _dedupe([i for i in items if i.kind == "news"])
    laws = _dedupe([i for i in items if i.kind == "law"])

    if not (events or vacancies or news or laws):
        return [f"<b>Дайджест на {stamp}</b>\n\nНовых мероприятий, вакансий, новостей о людях рынка "
                "и изменений в законодательстве не нашлось."]

    messages: list[str] = []
    if events:
        # Номер сквозной по всему разделу; заголовок подраздела приклеиваем к первой карточке.
        cards = [_event_card(n, i, x) for n, (i, x) in enumerate(dated, 1)]
        late = [_undated_card(n, i, x) for n, (i, x) in enumerate(undated, len(dated) + 1)]
        if late:
            late[0] = "<b>Дата не указана</b> (проверьте пост)\n" + late[0]
        messages += _pack(f"<b>Мероприятия · {stamp}</b>\nВсего: {len(events)}", cards + late)
    if vacancies:
        blocks, counts = _vacancy_blocks(vacancies, today, open_vacancies, contacted)
        summary = f"Всего: {len(vacancies)}" + (f" (через агентства: {counts['agency']})" if counts["agency"] else "")
        if counts["hot"]:
            summary += f" · 🔥 горячих: {counts['hot']}"
        if counts["good"]:
            summary += f" · ⭐ хороших: {counts['good']}"
        messages += _pack(f"<b>Вакансии · {stamp}</b>\n{summary}", blocks)
    if news:
        messages += _pack(f"<b>Новости юридического рынка · {stamp}</b>\nВсего: {len(news)}",
                          _grouped(news, NEWS_GROUPS, _news_block))
    if laws:
        messages += _pack(f"<b>Законодательство и судебная практика · {stamp}</b>\nВсего: {len(laws)}",
                          _grouped(laws, LAW_GROUPS, lambda i, x: _law_block(i, x, today)))
    return messages
