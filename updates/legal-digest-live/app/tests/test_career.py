import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from digest import cli, config, reader, rules

TODAY = date(2026, 10, 28)


def kind_of(text, channel="Право.ru"):
    match = rules.classify(text, TODAY, channel)
    return None if match is None else (match.kind, match.subtype)


class NotACareerTests(unittest.TestCase):
    """Привлечение к ответственности, меры пресечения, штрафы и назначение дел не имеют отношения к карьере."""

    LIABILITY = (
        "В отношении юриста Ивана Петрова возбуждено уголовное дело, ему избрана мера пресечения в виде домашнего ареста.",
        "Адвокат Иван Петров привлечён к дисциплинарной ответственности, ему назначено наказание.",
        "Иван Петров назначен обвиняемым по делу о мошенничестве, суд избрал меру пресечения.",
        "Суд назначил Ивану Петрову штраф в размере 100 тысяч рублей за нарушение закона.",
        "Иван Петров, возглавляющий преступную группу, задержан по подозрению в хищении.",
        "Иван Петров возглавил преступное сообщество и приговорён к восьми годам колонии.",
        "Иван Петров покинул страну после возбуждения уголовного дела.",
        "Иван Петров присоединился к иску против банка по делу о взыскании долга.",
        "Дело назначено к рассмотрению судьёй Иваном Ивановым на 5 ноября.",
        "Иван Петров привлечён к административной ответственности за нарушение правил, ему назначен штраф.",
        "Иван Петров вернул деньги в бюджет после проверки прокуратуры.",
        "Иван Петров стал руководителем преступной группы, следствие предъявило обвинение.",
        "Анна Иванова, директор компании, привлечена к ответственности за невыплату зарплаты.",
        "Иван Петров, председатель суда, избрал меру пресечения подозреваемому Петру Сидорову.",
        "Бывший партнёр Dentons Иван Петров арестован по делу о получении взятки.",
        "Следователь возбудил дело в отношении партнёра фирмы Ивана Петрова, ему избрана мера пресечения.",
        "Адвокатская палата лишила статуса адвоката Ивана Петрова за нарушение правил этики.",
        "Иван Петров вернулся в Россию после ареста, в отношении него ведётся следствие.",
        "Директор компании Иван Петров возглавил организованную группу и получил штраф за налоговые нарушения.",
        "Юрист Иван Петров назначен экспертом по делу, судебное заседание состоится 10 ноября.",
        "Иван Петров признан виновным и приговорён к штрафу, как сообщила прокуратура.",
        "Партнёр Иван Петров перешёл в Dentons, но привлечён к ответственности за нарушение.",  # только это слово
    )
    OTHER_WORDS = (
        "Юрист Иван Петров перешёл на удалённую работу и теперь работает из дома.",
        "Иван Петров назначил встречу партнёрам и руководителям практик.",
        "Иван Петров стал фигурантом дела о банкротстве компании Сбыт.",
        "Иван Петров избран в Совет Федерации.",  # назван орган, но не должность юриста
    )

    def test_liability_posts_are_not_career_news(self):
        for text in self.LIABILITY + self.OTHER_WORDS:
            self.assertIsNone(kind_of(text), text)

    def test_the_liability_word_must_be_in_the_same_sentence_as_the_move(self):
        text = "Иван Петров перешёл из Dentons в Пепеляев Групп. Ранее по его делу о штрафе вынесено решение."
        self.assertEqual(kind_of(text), ("news", "Карьерный переход"))

    def test_a_move_inside_a_post_about_liability_is_still_not_a_move_when_the_same_sentence_says_so(self):
        self.assertIsNone(kind_of("Партнёр Иван Петров, перешедший в Пепеляев Групп, перешёл под стражу и задержан."))

    def test_appointment_needs_a_position_not_just_a_body(self):
        self.assertIsNone(kind_of("Иван Петров назначен в Dentons."))
        self.assertEqual(kind_of("Иван Петров назначен партнёром в Dentons."), ("news", "Назначение"))


