import plistlib
import tempfile
import unittest
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from digest import cli, config, reader, status, update
from digest.store import Store

NOON = datetime(2026, 10, 30, 12, 0)
MORNING = datetime(2026, 10, 30, 9, 0)


class TempDirTestCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)


class StatusTests(TempDirTestCase):
    def setUp(self):
        super().setUp()
        self.root = self.tmp / "legal-digest"
        self.home = self.tmp / "home"
        (self.root / "data").mkdir(parents=True)
        self.cfg = config.Config(1, "hash", "TOKEN", None, "Мониторинг", 14, 14, (), (), self.root / "data")

    def install_plist(self, folder=None, times=({"Hour": 9, "Minute": 0}, {"Hour": 15, "Minute": 0})):
        path = self.home / "Library" / "LaunchAgents" / f"{status.LABEL}.plist"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(plistlib.dumps({
            "Label": status.LABEL, "WorkingDirectory": str(folder or self.root), "StartCalendarInterval": list(times),
        }))

    def healthy(self):
        (self.root / "data" / "session.session").write_text("")
        self.install_plist()
        store = Store(self.cfg.db_path)
        store.set_meta("last_full_digest", "2026-10-30")
        store.set_meta("last_sent", "2026-10-30 09:00, сообщений: 4")
        store.close()

    def report(self, now=NOON, loaded=lambda label: True, is_mac=True):
        return status.report(self.cfg, self.root, now=now, home=self.home, is_mac=is_mac, loaded=loaded)

    def test_everything_in_order(self):
        self.healthy()
        text = self.report()
        self.assertIn("Автозапуск: включён, каждый день в 9:00, 15:00", text)
        self.assertIn("Вход в Telegram: выполнен", text)
        self.assertIn("Бот: подключён", text)
        self.assertIn("Всё в порядке", text)
        self.assertNotIn("ЧТО ИСПРАВИТЬ", text)

    def test_nothing_set_up_lists_every_fix(self):
        text = self.report()
        self.assertIn("Вход в Telegram: НЕ выполнен", text)
        self.assertIn("Автозапуск: НЕ включён", text)
        self.assertIn("ЧТО ИСПРАВИТЬ", text)
        self.assertIn("-m digest login", text)
        self.assertIn("bash schedule-mac.sh", text)
        self.assertIn("ещё не создан", text)  # журнала нет: автозапуск ни разу не срабатывал

    def test_a_schedule_that_runs_another_folder_is_caught(self):
        self.healthy()
        (self.home / "Library" / "LaunchAgents" / f"{status.LABEL}.plist").unlink()
        self.install_plist(folder=self.tmp / "old-digest")
        text = self.report()
        self.assertIn("запускает ДРУГУЮ папку", text)
        self.assertIn("ЧТО ИСПРАВИТЬ", text)

    def test_a_schedule_file_that_macos_did_not_load(self):
        self.healthy()
        text = self.report(loaded=lambda label: False)
        self.assertIn("macOS его не загрузила", text)
        self.assertIn("ЧТО ИСПРАВИТЬ", text)

    def test_a_broken_schedule_file(self):
        self.healthy()
        (self.home / "Library" / "LaunchAgents" / f"{status.LABEL}.plist").write_text("не plist")
        self.assertIn("повреждён", self.report())

    def test_the_last_error_is_shown_and_must_be_fixed(self):
        self.healthy()
        Store(self.cfg.db_path).set_meta("last_error", "2026-10-30 09:00 · Вход в Telegram не выполнен")
        text = self.report()
        self.assertIn("Последняя ошибка: 2026-10-30 09:00 · Вход в Telegram не выполнен", text)
        self.assertIn("ЧТО ИСПРАВИТЬ", text)

    def test_missing_morning_digest_is_flagged_only_after_ten(self):
        self.healthy()
        Store(self.cfg.db_path).set_meta("last_full_digest", "2026-10-29")
        self.assertIn("Сегодняшней утренней сводки не было", self.report(now=datetime(2026, 10, 30, 11, 0)))
        self.assertNotIn("Сегодняшней утренней сводки не было", self.report(now=datetime(2026, 10, 30, 9, 30)))

    def test_the_tail_of_the_log_and_a_missing_bot(self):
        self.healthy()
        self.cfg = config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), self.root / "data")
        (self.root / "data" / "run.log").write_text("\n".join(f"строка {n}" for n in range(10)) + "\n", encoding="utf-8")
        text = self.report()
        self.assertIn("строка 9", text)
        self.assertNotIn("строка 5", text)  # только последние строки
        self.assertIn("Бот: не подключён", text)

    def test_a_broken_database_is_reported_instead_of_crashing(self):
        self.healthy()
        self.cfg.db_path.write_text("это не база данных", encoding="utf-8")
        text = self.report()
        self.assertIn("ПОВРЕЖДЕНА", text)
        self.assertIn("ЧТО ИСПРАВИТЬ", text)
        self.assertIn("mv data/digest.sqlite3", text)
        self.assertIn("Автозапуск: включён", text)  # остальная проверка продолжается

    def test_other_systems_are_told_to_check_by_hand(self):
        self.assertIn("не macOS", self.report(is_mac=False))


