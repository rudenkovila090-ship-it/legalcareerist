import csv
import io
import sqlite3
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from digest import cli, config, export, reader, rules
from digest.store import Item, Store

TODAY = date(2026, 10, 24)
NEWS_TITLE_COLUMN = export.NEWS_HEADER.index("Заголовок")
POSTED = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


class EventCardFieldsTests(unittest.TestCase):
    EVENT = (
        "Вебинар: налоговые риски бизнеса\n30 октября, 15:00–16:30\nОнлайн, участие бесплатное\n"
        "Разберём налоговые претензии, субсидиарные риски и взаимодействие юридической службы с финансовым "
        "подразделением.\nДля налоговых юристов, инхаусов и руководителей юридических департаментов.\n"
        "Регистрация: https://example.com/reg"
    )

    def test_all_card_fields_from_one_post(self):
        m = rules.classify(self.EVENT, TODAY, "Закон.ру")
        self.assertEqual((m.kind, m.event_date, m.event_time, m.event_end), ("event", date(2026, 10, 30), time(15, 0), time(16, 30)))
        self.assertEqual(m.work_format, "онлайн")
        self.assertEqual(m.price, "Бесплатно, по регистрации")
        self.assertEqual(m.audience, ("инхаусам", "руководителям"))
        self.assertEqual(m.reg_url, "https://example.com/reg")
        self.assertTrue(m.topic.startswith("Разберём налоговые претензии"))
        self.assertNotIn("15:00", m.topic)

    def test_single_time_has_no_end(self):
        m = rules.classify("Семинар 28 октября в 19:00 по трудовому праву", TODAY)
        self.assertEqual((m.event_time, m.event_end), (time(19, 0), None))

    def test_price(self):
        self.assertEqual(rules.find_price("Участие бесплатное"), "Бесплатно")
        self.assertEqual(rules.find_price("Вход свободный, регистрация обязательна"), "Бесплатно, по регистрации")
        self.assertEqual(rules.find_price("Вход 5000 руб."), "5000 руб.")
        self.assertEqual(rules.find_price("Стоимость участия: 3 000 руб. для членов ассоциации"), "3 000 руб.")
        self.assertEqual(rules.find_price("Стоимость уточняйте у организаторов"), "Платно")
        self.assertIsNone(rules.find_price("Приглашаем на вебинар"))

    def test_format(self):
        self.assertEqual(rules.find_event_format("Онлайн в Zoom"), "онлайн")
        self.assertEqual(rules.find_event_format("Очно, адрес: ул. Тверская, 1"), "офлайн")
        self.assertEqual(rules.find_event_format("Мероприятие пройдёт в смешанном формате"), "гибрид")
        self.assertEqual(rules.find_event_format("Конференция в Москве с онлайн-трансляцией, метро Тверская"), "гибрид")
        self.assertIsNone(rules.find_event_format("Присылайте вопросы на адрес электронной почты"))
        self.assertIsNone(rules.find_event_format("Приглашаем на конференцию"))

    def test_city_takes_the_earliest_mention_and_handles_declensions(self):
        self.assertEqual(rules.find_city("Конференция в Санкт-Петербурге, потом в Москве"), "Санкт-Петербург")
        self.assertEqual(rules.find_city("Офис в Екатеринбурге"), "Екатеринбург")
        self.assertEqual(rules.find_city("Встреча в Нижнем Новгороде"), "Нижний Новгород")
        self.assertIsNone(rules.find_city("Работа удалённо"))

    def test_audience_tags(self):
        self.assertEqual(rules.find_audience("для адвокатов и студентов"), ("адвокатам", "студентам и начинающим"))
        self.assertEqual(rules.find_audience("для всех желающих"), ())

    def test_topic_skips_title_greeting_and_logistics_and_cuts_long_text(self):
        text = ("Друзья!\nВебинар по трудовому праву\n28 октября в 19:00\nРегистрация по ссылке\n"
                + "Обсудим споры об увольнении и доказательства по делу. " * 6)
        m = rules.classify(text, TODAY)
        self.assertLessEqual(len(m.topic), 201)
        self.assertTrue(m.topic.startswith("Обсудим споры об увольнении"))
        self.assertTrue(m.topic.endswith("."))

    def test_registration_link_can_be_hidden_behind_a_word(self):
        m = rules.classify("Вебинар по налогам 28 октября в 19:00. Регистрация по кнопке", TODAY, urls=(
            "https://t.me/channel/5", "https://reg.example.com/webinar"))
        self.assertEqual(m.reg_url, "https://reg.example.com/webinar")