class RealCareerTests(unittest.TestCase):
    CASES = (
        ("Назначение", "Иван Петров стал старшим юристом в Dentons.", "старший юрист"),
        ("Назначение", "Анна Иванова стала советником практики разрешения споров в Пепеляев Групп.", "советник"),
        ("Назначение", "Иван Петров стал партнёром Dentons, ранее он работал советником.", "партнёр"),
        ("Карьерный переход", "Партнёр Иван Петров перешёл из Dentons в Пепеляев Групп.", "партнёр"),
        ("Повышение", "Иван Петров повышен до партнёра в Пепеляев Групп.", "партнёр"),
        ("Повышение", "Анна Иванова получила повышение: теперь она советник юридической фирмы Dentons.", "советник"),
        ("Повышение", "Старший юрист Иван Петров повышен до советника в юридической фирме Dentons.", "советник"),
        ("Понижение", "Анна Иванова понижена в должности до старшего юриста.", "старший юрист"),
        ("Понижение", "Иван Петров разжалован из партнёров в советники юридической фирмы.", "советник"),
        ("Понижение", "Партнёр Иван Петров понижен до советника в Пепеляев Групп.", "советник"),
        ("Карьерный переход", "Иван Петров перешёл из «Сбера» в «Яндекс».", None),
        ("Назначение", "Мария Орлова назначена директором юридического департамента «Газпром».", "директор департамента"),
        ("Карьерный переход", "Иван Петров ушёл с должности руководителя практики в Dentons.", "руководитель практики"),
        ("Назначение", "Игорь Краснов назначен председателем Верховного суда.", "председатель суда"),
        ("Назначение", "Иван Петров избран управляющим партнёром Пепеляев Групп.", "управляющий партнёр"),
        ("Карьерный переход", "В команду Dentons пришёл Иван Петров.", None),
        ("Карьерный переход", "Иван Петров присоединился к Firm.One в качестве партнёра.", "партнёр"),
        ("Карьерный переход", "Мария Орлова покинула Dentons после десяти лет работы.", None),
        ("Назначение", "Старший юрист КИАП Мария Орлова стала руководителем практики по трудовому праву.", "руководитель практики"),
        ("Карьерный переход", "Иван Петров теперь работает в Сбере: ранее он был старшим юристом Dentons.", None),
        ("Карьерный переход", "Иван Петров вошёл в команду Dentons в качестве советника.", "советник"),
        ("Назначение", "Анна Орлова назначена руководителем юридического департамента компании «Лукойл».", None),
        ("Карьерный переход", "Партнёр Иван Петров ушёл из Пепеляев Групп и присоединился к Dentons.", "партнёр"),
    )

    def test_promotions_demotions_moves_and_appointments_are_found_with_the_role(self):
        for subtype, text, role in self.CASES:
            match = rules.classify(text, TODAY, "Право.ru")
            self.assertIsNotNone(match, text)
            self.assertEqual((match.kind, match.subtype), ("news", subtype), text)
            if role:
                self.assertEqual(match.role, role, text)

    def test_the_move_names_the_old_and_the_new_employer(self):
        m = rules.classify("Партнёр Иван Петров перешёл из Dentons в Пепеляев Групп.", TODAY, "Право.ru")
        self.assertEqual((m.origin, m.company), ("Dentons", "Пепеляев Групп"))
        m = rules.classify("Иван Петров перешёл из «Сбера» в «Яндекс».", TODAY, "Право.ru")
        self.assertEqual(m.company, "Яндекс")


class RemovedNewsTests(unittest.TestCase):
    def test_speeches_and_opinions_are_not_news_any_more(self):
        for text in (
            "Екатерина Белова выступила на форуме «Legal Tech 2026» с докладом об искусственном интеллекте в юридической практике.",
            "Павел Смирнов, партнёр Noerr, отметил, что рынок M&A в 2026 году восстановится быстрее, чем ожидалось.",
            "Александр Морозов, партнёр ЕПАП, рассказал, как меняется практика по субсидиарной ответственности.",
            "Иван Сидоров выступил за отмену налога. Юристы это поддержали.",
        ):
            self.assertIsNone(kind_of(text), text)

    def test_awards_and_new_practices_stay(self):
        self.assertEqual(kind_of("Алексей Громов награждён Chambers Europe в номинации «Разрешение споров»."), ("news", "Награда"))
        self.assertEqual(kind_of("Юрист Анна Иванова открыла собственную практику по банкротству."), ("news", "Открытие"))

    def test_the_match_has_no_speech_or_opinion_fields(self):
        names = {field for field in rules.Match.__dataclass_fields__}
        self.assertNotIn("quote", names)
        self.assertFalse(hasattr(rules, "SOFT_NEWS"))


