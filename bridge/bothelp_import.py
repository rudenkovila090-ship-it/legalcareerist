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
TELEGRAM_ID_LIMIT = 10**13  # id в Instagram/Facebook длиннее (16 цифр): это не Telegram, написать им отсюда нельзя
FOREVER_DAYS = 3650  # «дней до конца подписки» больше 10 лет: выданный вручную или тестовый доступ
FOREVER_TS = 4102444800  # 2100-01-01
SOURCE = "bothelp"


@dataclass
class Person:
    user_id: str  # как в нашей базе: tg:<id>
    name: str | None
    first_name: str | None
    first_seen: float
    last_seen: float
    source: str
    tags: list[str]
    mailing: str | None  # "yes" | "no" | None (согласия нет)
    consent_conflict: bool
    promo: str | None
    days: int | None
    plan: str | None


@dataclass
class ImportPlan:
    exported_at: dt.date
    people: list[Person] = field(default_factory=list)
    skipped_other_channel: int = 0
    skipped_empty: int = 0
    lost_contacts: int = 0  # в выгрузке есть email или телефон, а в нашей базе для них нет места
    attention: list[str] = field(default_factory=list)

    def count_tag(self, tag: str) -> int:
        return sum(1 for p in self.people if tag in p.tags)


def _int(value: str) -> int | None:
    value = (value or "").strip()
    return int(value) if re.fullmatch(r"-?\d+", value) else None


def date_from_filename(path: str) -> dt.date | None:
    """В названии выгрузки BotHelp стоит дата ДДММГГГГ: `...export-21102026.csv`."""
    match = re.search(r"(\d{2})(\d{2})(\d{4})(?=\D*$)", os.path.splitext(os.path.basename(path))[0])
    if not match:
        return None
    try:
        return dt.date(int(match[3]), int(match[2]), int(match[1]))
    except ValueError:
        return None


def mask(user_id: str) -> str:
    return "…" + user_id.removeprefix("tg:")[-4:]


def parse_export(path: str, exported_at: dt.date) -> ImportPlan:
    plan = ImportPlan(exported_at=exported_at)
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh, delimiter=";"):
            raw_id = (row.get("id") or "").strip()
            if not raw_id.isdigit():
                plan.skipped_empty += 1
                continue
            if int(raw_id) >= TELEGRAM_ID_LIMIT:
                plan.skipped_other_channel += 1
                continue
            user_id = f"tg:{raw_id}"
            tags = [t.strip() for t in (row.get("User tags") or "").split(";") if t.strip()]
            says_yes, says_no = TAG_YES in tags, TAG_NO in tags
            conflict = says_yes and says_no
            mailing = "yes" if says_yes and not says_no else "no" if says_no else None
            days = _int(row.get("дни", ""))
            promo = (row.get("Промокод") or "").strip() or None
            first_seen = float(_int(row.get("first_contact_at", "")) or 0)
            last_seen = float(_int(row.get("last_contact_at", "")) or first_seen)
            start = (row.get("start_param") or "").strip()
            if (row.get("email") or "").strip() or (row.get("phone") or "").strip():
                plan.lost_contacts += 1
            person = Person(
                user_id=user_id,
                name=(row.get("name") or "").strip() or None,
                first_name=(row.get("first_name") or "").strip() or None,
                first_seen=first_seen,
                last_seen=max(first_seen, last_seen),
                source=f"{SOURCE}:{start}"[:64] if start else SOURCE,
                tags=[t for t in tags if t not in (TAG_YES, TAG_NO)],
                mailing=mailing,
                consent_conflict=conflict,
                promo=promo,
                days=days,
                plan=TAG_SUB if TAG_SUB in tags else ("подписка" if days is not None else None),
            )
            plan.people.append(person)
            who = mask(user_id)
            if conflict:
                plan.attention.append(f"{who}: в BotHelp стоят обе метки, «согласен» и «не согласен». Считаем, что рассылку нельзя.")
            if days is not None and days >= FOREVER_DAYS:
                plan.attention.append(f"{who}: доступ на {days} дн. (выдан вручную или тестовый). Переносим как «бессрочно»; проверьте, нужен ли он.")
            if days is not None and days < 0 and "резидент_сообщества" in tags:
                plan.attention.append(f"{who}: подписка закончилась {-days} дн. назад, а метка «резидент сообщества» осталась. Решите: убрать из чата или продлить.")
    return plan


def apply_plan(plan: ImportPlan, store: Store) -> dict[str, int]:
    """Безопасно повторять: контакты и метки только добавляются, живые данные не затираются."""
    added = {"contacts_new": 0, "contacts_known": 0, "subscriptions": 0}
    for p in plan.people:
        if store.import_contact(p.user_id, p.name, p.first_name, p.source, p.first_seen, p.last_seen):
            added["contacts_new"] += 1
        else:
            added["contacts_known"] += 1
        for tag in p.tags:
            store.add_tag(p.user_id, tag)
        if p.mailing:
            store.add_tag(p.user_id, f"mailing:{p.mailing}")
        if p.promo:
            store.add_tag(p.user_id, f"promo:{p.promo}")
        store.add_tag(p.user_id, f"import:{SOURCE}")
        if p.days is not None:
            if p.days >= FOREVER_DAYS:
                expires, label = FOREVER_TS, "бессрочно"
            else:
                midnight = dt.datetime.combine(plan.exported_at, dt.time(), tzinfo=dt.timezone.utc)
                expires, label = (midnight + dt.timedelta(days=p.days)).timestamp(), p.plan or "подписка"
            store.set_subscription(p.user_id, label, expires, SOURCE)
            added["subscriptions"] += 1
    return added


def report(plan: ImportPlan) -> str:
    people = plan.people
    sub_end = [p for p in people if p.days is not None and p.days < FOREVER_DAYS]
    active = sum(1 for p in sub_end if p.days >= 0)
    yes = sum(1 for p in people if p.mailing == "yes")
    no = sum(1 for p in people if p.mailing == "no")
    tags: dict[str, int] = {}
    for p in people:
        for t in p.tags:
            tags[t] = tags.get(t, 0) + 1
    lines = [
        f"Выгрузка от {plan.exported_at:%d.%m.%Y}",
        f"Люди из Telegram: {len(people)}",
        f"  с разрешением на рассылку: {yes}",
        f"  с запретом (или противоречием): {no}",
        f"  без ответа про рассылку: {len(people) - yes - no}",
        f"Подписки: {len(sub_end)} с датой окончания, из них действуют сейчас {active}",
    ]
    if plan.skipped_other_channel:
        lines.append(f"Не из Telegram (Instagram и др.), пропущено: {plan.skipped_other_channel}. Им отсюда писать нельзя.")
    if plan.skipped_empty:
        lines.append(f"Строк без номера, пропущено: {plan.skipped_empty}")
    if plan.lost_contacts:
        lines.append(f"Есть email или телефон у {plan.lost_contacts} чел.: в нашу базу они не переносятся, сохраните файл выгрузки.")
    lines.append("Метки:")
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
