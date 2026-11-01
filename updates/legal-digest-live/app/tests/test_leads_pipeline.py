import csv
import io
import sqlite3
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from digest import cli, config, export, reader, render
from digest.store import Item, Store

TODAY = date(2026, 10, 24)
POSTED = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


def vacancy(msg_id, title="Старший юрист в VK", channel="Закон.ру", channel_id=1, **kw):
    return Item(channel_id, msg_id, "vacancy", title, channel, f"https://t.me/c/{channel_id}/{msg_id}",
                None, None, None, POSTED, **kw)


class StoreLeadFieldsTests(unittest.TestCase):
    def test_new_fields_roundtrip(self):
        store = Store(":memory:")
        original = vacancy(1, company="Предметно", salary="от 250 тыс. руб.", work_format="гибрид",
                           contacts=("@hr_predmetno", "hr@predmetno.ru"), via_agency=True)
        store.add_item(original)
        self.assertEqual(store.pending_items(TODAY, 14), [original])

    def test_old_database_is_migrated_without_losing_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "old.sqlite3"
            db = sqlite3.connect(path)
            db.executescript("""
                CREATE TABLE channels (channel_id INTEGER PRIMARY KEY, title TEXT NOT NULL, last_msg_id INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE items (channel_id INTEGER NOT NULL, msg_id INTEGER NOT NULL, kind TEXT NOT NULL,
                    title TEXT NOT NULL, channel_title TEXT NOT NULL, link TEXT NOT NULL, event_date TEXT,
                    event_time TEXT, deadline TEXT, posted_at TEXT NOT NULL, sent_at TEXT,
                    PRIMARY KEY (channel_id, msg_id));
                INSERT INTO channels VALUES (7, 'Канал', 150);
                INSERT INTO items VALUES (7, 1, 'vacancy', 'Юрист в Сбер', 'Канал', 'https://t.me/c/7/1',
                    NULL, NULL, NULL, '2026-10-23T12:00:00+00:00', NULL);
            """)
            db.commit()
            db.close()
            store = Store(path)
            (item,) = store.pending_items(TODAY, 14)
            self.assertEqual((item.title, item.company, item.contacts, item.via_agency), ("Юрист в Сбер", None, (), False))
            self.assertEqual(store.last_msg_id(7), 150)
            Store(path)  # повторное открытие не должно падать на уже добавленных полях

    def test_meta(self):
        store = Store(":memory:")
        self.assertIsNone(store.get_meta("owner_id"))
        store.set_meta("owner_id", "1")
        store.set_meta("owner_id", "777")
        self.assertEqual(store.get_meta("owner_id"), "777")


class RenderLeadsTests(unittest.TestCase):
    def test_lead_card_agencies_separate_and_escaping(self):
        items = [
            vacancy(1, company="Legal & Co", salary="от 250 тыс. руб.", work_format="гибрид",
                    contacts=("@hr_anna", "hr@legal.ru", "https://hh.ru/vacancy/1")),
            vacancy(2, title="Юрист в агентстве", via_agency=True, contacts=("@recruiter",)),
        ]
        (text,) = render.build_digest(items, TODAY)
        self.assertIn("Всего: 2 (через агентства: 1)", text)
        self.assertLess(text.index("Горячие лиды"), text.index("Вакансии через агентства"))
        self.assertLess(text.index("Legal &amp; Co"), text.index("Вакансии через агентства"))
        self.assertIn("<b>Legal &amp; Co</b> · гибрид · от 250 тыс. руб.", text)
        self.assertIn("контакты: @hr_anna, hr@legal.ru\n", text)
        self.assertIn('🌐 В посте: <a href="https://hh.ru/vacancy/1">hh.ru/vacancy/1</a>', text)  # ссылка из контактов

    def test_duplicate_vacancy_shows_the_post_with_contacts(self):
        items = [
            vacancy(1, title="Старший юрист в VK", channel="Канал A", channel_id=1),
            vacancy(2, title="Старший юрист в VK", channel="Канал B", channel_id=2, contacts=("@hr_vk",), company="VK"),
        ]
        (text,) = render.build_digest(items, TODAY)
        self.assertIn("Всего: 1", text)
        self.assertIn("контакты: @hr_vk", text)
        self.assertIn("ещё постов: 1", text)

    def test_no_agency_section_when_there_are_none(self):
        (text,) = render.build_digest([vacancy(1)], TODAY)
        self.assertNotIn("через агентства", text)


