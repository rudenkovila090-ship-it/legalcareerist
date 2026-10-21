import datetime as dt

from bridge import bothelp_import as bi
from bridge.store import Store

HEADER = (
    '"id";"name";"first_name";"last_name";"email";"phone";"start_param";'
    '"first_contact_at";"last_contact_at";"Промокод";"дни";"User tags"'
)
EXPORTED = dt.date(2026, 10, 21)
MIDNIGHT = dt.datetime(2026, 10, 21, tzinfo=dt.timezone.utc).timestamp()
TG = 1000000000  # ровно 10 цифр, как настоящие id в Telegram


def write_csv(tmp_path, *rows, name="export-21102026.csv"):
    path = tmp_path / name
    path.write_text("﻿" + "\n".join([HEADER, *rows]) + "\n", encoding="utf-8")
    return str(path)


def row(id_, tags="", days="", promo="", start="", email="", phone="", last="", first_seen="1700000000", last_seen="1700001000", name="Аня"):
    return (
        f'"{id_}";"{name}";"{name}";"{last}";"{email}";"{phone}";"{start}";{first_seen};{last_seen};'
        f'"{promo}";{days or chr(34) * 2};"{tags}"'
    )


def test_date_from_filename():
    assert bi.date_from_filename("/x/2a6f-export-21102026.csv") == EXPORTED
    assert bi.date_from_filename("export.csv") is None
    assert bi.date_from_filename("export-99992026.csv") is None


def test_tags_are_kept_as_is_and_mailing_flag_is_added(tmp_path):
    path = write_csv(
        tmp_path,
        row(TG + 1, f"{bi.TAG_YES}"),
        row(TG + 2, f"{bi.TAG_NO}"),
        row(TG + 3, f"{bi.TAG_YES};{bi.TAG_NO}"),
        row(TG + 4, "пользователь"),
    )
    plan = bi.parse_export(path, EXPORTED)
    assert [p.mailing for p in plan.people] == ["yes", "no", "no", None]
    assert len(plan.attention) == 1 and "…000003" in plan.attention[0]
    store = Store(":memory:")
    bi.apply_plan(plan, store)
    assert store.tags(f"tg:{TG + 1}")[:1] == [bi.TAG_YES]  # исходная метка на месте
    assert "mailing:yes" in store.tags(f"tg:{TG + 1}")
    assert {bi.TAG_YES, bi.TAG_NO, "mailing:no"} <= set(store.tags(f"tg:{TG + 3}"))
    assert not any(t.startswith("mailing:") for t in store.tags(f"tg:{TG + 4}"))


def test_other_channels_and_chats_are_kept_under_their_own_ids(tmp_path):
    path = write_csv(
        tmp_path,
        row(TG + 5, "пользователь"),
        row("2280384629394930", "пользователь;" + bi.TAG_YES, name="Из Instagram"),
        row("-1001234567890", "пользователь", name="Чат сообщества"),
        row("", "x"),
    )
    plan = bi.parse_export(path, EXPORTED)
    assert [(p.user_id, p.kind) for p in plan.people] == [
        (f"tg:{TG + 5}", "telegram"),
        ("bothelp:2280384629394930", "other"),
        ("chat:-1001234567890", "chat"),
    ]
    assert plan.skipped_empty == 1
    assert plan.chats == ["Чат сообщества (-1001234567890)"]
    text = bi.report(plan)
    assert "Люди из Telegram: 1" in text and "Из других каналов (Instagram и др.): 1" in text
    store = Store(":memory:")
    bi.apply_plan(plan, store)
    assert bi.TAG_YES in store.tags("bothelp:2280384629394930")  # данные не потеряны


