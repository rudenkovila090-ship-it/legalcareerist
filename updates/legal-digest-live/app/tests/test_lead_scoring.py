import csv
import io
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from digest import cli, config, export, leads, reader, render
from digest.store import Item, Store

TODAY = date(2026, 10, 30)
POSTED = datetime(2026, 10, 30, 8, 0, tzinfo=timezone.utc)


def vacancy(msg_id=1, title="Юрист в Сбер", posted=POSTED, channel_id=1, **kw):
    return Item(channel_id, msg_id, "vacancy", title, f"Канал {channel_id}", f"https://t.me/c/{channel_id}/{msg_id}",
                None, None, None, posted, **kw)


def score(item, **kw):
    return leads.score_vacancy(item, TODAY, **kw)


class PiecesTests(unittest.TestCase):
    def test_salary_value(self):
        for text, expected in (
            ("от 250 тыс. руб.", 250_000), ("200-300 тыс", 300_000), ("230 000 руб", 230_000), ("от 120к", 120_000),
            ("$3000", 270_000), ("3 млн руб", 250_000),  # такая сумма в месяц нереальна: это годовой доход
            ("опыт 3 года", None), ("", None), (None, None), ("по договорённости", None),
        ):
            self.assertEqual(leads.salary_value(text), expected, text)

    def test_seniority_looks_at_the_lowest_word_first(self):
        for title, level in (
            ("Партнёр в практику банкротства", 3), ("Head of Legal", 3), ("Руководитель юридического отдела", 3),
            ("Главный юрист", 3), ("Директор по правовым вопросам", 3),
            ("Старший юрист в налоговую практику", 2), ("Ведущий юрисконсульт", 2), ("Senior associate", 2),
            ("Юрист по договорной работе", 1), ("Адвокат", 1),
            ("Помощник руководителя юридического департамента", 0), ("Ассистент партнёра", 0),
            ("Стажёр в практику", 0), ("Офис-менеджер в юрфирму", 0), ("Секретарь", 0), ("Младший юрист", 0),
        ):
            self.assertEqual(leads.seniority(title), level, title)

    def test_contact_kind_picks_the_best_way_to_write(self):
        self.assertEqual(leads.contact_kind(("https://hh.ru/vacancy/1", "hr@x.ru", "@anna_hr")), "handle")
        self.assertEqual(leads.contact_kind(("https://hh.ru/vacancy/1", "hr@x.ru")), "email")
        self.assertEqual(leads.contact_kind(("https://hh.ru/vacancy/1", "+7 495 123 45 67")), "phone")
        self.assertEqual(leads.contact_kind(("@apply_bot", "https://hh.ru/vacancy/1")), "bot")
        self.assertEqual(leads.contact_kind(("https://hh.ru/vacancy/1",)), "link")
        self.assertEqual(leads.contact_kind(()), "none")


