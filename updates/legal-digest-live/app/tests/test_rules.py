import unittest
from datetime import date, time

from digest import rules

TODAY = date(2026, 10, 24)


class EventTests(unittest.TestCase):
    def test_meetup_with_date_time_and_registration_deadline(self):
        text = (
            "📢 Приглашаем на митап «Трудовое право 2026»\n\n"
            "📅 28 октября, 19:00\n📍 Москва, Legal Hub\n"
            "Регистрация до 27 октября: https://example.com/reg"
        )
        m = rules.classify(text, TODAY)
        self.assertEqual(m.kind, "event")
        self.assertEqual(m.event_date, date(2026, 10, 28))
        self.assertEqual(m.event_time, time(19, 0))
        self.assertEqual(m.deadline, date(2026, 10, 27))
        self.assertEqual(m.title, "Приглашаем на митап «Трудовое право 2026»")

    def test_numeric_date(self):
        m = rules.classify("Вебинар: налоговые риски для юристов. 05.11 в 12:00 (мск). Участие бесплатное.", TODAY)
        self.assertEqual((m.kind, m.event_date, m.event_time), ("event", date(2026, 11, 5), time(12, 0)))

    def test_date_range_takes_first_day(self):
        for text in (
            "Конференция Legal Tech Russia пройдёт 10–12 ноября в Санкт-Петербурге",
            "Конференция Legal Tech Russia пройдёт с 10 по 12 ноября в Санкт-Петербурге",
        ):
            m = rules.classify(text, TODAY)
            self.assertEqual(m.event_date, date(2026, 11, 10), text)
            self.assertIsNone(m.event_time)

    def test_report_about_past_event_is_not_an_event(self):
        text = "Прошла конференция LegalTech 12 октября, спасибо всем, кто пришёл! Фото и видео по ссылке."
        self.assertIsNone(rules.classify(text, TODAY))

    def test_relative_date(self):
        m = rules.classify("Завтра в 19:00 прямой эфир с партнёром фирмы, приглашаем! Регистрация обязательна.", TODAY)
        self.assertEqual((m.kind, m.event_date, m.event_time), ("event", date(2026, 10, 25), time(19, 0)))

    def test_year_rolls_over_in_december(self):
        m = rules.classify("Приглашаем на семинар 15 января, начало в 18:30", date(2026, 12, 20))
        self.assertEqual(m.event_date, date(2027, 1, 15))

    def test_explicit_year_and_dotted_year(self):
        self.assertEqual(rules.classify("Семинар 3 декабря 2026 года, 11:00", TODAY).event_date, date(2026, 12, 3))
        self.assertEqual(rules.classify("Семинар 03.12.26, 11:00", TODAY).event_date, date(2026, 12, 3))

    def test_course_ad_is_not_an_event(self):
        text = "Курс «Юрист-практик» стартует 1 декабря. Регистрация открыта до 25 ноября. Успейте записаться!"
        self.assertIsNone(rules.classify(text, TODAY))

    def test_invitation_without_date_is_flagged_undated(self):
        m = rules.classify("Приглашаем на вебинар по комплаенсу. Регистрация по ссылке: https://example.com", TODAY)
        self.assertEqual((m.kind, m.event_date), ("event", None))

    def test_experience_years_are_not_dates(self):
        text = "Лекция для юристов с опытом 3.5 года, начало в 19:00, приглашаем"
        self.assertIsNone(rules.classify(text, TODAY))

    def test_labor_court_news_is_not_an_event_and_only_counts_as_law_when_asked_for(self):
        text = "Верховный суд разъяснил: работодатель обязан выплатить компенсацию при незаконном увольнении сотрудника."
        self.assertEqual(rules.classify(text, TODAY).kind, "law")
        self.assertIsNone(rules.classify(text, TODAY, kinds=("event", "vacancy", "news")))

    def test_court_news_outside_labor_law_is_ignored(self):
        self.assertIsNone(rules.classify("Верховный суд разъяснил порядок взыскания неустойки по договорам подряда.", TODAY))


