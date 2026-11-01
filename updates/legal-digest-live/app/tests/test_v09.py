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

from digest import cli, config, export, reader, render, rules
from digest.store import Item, Store

TODAY = date(2026, 10, 28)
POSTED = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


class PeopleTests(unittest.TestCase):
    def test_names_in_any_case_come_back_in_the_nominative(self):
        for text, expected in (
            ("Назначение Ольги Романовой партнёром", ("Ольга Романова",)),
            ("Поздравляем Анну Петрову с наградой", ("Анна Петрова",)),
            ("Ивану Петрову вручили награду", ("Иван Петров",)),
            ("Павла Орлова назначили руководителем", ("Павел Орлов",)),
            ("Голованёв Михаил возглавил практику", ("Голованёв Михаил",)),
            ("Иван Петров перешёл в фирму", ("Иван Петров",)),
        ):
            self.assertEqual(rules.find_people(text), expected, text)

    def test_places_organisations_and_ordinary_words_are_not_people(self):
        for text in ("Верховный Суд и Высшая Школа Права", "Анна Групп запустила проект", "Нижний Новгород"):
            self.assertEqual(rules.find_people(text), (), text)


class NewsDetailsTests(unittest.TestCase):
    def news(self, text, channel="Закон.ру"):
        m = rules.classify(text, TODAY, channel)
        self.assertEqual(m.kind, "news", text)
        return m

    def test_who_moved_from_where_to_where_and_in_what_role(self):
        m = self.news("Иван Петров присоединился к команде Пепеляев Групп в качестве партнёра. Ранее он работал в Dentons.")
        self.assertEqual((m.subtype, m.people, m.company, m.origin, m.role),
                         ("Карьерный переход", ("Иван Петров",), "Пепеляев Групп", "Dentons", "партнёр"))

    def test_move_with_quoted_company_names(self):
        m = self.news("Анна Иванова перешла из Dentons в «Сбер»: возглавила юридический департамент.")
        self.assertEqual((m.company, m.origin), ("Сбер", "Dentons"))

    def test_new_role_is_the_one_named_after_the_move_verb(self):
        m = self.news("Мария Лебедева, ранее руководитель юридического департамента «Сбер», перешла в «Яндекс» "
                      "на должность директора по правовым вопросам.")
        self.assertEqual((m.company, m.origin, m.role), ("Яндекс", "Сбер", "директор по правовым вопросам"))

    def test_firm_that_gained_a_person(self):
        m = self.news("Юридическая фирма Goltsblat BLP пополнила команду: к практике присоединился Михаил Соколов, старший юрист.")
        self.assertEqual((m.company, m.role, m.people), ("Goltsblat BLP", "старший юрист", ("Михаил Соколов",)))

    def test_appointment_phrased_as_a_noun_and_in_the_genitive(self):
        m = self.news("Юридическая фирма «Инфралекс» объявила о назначении Ольги Романовой партнёром практики разрешения споров.",
                      "Legal")
        self.assertEqual((m.subtype, m.people, m.company, m.role), ("Назначение", ("Ольга Романова",), "Инфралекс", "партнёр"))

    def test_court_ordering_something_is_not_an_appointment(self):
        self.assertIsNone(rules.classify("Суд назначил Ивану Петрову штраф за нарушение закона.", TODAY, "Закон.ру", kinds=("news",)))

    def test_award_names_the_ranking_and_nomination(self):
        m = self.news("Алексей Громов награждён Chambers Europe в номинации «Разрешение споров».", "Право.ru")
        self.assertEqual((m.subtype, m.place), ("Награда", "Chambers Europe, номинация «Разрешение споров»"))

    def test_new_office_head(self):
        m = self.news("Адвокатское бюро КИАП открыло новый офис в Казани. Офис возглавит Сергей Власов.", "Legal")
        self.assertEqual((m.company, m.role, m.people), ("КИАП", "руководитель офиса", ("Сергей Власов",)))