class ScoreTests(unittest.TestCase):
    def test_a_senior_role_with_a_live_contact_salary_and_company_is_hot(self):
        lead = score(vacancy(title="Старший юрист в VK", company="VK", salary="от 300 тыс. руб.", contacts=("@hr_vk",),
                             city="Москва"))
        self.assertEqual(lead.tier, "hot")
        self.assertGreaterEqual(lead.score, leads.HOT)
        self.assertIn("пишите в Telegram", lead.reasons)
        self.assertIn("старшая позиция", lead.reasons)
        self.assertIn("высокая зарплата", lead.reasons)
        self.assertIn("опубликована сегодня", lead.reasons)
        self.assertEqual(lead.reasons[0], "прямой работодатель")

    def test_an_ordinary_lawyer_job_with_a_contact_is_good_but_not_hot(self):
        lead = score(vacancy(company="Сбер", contacts=("@hr",)))
        self.assertEqual(lead.tier, "good")

    def test_without_a_live_contact_nothing_is_hot_or_even_good(self):
        senior = dict(title="Head of Legal", company="X", salary="500 000 руб", city="Москва")
        no_contact = score(vacancy(**senior))
        only_link = score(vacancy(contacts=("https://hh.ru/vacancy/1",), **senior))
        self.assertEqual((no_contact.tier, only_link.tier), ("other", "good"))
        self.assertLessEqual(no_contact.score, 45)
        self.assertLessEqual(only_link.score, 60)
        self.assertIn("контакта нет", no_contact.reasons)
        self.assertIn("только ссылка на отклик", only_link.reasons)

    def test_telegram_beats_email_beats_phone_beats_link(self):
        base = dict(company="Сбер")
        scores = [score(vacancy(contacts=c, **base)).score for c in
                  (("@hr",), ("hr@sber.ru",), ("+7 495 123 45 67",), ("https://hh.ru/1",), ())]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertEqual(len(set(scores)), 5)

    def test_the_agency_is_a_separate_tier_with_a_penalty(self):
        direct = score(vacancy(company="Y", contacts=("@rec",)))
        agency = score(vacancy(company="Y", contacts=("@rec",), via_agency=True))
        self.assertEqual(agency.tier, "agency")
        self.assertEqual(agency.score, direct.score - leads.AGENCY_PENALTY)
        self.assertEqual(agency.reasons[0], "через агентство: посредник")

    def test_the_employer_you_already_wrote_to_goes_down(self):
        item = vacancy(title="Старший юрист в VK", company="VK", salary="от 300 тыс. руб.", contacts=("@hr_vk",))
        fresh = score(item)
        for contacted in (frozenset({"vk"}), frozenset({"@hr_vk"})):
            lead = score(item, contacted=contacted)
            self.assertEqual((lead.tier, lead.contacted, lead.reasons[0]), ("other", True, "уже писали"), contacted)
            self.assertLess(lead.score, fresh.score)

    def test_fresher_is_better_and_old_ones_lose_the_bonus(self):
        scores = [score(vacancy(company="Сбер", contacts=("@hr",), posted=POSTED - timedelta(days=d))).score
                  for d in (0, 1, 3, 6, 9)]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertGreater(scores[0], scores[-1])
        self.assertIn("опубликована вчера", score(vacancy(posted=POSTED - timedelta(days=1))).reasons)

    def test_an_employer_with_several_open_vacancies_and_a_vacancy_in_several_channels_score_higher(self):
        item = vacancy(company="Сбер", contacts=("@hr",))
        one, two, three = (score(item, open_vacancies=n).score for n in (1, 2, 3))
        self.assertLess(one, two)
        self.assertLess(two, three)
        self.assertIn("у работодателя 3 вакансий", score(item, open_vacancies=3).reasons)
        self.assertEqual(score(item, extra_posts=2).score, one + 3)
        self.assertIn("объявлена в 3 каналах", score(item, extra_posts=2).reasons)

    def test_the_score_stays_between_zero_and_hundred(self):
        top = score(vacancy(title="Партнёр", company="X", salary="900 000 руб", contacts=("@a",), city="Москва"),
                    open_vacancies=5, extra_posts=3)
        bottom = score(vacancy(title="Стажёр", via_agency=True), contacted=frozenset({"сбер"}))
        self.assertEqual(top.score, 100)
        self.assertGreaterEqual(bottom.score, 0)