class NewsTests(unittest.TestCase):
    def test_career_moves_appointments_launches_and_awards_with_a_named_person(self):
        for text, channel, subtype, person in (
            ("Денис Бушнев присоединился к Firm.One в качестве партнёра.", "РУЛЬФЫ, ИЛЬФЫ И ИНХАУСЫ", "Карьерный переход", "Денис Бушнев"),
            ("Игорь Краснов назначен председателем Верховного суда.", "Закон.ру", "Назначение", "Игорь Краснов"),
            ("Юрист Анна Иванова открыла собственную практику по банкротству.", "Закон.ру", "Открытие", "Анна Иванова"),
            ("Партнёр Мария Петрова награждена премией за вклад в юридическую профессию.", "Право.ru", "Награда", "Мария Петрова"),
        ):
            m = rules.classify(text, TODAY, channel, kinds=("news",))
            self.assertEqual((m.kind, m.subtype, m.people[0]), ("news", subtype, person), text)

    def test_no_person_or_no_legal_context_is_not_news(self):
        self.assertIsNone(rules.classify("Суд назначен на 5 ноября", TODAY, "Закон.ру", kinds=("news",)))
        self.assertIsNone(rules.classify("Иван Петров присоединился к команде ТехСтарт", TODAY, "Блог", kinds=("news",)))

    def test_channels_marked_news_do_not_need_legal_context(self):
        text = "Иван Петров присоединился к команде ТехСтарт"
        m = rules.classify(text, TODAY, "Блог", kinds=("news",), news_context_required=False)
        self.assertEqual((m.kind, m.people), ("news", ("Иван Петров",)))

    def test_event_announcement_with_a_speaker_stays_an_event(self):
        text = "Михаил Голованёв расскажет о налоговом ландшафте на вебинаре 29 октября в 18:10"
        self.assertEqual(rules.classify(text, TODAY, "Закон.ру").kind, "event")

    def test_long_articles_are_not_news(self):
        text = "Денис Бушнев присоединился к Firm.One партнёром. " + "Подробности рынка юристов. " * 100
        self.assertIsNone(rules.classify(text, TODAY, "Закон.ру", kinds=("news",)))

    def test_people_detection(self):
        self.assertEqual(rules.find_people("Сегодня Михаил Голованёв и Анна Иванова рассказали про рынок"),
                         ("Михаил Голованёв", "Анна Иванова"))
        self.assertEqual(rules.find_people("Голованёв Михаил возглавил практику"), ("Голованёв Михаил",))
        self.assertEqual(rules.find_people("Верховный Суд и Высшая Школа Права приняли решение"), ())
        self.assertEqual(rules.find_people("Анна Групп запустила проект"), ())


def event_item(msg_id, title, channel_id=1, day=date(2026, 10, 30), at=None, url=None, posted=POSTED):
    return Item(channel_id, msg_id, "event", title, f"Канал {channel_id}", f"https://t.me/c/{channel_id}/{msg_id}",
                day, at, None, posted, reg_url=url)


def vacancy_item(msg_id, title, company=None, contacts=(), channel_id=1, posted=POSTED):
    return Item(channel_id, msg_id, "vacancy", title, f"Канал {channel_id}", f"https://t.me/c/{channel_id}/{msg_id}",
                None, None, None, posted, company=company, contacts=contacts)


def news_item(msg_id, title, people, subtype="Карьерный переход", channel_id=1, posted=POSTED):
    return Item(channel_id, msg_id, "news", title, f"Канал {channel_id}", f"https://t.me/c/{channel_id}/{msg_id}",
                None, None, None, posted, subtype=subtype, people=people)