def test_subscription_days_become_exact_expiry_dates(tmp_path):
    path = write_csv(
        tmp_path,
        row(TG + 1, f"{bi.TAG_SUB};резидент_сообщества", days="22"),
        row(TG + 2, f"{bi.TAG_SUB};резидент_сообщества", days="-10"),
        row(TG + 3, "оплатил_подписку_1", days="8"),
        row(TG + 4, "пользователь", days="999839"),
        row(TG + 5, "пользователь"),
    )
    plan = bi.parse_export(path, EXPORTED)
    store = Store(":memory:")
    bi.apply_plan(plan, store)
    assert store.subscription(f"tg:{TG + 1}") == {"plan": bi.TAG_SUB, "expires_at": MIDNIGHT + 22 * 86400, "source": "bothelp"}
    assert store.subscription(f"tg:{TG + 2}")["expires_at"] == MIDNIGHT - 10 * 86400
    assert store.subscription(f"tg:{TG + 3}")["plan"] == "подписка"
    long = store.subscription(f"tg:{TG + 4}")
    assert dt.datetime.fromtimestamp(long["expires_at"], dt.timezone.utc).date() == EXPORTED + dt.timedelta(days=999839)
    assert store.subscription(f"tg:{TG + 5}") is None
    text = "\n".join(plan.attention)
    assert "…000002" in text and "10 дн. назад" in text  # просрочил, но остался в чате
    assert "…000004" in text and "999839" in text
    assert "…000001" not in text


def test_absurd_days_do_not_crash():
    assert dt.datetime.fromtimestamp(bi.expires_at(EXPORTED, 10**9), dt.timezone.utc).date() == bi.MAX_DATE
    assert dt.datetime.fromtimestamp(bi.expires_at(EXPORTED, 10**12), dt.timezone.utc).date() == bi.MAX_DATE


def test_same_telegram_id_twice_is_merged(tmp_path):
    path = write_csv(
        tmp_path,
        row(TG + 6, "пользователь;оплатил_лонглист", days="5", first_seen="1700000500", last_seen="1700000600"),
        row(TG + 6, f"пользователь;{bi.TAG_YES}", days="30", first_seen="1700000100", last_seen="1700009000", promo="PROMO1"),
    )
    plan = bi.parse_export(path, EXPORTED)
    assert plan.merged == 1 and len(plan.people) == 1
    p = plan.people[0]
    assert p.tags == ["пользователь", "оплатил_лонглист", bi.TAG_YES]
    assert (p.days, p.first_seen, p.last_seen, p.promo) == (30, 1700000100.0, 1700009000.0, "PROMO1")
    assert "объединено строк: 1" in bi.report(plan)


def test_import_keeps_live_data_and_is_repeatable(tmp_path):
    uid = f"tg:{TG + 7}"
    path = write_csv(tmp_path, row(TG + 7, "оплатил_лонглист", promo="PROMO1", start="abc", name="Старое имя"))
    store = Store(":memory:")
    store.touch_contact(uid, "live_user", "Живое имя", "Живое", "ig_story")
    plan = bi.parse_export(path, EXPORTED)
    first = bi.apply_plan(plan, store)
    second = bi.apply_plan(plan, store)
    assert first["contacts_known"] == 1 and second["contacts_known"] == 1
    contact = store.contacts()[0]
    assert contact["username"] == "live_user" and contact["name"] == "Живое имя" and contact["source"] == "ig_story"
    assert contact["first_seen"] == 1700000000.0  # настоящая дата первого контакта из BotHelp
    tags = store.tags(uid)
    assert tags.count("оплатил_лонглист") == 1
    assert {"promo:PROMO1", "import:bothelp"} <= set(tags)


def test_new_contact_keeps_all_fields_and_bothelp_source(tmp_path):
    path = write_csv(
        tmp_path,
        row(TG + 8, start="c1-test", last="Иванова", phone="+79990001122", email="a@b.ru"),
        row(TG + 9),
    )
    store = Store(":memory:")
    bi.apply_plan(bi.parse_export(path, EXPORTED), store)
    by_id = {c["user_id"]: c for c in store.contacts()}
    first = by_id[f"tg:{TG + 8}"]
    assert first["source"] == "bothelp:c1-test"
    assert (first["last_name"], first["phone"], first["email"]) == ("Иванова", "+79990001122", "a@b.ru")
    assert by_id[f"tg:{TG + 9}"]["source"] == "bothelp"
    assert store.first_name(f"tg:{TG + 8}") == "Аня"


