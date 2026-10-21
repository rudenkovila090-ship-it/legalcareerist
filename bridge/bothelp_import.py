from __future__ import annotations

import argparse
import csv
import datetime as dt
import logging
import os
import re
import sys
from dataclasses import dataclass, field

from .logging_setup import setup_logging
from .store import Store

log = logging.getLogger("bothelp_import")

TAG_YES = "согласен_на_рассылку_сообщений"
TAG_NO = "не_согласен_на_рассылку_сообщений"
TAG_SUB = "подписка_350"
TELEGRAM_ID_LIMIT = 10**13  # id в Instagram/Facebook длиннее (15-16 цифр): это не Telegram, написать им отсюда нельзя
LONG_ACCESS_DAYS = 3650  # доступ дольше 10 лет: скорее всего выдан вручную или тестовый, просим проверить
MAX_DATE = dt.date(9999, 12, 31)
SOURCE = "bothelp"


@dataclass
class Person:
    user_id: str  # tg:<id> (человек в Telegram), chat:<id> (группа или канал), bothelp:<id> (другой канал, например Instagram)
    kind: str  # telegram | chat | other
    name: str | None
    first_name: str | None
    last_name: str | None
    phone: str | None
    email: str | None
    first_seen: float
    last_seen: float
    source: str
    tags: list[str]
    promo: str | None
    days: int | None

    @property
    def says_yes(self) -> bool:
        return TAG_YES in self.tags

    @property
    def says_no(self) -> bool:
        return TAG_NO in self.tags

    @property
    def mailing(self) -> str | None:
        """Одна общая метка для будущих рассылок: разрешено только при «согласен» без «не согласен»."""
        return "yes" if self.says_yes and not self.says_no else "no" if self.says_no else None

    @property
    def plan(self) -> str | None:
        return TAG_SUB if TAG_SUB in self.tags else ("подписка" if self.days is not None else None)


@dataclass
class ImportPlan:
    exported_at: dt.date
    people: list[Person] = field(default_factory=list)
    skipped_empty: int = 0
    merged: int = 0  # строки BotHelp с одним и тем же Telegram id, объединённые в одну
    attention: list[str] = field(default_factory=list)
    chats: list[str] = field(default_factory=list)  # «Название (id)» групп и каналов, найденных среди контактов

    def of_kind(self, kind: str) -> list[Person]:
        return [p for p in self.people if p.kind == kind]


def _int(value: str) -> int | None:
    value = (value or "").strip()
    return int(value) if re.fullmatch(r"-?\d+", value) else None


def _text(value: str | None) -> str | None:
    return (value or "").strip() or None


def date_from_filename(path: str) -> dt.date | None:
    """В названии выгрузки BotHelp стоит дата ДДММГГГГ: `...export-21102026.csv`."""
    match = re.search(r"(\d{2})(\d{2})(\d{4})(?=\D*$)", os.path.splitext(os.path.basename(path))[0])
    if not match:
        return None
    try:
        return dt.date(int(match[3]), int(match[2]), int(match[1]))
    except ValueError:
        return None


def _key(raw_id: str) -> tuple[str, str] | None:
    """(наш id, вид) для id из BotHelp; None, если это не id."""
    if not re.fullmatch(r"-?\d+", raw_id):
        return None
    if raw_id.startswith("-"):
        return f"chat:{raw_id}", "chat"
    if int(raw_id) >= TELEGRAM_ID_LIMIT:
        return f"{SOURCE}:{raw_id}", "other"
    return f"tg:{raw_id}", "telegram"


def mask(person: Person) -> str:
    """Имя и последние цифры id: чтобы найти человека в списке, не печатая id целиком."""
    tail = person.user_id.rpartition(":")[2][-6:]
    return f"{person.first_name or person.name or 'без имени'} …{tail}"