class DuplicateProtectionTests(unittest.TestCase):
    def store_with_sent(self, *items):
        store = Store(":memory:")
        for i in items:
            store.add_item(i)
        store.mark_sent(list(items))
        return store

    def test_event_same_registration_page_is_the_same_even_with_tracking_and_www(self):
        store = self.store_with_sent(event_item(1, "Вебинар: налоговые риски", url="https://example.com/reg?utm_source=tg"))
        again = event_item(2, "Совсем другой заголовок", channel_id=2, url="https://www.example.com/reg/")
        self.assertTrue(store.seen_before(again))

    def test_event_similar_title_same_day_is_a_duplicate_regardless_of_word_order(self):
        store = self.store_with_sent(event_item(1, "Вебинар: налоговые риски бизнеса"))
        self.assertTrue(store.seen_before(event_item(2, "Налоговые риски бизнеса — вебинар", channel_id=2)))

    def test_event_other_day_or_other_topic_is_not_a_duplicate(self):
        store = self.store_with_sent(event_item(1, "Вебинар: налоговые риски бизнеса", url="https://example.com/reg"))
        self.assertFalse(store.seen_before(event_item(2, "Вебинар: налоговые риски бизнеса", channel_id=2, day=date(2026, 11, 6),
                                                      url="https://example.com/reg")))
        self.assertFalse(store.seen_before(event_item(3, "Конференция по банкротству", channel_id=2)))

    def test_vacancy_same_company_and_similar_title_is_a_duplicate_other_company_is_not(self):
        store = self.store_with_sent(vacancy_item(1, "Старший юрист в VK", company="VK"))
        self.assertTrue(store.seen_before(vacancy_item(2, "Старший юрист в VK (Москва)", company="VK", channel_id=2)))
        self.assertFalse(store.seen_before(vacancy_item(3, "Старший юрист в VK", company="Сбер", channel_id=2)))

    def test_vacancy_without_company_needs_a_shared_contact_or_a_long_identical_title(self):
        store = self.store_with_sent(
            vacancy_item(1, "Юрист", contacts=("@hr_anna",)),
            vacancy_item(2, "Руководитель юридического отдела строительной компании"),
        )
        self.assertFalse(store.seen_before(vacancy_item(3, "Юрист", channel_id=2)))  # общее название, контакта нет
        self.assertTrue(store.seen_before(vacancy_item(4, "Юрист", contacts=("@hr_anna",), channel_id=2)))
        self.assertTrue(store.seen_before(vacancy_item(5, "Руководитель юридического отдела строительной компании", channel_id=2)))

    def test_news_same_person_and_type_within_two_weeks(self):
        store = self.store_with_sent(news_item(1, "Денис Бушнев присоединился к Firm.One", ("Денис Бушнев",)))
        self.assertTrue(store.seen_before(news_item(2, "Бушнев Денис теперь партнёр Firm.One", ("Денис Бушнев",), channel_id=2)))
        self.assertFalse(store.seen_before(news_item(3, "Анна Иванова присоединилась к Firm.One", ("Анна Иванова",), channel_id=2)))
        self.assertFalse(store.seen_before(news_item(4, "Денис Бушнев награждён премией", ("Денис Бушнев",), subtype="Награда",
                                                     channel_id=2, posted=POSTED + timedelta(days=1))))
        long_after = POSTED + timedelta(days=20)
        self.assertFalse(store.seen_before(news_item(5, "Денис Бушнев присоединился к другой фирме", ("Денис Бушнев",),
                                                     channel_id=2, posted=long_after)))

    def test_not_yet_sent_items_and_the_item_itself_do_not_count(self):
        store = Store(":memory:")
        first = event_item(1, "Вебинар: налоговые риски бизнеса")
        store.add_item(first)  # ещё не отправлено: склеится при сборке сводки
        self.assertFalse(store.seen_before(event_item(2, "Вебинар: налоговые риски бизнеса", channel_id=2)))
        store.mark_sent([first])
        self.assertFalse(store.seen_before(first))


