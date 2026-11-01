import unittest
from datetime import date

from digest import rules

TODAY = date(2026, 10, 24)

OFFICE_ADMIN_POST = (
    "Юридическая фирма ищет офис-менеджера\nОбязанности: документооборот, встреча гостей\n"
    "Условия: оклад 90 000 руб., офис в центре\nРезюме присылайте на почту"
)


class LegalScopeTests(unittest.TestCase):
    def test_legal_roles_pass(self):
        for text in (
            "Старший юрист в VK. Обязанности: договоры",
            "Руководитель по законодательному сопровождению в Ингосстрахе",
            "Специалист по защите персональных данных (DPO) в банк",
            "Помощник адвоката для постоянного сотрудничества",
        ):
            self.assertTrue(rules.is_legal_vacancy(text, "Закон.ру"), text)

    def test_office_roles_pass_only_in_legal_context(self):
        # юридическая фирма названа в тексте
        self.assertTrue(rules.is_legal_vacancy(OFFICE_ADMIN_POST, "PRO.Карьера"))
        # канал юридический, а роль административная
        self.assertTrue(rules.is_legal_vacancy("Секретарь, Москва, офис, график 5/2", "Юрист компании"))
        # то же самое без юридического контекста — нет
        self.assertFalse(rules.is_legal_vacancy("Бизнес-ассистент в IT-компанию. Условия: гибрид", "PRO.Карьера"))
        self.assertFalse(rules.is_legal_vacancy("Личный помощник руководителя, оклад 100 000 руб.", "Вакансии | ПроПрактика"))

    def test_non_legal_roles_are_out(self):
        for text, channel in (
            ("Вакансия: SMM-специалист (удалённо). Обязанности: ведение соцсетей", "Вакансии | ПроПрактика"),
            ("Вакансия: Разработчик Битрикс24", "2b.mgimo.career"),
            ("Финансовый менеджер. Условия: офис", "2b.mgimo.career"),
            ("Project Manager в digital-агентство (удалённо)", "Вакансии | ПроПрактика"),
            ("Вакансия 836: Инженер по защите информации в ФГБУН", "Privacy Jobs"),
        ):
            self.assertFalse(rules.is_legal_vacancy(text, channel), text)

    def test_every_vacancy_of_a_legal_job_board_counts(self):
        self.assertTrue(rules.is_legal_vacancy("Офис-менеджер, Москва", "Вакансии для юристов (стажировки, госслужба)"))

    def test_office_manager_title_in_a_legal_job_channel_is_a_vacancy(self):
        m = rules.classify("Офис-менеджер", TODAY, "Вакансии для юристов (стажировки, госслужба)")
        self.assertEqual(m.kind, "vacancy")

    def test_office_manager_post_with_hiring_words_is_a_vacancy(self):
        m = rules.classify(OFFICE_ADMIN_POST, TODAY, "Закон.ру")
        self.assertEqual(m.kind, "vacancy")
        self.assertEqual(m.work_format, "офис")