class VacancyTests(unittest.TestCase):
    def test_structured_vacancy(self):
        text = (
            "#вакансия\nЮрист в корпоративную практику\n\nОбязанности: договорная работа\n"
            "Требования: опыт от 3 лет\nУсловия: зарплата от 150 000, гибрид\nРезюме присылайте @hr_firm"
        )
        m = rules.classify(text, TODAY)
        self.assertEqual((m.kind, m.title), ("vacancy", "Юрист в корпоративную практику"))

    def test_short_post_with_tag(self):
        self.assertEqual(rules.classify("#вакансия Юрист в M&A, от 200к, пишите в личку", TODAY).kind, "vacancy")

    def test_we_are_looking_for_with_conditions(self):
        text = "Ищем помощника юриста в команду. Условия: офис, оклад обсуждается. Отклик в личные сообщения."
        self.assertEqual(rules.classify(text, TODAY).kind, "vacancy")

    def test_article_about_vacancies_is_not_a_vacancy(self):
        self.assertIsNone(rules.classify("Какие вакансии сейчас на рынке юристов? Мы собрали статистику за квартал.", TODAY))

    def test_job_seeker_is_not_a_vacancy(self):
        self.assertIsNone(rules.classify("#резюме Ищу работу юристом. Опыт работы 5 лет, рассмотрю предложения.", TODAY))


class NoiseFromRealDigestTests(unittest.TestCase):
    """Ложные срабатывания, замеченные в первой настоящей сводке."""

    def test_course_ads_and_reviews_are_not_events(self):
        for text in (
            "«Я окупила курс за одну услугу» — отзыв Валерии Смирновой о курсе «Рекламное право 360». Новый поток 26 октября.",
            "Поток «Юридического консалтинга» НИУ ВШЭ × RENEWAL стартовал! Первое занятие 26.10",
        ):
            self.assertIsNone(rules.classify(text, TODAY), text)

    def test_event_keeps_status_even_if_it_mentions_a_discount(self):
        m = rules.classify("Вебинар по рекламному праву 27 октября в 18:00. Участникам скидка на курс.", TODAY)
        self.assertEqual((m.kind, m.event_date), ("event", date(2026, 10, 27)))

    def test_recordings_and_reports_are_not_events(self):
        for text in (
            "Записи полезных мастер-классов про использование ИИ для юристов. Смотрите до 27 октября в 19:00",
            "«Спор? Договоримся!»: медиация для бизнеса. Как это было. Встреча 30.10 в 10:00 собрала полный зал.",
        ):
            self.assertIsNone(rules.classify(text, TODAY), text)

    def test_weak_event_words_need_time_or_invitation(self):
        self.assertIsNone(rules.classify("Как провести стимулирующее мероприятие: разбор на карточках. Материал от 26.10.", TODAY))
        m = rules.classify("Встреча выпускников 28 октября в 19:00", TODAY)
        self.assertEqual((m.kind, m.event_time), ("event", time(19, 0)))

    def test_subscription_deadline_is_not_an_event_date(self):
        self.assertIsNone(rules.classify("Премиум-подписка на клуб Цивилистов — до 1 ноября", TODAY))

    def test_blog_and_news_posts_are_not_vacancies(self):
        for text in (
            "Как вы ищете работу? Расскажите, какие вакансии и зарплаты вас интересуют, присылайте резюме",
            "Почему студентам не отвечают на отклики: 5 ошибок, которые видит рекрутер\nРезюме и требования к кандидату",
            "ИИ ищет сговоры, ЕС уточняет требования, а юрфирмы пробуют фиксированные цены",
            "Требуется HR. Обязанности: быть хорошим для всех. Зарплата: нервный срыв",
            "Ищем подрядчика для юридических задач. Условия обсудим, пишите.",
            "Рекомендую сильного международного юриста Corporate / M&A / International Expansion",
        ):
            self.assertIsNone(rules.classify(text, TODAY), text)

    def test_smm_vacancy_in_a_marketing_channel(self):
        text = ("Вакансия: SMM-специалист (удалённо)\nОбязанности: ведение соцсетей\nТребования: опыт от года\n"
                "Оплата: от 60 000 руб.\nОтклик: @hr_pro")
        m = rules.classify(text, TODAY, "Вакансии | ПроПрактика")
        self.assertEqual((m.kind, m.title), ("vacancy", "Вакансия: SMM-специалист (удалённо)"))

    def test_job_channels_get_a_softer_rule_than_blogs(self):
        self.assertEqual(rules.classify("Старший юрист в Playerok", TODAY, "Legal jobs: IP • IT • DP • LT").kind, "vacancy")
        self.assertIsNone(rules.classify("Старший юрист в Playerok", TODAY, "Блог юриста"))
        self.assertIsNone(rules.classify("Как студенту попасть на стажировку? Разбираем, куда присылать резюме", TODAY, "Вакансии | ПроПрактика"))