class ExportTests(unittest.TestCase):
    def test_append_keeps_one_header_and_one_bom(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = vacancy(1, company="VK", salary="от 200 тыс.", contacts=("@hr_vk", "hr@vk.ru"), via_agency=False)
            second = vacancy(2, title="Юрист в агентстве", via_agency=True)
            export.export_items(Path(tmp), [first], today=TODAY)
            export.export_items(Path(tmp), [second], today=TODAY)
            raw = (Path(tmp) / "vacancies.csv").read_bytes()
            self.assertEqual(raw.count(b"\xef\xbb\xbf"), 1)
            self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
            rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
            self.assertEqual(rows[0], export.VACANCY_HEADER)
            self.assertEqual(rows[1][:10], ["2026-10-23", "Старший юрист в VK", "VK", "", "от 200 тыс.", "", "@hr_vk, hr@vk.ru",
                                            "работодатель", "Закон.ру", "https://t.me/c/1/1"])
            self.assertEqual(rows[1][11], "горячий")
            self.assertEqual(rows[1][13], "")  # колонку статуса заполняете вы
            self.assertEqual(rows[2][7], "агентство")
            self.assertEqual(len(rows), 3)

    def test_events_file_and_no_empty_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            export.export_items(Path(tmp), [vacancy(1)])
            self.assertFalse((Path(tmp) / "events.csv").exists())
            event = Item(1, 5, "event", "Вебинар по трудовому праву", "Закон.ру", "https://t.me/c/1/5",
                         date(2026, 10, 28), None, date(2026, 10, 27), POSTED)
            export.export_items(Path(tmp), [event])
            rows = list(csv.reader(io.StringIO((Path(tmp) / "events.csv").read_text(encoding="utf-8-sig"))))
            self.assertEqual(rows[1], ["2026-10-28", "", "Вебинар по трудовому праву", "", "", "", "", "", "2026-10-27", "",
                                       "Закон.ру", "https://t.me/c/1/5"])

    def test_formulas_from_posts_are_neutralized_but_handles_and_phones_are_not(self):
        self.assertEqual(export._cell('=HYPERLINK("http://evil","x")'), "'=HYPERLINK(\"http://evil\",\"x\")")
        self.assertEqual(export._cell("@SUM(A1)"), "'@SUM(A1)")
        self.assertEqual(export._cell("-SUM(A1)"), "'-SUM(A1)")
        self.assertEqual(export._cell("@hr_anna, hr@legal.ru"), "@hr_anna, hr@legal.ru")
        self.assertEqual(export._cell("+7 (999) 123-45-67"), "+7 (999) 123-45-67")
        self.assertEqual(export._cell(None), "")


class ChannelModesTests(unittest.TestCase):
    def load(self, text):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "channels.txt"
            path.write_text(text, encoding="utf-8")
            return config.load_channel_modes(path)

    def test_parsing_and_lookup(self):
        modes = self.load(
            "# комментарий\n\nevents: PROбанкротство\nAGENCY: To Hunt a Lawyer\n"
            "vacancies: Legal jobs: IP • IT • DP • LT\noff: @NoisyChannel\n"
        )
        self.assertEqual(config.channel_mode(modes, "ProБанкротство", None), "events")
        self.assertEqual(config.channel_mode(modes, "To Hunt a Lawyer", None), "agency")
        self.assertEqual(config.channel_mode(modes, "Legal jobs: IP • IT • DP • LT", None), "vacancies")
        self.assertEqual(config.channel_mode(modes, "Что угодно", "noisychannel"), "off")
        self.assertEqual(config.channel_mode(modes, "Другой канал", "other"), "all")

    def test_missing_file_means_everything_is_read(self):
        self.assertEqual(config.load_channel_modes(Path("/nonexistent/channels.txt")), {})

    def test_bad_lines_are_reported_with_the_line_number(self):
        for bad in ("events PROбанкротство", "sometimes: Канал", "events:"):
            with self.assertRaises(SystemExit) as ctx:
                self.load(f"all: Нормальный\n{bad}\n")
            self.assertIn("строка 2", str(ctx.exception), bad)


class FakeClient:
    def __init__(self, messages):
        self.messages = sorted(messages, key=lambda m: m.id, reverse=True)

    async def iter_messages(self, entity, min_id=0, limit=None):
        for message in self.messages[:limit]:
            if message.id > min_id:
                yield message

    async def get_me(self):
        return NS(id=777)


def post(msg_id, text, entities=None):
    return NS(id=msg_id, message=text, date=datetime.now(timezone.utc) - timedelta(hours=1), entities=entities)


SOURCE = reader.Source(id=42, title="Юридический клуб", username="legal_club", entity=NS())
LEGAL_VACANCY = ("Юридическая фирма «Предметно» ищет старшего юриста\nОбязанности: договоры\n"
                 "Условия: зарплата от 250 тыс. руб.\nРезюме: @hr_predmetno")
SMM_VACANCY = ("Компания ищет SMM-менеджера в команду\nОбязанности: соцсети\n"
               "Условия: зарплата от 80 тыс. руб.\nОтклик: @hr_smm")


class RunLeadsTests(unittest.IsolatedAsyncioTestCase):
    async def run_digest(self, messages, **overrides):
        sent = []

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield FakeClient(messages)

        async def fake_sources(_client, _folder):
            return [SOURCE]

        async def fake_deliver(_cfg, _client, texts):
            sent.extend(texts)

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        bot_token = overrides.pop("bot_token", None)
        cfg = config.Config(1, "hash", bot_token, None, "Мониторинг", 14, 14, (), (), Path(tmp.name), **overrides)
        with mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver):
            await cli.cmd_run(cfg, print_only=False)
        return "\n".join(sent), cfg

    def messages(self):
        day = date.today() + timedelta(days=3)
        return [post(1, LEGAL_VACANCY), post(2, SMM_VACANCY),
                post(3, f"Приглашаем на вебинар по трудовому праву {day:%d.%m} в 19:00. Регистрация открыта.")]

    async def test_only_legal_vacancies_by_default_with_lead_data_and_csv(self):
        text, cfg = await self.run_digest(self.messages())
        self.assertIn("Предметно", text)
        self.assertIn("контакты: @hr_predmetno", text)
        self.assertNotIn("SMM", text)
        self.assertIn("вебинар по трудовому праву", text)
        vacancies = (cfg.data_dir / "vacancies.csv").read_text(encoding="utf-8-sig")
        self.assertIn("Предметно", vacancies)
        self.assertNotIn("SMM", vacancies)
        self.assertIn("вебинар", (cfg.data_dir / "events.csv").read_text(encoding="utf-8-sig"))

    async def test_scope_all_keeps_non_legal_vacancies(self):
        text, _ = await self.run_digest(self.messages(), vacancy_scope="all")
        self.assertIn("SMM", text)
        self.assertIn("Предметно", text)

    async def test_mode_events_ignores_vacancies(self):
        text, _ = await self.run_digest(self.messages(), channel_modes={"юридический клуб": "events"})
        self.assertIn("вебинар", text)
        self.assertNotIn("Предметно", text)

    async def test_mode_agency_marks_vacancies_and_skips_events(self):
        text, _ = await self.run_digest(self.messages(), channel_modes={"@legal_club": "agency"})
        self.assertIn("Вакансии через агентства", text)
        self.assertNotIn("вебинар", text)

    async def test_mode_off_skips_the_channel(self):
        text, _ = await self.run_digest(self.messages(), channel_modes={"юридический клуб": "off"})
        self.assertIn("не нашлось", text)

    async def test_hidden_link_becomes_a_contact(self):
        entity = NS(url="https://hh.ru/vacancy/777", offset=0, length=5)
        text, _ = await self.run_digest([post(1, LEGAL_VACANCY, entities=[entity])])
        self.assertIn('🌐 В посте: <a href="https://hh.ru/vacancy/777">hh.ru/vacancy/777</a>', text)

    async def test_owner_is_remembered_when_a_bot_is_configured(self):
        _, cfg = await self.run_digest(self.messages(), bot_token="TOKEN")
        self.assertEqual(Store(cfg.db_path).get_meta("owner_id"), "777")