class ContactedFileTests(unittest.TestCase):
    def test_companies_handles_and_emails_are_read_and_normalised(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "contacted.txt"
            path.write_text("# уже писали\nСбер\n  «ВК-Групп»  # ответили\n@HR_Anna\nhr@Firm.ru\n\n", encoding="utf-8")
            found = config.load_contacted(path)
        self.assertEqual(found, frozenset({"сбер", "вк групп", "@hr_anna", "hr@firm.ru"}))
        self.assertEqual(config.load_contacted(Path(tmp) / "missing.txt"), frozenset())

    def test_matching_by_company_handle_or_email(self):
        contacted = frozenset({"вк групп", "@hr_anna", "hr@firm.ru"})
        self.assertTrue(leads.is_contacted(vacancy(company="ВК-Групп"), contacted))
        self.assertTrue(leads.is_contacted(vacancy(contacts=("@HR_Anna",)), contacted))
        self.assertTrue(leads.is_contacted(vacancy(contacts=("HR@firm.ru",)), contacted))
        self.assertFalse(leads.is_contacted(vacancy(company="Сбер", contacts=("@other",)), contacted))
        self.assertFalse(leads.is_contacted(vacancy(company="Сбер"), frozenset()))


class StoreCountsTests(unittest.TestCase):
    def test_distinct_vacancies_of_a_direct_employer_in_the_last_month(self):
        store = Store(":memory:")
        rows = [
            vacancy(1, "Юрист в VK", company="VK"), vacancy(2, "Юрист в VK", company="VK", channel_id=2),  # та же вакансия
            vacancy(3, "Старший юрист в VK", company="VK"), vacancy(4, "Юрист в Сбер", company="Сбер"),
            vacancy(5, "Юрист в агентстве", company="Агентство", via_agency=True),
            vacancy(6, "Старая вакансия", company="Сбер", posted=POSTED - timedelta(days=60)),
            vacancy(7, "Вакансия без компании"),
        ]
        for item in rows:
            store.add_item(item)
        self.assertEqual(store.vacancy_counts(TODAY), {"vk": 2, "сбер": 1})


class DigestOrderTests(unittest.TestCase):
    def items(self):
        return [
            vacancy(1, "Юрист без контакта", company="Фирма"),
            vacancy(2, "Старший юрист в VK", company="VK", salary="от 300 тыс. руб.", contacts=("@hr_vk",), city="Москва"),
            vacancy(3, "Юрист в Сбер", company="Сбер", contacts=("@hr_sber",)),
            vacancy(4, "Юрист в агентстве", company="Агент", contacts=("@rec",), via_agency=True),
        ]

    def test_hot_then_good_then_the_rest_then_agencies(self):
        (text,) = render.build_digest(self.items(), TODAY)
        order = [text.index(x) for x in (
            "🔥 Горячие лиды: пишите первыми", "Старший юрист в VK", "⭐ Хорошие лиды", "Юрист в Сбер",
            "Остальные вакансии работодателей", "Юрист без контакта", "Вакансии через агентства", "Юрист в агентстве")]
        self.assertEqual(order, sorted(order))
        self.assertIn("Всего: 4 (через агентства: 1) · 🔥 горячих: 1 · ⭐ хороших: 1", text)

    def test_inside_a_group_the_higher_score_comes_first_whatever_the_input_order(self):
        lower = vacancy(1, "Старший юрист в налоговую практику", company="Налоговая", contacts=("@hr_tax",))
        higher = vacancy(2, "Старший юрист в VK", company="VK", salary="от 300 тыс. руб.", contacts=("@hr_vk",))
        for items in ([lower, higher], [higher, lower]):
            (text,) = render.build_digest(items, TODAY)
            self.assertEqual(text.count("🔥 Горячие лиды"), 1)  # оба горячие, группа одна
            self.assertLess(text.index("Старший юрист в VK"), text.index("Старший юрист в налоговую практику"))

    def test_the_card_shows_the_score_and_the_reasons(self):
        (text,) = render.build_digest(self.items(), TODAY)
        line = next(l for l in text.splitlines() if l.startswith("  🔥"))
        self.assertIn("/100 · пишите в Telegram · старшая позиция · высокая зарплата", line)
        self.assertNotIn("прямой работодатель", line)  # это видно по группе
        self.assertLessEqual(line.count(" · "), 5)

    def test_open_vacancies_of_the_employer_raise_the_lead(self):
        item = vacancy(1, "Юрист в Сбер", company="Сбер", contacts=("@hr_sber",))
        (plain,) = render.build_digest([item], TODAY)
        (boosted,) = render.build_digest([item], TODAY, open_vacancies={"сбер": 3})
        self.assertNotIn("🔥 Горячие", plain)
        self.assertIn("у работодателя 3 вакансий", boosted)
        self.assertIn("🔥 Горячие", boosted)

    def test_the_employer_you_wrote_to_is_marked_and_not_in_the_top(self):
        (text,) = render.build_digest(self.items(), TODAY, contacted=frozenset({"vk"}))
        self.assertNotIn("🔥 Горячие", text)
        self.assertIn("▫️ <b>", text)
        self.assertIn("уже писали", text)

    def test_afternoon_update_is_also_sorted_by_the_score(self):
        (text,) = render.build_digest(self.items(), TODAY, update=True)
        self.assertIn("Вакансии · 30.10.2026 · обновление", text)
        self.assertLess(text.index("Старший юрист в VK"), text.index("Юрист в Сбер"))


class ExportTests(unittest.TestCase):
    def test_csv_has_score_tier_reasons_and_an_empty_status_column_best_leads_first(self):
        items = [vacancy(1, "Юрист без контакта", company="Фирма"),
                 vacancy(2, "Старший юрист в VK", company="VK", salary="от 300 тыс. руб.", contacts=("@hr_vk",))]
        with tempfile.TemporaryDirectory() as tmp:
            export.export_items(Path(tmp), items, today=TODAY)
            header, *rows = list(csv.reader(io.StringIO((Path(tmp) / "vacancies.csv").read_text(encoding="utf-8-sig"))))
        self.assertEqual(header, export.VACANCY_HEADER)
        first, second = (dict(zip(header, row)) for row in rows)
        self.assertEqual((first["Должность"], first["Уровень"]), ("Старший юрист в VK", "горячий"))
        self.assertTrue(int(first["Оценка лида"]) > int(second["Оценка лида"]))
        self.assertIn("пишите в Telegram", first["Почему"])
        self.assertEqual((first["Статус (заполняете вы)"], second["Уровень"]), ("", "обычный"))


MULTI = (
    "#вакансия\nСтарший юрист в налоговую практику\nУсловия: зарплата от 300 000\nРезюме: @hr_tax\nКомпания: Налоговая фирма"
)


def post(msg_id, text, age_days=0.0):
    return NS(id=msg_id, message=text, entities=None,
              date=datetime.now(timezone.utc) - timedelta(days=age_days, hours=1))


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def digest(self, posts, **cfg_kw):
        sent = []

        class Client:
            async def iter_messages(self, entity, min_id=0, limit=None):
                for m in sorted(posts, key=lambda m: m.id, reverse=True)[:limit]:
                    if m.id > min_id:
                        yield m

            async def get_me(self):
                return NS(id=1)

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield Client()

        async def fake_sources(_client, _folder):
            return [reader.Source(id=1, title="Вакансии для юристов", username="jobs", entity=NS())]

        async def fake_deliver(_cfg, _client, texts):
            sent.extend(texts)

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver):
            cfg = config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), Path(tmp), **cfg_kw)
            await cli.cmd_run(cfg, print_only=False)
        return "\n".join(sent)

    async def test_vacancies_older_than_a_week_are_skipped(self):
        text = await self.digest([post(1, MULTI, age_days=9), post(2, MULTI.replace("налоговую", "трудовую"), age_days=1)])
        self.assertIn("трудовую практику", text)
        self.assertNotIn("налоговую практику", text)
        text = await self.digest([post(1, MULTI, age_days=9)], vacancy_days=14)
        self.assertIn("налоговую практику", text)

    async def test_closed_junk_digest_and_off_profile_posts_never_reach_the_digest(self):
        posts = [
            post(1, "#вакансия\nЮрист по договорной работе. Вакансия закрыта, спасибо всем."),
            post(2, "Ищем юриста! Сетевой маркетинг, доход от 5000 в день, без вложений. Пишите @hr_mlm"),
            post(3, "Подборка вакансий для юристов\n1. Юрист в Сбер\n2. Юрист в VK\nРезюме присылайте @recruiter"),
            post(4, "Бухгалтер в производственную компанию. Зарплата от 90 000, резюме на hr@plant.ru"),
            post(5, MULTI),
        ]
        text = await self.digest(posts)
        self.assertIn("налоговую практику", text)
        for absent in ("закрыта", "hr_mlm", "recruiter", "Бухгалтер"):
            self.assertNotIn(absent, text)

    async def test_the_best_lead_comes_first_and_contacted_txt_demotes_the_employer(self):
        weak = post(1, "#вакансия\nЮрист в Сбер\nУсловия: офис\nРезюме: @hr_sber\nКомпания: Сбер")
        strong = post(2, MULTI)
        text = await self.digest([weak, strong])
        self.assertLess(text.index("Старший юрист в налоговую практику"), text.index("Юрист в Сбер"))
        text = await self.digest([weak, strong], contacted=frozenset({"налоговая фирма"}))
        self.assertLess(text.index("Юрист в Сбер"), text.index("Старший юрист в налоговую практику"))
        self.assertIn("уже писали", text)

    async def test_second_vacancy_of_the_same_employer_raises_both_leads(self):
        a = post(1, "#вакансия\nЮрист в Сбер\nУсловия: офис\nРезюме: @hr_sber\nКомпания: Сбер")
        b = post(2, "#вакансия\nСтарший юрист по комплаенсу в Сбер\nУсловия: офис\nРезюме: @hr_sber\nКомпания: Сбер")
        text = await self.digest([a, b])
        self.assertEqual(text.count("у работодателя 2 вакансий"), 2)


if __name__ == "__main__":
    unittest.main()