def test_old_database_gets_new_contact_columns(tmp_path):
    import sqlite3

    db = str(tmp_path / "old.db")
    raw = sqlite3.connect(db)
    raw.execute(
        "CREATE TABLE contacts (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, first_name TEXT, "
        "source TEXT, first_seen REAL NOT NULL, last_seen REAL NOT NULL)"
    )
    raw.execute("INSERT INTO contacts VALUES ('tg:1', 'u', 'N', 'F', NULL, 1, 2)")
    raw.commit()
    raw.close()
    store = Store(db)
    assert store.contacts()[0]["username"] == "u" and store.contacts()[0]["phone"] is None
    assert store.import_contact("tg:1", None, None, None, 0.5, 3, phone="+7")  is False
    assert store.contacts()[0]["phone"] == "+7"


def test_cli_dry_run_writes_nothing_and_apply_writes(tmp_path, capsys):
    path = write_csv(tmp_path, row(TG + 11, bi.TAG_YES), row(TG + 12, days="5"))
    db = str(tmp_path / "bot.db")
    assert bi.main([path, "--db", db]) == 0
    assert "пробный запуск" in capsys.readouterr().out
    assert Store(db).contacts() == []
    assert bi.main([path, "--db", db, "--apply"]) == 0
    store = Store(db)
    assert len(store.contacts()) == 2 and len(store.subscriptions()) == 1


def test_cli_needs_export_date(tmp_path, capsys):
    path = write_csv(tmp_path, row(TG + 1), name="contacts.csv")
    assert bi.main([path, "--db", str(tmp_path / "x.db")]) == 2
    assert "--exported-at" in capsys.readouterr().err
    assert bi.main([path, "--db", str(tmp_path / "x.db"), "--exported-at", "2026-10-21"]) == 0
    assert bi.main([path, "--exported-at", "21.10.2026"]) == 2


def test_owner_can_confirm_mailing_consent_for_conflicting_tags(tmp_path):
    uid = f"tg:{TG + 20}"
    path = write_csv(tmp_path, row(TG + 20, f"{bi.TAG_YES};{bi.TAG_NO}"), row(TG + 21, f"{bi.TAG_YES};{bi.TAG_NO}"))
    store = Store(":memory:")
    bi.apply_plan(bi.parse_export(path, EXPORTED), store)  # первый импорт без решения владельца
    assert "mailing:no" in store.tags(uid)

    plan = bi.parse_export(path, EXPORTED, frozenset({str(TG + 20)}))
    assert len(plan.attention) == 1 and "…000021" in plan.attention[0]  # по Екатерине вопроса больше нет
    bi.apply_plan(plan, store)
    tags = store.tags(uid)
    assert {"mailing:yes", bi.MAILING_OWNER, bi.TAG_YES, bi.TAG_NO} <= set(tags) and "mailing:no" not in tags
    assert "mailing:no" in store.tags(f"tg:{TG + 21}")  # остальные не затронуты

    bi.apply_plan(bi.parse_export(path, EXPORTED), store)  # свежая выгрузка без флага не перебивает решение
    assert "mailing:no" not in store.tags(uid) and "mailing:yes" in store.tags(uid)


def test_allow_mailing_only_applies_to_telegram_people(tmp_path):
    path = write_csv(tmp_path, row("2280384629394930", bi.TAG_NO))
    plan = bi.parse_export(path, EXPORTED, frozenset({"2280384629394930"}))
    assert plan.people[0].mailing == "no"


def test_cli_allow_mailing(tmp_path):
    path = write_csv(tmp_path, row(TG + 30, f"{bi.TAG_YES};{bi.TAG_NO}"))
    db = str(tmp_path / "bot.db")
    assert bi.main([path, "--db", db, "--allow-mailing", str(TG + 30), "--apply"]) == 0
    assert "mailing:yes" in Store(db).tags(f"tg:{TG + 30}")
