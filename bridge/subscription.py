"""Сообщения клиенту о платной подписке: оплата прошла, скоро списание, списание выполнено.

Тексты лежат в config/subscription.json. Подстановки: {first_name} (имя), {plan} (название подписки),
{amount} (сумма), {date} (дата списания), {until} (до какого числа открыт доступ).
"""
from __future__ import annotations

import datetime as dt
import json
import string

from .flows import fill_name

KEYS = ("paid", "reminder", "charged")
FIELDS = {"first_name", "plan", "amount", "date", "until"}
TEST_NOTE = "Тест: так клиент увидит сообщения о подписке. Имя, сумма и даты условные."


def load_subscription(path: str) -> dict[str, str]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    texts: dict[str, str] = {}
    for key in KEYS:
        text = data.get(key) if isinstance(data, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"в {path} нет текста «{key}»")
        try:
            used = {name for _, name, _, _ in string.Formatter().parse(text) if name}
        except ValueError as exc:
            raise ValueError(f"некорректные фигурные скобки в тексте «{key}»: {exc}") from None
        if used - FIELDS:
            raise ValueError(f"неизвестные подстановки {sorted(used - FIELDS)} в тексте «{key}»")
        texts[key] = text
    return texts


def compose(text: str, first_name: str | None, plan: str, amount: str, date: str, until: str) -> str:
    """Имя подставляем последним: в имени клиента могут быть любые символы, в том числе фигурные скобки."""
    for name, value in (("plan", plan), ("amount", amount), ("date", date), ("until", until)):
        text = text.replace("{" + name + "}", value)
    return fill_name(text, first_name)


def sample_messages(texts: dict[str, str], first_name: str | None, today: dt.date) -> list[str]:
    """Три сообщения с условными данными: для проверки текстов глазами."""
    plan, amount = "Резидент сообщества", "350 ₽"
    date, until = (today + dt.timedelta(days=3)).strftime("%d.%m.%Y"), (today + dt.timedelta(days=30)).strftime("%d.%m.%Y")
    return [compose(texts[key], first_name, plan, amount, date, until) for key in KEYS]
