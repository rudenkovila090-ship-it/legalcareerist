"""Shared classification for scheduled scans and live Telegram updates."""
from collections import Counter

from . import rules
from .store import Item

KINDS_BY_MODE = {
    "all": ("event", "vacancy", "news", "law"),
    "events": ("event",), "vacancies": ("vacancy",),
    "news": ("news",), "law": ("law",), "agency": ("vacancy",),
}


def ingest_post(cfg, store, src, post, mode, today, news_limit):
    counts = Counter()
    if not rules.passes_filters(post.text, cfg.only_keywords, cfg.exclude_keywords):
        return counts
    posted_on = post.date.astimezone().date()
    match = rules.classify(
        post.text, posted_on, src.title, src.username, post.urls,
        KINDS_BY_MODE[mode], news_context_required=mode != "news", channel_id=src.id,
    )
    if not match:
        return counts
    if match.kind == "vacancy":
        if cfg.vacancy_scope == "legal" and not rules.is_legal_vacancy(post.text, src.title):
            counts["not_legal"] += 1
            return counts
        if (today - posted_on).days > cfg.vacancy_days:
            counts["stale"] += 1
            return counts
    if match.kind in ("news", "law") and (today - posted_on).days > news_limit:
        return counts
    if match.kind == "law" and cfg.law_scope == "labor" and not rules.is_labor_law(post.text):
        return counts
    link = src.link(post.msg_id)
    item = Item(
        src.id, post.msg_id, match.kind, match.title, src.title, link,
        match.event_date, match.event_time, match.deadline, post.date,
        company=match.company, salary=match.salary, work_format=match.work_format,
        contacts=match.contacts, via_agency=match.via_agency or mode == "agency",
        event_end=match.event_end, city=match.city, price=match.price, audience=match.audience,
        topic=match.topic, reg_url=match.reg_url, subtype=match.subtype, people=match.people,
        role=match.role, origin=match.origin, place=match.place, doc_ref=match.doc_ref,
        links=tuple(u for u in match.links if rules.link_key(u) != rules.link_key(link)),
    )
    if store.seen_before(item):
        counts["duplicate"] += 1
        return counts
    store.add_item(item)
    counts[match.kind] += 1
    return counts
