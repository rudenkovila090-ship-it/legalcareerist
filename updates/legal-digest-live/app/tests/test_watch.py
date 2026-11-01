import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch

from digest import config, reader, rules
from digest.store import Store
from digest.watch import Watcher, MOSCOW

VACANCY = "Юридическая фирма Ромашка ищет юриста по судебной работе. Зарплата от 150 000 рублей. Отклик: hr@example.com"
CAREER = "Иван Петров перешёл из Dentons в Пепеляев Групп в качестве партнёра."
LABOR = "Верховный суд разъяснил, что работодатель обязан выплатить компенсацию при незаконном увольнении."
TAX = "ФНС разъяснила порядок уплаты НДС для маркетплейсов."


class WatchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cfg = config.Config(1, "hash", "fake", 123, "Мониторинг", 14, 14, (), (), Path(self.tmp.name))
        self.store = Store(self.cfg.db_path)
        self.addCleanup(self.store.close)
        self.now = datetime(2026, 11, 2, 8, 59, tzinfo=MOSCOW)
        self.deliver = AsyncMock()
        self.w = Watcher(self.cfg, NS(), self.store, self.deliver, lambda: self.now)
        self.source = reader.Source(42, "Право.ru", "pravo_ru", NS())
        self.w.sources = {42: self.source}

    def event(self, text, msg_id=1, channel_id=42):
        return NS(message=NS(id=msg_id, message=text, date=self.now, peer_id=NS(channel_id=channel_id)))

    async def test_vacancy_delivered_on_new_event_without_scan_or_clock_wait(self):
        await self.w.on_event(self.event(VACANCY))
        self.deliver.assert_awaited_once()
        self.assertIn("Вакансии", self.deliver.call_args.args[2][0])
        self.assertEqual(self.store.pending_items(self.now.date(), 14), [])
        self.assertEqual(self.store.last_msg_id(42), 0)  # event must not skip scan gaps

    async def test_news_and_labor_wait_until_nine_moscow_and_not_in_vacancy_feed(self):
        await self.w.on_event(self.event(CAREER, 1))
        await self.w.on_event(self.event(LABOR, 2))
        await self.w.publish_morning()
        self.deliver.assert_not_awaited()
        self.now = self.now.replace(hour=9, minute=0)
        await self.w.publish_morning()
        self.deliver.assert_awaited_once()
        text = "\n".join(self.deliver.call_args.args[2])
        self.assertIn("Новости юридического рынка", text)
        self.assertIn("Законодательство", text)
        self.assertNotIn("Вакансии ·", text)
        await self.w.publish_morning()
        self.assertEqual(self.deliver.await_count, 1)

    async def test_all_law_not_just_court_practice_is_filtered(self):
        for i, text in enumerate([TAX, "Госдума приняла закон о маркировке рекламы. Закон вступает в силу с 1 января 2027 года.",
                                  "ФНС разъяснила порядок уплаты НДС для работодателей."], 1):
            self.assertIsNotNone(rules.classify(text, self.now.date()))
            await self.w.on_event(self.event(text, i))
        self.assertEqual(self.store.pending_items(self.now.date(), 14), [])
        await self.w.on_event(self.event("Минтруд разъяснил порядок предоставления ежегодного отпуска работникам.", 5))
        self.assertEqual([i.kind for i in self.store.pending_items(self.now.date(), 14)], ["law"])

    async def test_failed_delivery_is_retried_from_database(self):
        self.deliver.side_effect = RuntimeError("fake send failure")
        await self.w.on_event(self.event(VACANCY))
        self.assertEqual(len(self.store.pending_items(self.now.date(), 14)), 1)
        self.deliver.side_effect = None
        # A restarted watcher reads the same persistent outbox.
        restarted = Watcher(self.cfg, NS(), self.store, self.deliver, lambda: self.now)
        await restarted.publish_vacancies()
        self.assertEqual(self.store.pending_items(self.now.date(), 14), [])

    async def test_duplicate_event_edit_and_crosspost_are_not_resent(self):
        await self.w.on_event(self.event(VACANCY))
        await self.w.on_event(self.event(VACANCY))
        self.w.sources[43] = reader.Source(43, "Юрканал", "other", NS())
        await self.w.on_event(self.event(VACANCY, channel_id=43))
        self.assertEqual(self.deliver.await_count, 1)

    async def test_unselected_and_disabled_channels_ignored(self):
        await self.w.on_event(self.event(VACANCY, channel_id=999))
        self.w.cfg = replace(self.w.cfg, channel_modes={"@pravo_ru": "off"})
        await self.w.on_event(self.event(VACANCY))
        self.deliver.assert_not_awaited()

    async def test_missed_morning_is_sent_once_after_restart_and_next_day_again(self):
        self.now = self.now.replace(hour=11)
        await self.w.publish_morning()
        restarted = Watcher(self.cfg, NS(), self.store, self.deliver, lambda: self.now)
        await restarted.publish_morning()
        self.assertEqual(self.deliver.await_count, 1)
        self.now += timedelta(days=1)
        await restarted.publish_morning()
        self.assertEqual(self.deliver.await_count, 2)

    async def test_failed_morning_remains_pending_for_retry(self):
        await self.w.on_event(self.event(CAREER))
        self.now = self.now.replace(hour=9)
        self.deliver.side_effect = RuntimeError("network")
        with self.assertRaises(RuntimeError):
            await self.w.publish_morning()
        self.assertIsNone(self.store.get_meta("last_full_digest"))
        self.assertEqual(len(self.store.pending_items(self.now.date(), 14)), 1)

    async def test_event_waits_for_morning_and_vacancy_does_not(self):
        text = "3 ноября в 15:00 состоится бесплатный вебинар для юристов «Трудовые споры». Регистрация: https://example.com/event"
        await self.w.on_event(self.event(text, 1))
        self.assertEqual([i.kind for i in self.store.pending_items(self.now.date(), 14)], ["event"])
        self.deliver.assert_not_awaited()
        await self.w.on_event(self.event(VACANCY, 2))
        self.assertEqual(self.deliver.await_count, 1)
        self.now = self.now.replace(hour=9, minute=0)
        await self.w.publish_morning()
        self.assertIn("Мероприятия", "\n".join(self.deliver.call_args.args[2]))
        self.assertNotIn("Вакансии ·", "\n".join(self.deliver.call_args.args[2]))

    async def test_source_failure_keeps_cursor_and_vacancy_outbox(self):
        self.w.rescan = False
        self.store.set_last_msg_id(42, self.source.title, 10)
        async def broken(*args, **kwargs):
            raise OSError("offline")
            yield
        self.w.client = NS(iter_messages=broken)
        with patch.object(self.w, "refresh_sources", AsyncMock()):
            await self.w.catch_up()
        self.assertEqual(self.store.last_msg_id(42), 10)
        self.assertIn("OSError", self.store.get_meta("last_error"))

    async def test_expired_vacancy_is_not_delivered_after_outage(self):
        self.w.ingest(reader.Post(self.source, 1, VACANCY, self.now))
        self.now += timedelta(days=10)
        await self.w.publish_vacancies()
        self.deliver.assert_not_awaited()
        self.assertEqual(self.store.pending_items(self.now.date(), 14), [])

    async def test_recovery_uses_oldest_first_gap_and_preserves_failures(self):
        self.w.rescan = False
        self.store.set_last_msg_id(42, self.source.title, 10)
        async def messages(*args, **kwargs):
            self.assertEqual(kwargs, {"min_id": 10, "reverse": True, "limit": 1000})
            for n in (11, 12):
                yield self.event("Без новостей", n).message
        self.w.client = NS(iter_messages=messages)
        with patch.object(self.w, "refresh_sources", AsyncMock()), patch.object(reader, "PAUSE_SECONDS", 0):
            await self.w.catch_up()
        self.assertEqual(self.store.last_msg_id(42), 12)

    async def test_legacy_pending_law_is_rebuilt_without_erasing_sent_history(self):
        await self.w.on_event(self.event(LABOR, 1))
        self.assertEqual(len(self.store.pending_items(self.now.date(), 14)), 1)
        Watcher(self.cfg, NS(), self.store, self.deliver, lambda: self.now)
        self.assertEqual(self.store.pending_items(self.now.date(), 14), [])


class LaborSubjectTests(unittest.TestCase):
    def test_labor_law_subjects(self):
        for text in (LABOR, "Изменения в ТК РФ", "правила сверхурочной работы", "спор об отпуске", "охрана труда"):
            self.assertTrue(rules.is_labor_law(text), text)
        for text in (TAX, "НДС для работодателей", "Спор по договору поставки", "Закон о налогах для самозанятых"):
            self.assertFalse(rules.is_labor_law(text), text)