class UpdateTests(TempDirTestCase):
    def make_program(self, folder, version, readme="README", requirements="telethon>=1.36\n", schedule="#!/bin/bash\n"):
        (folder / "digest").mkdir(parents=True, exist_ok=True)
        (folder / "digest" / "__init__.py").write_text(f'__version__ = "{version}"\n', encoding="utf-8")
        (folder / "digest" / "extra.py").write_text(f"# {version}\n", encoding="utf-8")
        (folder / "digest" / "__pycache__").mkdir(exist_ok=True)
        (folder / "digest" / "__pycache__" / "x.pyc").write_bytes(b"cache")
        (folder / "README.md").write_text(readme, encoding="utf-8")
        (folder / "requirements.txt").write_text(requirements, encoding="utf-8")
        (folder / "schedule-mac.sh").write_text(schedule, encoding="utf-8")
        return folder

    def setUp(self):
        super().setUp()
        self.root = self.make_program(self.tmp / "legal-digest", "1.0")
        (self.root / ".env").write_text("TG_API_HASH=secret\n")
        (self.root / "channels.txt").write_text("law: Канал\n")
        (self.root / "contacted.txt").write_text("Сбер\n")
        (self.root / "data").mkdir()
        (self.root / "data" / "digest.sqlite3").write_text("база")
        (self.root / "data" / "session.session").write_text("сессия")
        self.downloads = self.tmp / "Downloads"
        self.messages: list[str] = []

    def run_update(self, **kw):
        with mock.patch.object(update.subprocess, "run") as pip:
            code = update.run(self.root, downloads=self.downloads, echo=self.messages.append, **kw)
        return code, pip

    def test_finds_the_newest_version_in_either_layout_and_with_spaces_in_the_name(self):
        self.make_program(self.downloads / "my-website-claude-x" / "telegram-digest", "1.0.5")
        self.make_program(self.downloads / "telegram-digest 2", "1.1")
        self.make_program(self.downloads / "telegram-digest", "0.9.2")
        (self.downloads / "other" / "digest").mkdir(parents=True)  # чужая папка без версии
        found = update.candidates(self.downloads)
        self.assertEqual([update.show(v) for v, _ in found], ["1.1", "1.0.5", "0.9.2"])
        self.assertEqual(found[0][1].name, "telegram-digest 2")

    def test_the_newest_archive_is_installed_and_the_users_files_are_untouched(self):
        self.make_program(self.downloads / "telegram-digest 2", "1.1", readme="НОВЫЙ README")
        self.make_program(self.downloads / "telegram-digest", "1.0.5", readme="СТАРЫЙ README")
        code, _ = self.run_update()
        self.assertEqual(code, 0)
        self.assertEqual((self.root / "digest" / "__init__.py").read_text(), '__version__ = "1.1"\n')
        self.assertEqual((self.root / "README.md").read_text(), "НОВЫЙ README")
        self.assertFalse((self.root / "digest" / "__pycache__" / "x.pyc").read_bytes() != b"cache")  # кэш не копируется
        for name, content in ((".env", "TG_API_HASH=secret\n"), ("channels.txt", "law: Канал\n"), ("contacted.txt", "Сбер\n"),
                              ("data/digest.sqlite3", "база"), ("data/session.session", "сессия")):
            self.assertEqual((self.root / name).read_text(), content, name)
        self.assertIn("Обновлено: 1.0 → 1.1", self.messages[0])
        self.assertTrue(any("digest status" in m for m in self.messages))

    def test_an_old_or_equal_archive_changes_nothing(self):
        self.make_program(self.downloads / "telegram-digest", "1.0", readme="ТОТ ЖЕ")
        code, _ = self.run_update()
        self.assertEqual(code, 0)
        self.assertIn("Уже установлена самая новая версия: 1.0", self.messages[0])
        self.assertEqual((self.root / "README.md").read_text(), "README")

    def test_version_numbers_are_compared_as_numbers_not_as_text(self):
        self.make_program(self.downloads / "telegram-digest", "1.10")
        self.root = self.make_program(self.tmp / "other-root", "1.9")
        self.run_update()
        self.assertEqual((self.root / "digest" / "__init__.py").read_text(), '__version__ = "1.10"\n')

    def test_no_archive_in_downloads(self):
        self.downloads.mkdir()
        code, _ = self.run_update()
        self.assertEqual(code, 1)
        self.assertIn("Не нашёл распакованный архив", self.messages[0])

    def test_an_explicit_folder(self):
        folder = self.make_program(self.tmp / "somewhere" / "telegram-digest", "1.2")
        code, _ = self.run_update(source=folder)
        self.assertEqual(code, 0)
        self.assertIn("1.0 → 1.2", self.messages[0])
        code, _ = self.run_update(source=self.tmp / "empty")
        self.assertEqual(code, 1)

    def test_libraries_are_installed_only_when_the_list_changed(self):
        self.make_program(self.downloads / "telegram-digest", "1.1")
        _, pip = self.run_update()
        pip.assert_not_called()
        self.make_program(self.downloads / "telegram-digest 3", "1.2", requirements="telethon>=1.36\nqrcode>=7.4\n")
        _, pip = self.run_update()
        pip.assert_called_once()
        self.assertIn("-r", pip.call_args.args[0])

    def test_a_changed_schedule_script_asks_to_reinstall_the_schedule(self):
        self.make_program(self.downloads / "telegram-digest", "1.1", schedule="#!/bin/bash\n# новый\n")
        self.run_update()
        self.assertTrue(any("bash schedule-mac.sh" in m for m in self.messages))

    def test_the_update_command_needs_no_env_file(self):
        folder = self.make_program(self.tmp / "archive" / "telegram-digest", "1.3")
        with mock.patch.object(config, "ROOT", self.root), mock.patch.object(update.subprocess, "run"):
            with self.assertRaises(SystemExit) as ctx:
                cli.main(["update", "--from", str(folder)])
        self.assertEqual(ctx.exception.code, 0)
        self.assertEqual((self.root / "digest" / "__init__.py").read_text(), '__version__ = "1.3"\n')