class LaborCourtPracticeTests(unittest.TestCase):
    LABOR = (
        "Верховный суд разъяснил, что работодатель обязан выплатить компенсацию при незаконном увольнении сотрудника.",
        "Суд восстановил на работе уволенного сотрудника и взыскал заработную плату за время вынужденного прогула.",
        "Пленум ВС РФ принял постановление о применении трудового законодательства: отпуск, сверхурочные и зарплата.",
        "Конституционный суд признал незаконным увольнение работника без выплаты компенсации и разъяснил права работников.",
        "Верховный суд: работодатель не вправе отказать в отпуске работнику, указал суд в определении.",
    )
    NOT_LABOR = (
        "Верховный суд указал, что кредитор вправе требовать неустойку. Определение № 305-ЭС24-1234 по договору подряда.",
        "Конституционный суд рассмотрел жалобу на закон о банкротстве граждан.",
        "Пленум ВС РФ принял постановление о применении норм о банкротстве.",
        "Суд признал договор недействительным, истец заявил, что ответчик нарушил условия.",
        "Верховный суд разъяснил порядок оспаривания торгов по госзакупкам.",
        "Суд признал сделку недействительной и взыскал убытки с ответчика.",
    )

    def test_court_news_is_kept_only_for_labor_disputes(self):
        for text in self.LABOR:
            self.assertEqual(kind_of(text), ("law", "Судебная практика"), text)
        for text in self.NOT_LABOR:
            self.assertIsNone(kind_of(text), text)

    def test_laws_and_agency_clarifications_stay_on_every_topic(self):
        self.assertEqual(kind_of("Госдума приняла закон о маркировке рекламы. Закон вступает в силу с 1 января 2027 года."),
                         ("law", "Закон"))
        self.assertEqual(kind_of("ФНС разъяснила порядок уплаты НДС для маркетплейсов."), ("law", "Разъяснение ведомства"))


class EndToEndTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_digest_has_the_real_career_news_and_labor_practice_and_nothing_about_liability(self):
        texts = [
            "Иван Петров перешёл из Dentons в Пепеляев Групп в качестве партнёра.",
            "Иван Петров назначен обвиняемым по делу о мошенничестве, суд избрал меру пресечения.",
            "Адвокат Иван Сидоров привлечён к дисциплинарной ответственности, ему назначено наказание.",
            "Павел Смирнов, партнёр Noerr, отметил, что рынок M&A восстановится быстрее.",
            "Екатерина Белова выступила на форуме «Legal Tech 2026» с докладом.",
            "Верховный суд указал, что кредитор вправе требовать неустойку по договору подряда.",
            "Верховный суд разъяснил, что работодатель обязан выплатить компенсацию при незаконном увольнении.",
        ]
        messages = [
            NS(id=n, message=text, entities=None, date=datetime.now(timezone.utc) - timedelta(hours=1))
            for n, text in enumerate(texts, 1)
        ]
        sent = []

        class Client:
            async def iter_messages(self, entity, min_id=0, limit=None):
                for m in sorted(messages, key=lambda m: m.id, reverse=True)[:limit]:
                    if m.id > min_id:
                        yield m

            async def get_me(self):
                return NS(id=1)

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield Client()

        async def fake_sources(_client, _folder):
            return [reader.Source(id=1, title="Закон.ру", username="zakon", entity=NS())]

        async def fake_deliver(_cfg, _client, texts):
            sent.extend(texts)

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver):
            await cli.cmd_run(config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), Path(tmp)), print_only=False)
        digest = "\n".join(sent)
        self.assertIn("Переход: Dentons → <b>Пепеляев Групп</b>", digest)
        self.assertIn("Судебная практика: трудовые споры", digest)
        self.assertIn("незаконном увольнении", digest)
        for absent in ("обвиняемым", "Сидоров", "Noerr", "Legal Tech", "неустойку"):
            self.assertNotIn(absent, digest)


if __name__ == "__main__":
    unittest.main()