class MigrationAndExportTests(unittest.TestCase):
    def test_database_from_the_previous_version_is_migrated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "v06.sqlite3"
            db = sqlite3.connect(path)
            db.executescript("""
                CREATE TABLE channels (channel_id INTEGER PRIMARY KEY, title TEXT NOT NULL, last_msg_id INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE items (channel_id INTEGER NOT NULL, msg_id INTEGER NOT NULL, kind TEXT NOT NULL,
                    title TEXT NOT NULL, channel_title TEXT NOT NULL, link TEXT NOT NULL, event_date TEXT,
                    event_time TEXT, deadline TEXT, posted_at TEXT NOT NULL, sent_at TEXT, company TEXT, salary TEXT,
                    work_format TEXT, contacts TEXT, via_agency INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (channel_id, msg_id));
                INSERT INTO items VALUES (7, 1, 'vacancy', 'Юрист в Сбер', 'Канал', 'https://t.me/c/7/1', NULL, NULL, NULL,
                    '2026-10-23T12:00:00+00:00', NULL, 'Сбер', 'от 200 тыс.', 'гибрид', '["@hr"]', 0);
            """)
            db.commit()
            db.close()
            store = Store(path)
            (item,) = store.pending_items(TODAY, 14)
            self.assertEqual((item.company, item.contacts, item.city, item.people, item.audience), ("Сбер", ("@hr",), None, (), ()))
            store.add_item(news_item(2, "Новость", ("Анна Иванова",)))  # новые колонки доступны для записи

    def test_new_fields_roundtrip(self):
        store = Store(":memory:")
        original = Item(1, 1, "event", "Вебинар", "Канал", "https://t.me/c/1/1", date(2026, 10, 30), time(15, 0), None, POSTED,
                        work_format="онлайн", event_end=time(16, 30), city="Москва", price="Бесплатно",
                        audience=("инхаусам",), topic="О налогах", reg_url="https://example.com/reg")
        store.add_item(original)
        self.assertEqual(store.pending_items(TODAY, 14), [original])

    def test_old_format_csv_is_set_aside_and_a_new_one_started(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = Path(tmp) / "vacancies.csv"
            old.write_text("Дата поста,Должность,Компания,Зарплата\n2026-10-20,Юрист,VK,200\n", encoding="utf-8-sig")
            export.export_items(Path(tmp), [vacancy_item(1, "Юрист в Сбер", company="Сбер")])
            kept = [p for p in Path(tmp).iterdir() if "старый-формат" in p.name]
            self.assertEqual(len(kept), 1)
            self.assertIn("VK", kept[0].read_text(encoding="utf-8-sig"))
            rows = list(csv.reader(io.StringIO(old.read_text(encoding="utf-8-sig"))))
            self.assertEqual(rows[0], export.VACANCY_HEADER)
            self.assertEqual(len(rows), 2)

    def test_columns_added_by_the_user_on_the_right_do_not_trigger_rotation(self):
        with tempfile.TemporaryDirectory() as tmp:
            export.export_items(Path(tmp), [vacancy_item(1, "Юрист в Сбер", company="Сбер")])
            path = Path(tmp) / "vacancies.csv"
            last = export.VACANCY_HEADER[-1]
            content = path.read_text(encoding="utf-8-sig")
            self.assertEqual(content.count(f"{last}\n"), 1)  # шапка заканчивается нашей колонкой
            path.write_text(content.replace(f"{last}\n", f"{last},Мои заметки\n", 1), encoding="utf-8-sig")
            export.export_items(Path(tmp), [vacancy_item(2, "Юрист в VK", company="VK")])
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ["vacancies.csv"])
            self.assertEqual(len(list(csv.reader(io.StringIO(path.read_text(encoding="utf-8-sig"))))), 3)

    def test_news_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            export.export_items(Path(tmp), [news_item(1, "Денис Бушнев присоединился к Firm.One", ("Денис Бушнев",))])
            rows = list(csv.reader(io.StringIO((Path(tmp) / "news.csv").read_text(encoding="utf-8-sig"))))
            self.assertEqual(rows[0], export.NEWS_HEADER)
            self.assertEqual(rows[1][:3], ["2026-10-23", "Карьерный переход", "Денис Бушнев"])
            self.assertEqual(rows[1][NEWS_TITLE_COLUMN], "Денис Бушнев присоединился к Firm.One")

    def test_news_mode_in_channels_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "channels.txt"
            path.write_text("news: Люди рынка\n", encoding="utf-8")
            modes = config.load_channel_modes(path)
            self.assertEqual(config.channel_mode(modes, "Люди рынка", None), "news")