class FailureReportTests(unittest.TestCase):
    def cfg(self, tmp, **kw):
        return config.Config(1, "hash", kw.pop("bot_token", "TOKEN"), kw.pop("owner", None), "Мониторинг", 14, 14,
                             (), (), Path(tmp), **kw)

    def test_failure_is_reported_to_the_remembered_owner_with_escaping(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self.cfg(tmp)
            Store(cfg.db_path).set_meta("owner_id", "777")
            with mock.patch.object(cli.notify, "send_via_bot") as send:
                cli._report_failure(cfg, SystemExit("Вход в Telegram не выполнен <b>"))
            token, chat_id, texts = send.call_args.args
            self.assertEqual((token, chat_id), ("TOKEN", 777))
            self.assertIn("Дайджест не сформирован", texts[0])
            self.assertIn("Вход в Telegram не выполнен &lt;b&gt;", texts[0])

    def test_configured_owner_wins_over_remembered(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self.cfg(tmp, owner=555)
            with mock.patch.object(cli.notify, "send_via_bot") as send:
                cli._report_failure(cfg, RuntimeError("сбой"))
            self.assertEqual(send.call_args.args[1], 555)

    def test_silent_when_nobody_to_tell_and_never_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(cli.notify, "send_via_bot") as send:
                cli._report_failure(self.cfg(tmp), RuntimeError("нет владельца в базе"))
                cli._report_failure(self.cfg(tmp, bot_token=None, owner=1), RuntimeError("нет токена"))
                send.assert_not_called()
            with mock.patch.object(cli.notify, "send_via_bot", side_effect=RuntimeError("нет сети")):
                cli._report_failure(self.cfg(tmp, owner=1), RuntimeError("сбой"))  # не должно упасть

    def test_what_counts_as_a_failure(self):
        self.assertFalse(cli._is_failure(SystemExit(0)))
        self.assertFalse(cli._is_failure(SystemExit()))
        self.assertFalse(cli._is_failure(KeyboardInterrupt()))
        self.assertTrue(cli._is_failure(SystemExit("Вход не выполнен")))
        self.assertTrue(cli._is_failure(RuntimeError("сбой")))


if __name__ == "__main__":
    unittest.main()
