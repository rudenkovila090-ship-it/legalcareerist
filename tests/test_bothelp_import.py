import datetime as dt

from bridge import bothelp_import as bi
from bridge.store import Store

HEADER = '"id";"name";"first_name";"email";"phone";"start_param";"first_contact_at";"last_contact_at";"Промокод";"дни";"User tags"'
EXPORTED = dt.date(2026, 10, 21)
MIDNIGHT = dt.datetime(2026, 10, 21, tzinfo=dt.timezone.utc).timestamp()


def write_csv(tmp_path, *rows, name="export-21102026.csv"):
    path = tmp_path / name
    path.write_text("﻿" + "\n".join([HEADER, *rows]) + "\n", encoding="utf-8")
    return str(path)


def row(id_, tags="", days="", promo="", start="", email="", first="1700000000", last="1700001000", name="Аня"):
    return f'"{id_}";"{name}";"{name}";"{email}";"";"{start}";{first};{last};"{promo}";{days or chr(34)*2};"{tags}"'


def test_date_from_filename():
    assert bi.date_from_filename("/x/2a6f-export-21102026.csv") == EXPORTED
    assert bi.date_from_filename("export.csv") is None
    assert bi.date_from_filename("export-99992026.csv") is None


def test_mailing_consent_is_conservative(tmp_path):
    path = write_csv(
        tmp_path,
        row(101, f"{bi.TAG_YES}"),
        row(102, f"{bi.TAG_NO}"),
        row(103, f"{bi.TAG_YES};{bi.TAG_NO}"),
        row(104, "пользователь"),
    )
    plan = bi.parse_export(path, EXPORTED)
    assert [p.mailing for p in plan.people] == ["yes", "no", "no", None]
    assert plan.people[2].consent_conflict and len(plan.attention) == 1
    store = Store(":memory:")
    bi.apply_plan(plan, store)
    assert "mailing:yes" in store.tags("tg:101")
    assert "mailing:no" in store.tags("tg:103")
    assert not any(t.startswith("mailing:") for t in store.tags("tg:104"))
    assert bi.TAG_YES not in store.tags("tg:101")  # заменено меткой mailing:yes


def test_other_channels_and_empty_rows_are_skipped(tmp_path):
    path = write_csv(tmp_path, row(5, "пользователь"), row("2280384629394930", "пользователь"), row("", "x"))
    plan = bi.parse_export(path, EXPORTED)
    assert [p.user_id for p in plan.people] == ["tg:5"]
    assert plan.skipped_other_channel == 1 and plan.skipped_empty == 1


def test_subscription_days_become_expiry_dates(tmp_path):
    path = write_csv(
        tmp_path,
        row(1000000001, f"{bi.TAG_SUB};резидент_сообщества", days="22"),
        row(1000000002, f"{bi.TAG_SUB};резидент_сообщества", days="-10"),
        row(1000000003, "оплатил_подписку_1", days="8"),
        row(1000000004, "пользователь", days="999839"),
        row(1000000005, "пользователь"),
    )
    plan = bi.parse_export(path, EXPORTED)
    store = Store(":memory:")
    bi.apply_plan(plan, store)
    assert store.subscription("tg:1000000001") == {"plan": bi.TAG_SUB, "expires_at": MIDNIGHT + 22 * 86400, "source": "bothelp"}
    assert store.subscription("tg:1000000002")["expires_at"] == MIDNIGHT - 10 * 86400
    assert store.subscription("tg:1000000003")["plan"] == "подписка"
    assert store.subscription("tg:1000000004") == {"plan": "бессрочно", "expires_at": bi.FOREVER_TS, "source": "bothelp"}
    assert store.subscription("tg:1000000005") is None
    text = "\n".join(plan.attention)
    assert "…0002" in text and "10 дн. назад" in text  # просрочил, но остался в чате
    assert "…0004" in text and "бессрочно" in text
    assert "…0001" not in text


def test_import_keeps_live_data_and_is_repeatable(tmp_path):
    path = write_csv(tmp_path, row(7, "оплатил_лонглист", promo="KQ21", start="abc", name="Старое имя"))
    store = Store(":memory:")
    store.touch_contact("tg:7", "live_user", "Живое имя", "Живое", "ig_story")
    plan = bi.parse_export(path, EXPORTED)
    first = bi.apply_plan(plan, store)
    second = bi.apply_plan(plan, store)
    assert first["contacts_known"] == 1 and second["contacts_known"] == 1
    contact = store.contacts()[0]
    assert contact["username"] == "live_user" and contact["name"] == "Живое имя" and contact["source"] == "ig_story"
    assert contact["first_seen"] == 1700000000.0  # настоящая дата первого контакта из BotHelp
    tags = store.tags("tg:7")
    assert tags.count("оплатил_лонглист") == 1
    assert {"promo:KQ21", "import:bothelp"} <= set(tags)


def test_new_contact_gets_bothelp_source(tmp_path):
    path = write_csv(tmp_path, row(8, start="c1-test"), row(9))
    store = Store(":memory:")
    bi.apply_plan(bi.parse_export(path, EXPORTED), store)
    assert {c["user_id"]: c["source"] for c in store.contacts()} == {"tg:8": "bothelp:c1-test", "tg:9": "bothelp"}
    assert store.first_name("tg:8") == "Аня"


def test_email_and_phone_are_counted_not_imported(tmp_path):
    plan = bi.parse_export(write_csv(tmp_path, row(1, email="a@b.ru"), row(2)), EXPORTED)
    assert plan.lost_contacts == 1
    assert "email или телефон у 1" in bi.report(plan)


def test_cli_dry_run_writes_nothing_and_apply_writes(tmp_path, capsys):
    path = write_csv(tmp_path, row(11, bi.TAG_YES), row(12, days="5"))
    db = str(tmp_path / "bot.db")
    assert bi.main([path, "--db", db]) == 0
    assert "пробный запуск" in capsys.readouterr().out
    assert Store(db).contacts() == []
    assert bi.main([path, "--db", db, "--apply"]) == 0
    store = Store(db)
    assert len(store.contacts()) == 2 and len(store.subscriptions()) == 1


def test_cli_needs_export_date(tmp_path, capsys):
    path = write_csv(tmp_path, row(1), name="contacts.csv")
    assert bi.main([path, "--db", str(tmp_path / "x.db")]) == 2
    assert "--exported-at" in capsys.readouterr().err
    assert bi.main([path, "--db", str(tmp_path / "x.db"), "--exported-at", "2026-10-21"]) == 0
    assert bi.main([path, "--exported-at", "21.10.2026"]) == 2
