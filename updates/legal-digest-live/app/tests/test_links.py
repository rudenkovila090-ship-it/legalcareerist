import csv
import io
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from telethon.tl.custom import Message
from telethon.tl.types import MessageEntityTextUrl, MessageEntityUrl, PeerChannel

from digest import cli, config, export, reader, render, rules
from digest.store import Item, Store

TODAY = date(2026, 10, 28)
POSTED = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


class FindLinksTests(unittest.TestCase):
    def test_links_in_the_text_hidden_ones_and_duplicates(self):
        text = "Регистрация: https://example.com/reg?utm_source=tg. Подробности https://www.example.com/reg/ и https://hh.ru/vacancy/1"
        self.assertEqual(
            rules.find_links(text, urls=("https://forms.gle/abc",)),
            ("https://forms.gle/abc", "https://example.com/reg?utm_source=tg", "https://hh.ru/vacancy/1"),
        )

    def test_trailing_punctuation_is_not_part_of_the_link(self):
        self.assertEqual(rules.find_links("Подробнее: https://example.com/a, и ещё https://example.com/b!"),
                         ("https://example.com/a", "https://example.com/b"))

    def test_only_web_links_are_taken(self):
        self.assertEqual(rules.find_links("", urls=("tg://resolve?domain=x", "mailto:hr@x.ru", "https://x.ru")), ("https://x.ru",))

    def test_the_link_to_the_channel_itself_is_noise_but_another_post_of_it_is_not(self):
        text = "Подписывайтесь: https://t.me/zakon_ru\nПродолжение: https://t.me/zakon_ru/501\nБот: https://t.me/reg_bot?start=1"
        self.assertEqual(rules.find_links(text, channel_username="Zakon_RU"),
                         ("https://t.me/zakon_ru/501", "https://t.me/reg_bot?start=1"))
        self.assertEqual(rules.find_links("https://t.me/c/777\nhttps://t.me/c/777/5", channel_id=777), ("https://t.me/c/777/5",))

    def test_at_most_four_links(self):
        text = " ".join(f"https://example.com/{n}" for n in range(9))
        self.assertEqual(len(rules.find_links(text)), 4)

    def test_every_kind_of_match_carries_its_links(self):
        link = "https://example.com/x"
        cases = {
            "vacancy": f"#вакансия\nЮрист в корпоративную практику\nУсловия: зарплата от 150 000\nРезюме: @hr_firm\n{link}",
            "event": f"Вебинар по трудовому праву 5 ноября в 19:00. Регистрация: {link}",
            "news": f"Иван Петров присоединился к команде Пепеляев Групп в качестве партнёра юридической практики. {link}",
            "law": f"Госдума приняла закон о маркировке рекламы. Закон вступает в силу с 1 января 2027 года. {link}",
        }
        for kind, text in cases.items():
            match = rules.classify(text, TODAY, "Право.ru")
            self.assertEqual((match.kind, match.links), (kind, (link,)), kind)

    def test_a_post_without_links_has_none(self):
        match = rules.classify("Госдума приняла закон о маркировке рекламы.", TODAY)
        self.assertEqual((match.kind, match.links), ("law", ()))


class MessageUrlsTests(unittest.TestCase):
    def test_hidden_link_visible_link_without_scheme_and_both_kinds_of_buttons(self):
        text = "Откликнуться: hh.ru/vacancy/1 и анкета"
        message = Message(
            id=1, peer_id=PeerChannel(1), message=text,
            entities=[MessageEntityUrl(offset=text.index("hh.ru"), length=len("hh.ru/vacancy/1")),
                      MessageEntityTextUrl(offset=text.index("анкета"), length=6, url="https://forms.gle/abc")],
        )
        message.reply_markup = NS(rows=[
            NS(buttons=[NS(text="Регистрация", url="https://reg.example.com/old-style")]),  # Telethon до 1.4x
            NS(buttons=[NS(text="Сайт", type=NS(url="https://site.example.com/new-style")), NS(text="Ответ", data=b"1")]),
        ])
        self.assertEqual(reader._message_urls(message), (
            "https://forms.gle/abc", "https://hh.ru/vacancy/1", "https://reg.example.com/old-style",
            "https://site.example.com/new-style",
        ))

    def test_message_without_links_or_buttons(self):
        self.assertEqual(reader._message_urls(NS(entities=None)), ())
        self.assertEqual(reader._message_urls(Message(id=1, peer_id=PeerChannel(1), message="Просто текст")), ())

    def test_the_same_link_twice_counts_once(self):
        message = NS(entities=[NS(url="https://x.ru/a"), NS(url="https://x.ru/a")],
                     reply_markup=NS(rows=[NS(buttons=[NS(url="https://x.ru/a")])]))
        self.assertEqual(reader._message_urls(message), ("https://x.ru/a",))


def vacancy(msg_id=1, **kw):
    return Item(1, msg_id, "vacancy", kw.pop("title", "Юрист в Сбер"), "Закон.ру", f"https://t.me/zakon/{msg_id}", None, None,
                None, POSTED, **kw)