class LawTests(unittest.TestCase):
    def law(self, text, channel="Право.ru"):
        m = rules.classify(text, TODAY, channel)
        self.assertIsNotNone(m, text)
        self.assertEqual(m.kind, "law", text)
        return m

    def test_labor_court_practice_with_case_number(self):
        m = self.law("Верховный суд указал, что работодатель обязан выплатить зарплату за время вынужденного прогула. "
                     "Определение № 305-ЭС24-1234 разъясняет практику по трудовым спорам об увольнении.")
        self.assertEqual((m.subtype, m.place, m.doc_ref), ("Судебная практика", "Верховный суд РФ", "305-ЭС24-1234"))

    def test_plenum_on_labor_law(self):
        m = self.law("Пленум ВС РФ принял постановление о применении трудового законодательства: отпуск, сверхурочные и зарплата.")
        self.assertEqual((m.subtype, m.place), ("Судебная практика", "Пленум ВС РФ"))

    def test_the_first_named_thing_decides_the_type(self):
        m = self.law("Верховный суд разъяснил, как работодателю применять закон о сверхурочной работе, принятый в этом году.")
        self.assertEqual(m.subtype, "Судебная практика")

    def test_law_with_number_and_date_it_comes_into_force(self):
        m = self.law("Госдума приняла закон о маркировке рекламы. Федеральный закон № 63-ФЗ вступает в силу с 1 января 2027 года.")
        self.assertEqual((m.subtype, m.place, m.doc_ref, m.event_date), ("Закон", "Госдума", "63-ФЗ", date(2027, 1, 1)))

    def test_date_of_adoption_in_the_reference_is_not_the_date_of_entry_into_force(self):
        m = self.law("Подписан федеральный закон от 28.12.2026 № 612-ФЗ о платформенной экономике. Он вступает в силу с 1 марта 2027 года.")
        self.assertEqual(m.event_date, date(2027, 3, 1))

    def test_bill(self):
        m = self.law("В Госдуму внесён законопроект о страховании ответственности адвокатов.")
        self.assertEqual((m.subtype, m.place), ("Законопроект", "Госдума"))

    def test_agency_clarification(self):
        m = self.law("ФНС разъяснила порядок уплаты НДС для маркетплейсов. Письмо ФНС от 10.10.2026.")
        self.assertEqual((m.subtype, m.place), ("Разъяснение ведомства", "ФНС"))

    def test_president_signs_a_law(self):
        m = self.law("Президент подписал закон о запрете рекламы у иноагентов.")
        self.assertEqual((m.subtype, m.place), ("Закон", "Президент РФ"))

    def test_ads_giveaways_and_bare_mentions_are_not_law(self):
        for text in (
            "Скидка 30% на курс по судебной практике ВС РФ! Записывайтесь до конца недели",
            "Розыгрыш: выиграйте книгу по ГК РФ! Подписывайтесь и участвуйте",
            "Как выбрать юриста: 5 советов",
            "Центробанк повысил ключевую ставку до 18%. Курс доллара вырос.",
            "Суд в Москве признал договор недействительным. Истец заявил, что ответчик нарушил условия.",
            "В статье разбираем закон о защите прав потребителей на простых примерах из жизни.",
        ):
            self.assertIsNone(rules.classify(text, TODAY, "Право.ru"), text)

    def test_very_long_texts_are_not_law_news(self):
        self.assertIsNone(rules.classify("Верховный суд разъяснил порядок взыскания. " + "Подробности. " * 400, TODAY, "Право.ru"))

    def test_vacancy_and_event_win_over_law(self):
        vacancy = ("Ищем юриста в отдел судебной практики. Верховный суд, арбитражные споры. "
                   "Условия: офис, зарплата от 200 000. Резюме: hr@firm.ru")
        self.assertEqual(rules.classify(vacancy, TODAY, "Работа юристам").kind, "vacancy")
        event = "Приглашаем на вебинар по новому закону о маркировке рекламы 5 ноября в 18:00. Регистрация: https://example.com/r"
        self.assertEqual(rules.classify(event, TODAY, "Право.ru").kind, "event")

    def test_personal_career_news_wins_over_law(self):
        m = rules.classify("Игорь Краснов назначен председателем Верховного суда.", TODAY, "Закон.ру")
        self.assertEqual((m.kind, m.subtype), ("news", "Назначение"))

    def test_only_asked_kinds_are_searched(self):
        text = "Верховный суд разъяснил: работодатель обязан выплатить компенсацию при незаконном увольнении сотрудника."
        self.assertEqual(rules.classify(text, TODAY, kinds=("law",)).kind, "law")
        self.assertIsNone(rules.classify(text, TODAY, kinds=("event", "vacancy", "news")))

    def test_law_mode_is_known_to_the_channels_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "channels.txt"
            path.write_text("law: Налоговый вестник\n", encoding="utf-8")
            modes = config.load_channel_modes(path)
            self.assertEqual(config.channel_mode(modes, "Налоговый вестник", None), "law")
        self.assertEqual(cli.KINDS_BY_MODE["law"], ("law",))
        self.assertIn("law", cli.KINDS_BY_MODE["all"])