class LeadFieldsTests(unittest.TestCase):
    POST = (
        "Юридическая фирма «Предметно» ищет старшего юриста\n"
        "Обязанности: договоры и споры\nУсловия: зарплата от 250 тыс. руб., гибрид\n"
        "Резюме: hr@predmetno.ru или @hr_predmetno, +7 (999) 123-45-67\n"
        "Подробнее: https://hh.ru/vacancy/123456\nКанал: @zakon_news"
    )

    def test_vacancy_becomes_a_lead_with_all_fields(self):
        m = rules.classify(self.POST, TODAY, "Закон.ру", "zakon_news", ("https://hh.ru/vacancy/123456",))
        self.assertEqual(m.kind, "vacancy")
        self.assertEqual(m.company, "Предметно")
        self.assertEqual(m.salary, "от 250 тыс. руб.")
        self.assertEqual(m.work_format, "гибрид")
        self.assertEqual(m.contacts, ("@hr_predmetno", "hr@predmetno.ru", "+7 (999) 123-45-67", "https://hh.ru/vacancy/123456"))
        self.assertFalse(m.via_agency)

    def test_hidden_link_behind_a_word_is_used(self):
        m = rules.classify("Ищем юриста в команду. Условия: гибрид. Отклик по кнопке", TODAY, "Закон.ру", None,
                           ("https://career.example.com/job/9",))
        self.assertIn("https://career.example.com/job/9", m.contacts)

    def test_agency_posts_are_flagged(self):
        text = "Наш клиент, юридическая фирма, ищет юриста по налоговым спорам. Условия: гибрид. Резюме: @recruiter_anna"
        m = rules.classify(text, TODAY, "Закон.ру")
        self.assertTrue(m.via_agency)
        self.assertEqual(m.contacts, ("@recruiter_anna",))

    def test_company_from_real_titles(self):
        for title, expected in (
            ("Старший юрист в Playerok", "Playerok"),
            ("Юрист в KIP LEGALTECH", "KIP LEGALTECH"),
            ("Юрист в Сбер на юридическое сопровождение API и маркетплейсов", "Сбер"),
            ("VK ищет старшего юриста", "VK"),
            ('Компания "ФРК" ищет специалиста по договорной работе (юриста)', "ФРК"),
            ("Помощник юриста в Консалтинговую компанию «Юридическая сила»", "Юридическая сила"),
            ('Адвокатское бюро "Парадокс" ищет младшего юриста в судебную практику', "Парадокс"),
            ("Next Genium ищет в команду юриста", "Next Genium"),
            ("Юридическая фирма BGP Litigation в поисках юриста в практику налоговых споров", "Юридическая фирма BGP Litigation"),
            ("Юрист в сфере морского права", None),
            ("Юрист в multi-family office", None),
        ):
            self.assertEqual(rules.find_company(title, title), expected, title)

    def test_generic_descriptions_are_not_company_names(self):
        for title in (
            "Наш клиент, международная юрфирма, ищет юриста по M&A",
            "Ведущая юридическая фирма ищет юриста",
            "Крупная компания ищет помощника юриста",
            "Российский банк ищет юриста",
        ):
            self.assertIsNone(rules.find_company(title, title), title)
        self.assertEqual(rules.find_company("Юридическая фирма LECAP ищет юриста", ""), "Юридическая фирма LECAP")

    def test_company_label_in_text(self):
        self.assertEqual(rules.find_company("Старший юрист", "Работодатель: Консалтинговая группа БЕРИНГОВ\nМосква"),
                         "Консалтинговая группа БЕРИНГОВ")

    def test_salary(self):
        for text, expected in (
            ("Условия: зарплата от 250 тыс. руб., гибрид", "от 250 тыс. руб."),
            ("230 000 руб/мес. и работа с персональными данными", "230 000 руб/мес"),
            ("Младший юрист на зарплату выше 200 тыс. руб.", "200 тыс. руб."),
            ("Зарплата по результатам собеседования", "по результатам собеседования"),
            ("Вилка: 150–200 тыс. рублей на руки", "150–200 тыс. рублей на руки"),
            ("Опыт от 3 лет, знание английского", None),
        ):
            self.assertEqual(rules.find_salary(text), expected, text)

    def test_work_format(self):
        self.assertEqual(rules.find_format("Работа удалённо или гибрид"), "удалённо / гибрид")
        self.assertEqual(rules.find_format("Офисный формат, Москва"), "офис")
        self.assertIsNone(rules.find_format("Офис-менеджер в юрфирму"))
        self.assertIsNone(rules.find_format("Москва, полная занятость"))

    def test_contacts_skip_the_channel_itself_and_post_links(self):
        text = "Пишите @hr_anna и t.me/hr_boris, пост t.me/legaljobs/123, канал @legaljobs, почта a@b.ru"
        self.assertEqual(rules.extract_contacts(text, "LegalJobs"), ["@hr_anna", "@hr_boris", "a@b.ru"])

    def test_at_most_two_links(self):
        text = "Ссылки: https://a.example/1 https://b.example/2 https://c.example/3 и https://t.me/channel/5"
        self.assertEqual(rules.extract_contacts(text), ["https://a.example/1", "https://b.example/2"])


class KindsTests(unittest.TestCase):
    def test_kinds_restrict_what_is_searched(self):
        event = "Приглашаем на вебинар по трудовому праву 28 октября в 19:00. Регистрация по ссылке"
        vacancy = "Юридическая фирма ищет юриста. Условия: зарплата от 200 тыс. руб. Резюме присылайте на почту"
        self.assertEqual(rules.classify(event, TODAY).kind, "event")
        self.assertIsNone(rules.classify(event, TODAY, kinds=("vacancy",)))
        self.assertEqual(rules.classify(vacancy, TODAY, kinds=("vacancy",)).kind, "vacancy")
        self.assertIsNone(rules.classify(vacancy, TODAY, kinds=("event",)))


if __name__ == "__main__":
    unittest.main()
