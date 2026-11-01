import contextlib
import io
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from telethon.tl.types import Channel, ChatPhotoEmpty

from digest import cli, config, folders, reader
from digest.store import Store


class FakeClient:
    """Подставной клиент Telegram: канал с постами, от новых к старым, как отдаёт настоящий."""

    def __init__(self, messages):
        self.messages = sorted(messages, key=lambda m: m.id, reverse=True)

    async def iter_messages(self, entity, min_id=0, limit=None):
        for message in self.messages[:limit]:
            if message.id > min_id:
                yield message


def message(msg_id, text, age_days=0.0):
    return NS(id=msg_id, message=text, date=datetime.now(timezone.utc) - timedelta(days=age_days, hours=1))


SOURCE = reader.Source(id=42, title="Юридический клуб", username="legal_club", entity=NS())


class FetchPostsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        patcher = mock.patch.object(reader, "PAUSE_SECONDS", 0)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_first_run_stops_at_cutoff_and_skips_media_without_text(self):
        client = FakeClient([message(1, "очень старый", age_days=60), message(2, "старый", age_days=20),
                             message(3, "", age_days=2), message(4, "свежий", age_days=1)])
        cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        posts, newest = await reader.fetch_posts(client, SOURCE, 0, cutoff)
        self.assertEqual([p.msg_id for p in posts], [4])
        self.assertEqual(newest, 4)

    async def test_next_run_reads_only_new_posts(self):
        client = FakeClient([message(1, "a", 30), message(2, "b", 30), message(3, "c"), message(4, "d")])
        old_cutoff = datetime.now(timezone.utc) - timedelta(days=1)  # при since_id > 0 cutoff не применяется
        posts, newest = await reader.fetch_posts(client, SOURCE, 2, old_cutoff)
        self.assertEqual([p.msg_id for p in posts], [4, 3])
        self.assertEqual(newest, 4)

    async def test_nothing_new_keeps_pointer(self):
        posts, newest = await reader.fetch_posts(FakeClient([message(1, "a")]), SOURCE, 1, datetime.now(timezone.utc))
        self.assertEqual((posts, newest), ([], 1))

    def test_links(self):
        self.assertEqual(SOURCE.link(7), "https://t.me/legal_club/7")
        private = reader.Source(id=99, title="Закрытый", username=None, entity=NS())
        self.assertEqual(private.link(7), "https://t.me/c/99/7")


class FakeDialogs:
    """Подставной клиент: список диалогов и папки аккаунта."""

    def __init__(self, entities, filters):
        self.entities = entities
        self.filters = filters

    async def __call__(self, request):
        return self.filters

    async def iter_dialogs(self):
        for entity in self.entities:
            yield NS(entity=entity)


def channel(channel_id, broadcast=True):
    return Channel(id=channel_id, title=f"Канал {channel_id}", photo=ChatPhotoEmpty(), date=datetime.now(timezone.utc),
                   broadcast=broadcast, megagroup=not broadcast, username=f"c{channel_id}")


def folder(title, *ids):
    return NS(title=title, include_peers=[NS(channel_id=i, access_hash=0) for i in ids],
              pinned_peers=[], exclude_peers=[], broadcasts=False)


class ListSourcesTests(unittest.IsolatedAsyncioTestCase):
    def client(self):
        entities = [channel(1), channel(2), channel(3), channel(4), channel(5), channel(6), channel(7, broadcast=False), NS(id=8)]
        filters = NS(filters=[
            folder("Business", 1, 2, 7),
            folder("HR", 2, 3),
            folder("КЮ SMM", 4),
            folder("SMM", 5),
        ])
        return FakeDialogs(entities, filters)

    async def test_several_folders_each_channel_once_only_broadcast(self):
        sources = await reader.list_sources(self.client(), "Business, HR,  smm")
        self.assertEqual([s.id for s in sources], [1, 2, 3, 5])  # без «КЮ SMM», без группы 7 и без канала 6 вне папок

    async def test_star_or_empty_means_all_channels(self):
        for value in ("*", "", " "):
            sources = await reader.list_sources(self.client(), value)
            self.assertEqual([s.id for s in sources], [1, 2, 3, 4, 5, 6], value)

    async def test_unknown_folder_names_the_missing_one(self):
        with self.assertRaises(folders.FolderNotFound) as ctx:
            await reader.list_sources(self.client(), "HR, Marketing")
        self.assertIn("«Marketing»", str(ctx.exception))
        self.assertIn("«Business»", str(ctx.exception))


class RunCommandTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_collects_sends_once_and_does_not_repeat(self):
        event_day = date.today() + timedelta(days=3)
        client = FakeClient([
            message(1, f"Приглашаем на митап по трудовому праву {event_day:%d.%m} в 19:00. Регистрация открыта."),
            message(2, "#вакансия\nЮрист в корпоративную практику\nУсловия: зарплата от 150 000"),
            message(3, "Верховный суд разъяснил: работодатель обязан выплатить компенсацию при незаконном увольнении сотрудника."),
        ])

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield client

        async def fake_sources(_client, _folder):
            return [SOURCE]

        sent = []

        async def fake_deliver(_cfg, _client, messages):
            sent.extend(messages)

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver):
            cfg = config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), Path(tmp))

            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                await cli.cmd_run(cfg, print_only=True)
            self.assertIn("Мероприятия", out.getvalue())
            self.assertIn("Вакансии", out.getvalue())
            self.assertEqual(sent, [])  # --print-only ничего не отправляет

            await cli.cmd_run(cfg, print_only=False)
            self.assertEqual(len(sent), 3)  # мероприятия, вакансии и судебная практика приходят отдельными сообщениями
            self.assertIn("https://t.me/legal_club/1", sent[0])
            self.assertIn("Юрист в корпоративную практику", sent[1])
            self.assertIn("Судебная практика", sent[2])
            self.assertEqual(Store(cfg.db_path).last_msg_id(SOURCE.id), 3)

            sent.clear()
            await cli.cmd_run(cfg, print_only=False)  # новых постов нет, показанное повторно не приходит
            self.assertEqual(len(sent), 1)
            self.assertIn("не нашлось", sent[0])


if __name__ == "__main__":
    unittest.main()