def news(**kw):
    return Item(1, 3, "news", "Иван Петров перешёл в Dentons", "Право.ru", "https://t.me/pravo/3", None, None, None, POSTED,
                subtype="Карьерный переход", people=("Иван Петров",), **kw)


def law(**kw):
    return Item(1, 4, "law", "Принят закон", "Налоги", "https://t.me/nalogi/4", None, None, None, POSTED, subtype="Закон", **kw)


def event(**kw):
    return Item(1, 5, "event", "Вебинар по налогам", "Закон.ру", "https://t.me/zakon/5", date(2026, 10, 30), time(15, 0), None,
                POSTED, **kw)


class RenderLinksTests(unittest.TestCase):
    def test_every_section_shows_the_post_link_in_the_channel(self):
        items = [vacancy(), event(), news(), law()]
        messages = render.build_digest(items, TODAY)
        expected = ["t.me/zakon/1", "t.me/zakon/5", "t.me/pravo/3", "t.me/nalogi/4"]
        for message, short in zip(messages, ("t.me/zakon/5", "t.me/zakon/1", "t.me/pravo/3", "t.me/nalogi/4")):
            self.assertIn(f'🔗 Пост: <a href="https://{short}">{short}</a>', message)
        self.assertEqual(len(expected), len(messages))

    def test_links_from_the_post_follow_in_their_own_line_in_every_section(self):
        links = ("https://example.com/doc", "https://hh.ru/vacancy/9")
        for item in (vacancy(links=links), news(links=links), law(links=links)):
            (text,) = render.build_digest([item], TODAY)
            self.assertIn(
                '🌐 В посте: <a href="https://example.com/doc">example.com/doc</a> · '
                '<a href="https://hh.ru/vacancy/9">hh.ru/vacancy/9</a>', text, item.kind)

    def test_event_keeps_the_registration_link_and_adds_the_rest(self):
        item = event(reg_url="https://example.com/reg",
                     links=("https://example.com/reg", "https://example.com/program", "https://t.me/reg_bot"))
        (text,) = render.build_digest([item], TODAY)
        self.assertIn('→ <a href="https://example.com/reg">Подробнее и регистрация</a>', text)
        self.assertIn('🔗 Пост: <a href="https://t.me/zakon/5">t.me/zakon/5</a>', text)
        self.assertIn('🌐 В посте: <a href="https://example.com/program">example.com/program</a> · '
                      '<a href="https://t.me/reg_bot">t.me/reg_bot</a>', text)
        self.assertEqual(text.count("example.com/reg"), 1)  # ссылка регистрации показана один раз, в «В посте» не повторяется

    def test_undated_event_has_the_post_link_too(self):
        item = Item(1, 6, "event", "Приглашаем на вебинар", "Канал", "https://t.me/c/1/6", None, None, None, POSTED,
                    links=("https://example.com/r",))
        (text,) = render.build_digest([item], TODAY)
        self.assertIn("Дата не указана", text)
        self.assertIn("🔗 Пост: ", text)
        self.assertIn("🌐 В посте: ", text)

    def test_vacancy_contacts_and_links_do_not_repeat_each_other(self):
        item = vacancy(contacts=("@hr_anna", "hr@legal.ru", "https://hh.ru/vacancy/1"),
                       links=("https://t.me/hr_anna", "https://hh.ru/vacancy/1", "https://t.me/other_bot"))
        (text,) = render.build_digest([item], TODAY)
        self.assertIn("контакты: @hr_anna, hr@legal.ru\n", text)
        self.assertEqual(text.count('href="https://hh.ru/vacancy/1"'), 1)
        self.assertNotIn("t.me/hr_anna", text)  # уже есть среди контактов
        self.assertIn("t.me/other_bot", text)

    def test_at_most_three_links_are_shown_and_long_ones_are_shortened(self):
        long = "https://example.com/" + "a" * 100 + "?utm_source=tg&id=7"
        item = news(links=(long, "https://b.ru", "https://c.ru", "https://d.ru"))
        (text,) = render.build_digest([item], TODAY)
        self.assertNotIn("d.ru", text)
        shortened = next(line for line in text.splitlines() if "В посте" in line).split('">')[1].split("</a>")[0]
        self.assertLessEqual(len(shortened), 42)
        self.assertTrue(shortened.endswith("…"))
        self.assertIn(f'href="{long.replace("&", "&amp;")}"', text)  # адрес целый и экранированный
        self.assertNotIn("utm_source", shortened)

    def test_html_in_a_link_is_escaped(self):
        (text,) = render.build_digest([law(links=('https://example.com/?a=1&b="2"',))], TODAY)
        self.assertIn('href="https://example.com/?a=1&amp;b=&quot;2&quot;"', text)

    def test_old_records_without_links_fall_back_to_what_they_had(self):
        (text,) = render.build_digest([law(reg_url="https://example.com/doc")], TODAY)
        self.assertIn('🌐 В посте: <a href="https://example.com/doc">example.com/doc</a>', text)
        (text,) = render.build_digest([vacancy(contacts=("@hr", "https://hh.ru/vacancy/1"))], TODAY)
        self.assertIn("hh.ru/vacancy/1", text)

    def test_merged_duplicates_show_the_links_of_the_best_post(self):
        a = vacancy(1, title="Старший юрист в VK")
        b = Item(2, 2, "vacancy", "Старший юрист в VK", "Канал B", "https://t.me/b/2", None, None, None, POSTED,
                 contacts=("@hr_vk",), company="VK", links=("https://hh.ru/vacancy/5",))
        (text,) = render.build_digest([a, b], TODAY)
        self.assertIn("t.me/b/2", text)
        self.assertIn("hh.ru/vacancy/5", text)