def _merge(a: Person, b: Person) -> Person:
    """Два контакта BotHelp с одним id: метки складываем, срок подписки берём дальний, даты крайние."""
    days = [d for d in (a.days, b.days) if d is not None]
    for field_name in ("name", "first_name", "last_name", "phone", "email", "promo"):
        if getattr(a, field_name) is None:
            setattr(a, field_name, getattr(b, field_name))
    a.tags += [t for t in b.tags if t not in a.tags]
    a.first_seen = min(x for x in (a.first_seen, b.first_seen) if x) if a.first_seen or b.first_seen else 0.0
    a.last_seen = max(a.last_seen, b.last_seen)
    a.days = max(days) if days else None
    return a


def parse_export(path: str, exported_at: dt.date) -> ImportPlan:
    plan = ImportPlan(exported_at=exported_at)
    by_id: dict[str, Person] = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh, delimiter=";"):
            ident = _key((row.get("id") or "").strip())
            if ident is None:
                plan.skipped_empty += 1
                continue
            user_id, kind = ident
            first_seen = float(_int(row.get("first_contact_at", "")) or 0)
            last_seen = float(_int(row.get("last_contact_at", "")) or first_seen)
            start = (row.get("start_param") or "").strip()
            person = Person(
                user_id=user_id,
                kind=kind,
                name=_text(row.get("name")),
                first_name=_text(row.get("first_name")),
                last_name=_text(row.get("last_name")),
                phone=_text(row.get("phone")),
                email=_text(row.get("email")),
                first_seen=first_seen,
                last_seen=max(first_seen, last_seen),
                source=f"{SOURCE}:{start}"[:64] if start else SOURCE,
                tags=list(dict.fromkeys(t.strip() for t in (row.get("User tags") or "").split(";") if t.strip())),
                promo=_text(row.get("Промокод")),
                days=_int(row.get("дни", "")),
            )
            if user_id in by_id:
                plan.merged += 1
                by_id[user_id] = _merge(by_id[user_id], person)
            else:
                by_id[user_id] = person
    plan.people = list(by_id.values())

    for p in plan.people:
        who = mask(p)
        if p.kind == "chat":
            plan.chats.append(f"{p.name or 'без названия'} ({p.user_id.removeprefix('chat:')})")
        if p.says_yes and p.says_no:
            plan.attention.append(f"{who}: в BotHelp стоят обе метки, «согласен» и «не согласен». Для рассылок считаем, что нельзя.")
        if p.days is not None and p.days >= LONG_ACCESS_DAYS:
            plan.attention.append(f"{who}: осталось {p.days} дн. доступа (выдан вручную или тестовый). Перенёс как есть, проверьте, нужен ли он.")
        if p.days is not None and p.days < 0 and "резидент_сообщества" in p.tags:
            plan.attention.append(f"{who}: подписка закончилась {-p.days} дн. назад, а метка «резидент_сообщества» осталась. Решите: убрать из чата или продлить.")
    return plan


def expires_at(exported_at: dt.date, days: int) -> float:
    """Дата выгрузки + оставшиеся дни. Если дата не помещается в календарь, берём последнюю возможную."""
    try:
        end = exported_at + dt.timedelta(days=days)
    except OverflowError:
        end = MAX_DATE
    return dt.datetime.combine(end, dt.time(), tzinfo=dt.timezone.utc).timestamp()


def apply_plan(plan: ImportPlan, store: Store) -> dict[str, int]:
    """Безопасно повторять: контакты и метки только добавляются, живые данные не затираются."""
    added = {"contacts_new": 0, "contacts_known": 0, "subscriptions": 0}
    for p in plan.people:
        if store.import_contact(
            p.user_id, p.name, p.first_name, p.source, p.first_seen, p.last_seen, p.last_name, p.phone, p.email
        ):
            added["contacts_new"] += 1
        else:
            added["contacts_known"] += 1
        for tag in p.tags:  # метки BotHelp переносятся как есть
            store.add_tag(p.user_id, tag)
        extra = [f"import:{SOURCE}"]  # к ним только добавляем свои
        if p.mailing:
            extra.append(f"mailing:{p.mailing}")
        if p.promo:
            extra.append(f"promo:{p.promo}")
        for tag in extra:
            store.add_tag(p.user_id, tag)
        if p.days is not None:
            store.set_subscription(p.user_id, p.plan or "подписка", expires_at(plan.exported_at, p.days), SOURCE)
            added["subscriptions"] += 1
    return added