class MultiClient:
    def __init__(self, by_source):
        self.by_source = by_source

    async def iter_messages(self, entity, min_id=0, limit=None):
        for message in sorted(self.by_source[entity.sid], key=lambda m: m.id, reverse=True)[:limit]:
            if message.id > min_id:
                yield message

    async def get_me(self):
        return NS(id=777)


def post(msg_id, text, age_days=0.0):
    return NS(id=msg_id, message=text, entities=None,
              date=datetime.now(timezone.utc) - timedelta(days=age_days, hours=1))


def source(sid, title, username=None):
    return reader.Source(id=sid, title=title, username=username or f"chan_{sid}", entity=NS(sid=sid))


class RunV07Tests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)

    def cfg(self, **kw):
        return config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), self.tmp, **kw)

    async def run_day(self, sources, by_source, **cfg_kw):
        sent = []

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield MultiClient(by_source)

        async def fake_sources(_client, _folder):
            return sources

        async def fake_deliver(_cfg, _client, texts):
            sent.extend(texts)

        with mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver):
            await cli.cmd_run(self.cfg(**cfg_kw), print_only=False)
        return "\n".join(sent), len(sent)

    def webinar(self, link, extra=""):
        day = date.today() + timedelta(days=3)
        return (f"Вебинар по трудовому праву {day:%d.%m} в 19:00. {extra}Регистрация: {link}\n"
                "Разберём споры об увольнении и доказательства по трудовым делам на практике.")

    async def test_the_same_webinar_from_another_channel_the_next_day_is_not_sent_again(self):
        a, b = source(1, "Канал А"), source(2, "Канал Б")
        first, _ = await self.run_day([a, b], {1: [post(1, self.webinar("https://x.io/reg"))], 2: []})
        self.assertIn("Вебинар по трудовому праву", first)
        second, count = await self.run_day(
            [a, b], {1: [], 2: [post(1, self.webinar("https://www.x.io/reg/?utm_source=tg", "Ждём вас! "))]}
        )
        self.assertNotIn("Вебинар по трудовому праву", second)
        self.assertIn("не нашлось", second)
        self.assertEqual(count, 1)

    async def test_news_section_is_separate_and_stale_news_is_skipped(self):
        fresh = post(1, "Денис Бушнев присоединился к Firm.One в качестве партнёра юридической практики.")
        stale = post(2, "Игорь Краснов назначен председателем Верховного суда.", age_days=10)
        text, count = await self.run_day([source(1, "Закон.ру")], {1: [fresh, stale]})
        self.assertEqual(count, 1)
        self.assertIn("Новости юридического рынка", text)
        self.assertIn("Карьерный переход", text)
        self.assertIn("Денис Бушнев", text)
        self.assertNotIn("Краснов", text)

    async def test_channel_modes_control_news(self):
        message = post(1, "Иван Петров присоединился к команде ТехСтарт")
        in_all, _ = await self.run_day([source(1, "Блог")], {1: [message]})
        self.assertIn("не нашлось", in_all)
        tmp2 = tempfile.TemporaryDirectory()
        self.addCleanup(tmp2.cleanup)
        self.tmp = Path(tmp2.name)
        in_news, _ = await self.run_day([source(1, "Блог")], {1: [message]}, channel_modes={"блог": "news"})
        self.assertIn("Иван Петров", in_news)
        tmp3 = tempfile.TemporaryDirectory()
        self.addCleanup(tmp3.cleanup)
        self.tmp = Path(tmp3.name)
        in_events, _ = await self.run_day([source(1, "Блог")], {1: [message]}, channel_modes={"блог": "events"})
        self.assertNotIn("Иван Петров", in_events)

    async def test_vacancy_card_has_position_city_and_contact_in_its_own_message(self):
        vacancy = post(1, "Юридическая фирма «Предметно» ищет старшего юриста в Екатеринбурге\n"
                          "Обязанности: договоры\nУсловия: зарплата от 250 тыс. руб.\nРезюме: @hr_predmetno")
        text, count = await self.run_day([source(1, "Закон.ру")], {1: [vacancy]})
        self.assertEqual(count, 1)
        self.assertIn("Вакансии ·", text)
        self.assertIn("<b>Предметно</b> · Екатеринбург", text)
        self.assertIn("контакты: @hr_predmetno", text)


if __name__ == "__main__":
    unittest.main()
