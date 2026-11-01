"""Оценка вакансии как лида для кадрового агентства: кому писать первым.

Вакансия приносит деньги, если работодателю можно написать (есть живой контакт), позиция заметная (за руководящую
и старшую агентство обычно получает больше), вакансия свежая (старые уже закрыты) и работодатель сам, а не
посредник-конкурент. Оценка складывается из таких признаков и по каждой вакансии объясняет, из чего сложилась:
правила ниже можно подкручивать, веса собраны в начале файла.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from .store import Item

HOT = 70  # от этого балла вакансия «горячая»: пишите первой
GOOD = 50  # от этого балла «хорошая»
# Контакт: чем живее, тем лучше. Без контакта писать некому, а с одной ссылкой на отклик нельзя начать разговор.
CONTACT_POINTS = {"handle": 28, "email": 20, "phone": 14, "bot": 6, "link": 4, "none": 0}
CONTACT_CAP = {"none": 45, "link": 60, "bot": 60}  # потолок оценки без живого контакта
CONTACT_REASON = {
    "handle": "пишите в Telegram", "email": "есть e-mail", "phone": "есть телефон", "bot": "отклик только через бота",
    "link": "только ссылка на отклик", "none": "контакта нет",
}
LEVEL_POINTS = {3: 22, 2: 14, 1: 7, 0: 0}
LEVEL_REASON = {3: "руководящая позиция", 2: "старшая позиция", 0: "помощник или стажёр"}
AGENCY_PENALTY = 35
CONTACTED_PENALTY = 60
BIG_CITIES = ("Москва", "Санкт-Петербург")

# Должность по заголовку. Сначала проверяем самое низкое: «помощник руководителя» это не руководитель.
_LEVEL0 = re.compile(
    r"помощник|стажер|стажир|intern|trainee|junior|младш|ассистент|assistant|секретар|офис-?менеджер|офис менеджер|"
    r"администратор|референт|делопроизводитель|ресепшн|рецепшн|receptionist|без опыта"
)
_LEVEL3 = re.compile(
    r"партнер|partner|head of|руководител|директор|director|начальник|главн\w+ юрист|главный|chief|general counsel|"
    r"управляющ|заместител|вице-президент"
)
_LEVEL2 = re.compile(r"старш\w+|ведущ\w+|senior|советник|counsel|эксперт|\blead\b")

# Деньги: «от 250 тыс. руб.», «200-300 тыс», «230 000 руб», «$3000», «3 млн».
_NUMBER = re.compile(r"(\d[\d\s ]*(?:[.,]\d+)?)\s*(тыс\w*\.?|к(?![а-я])|т\.?\s?р|млн\.?|k\b)?", re.IGNORECASE)


def _norm(text: str) -> str:
    return re.sub(r"[\W_]+", " ", text.lower().replace("ё", "е")).strip()


def salary_value(text: str | None) -> int | None:
    """Верхняя сумма из текста о зарплате в рублях в месяц (доллары и евро пересчитываются грубо); без суммы None."""
    if not text:
        return None
    low = text.lower().replace("ё", "е")
    rate = 90 if ("$" in low or "usd" in low) else 100 if ("€" in low or "eur" in low) else 1
    best = 0.0
    for m in _NUMBER.finditer(low):
        try:
            value = float(re.sub(r"[\s ]", "", m[1]).replace(",", "."))
        except ValueError:
            continue
        unit = m[2] or ""
        if unit.startswith("млн"):
            value *= 1_000_000
        elif unit:
            value *= 1000
        elif value < 1000:  # «3 года», «5 лет» без «тыс.» и «руб.» — не деньги
            continue
        best = max(best, value * rate)
    if best >= 1_500_000:  # такая сумма в месяц нереальна: это годовой доход
        best /= 12
    return int(best) or None


def seniority(title: str) -> int:
    """3 руководящая должность, 2 старшая, 1 обычный юрист или специалист, 0 помощник или стажёр."""
    low = _norm(title)
    if _LEVEL0.search(low):
        return 0
    if _LEVEL3.search(low):
        return 3
    if _LEVEL2.search(low):
        return 2
    return 1


def contact_kind(contacts: tuple[str, ...]) -> str:
    """Лучший способ связи из найденных: handle (@ник человека), email, phone, bot, link, none."""
    kinds = set()
    for contact in contacts:
        if contact.startswith("@"):
            kinds.add("bot" if contact.lower().endswith("bot") else "handle")
        elif "@" in contact:
            kinds.add("email")
        elif contact.startswith("http"):
            kinds.add("link")
        elif re.search(r"\d", contact):
            kinds.add("phone")
    return next((kind for kind in ("handle", "email", "phone", "bot", "link") if kind in kinds), "none")


def is_contacted(item: Item, contacted: frozenset[str]) -> bool:
    """Вы уже писали этому работодателю: компания или контакт есть в contacted.txt."""
    if not contacted:
        return False
    if item.company and _norm(item.company) in contacted:
        return True
    return any(c.lower() in contacted for c in item.contacts)


def open_vacancy_key(company: str | None) -> str | None:
    return _norm(company) if company else None


@dataclass(frozen=True)
class Lead:
    score: int
    tier: str  # "hot" | "good" | "other" | "agency"
    reasons: tuple[str, ...]  # из чего сложилась оценка, самое важное первым
    contact: str  # handle | email | phone | bot | link | none
    contacted: bool = False


def _freshness(days: int) -> tuple[int, str | None]:
    if days <= 0:
        return 12, "опубликована сегодня"
    if days == 1:
        return 9, "опубликована вчера"
    if days <= 3:
        return 5, f"опубликована {days} дн. назад"
    if days <= 7:
        return 2, f"опубликована {days} дн. назад"
    return 0, f"опубликована {days} дн. назад"


def score_vacancy(
    item: Item, today: date, open_vacancies: int = 1, extra_posts: int = 0, contacted: frozenset[str] = frozenset(),
) -> Lead:
    """Оценка вакансии от 0 до 100. `open_vacancies` — сколько разных вакансий этого работодателя встретилось за
    последний месяц, `extra_posts` — в скольких ещё каналах она объявлена."""
    reasons: list[str] = []
    score = 15
    kind = contact_kind(item.contacts)
    score += CONTACT_POINTS[kind]
    reasons.append(CONTACT_REASON[kind])

    level = seniority(item.title)
    score += LEVEL_POINTS[level]
    if level in LEVEL_REASON:
        reasons.append(LEVEL_REASON[level])

    if item.salary:
        score += 8
        value = salary_value(item.salary)
        if value and value >= 300_000:
            score += 8
            reasons.append("высокая зарплата")
        else:
            if value and value >= 200_000:
                score += 5
            elif value and value >= 120_000:
                score += 2
            reasons.append("зарплата указана")
    if item.company:
        score += 7

    points, fresh = _freshness((today - item.posted_at.astimezone().date()).days)
    score += points
    if open_vacancies >= 2:
        score += 10 if open_vacancies >= 3 else 6
        reasons.append(f"у работодателя {open_vacancies} вакансий")
    if extra_posts:
        score += 3
        reasons.append(f"объявлена в {extra_posts + 1} каналах")
    if item.city in BIG_CITIES:
        score += 3
    if fresh:  # свежесть в конце списка причин: она важна, но чаще видна и так
        reasons.append(fresh)

    if kind in CONTACT_CAP:
        score = min(score, CONTACT_CAP[kind])

    is_agency = item.via_agency
    already = is_contacted(item, contacted)
    if is_agency:
        score -= AGENCY_PENALTY
        reasons.insert(0, "через агентство: посредник")
    else:
        reasons.insert(0, "прямой работодатель")
    if already:
        score -= CONTACTED_PENALTY
        reasons.insert(0, "уже писали")
    score = max(0, min(100, score))

    if is_agency:
        tier = "agency"
    elif already:
        tier = "other"
    else:
        tier = "hot" if score >= HOT else "good" if score >= GOOD else "other"
    return Lead(score, tier, tuple(reasons), kind, already)