def report(plan: ImportPlan) -> str:
    telegram = plan.of_kind("telegram")
    with_days = [p for p in plan.people if p.days is not None]
    active = sum(1 for p in with_days if p.days >= 0)
    yes = sum(1 for p in telegram if p.mailing == "yes")
    no = sum(1 for p in telegram if p.mailing == "no")
    tags: dict[str, int] = {}
    for p in plan.people:
        for t in p.tags:
            tags[t] = tags.get(t, 0) + 1
    lines = [
        f"Выгрузка от {plan.exported_at:%d.%m.%Y}",
        f"Люди из Telegram: {len(telegram)}. Бот сможет им написать, если токен тот же (или они нажмут «Старт»)",
        f"  разрешили рассылку: {yes}",
        f"  запретили (или противоречие): {no}",
        f"  без ответа про рассылку: {len(telegram) - yes - no}",
        f"Подписки: {len(with_days)} с датой окончания, из них действуют сейчас {active}",
    ]
    others = plan.of_kind("other")
    if others:
        lines.append(f"Из других каналов (Instagram и др.): {len(others)}. Сохраняю в базе с метками, но написать им отсюда нельзя.")
    if plan.chats:
        lines.append("Группы и каналы среди контактов: " + "; ".join(plan.chats))
    if plan.merged:
        lines.append(f"Один человек был в BotHelp дважды, объединено строк: {plan.merged}")
    if plan.skipped_empty:
        lines.append(f"Строк без номера, пропущено: {plan.skipped_empty}")
    withphone = sum(1 for p in plan.people if p.phone or p.email)
    if withphone:
        lines.append(f"Телефон или email есть у {withphone} чел.: переносятся в карточку контакта.")
    lines.append("Метки (переносятся как есть):")
    lines += [f"  {t}: {n}" for t, n in sorted(tags.items(), key=lambda kv: -kv[1])]
    if plan.attention:
        lines.append("Нужно ваше решение:")
        lines += [f"  {a}" for a in plan.attention]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Перенос контактов, меток и подписок из выгрузки BotHelp")
    parser.add_argument("file", help="CSV-выгрузка контактов из BotHelp")
    parser.add_argument("--db", default=os.environ.get("DB_PATH", "data/bridge.db"), help="файл базы бота")
    parser.add_argument("--exported-at", help="дата выгрузки ГГГГ-ММ-ДД (по умолчанию из названия файла)")
    parser.add_argument("--apply", action="store_true", help="записать в базу (без этого флага только показывает, что будет)")
    args = parser.parse_args(argv)
    setup_logging("WARNING")

    try:
        exported_at = dt.date.fromisoformat(args.exported_at) if args.exported_at else date_from_filename(args.file)
    except ValueError:
        print("Дата выгрузки должна быть в формате ГГГГ-ММ-ДД", file=sys.stderr)
        return 2
    if exported_at is None:
        print("Не нашёл дату в названии файла. Укажите её: --exported-at 2026-10-21", file=sys.stderr)
        return 2

    plan = parse_export(args.file, exported_at)
    print(report(plan))
    if not args.apply:
        print("\nЭто пробный запуск, в базу ничего не записано. Чтобы записать, добавьте --apply")
        return 0
    result = apply_plan(plan, Store(args.db))
    print(
        f"\nЗаписано в {args.db}: новых контактов {result['contacts_new']}, "
        f"уже были {result['contacts_known']}, подписок {result['subscriptions']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