def news_item(msg_id, title, people, subtype="Карьерный переход", channel_id=1, posted=POSTED, **kw):
    return Item(channel_id, msg_id, "news", title, f"Канал {channel_id}", f"https://t.me/c/{channel_id}/{msg_id}",
                None, None, None, posted, subtype=subtype, people=people, **kw)


def law_item(msg_id, title, subtype="Закон", channel_id=1, posted=POSTED, **kw):
    return Item(channel_id, msg_id, "law", title, f"Канал {channel_id}", f"https://t.me/c/{channel_id}/{msg_id}",
                kw.pop("event_date", None), None, None, posted, subtype=subtype, **kw)


class StoreTests(unittest.TestCase):
    def store_with_sent(self, *items):
        store = Store(":memory:")
        for i in items:
            store.add_item(i)
        store.mark_sent(list(items))
        return store

    def test_new_fields_survive_a_round_trip(self):
        store = Store(":memory:")
        item = news_item(1, "Иван Петров перешёл", ("Иван Петров",), company="Пепеляев Групп", origin="Dentons",
                         role="партнёр", place="Chambers Europe")
        law = law_item(2, "Закон о рекламе", doc_ref="63-ФЗ", place="Госдума", event_date=date(2027, 1, 1))
        store.add_item(item)
        store.add_item(law)
        got = {i.msg_id: i for i in store.pending_items(TODAY, 14)}
        self.assertEqual((got[1].company, got[1].origin, got[1].role, got[1].place),
                         ("Пепеляев Групп", "Dentons", "партнёр", "Chambers Europe"))
        self.assertEqual((got[2].doc_ref, got[2].place, got[2].event_date), ("63-ФЗ", "Госдума", date(2027, 1, 1)))

    def test_a_database_from_the_previous_version_is_upgraded(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "old.sqlite3"
            db = sqlite3.connect(path)
            db.executescript(
                "CREATE TABLE items (channel_id INTEGER NOT NULL, msg_id INTEGER NOT NULL, kind TEXT NOT NULL, "
                "title TEXT NOT NULL, channel_title TEXT NOT NULL, link TEXT NOT NULL, event_date TEXT, event_time TEXT, "
                "deadline TEXT, posted_at TEXT NOT NULL, sent_at TEXT, company TEXT, salary TEXT, work_format TEXT, "
                "contacts TEXT, via_agency INTEGER NOT NULL DEFAULT 0, event_end TEXT, city TEXT, price TEXT, "
                "audience TEXT, topic TEXT, reg_url TEXT, subtype TEXT, people TEXT, quote TEXT, "
                "PRIMARY KEY (channel_id, msg_id));"
                "INSERT INTO items (channel_id, msg_id, kind, title, channel_title, link, posted_at, sent_at) VALUES "
                "(1, 1, 'vacancy', 'Старая вакансия', 'Канал', 'https://t.me/c/1/1', '2026-10-20T10:00:00+00:00', NULL),"
                "(1, 2, 'news', 'Новость по старым правилам', 'Канал', 'https://t.me/c/1/2', '2026-10-20T10:00:00+00:00', NULL),"
                "(1, 3, 'law', 'Закон по старым правилам', 'Канал', 'https://t.me/c/1/3', '2026-10-20T10:00:00+00:00', NULL),"
                "(1, 4, 'news', 'Уже присланная новость', 'Канал', 'https://t.me/c/1/4', '2026-10-20T10:00:00+00:00', '2026-10-21T09:00:00');"
            )
            db.commit()
            db.close()
            store = Store(path)  # старая таблица с лишним столбцом quote не мешает
            # Неотправленные новости и законы, найденные по старым правилам, один раз убраны; вакансия и присланное целы.
            self.assertEqual([i.title for i in store.pending_items(TODAY, 14)], ["Старая вакансия"])
            kept = store.db.execute("SELECT title FROM items WHERE sent_at IS NOT NULL").fetchall()
            self.assertEqual(kept, [("Уже присланная новость",)])
            store.add_item(law_item(5, "Закон по новым правилам", doc_ref="63-ФЗ"))
            store.close()
            self.assertEqual(len(Store(path).pending_items(TODAY, 14)), 2)  # повторное открытие ничего не удаляет

    def test_the_same_law_from_another_channel_is_a_duplicate(self):
        store = self.store_with_sent(law_item(1, "Госдума приняла закон о маркировке рекламы", doc_ref="63-ФЗ"))
        again = law_item(2, "Принят закон о маркировке рекламы: что меняется", doc_ref="63-ФЗ", channel_id=2)
        self.assertTrue(store.seen_before(again))

    def test_two_different_laws_are_not_duplicates(self):
        store = self.store_with_sent(law_item(1, "Госдума приняла закон о маркировке рекламы", doc_ref="63-ФЗ"))
        other = law_item(2, "Правительство продлило мораторий на проверки бизнеса", doc_ref="44-ФЗ", channel_id=2)
        self.assertFalse(store.seen_before(other))

    def test_the_same_career_move_is_still_one_story(self):
        store = self.store_with_sent(news_item(1, "Иван Петров перешёл в Dentons", ("Иван Петров",)))
        self.assertTrue(store.seen_before(news_item(2, "Теперь Иван Петров работает в Dentons", ("Иван Петров",), channel_id=2)))


class RenderTests(unittest.TestCase):
    def test_four_sections_each_in_its_own_message(self):
        event = Item(1, 1, "event", "Вебинар по налогам", "Канал 1", "https://t.me/c/1/1", date(2026, 10, 30), None, None, POSTED)
        vacancy = Item(1, 2, "vacancy", "Юрист в Сбер", "Канал 1", "https://t.me/c/1/2", None, None, None, POSTED, company="Сбер")
        messages = render.build_digest([event, vacancy, news_item(3, "Иван Петров перешёл", ("Иван Петров",)),
                                        law_item(4, "Закон о рекламе")], TODAY)
        self.assertEqual(len(messages), 4)
        for message, header in zip(messages, ("Мероприятия", "Вакансии", "Новости юридического рынка", "Законодательство и судебная практика")):
            self.assertTrue(message.startswith(f"<b>{header} · 28.10.2026</b>"), message[:60])

    def test_move_card_shows_who_from_where_to_where_and_role(self):
        item = news_item(1, "Иван Петров присоединился к Пепеляев Групп", ("Иван Петров",), company="Пепеляев Групп",
                         origin="Dentons", role="партнёр")
        (text,) = render.build_digest([item], TODAY)
        self.assertIn("<b>Карьерные переходы и назначения</b>", text)
        self.assertIn("<b>Карьерный переход</b> — Иван Петров", text)
        self.assertIn("Переход: Dentons → <b>Пепеляев Групп</b>", text)
        self.assertIn("Должность: партнёр", text)
        self.assertIn('<a href="https://t.me/c/1/1">Иван Петров присоединился к Пепеляев Групп</a>', text)

    def test_law_card_shows_type_body_document_date_and_source(self):
        item = law_item(1, "Принят закон о маркировке рекламы", place="Госдума", doc_ref="63-ФЗ", event_date=date(2027, 1, 1),
                        topic="Вводится обязательная маркировка.", reg_url="https://example.com/doc")
        (text,) = render.build_digest([item], TODAY)
        self.assertIn("<b>Законы и законопроекты</b>", text)
        self.assertIn("<b>Закон</b> — Госдума · 63-ФЗ", text)
        self.assertIn("⏳ Вступает в силу: 01.01.2027", text)
        self.assertIn("Вводится обязательная маркировка.", text)
        self.assertIn('🌐 В посте: <a href="https://example.com/doc">example.com/doc</a>', text)  # источник из старой записи

    def test_a_law_already_in_force_says_so(self):
        (text,) = render.build_digest([law_item(1, "Закон", event_date=date(2026, 10, 1))], TODAY)
        self.assertIn("Вступил(а) в силу: 01.10.2026", text)

    def test_update_header_and_empty_text(self):
        vacancy = Item(1, 2, "vacancy", "Юрист в Сбер", "Канал 1", "https://t.me/c/1/2", None, None, None, POSTED)
        (text,) = render.build_digest([vacancy], TODAY, update=True)
        self.assertIn("<b>Вакансии · 28.10.2026 · обновление</b>", text)
        (empty,) = render.build_digest([], TODAY)
        self.assertIn("не нашлось", empty)
        self.assertIn("законодательств", empty)

    def test_html_in_law_fields_is_escaped(self):
        (text,) = render.build_digest([law_item(1, "A <b> & B", place="<Орган>")], TODAY)
        self.assertIn("A &lt;b&gt; &amp; B", text)
        self.assertIn("&lt;Орган&gt;", text)


class RenderNewsTests(unittest.TestCase):
    def test_award_card_names_the_award(self):
        item = news_item(1, "Алексей Громов награждён", ("Алексей Громов",), subtype="Награда", place="Chambers Europe")
        (text,) = render.build_digest([item], TODAY)
        self.assertIn("Награда: Chambers Europe", text)
        self.assertIn("<b>Награды и рейтинги</b>", text)

    def test_promotion_and_demotion_are_career_news_grouped_with_moves(self):
        up = news_item(1, "Иван Петров повышен до партнёра", ("Иван Петров",), subtype="Повышение", role="партнёр")
        down = news_item(2, "Анна Орлова понижена до старшего юриста", ("Анна Орлова",), subtype="Понижение",
                         role="старший юрист", channel_id=2)
        (text,) = render.build_digest([up, down], TODAY)
        self.assertEqual(text.count("Карьерные переходы и назначения"), 1)
        self.assertIn("<b>Повышение</b> — Иван Петров", text)
        self.assertIn("<b>Понижение</b> — Анна Орлова", text)
        self.assertIn("Должность: старший юрист", text)

    def test_career_moves_come_before_awards_and_new_practices(self):
        award = news_item(1, "Награда", ("Елена Орлова",), subtype="Награда", place="Legal 500", posted=POSTED + timedelta(hours=5))
        move = news_item(2, "Переход", ("Иван Петров",), channel_id=2)
        (text,) = render.build_digest([award, move], TODAY)
        self.assertLess(text.index("Иван Петров"), text.index("Елена Орлова"))

    def test_court_practice_comes_before_laws_under_its_own_labor_heading(self):
        court = law_item(1, "Определение ВС", subtype="Судебная практика", place="Верховный суд РФ", channel_id=2)
        law = law_item(2, "Закон", posted=POSTED + timedelta(hours=5))
        (text,) = render.build_digest([law, court], TODAY)
        self.assertIn("Судебная практика: трудовые споры", text)
        self.assertLess(text.index("Судебная практика"), text.index("Законы и законопроекты"))


class ExportTests(unittest.TestCase):
    def read(self, tmp, name):
        return list(csv.reader(io.StringIO((Path(tmp) / name).read_text(encoding="utf-8-sig"))))

    def test_news_csv_has_the_career_columns(self):
        item = news_item(1, "Иван Петров присоединился к Пепеляев Групп", ("Иван Петров",), company="Пепеляев Групп",
                         origin="Dentons", role="партнёр", place="Chambers Europe")
        with tempfile.TemporaryDirectory() as tmp:
            export.export_items(Path(tmp), [item])
            header, row = self.read(tmp, "news.csv")
            record = dict(zip(header, row))
            self.assertEqual(
                (record["Люди"], record["Должность"], record["Компания (куда)"], record["Откуда"], record["Награда"]),
                ("Иван Петров", "партнёр", "Пепеляев Групп", "Dentons", "Chambers Europe"),
            )
            self.assertNotIn("Что сказал", header)

    def test_law_csv(self):
        item = law_item(1, "Закон о рекламе", place="Госдума", doc_ref="63-ФЗ", event_date=date(2027, 1, 1), reg_url="https://e.com/d")
        with tempfile.TemporaryDirectory() as tmp:
            export.export_items(Path(tmp), [item])
            header, row = self.read(tmp, "law.csv")
            self.assertEqual(header, export.LAW_HEADER)
            record = dict(zip(header, row))
            self.assertEqual((record["Тип"], record["Орган / суд"], record["Документ / дело"], record["Вступает в силу"]),
                             ("Закон", "Госдума", "63-ФЗ", "2027-01-01"))


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


VACANCY = "#вакансия\nЮрист в корпоративную практику\nУсловия: зарплата от 150 000\nРезюме: @hr_firm"
COURT = "Верховный суд разъяснил: работодатель обязан выплатить компенсацию при незаконном увольнении сотрудника."
MOVE = "Иван Петров присоединился к команде Пепеляев Групп в качестве партнёра юридической практики."


class AutoRunTests(unittest.IsolatedAsyncioTestCase):
    """Расписание: утром приходит всё, днём после утренней сводки только новые вакансии (и тишина, если их нет)."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.by_source = {1: []}

    def add(self, msg_id, text):
        self.by_source[1].append(post(msg_id, text))

    async def run_at(self, hour, auto=True, rescan_days=0):
        sent = []

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield MultiClient(self.by_source)

        async def fake_sources(_client, _folder):
            return [reader.Source(id=1, title="Закон.ру", username="zakon", entity=NS(sid=1))]

        async def fake_deliver(_cfg, _client, texts):
            sent.extend(texts)

        now = datetime.now().replace(hour=hour, minute=0, second=0, microsecond=0)
        cfg = config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), self.tmp)
        with mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver), \
                mock.patch.object(cli, "_now", lambda: now):
            await cli.cmd_run(cfg, print_only=False, auto=auto, rescan_days=rescan_days)
        return sent

    async def test_morning_sends_everything_and_afternoon_only_new_vacancies(self):
        self.add(1, VACANCY)
        self.add(2, COURT)
        morning = await self.run_at(9)
        self.assertEqual(len(morning), 2)  # вакансии и судебная практика, каждое отдельным сообщением
        self.assertIn("Вакансии", "\n".join(morning))
        self.assertIn("Судебная практика", "\n".join(morning))

        self.add(3, "#вакансия\nСтарший юрист в налоговую практику\nУсловия: зарплата от 250 000\nРезюме: @hr_tax")
        self.add(4, MOVE)  # новость о человеке днём не отправляется, ждёт утра
        afternoon = await self.run_at(15)
        self.assertEqual(len(afternoon), 1)
        text = afternoon[0]
        self.assertIn("обновление", text)
        self.assertIn("Старший юрист в налоговую практику", text)
        self.assertNotIn("Юрист в корпоративную практику", text)  # утренняя вакансия не повторяется
        self.assertNotIn("Иван Петров", text)

        next_morning = await self.run_at(9)
        self.assertIn("Иван Петров", "\n".join(next_morning))  # отложенная новость пришла в следующей полной сводке

    async def test_afternoon_with_no_new_vacancies_stays_silent(self):
        self.add(1, VACANCY)
        await self.run_at(9)
        self.add(2, MOVE)
        self.assertEqual(await self.run_at(15), [])

    async def test_the_missed_morning_run_is_full_when_it_happens_in_the_afternoon(self):
        self.add(1, VACANCY)
        self.add(2, MOVE)
        late = await self.run_at(15)
        text = "\n".join(late)
        self.assertIn("Иван Петров", text)
        self.assertNotIn("обновление", text)

    async def test_morning_run_after_a_manual_run_is_still_full(self):
        self.add(1, VACANCY)
        await self.run_at(8, auto=False)
        self.add(2, MOVE)
        morning = await self.run_at(9)
        self.assertIn("Иван Петров", "\n".join(morning))

    async def test_a_manual_run_in_the_afternoon_sends_everything_pending(self):
        self.add(1, VACANCY)
        await self.run_at(9)
        self.add(2, MOVE)
        manual = await self.run_at(15, auto=False)
        self.assertIn("Иван Петров", "\n".join(manual))

    async def test_rescan_finds_what_was_missed_but_never_repeats_what_was_sent(self):
        old_law = post(1, COURT, age_days=5)
        old_vacancy = post(2, VACANCY, age_days=5)
        self.by_source[1] += [old_law, old_vacancy]
        first = await self.run_at(9, auto=False)  # закон старше NEWS_DAYS (3): обычный запуск его пропускает
        self.assertNotIn("Судебная практика", "\n".join(first))
        self.assertIn("Юрист в корпоративную практику", "\n".join(first))
        again = await self.run_at(9, auto=False, rescan_days=14)
        text = "\n".join(again)
        self.assertIn("Судебная практика", text)  # нашлось при перечитывании
        self.assertNotIn("Юрист в корпоративную практику", text)  # уже присланная вакансия не повторилась
        self.assertEqual(Store(self.tmp / "digest.sqlite3").last_msg_id(1), 2)  # указатель чтения не откатился к нулю
        later = await self.run_at(9, auto=False)
        self.assertEqual(len(later), 1)
        self.assertIn("не нашлось", later[0])

    async def test_run_without_auto_always_sends_something(self):
        sent = await self.run_at(9, auto=False)
        self.assertEqual(len(sent), 1)
        self.assertIn("не нашлось", sent[0])


if __name__ == "__main__":
    unittest.main()