class FakeClient:
    async def iter_messages(self, entity, min_id=0, limit=None):
        return
        yield  # асинхронный генератор без постов

    async def get_me(self):
        return NS(id=1)


class RunBookkeepingTests(TempDirTestCase, unittest.IsolatedAsyncioTestCase):
    def cfg(self):
        return config.Config(1, "hash", None, None, "Мониторинг", 14, 14, (), (), self.tmp)

    async def run_at(self, moment, auto=True):
        sent = []

        @asynccontextmanager
        async def fake_connected(cfg, interactive=False):
            yield FakeClient()

        async def fake_sources(_client, _folder):
            return [reader.Source(id=1, title="Канал", username="ch", entity=NS())]

        async def fake_deliver(_cfg, _client, texts):
            sent.extend(texts)

        with mock.patch.object(cli, "connected", fake_connected), \
                mock.patch.object(cli.reader, "list_sources", fake_sources), \
                mock.patch.object(cli.reader, "PAUSE_SECONDS", 0), \
                mock.patch.object(cli, "_deliver", fake_deliver), \
                mock.patch.object(cli, "_now", lambda: moment):
            await cli.cmd_run(self.cfg(), print_only=False, auto=auto)
        return sent

    async def test_a_repeated_automatic_run_does_not_send_a_second_nothing_found(self):
        first = await self.run_at(MORNING)
        self.assertEqual(len(first), 1)
        self.assertIn("не нашлось", first[0])
        self.assertEqual(await self.run_at(MORNING + timedelta(minutes=5)), [])  # например, после перезагрузки Mac

    async def test_a_manual_run_always_answers(self):
        await self.run_at(MORNING)
        again = await self.run_at(MORNING + timedelta(minutes=5), auto=False)
        self.assertEqual(len(again), 1)

    async def test_the_next_day_the_heartbeat_comes_again(self):
        await self.run_at(MORNING)
        self.assertEqual(len(await self.run_at(MORNING + timedelta(days=1))), 1)

    async def test_last_run_and_last_sent_are_remembered_and_the_error_is_cleared(self):
        Store(self.cfg().db_path).set_meta("last_error", "старая ошибка")
        await self.run_at(MORNING)
        store = Store(self.cfg().db_path)
        self.assertEqual(store.get_meta("last_run"), "2026-10-30 09:00")
        self.assertEqual(store.get_meta("last_sent"), "2026-10-30 09:00, сообщений: 1")
        self.assertEqual(store.get_meta("last_error"), "")

    async def test_a_failure_is_written_down_even_without_a_bot(self):
        cfg = self.cfg()
        with mock.patch.object(cli, "_now", lambda: MORNING):
            cli._report_failure(cfg, SystemExit("Вход в Telegram не выполнен"))
        self.assertEqual(Store(cfg.db_path).get_meta("last_error"), "2026-10-30 09:00 · Вход в Telegram не выполнен")


if __name__ == "__main__":
    unittest.main()