class StoreAndExportTests(unittest.TestCase):
    def test_links_survive_the_database(self):
        store = Store(":memory:")
        store.add_item(news(links=("https://a.ru/x", "https://t.me/bot")))
        (item,) = store.pending_items(TODAY, 14)
        self.assertEqual(item.links, ("https://a.ru/x", "https://t.me/bot"))

    def test_csv_has_the_links_column(self):
        with tempfile.TemporaryDirectory() as tmp:
            export.export_items(Path(tmp), [news(links=("https://a.ru/x", "https://b.ru/y")),
                                            law(links=("https://c.ru/z",))])
            for name, expected in (("news.csv", "https://a.ru/x https://b.ru/y"), ("law.csv", "https://c.ru/z")):
                header, row = list(csv.reader(io.StringIO((Path(tmp) / name).read_text(encoding="utf-8-sig"))))
                self.assertEqual(dict(zip(header, row))["Ссылки из поста"], expected, name)


class FakeClient:
    def __init__(self, messages):
        self.messages = messages

    async def iter_messages(self, entity, min_id=0, limit=None):
        for message in sorted(self.messages, key=lambda m: m.id, reverse=True)[:limit]:
            if message.id > min_id:
                yield message

    async def get_me(self):
        return NS(id=777)


class EndToEndTests(unittest.IsolatedAsyncioTestCase):
    async def run_digest(self, *messages, username="zakon_ru"):
        sent = []

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield FakeClient(list(messages))

        async def fake_sources(_client, _folder):
            return [reader.Source(id=42, title="Закон.ру", username=username, entity=NS())]

        async def fake_deliver(_cfg, _client, texts):
            sent.extend(texts)

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver):
            cfg = config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), Path(tmp))
            await cli.cmd_run(cfg, print_only=False)
        return "\n".join(sent)

    def message(self, msg_id, text, button_url=None):
        message = Message(id=msg_id, peer_id=PeerChannel(42), message=text,
                          date=datetime.now(timezone.utc) - timedelta(hours=1))
        if button_url:
            message.reply_markup = NS(rows=[NS(buttons=[NS(text="Подробнее", url=button_url)])])
        return message

    async def test_news_has_the_post_link_and_the_button_link_and_not_the_link_to_the_channel_itself(self):
        text = "Иван Петров присоединился к команде Пепеляев Групп в качестве партнёра юридической практики.\nhttps://t.me/zakon_ru"
        digest = await self.run_digest(self.message(7, text, button_url="https://example.com/more"))
        self.assertIn('🔗 Пост: <a href="https://t.me/zakon_ru/7">t.me/zakon_ru/7</a>', digest)
        self.assertIn('🌐 В посте: <a href="https://example.com/more">example.com/more</a>', digest)
        self.assertNotIn("t.me/zakon_ru</a>", digest)

    async def test_private_channel_post_link_and_no_link_to_the_channel_itself(self):
        text = "Иван Петров присоединился к команде Пепеляев Групп в качестве партнёра юридической практики.\nhttps://t.me/c/42"
        digest = await self.run_digest(self.message(9, text, button_url="https://example.com/more"), username=None)
        self.assertIn('🔗 Пост: <a href="https://t.me/c/42/9">t.me/c/42/9</a>', digest)
        self.assertNotIn('<a href="https://t.me/c/42">', digest)

    async def test_vacancy_has_the_post_link_and_the_link_from_the_post(self):
        text = "#вакансия\nЮрист в корпоративную практику\nУсловия: зарплата от 150 000\nОткликнуться: hh.ru/vacancy/777"
        message = self.message(8, text)
        message.entities = [MessageEntityUrl(offset=text.index("hh.ru"), length=len("hh.ru/vacancy/777"))]
        digest = await self.run_digest(message)
        self.assertIn('🔗 Пост: <a href="https://t.me/zakon_ru/8">t.me/zakon_ru/8</a>', digest)
        self.assertIn('🌐 В посте: <a href="https://hh.ru/vacancy/777">hh.ru/vacancy/777</a>', digest)


if __name__ == "__main__":
    unittest.main()