class NoiseFromSecondDigestTests(unittest.TestCase):
    """Ложные срабатывания второй настоящей сводки: судебные новости и реклама в вакансионных каналах."""

    def test_court_news_with_money_and_job_words_is_not_a_vacancy(self):
        text = ("Кассация взыскала 3 млн рублей. Директор должника отвечает по требованиям кредиторов, "
                "условия сделки признаны недействительными, руководитель направил отзыв.")
        for channel in ("PROбанкротство", "Право.ru", ""):
            self.assertIsNone(rules.classify(text, TODAY, channel), channel)

    def test_promo_without_a_position_in_a_job_channel_is_not_a_vacancy(self):
        text = "Бесплатное обучение профессии для Wildberries\nСтажировка с трудоустройством, оплата от 50 000 руб."
        self.assertIsNone(rules.classify(text, TODAY, "Вакансии для юристов (стажировки, госслужба)"))

    def test_long_detailed_vacancy_in_a_job_channel_is_kept(self):
        text = ("Вакансия: ведущий юрист\n" + "Обязанности: подготовка и согласование договоров, претензионная работа. " * 20
                + "\nТребования: опыт от 3 лет\nУсловия: зарплата от 250 тыс. руб., гибрид\nРезюме: hr@example.com")
        self.assertGreater(len(text), 1500)
        self.assertEqual(rules.classify(text, TODAY, "Legal jobs: IP • IT • DP • LT").kind, "vacancy")

    def test_structured_post_without_hiring_words_needs_a_job_channel(self):
        text = ("Руководитель юридического отдела\nОбязанности: договоры\nТребования: опыт\n"
                "Условия: зарплата от 300 тыс. руб.\nРезюме на почту")
        self.assertIsNone(rules.classify(text, TODAY, "Блог юриста"))
        self.assertEqual(rules.classify(text, TODAY, "Вакансии Старших Юристов").kind, "vacancy")

    def test_vacancy_in_a_regular_channel_still_found_with_hiring_words(self):
        text = ("Юридическая фирма «Предметно» ищет старшего юриста.\nОбязанности: договоры и споры.\n"
                "Условия: зарплата от 250 тыс. руб. Резюме присылайте на почту.")
        self.assertEqual(rules.classify(text, TODAY, "Закон.ру").kind, "vacancy")

    def test_giveaways_and_photo_contests_are_not_events(self):
        for text in (
            "Конкурс на самое оригинальное фото с мерчем конференции! Итоги 2 ноября",
            "Розыгрыш билетов на конференцию 28 октября, участвуйте до 27.10!",
        ):
            self.assertIsNone(rules.classify(text, TODAY), text)


class TitleTests(unittest.TestCase):
    def test_greeting_line_is_skipped(self):
        self.assertEqual(rules.make_title("Дорогие друзья!\n\nПриглашаем на открытую лекцию по налоговому праву"),
                         "Приглашаем на открытую лекцию по налоговому праву")

    def test_short_event_title_is_extended_with_next_line(self):
        m = rules.classify("Налоги и наследство:\nПрактический вебинар для юристов, 25 октября в 10:00", TODAY)
        self.assertEqual(m.title, "Налоги и наследство: Практический вебинар для юристов, 25 октября в 10:00")


class HelpersTests(unittest.TestCase):
    def test_title_skips_hashtags_and_links_and_shortens(self):
        self.assertEqual(rules.make_title("#анонс https://x.io\n\n🔥 Большая встреча юристов"), "Большая встреча юристов")
        long_title = rules.make_title("слово " * 40)
        self.assertLessEqual(len(long_title), 110)
        self.assertTrue(long_title.endswith("…"))

    def test_keyword_filters(self):
        self.assertTrue(rules.passes_filters("Митап для Юристов", ("юрист",), ()))
        self.assertFalse(rules.passes_filters("Митап для бухгалтеров", ("юрист",), ()))
        self.assertFalse(rules.passes_filters("Митап для юристов, реклама", ("юрист",), ("реклама",)))
        self.assertTrue(rules.passes_filters("что угодно", (), ()))


if __name__ == "__main__":
    unittest.main()
