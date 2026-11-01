"""One Telegram session: live vacancies, durable morning queue, outage recovery."""
from __future__ import annotations

import asyncio
import logging
import signal
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from telethon import events

from . import config, reader, render
from .pipeline import ingest_post
from .store import Store

log = logging.getLogger("digest.watch")
MOSCOW = ZoneInfo("Europe/Moscow")
MORNING_KINDS = ("event", "news", "law")
RECOVERY_SECONDS = 15 * 60


class Watcher:
    def __init__(self, cfg, client, store, deliver, clock=None):
        self.cfg = replace(cfg, law_scope="labor")
        self.client, self.store, self.deliver = client, store, deliver
        self.clock = clock or (lambda: datetime.now(MOSCOW))
        self.sources = {}
        self.lock = asyncio.Lock()
        self.ready = asyncio.Event()
        self.rescan = store.get_meta("watch_labor_v1") != "yes"
        if self.rescan:
            # Unsent legacy laws lack full source text; reclassify from originals.
            with store.db:
                store.db.execute("DELETE FROM items WHERE sent_at IS NULL AND kind = 'law'")

    async def refresh_sources(self):
        sources = await reader.list_sources(self.client, self.cfg.folder_name)
        self.cfg = replace(self.cfg, channel_modes=config.load_channel_modes(config.ROOT / "channels.txt"))
        self.sources = {
            s.id: s for s in sources
            if config.channel_mode(self.cfg.channel_modes, s.title, s.username) != "off"
        }
        log.info("Живой мониторинг: каналов %d", len(self.sources))

    def ingest(self, post):
        src = post.source
        mode = config.channel_mode(self.cfg.channel_modes, src.title, src.username)
        if mode != "off":
            ingest_post(self.cfg, self.store, src, post, mode, self.clock().date(), self.cfg.news_days)

    async def on_event(self, event):
        message = event.message
        source_id = getattr(getattr(message, "peer_id", None), "channel_id", None)
        src = self.sources.get(source_id)
        if not src or not message.message:
            return
        try:
            async with self.lock:
                self.ingest(reader.Post(src, message.id, message.message, message.date, reader._message_urls(message)))
                # Do not advance scan cursors here: a later post must not hide a gap.
                await self.publish_vacancies()
        except Exception as exc:
            self.failure(exc)

    def failure(self, exc):
        # No token, session contents, source text, or API URL in error messages.
        self.store.set_meta("last_error", f"{self.clock():%Y-%m-%d %H:%M} · {type(exc).__name__}")
        log.warning("Мониторинг: %s; очередь сохранена, повторим", type(exc).__name__)

    async def publish_vacancies(self):
        today = self.clock().date()
        pending = [i for i in self.store.pending_items(today, self.cfg.horizon_days) if i.kind == "vacancy"]
        for item in sorted(pending, key=lambda i: (i.posted_at, i.channel_id, i.msg_id)):
            if (today - item.posted_at.astimezone(MOSCOW).date()).days > self.cfg.vacancy_days:
                self.store.mark_sent([item])  # expired outbox entries must not retry forever
                continue
            if self.store.seen_before(item):
                self.store.mark_sent([item])
                continue
            messages = render.build_digest(
                [item], today, open_vacancies=self.store.vacancy_counts(today), contacted=self.cfg.contacted,
            )
            await self.deliver(self.cfg, self.client, messages)
            self.store.mark_sent([item])
            self.store.set_meta("last_sent", f"{self.clock():%Y-%m-%d %H:%M}, вакансия сразу")
            self.store.set_meta("last_error", "")
            log.info("Новая вакансия отправлена")
            if len(pending) > 1:
                await asyncio.sleep(1.1)  # avoid flooding a single recipient on recovery

    async def publish_morning(self):
        now = self.clock()
        if now.hour < 9 or self.store.get_meta("last_full_digest") == now.date().isoformat():
            return
        items = [i for i in self.store.pending_items(now.date(), self.cfg.horizon_days) if i.kind in MORNING_KINDS]
        messages = render.build_digest(items, now.date(), contacted=self.cfg.contacted) if items else [
            f"Утренняя сводка · {now:%d.%m.%Y}\nНовых мероприятий, новостей юридического рынка "
            "и трудового законодательства/практики нет. Вакансии приходят отдельно по мере появления."
        ]
        await self.deliver(self.cfg, self.client, messages)
        self.store.mark_sent(items)
        self.store.set_meta("last_full_digest", now.date().isoformat())
        self.store.set_meta("last_sent", f"{now:%Y-%m-%d %H:%M}, утренняя сводка")
        self.store.set_meta("last_error", "")
        log.info("Утренняя сводка отправлена (%d сообщ.)", len(messages))

    async def catch_up(self):
        await self.refresh_sources()
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.cfg.backfill_days)
        failures = 0
        for src in list(self.sources.values()):
            since = 0 if self.rescan else self.store.last_msg_id(src.id)
            try:
                if since:
                    # Oldest gap first: more than 300 posts after an outage must not be skipped.
                    posts, newest = [], since
                    async for m in self.client.iter_messages(src.entity, min_id=since, reverse=True, limit=1000):
                        newest = max(newest, m.id)
                        if m.message:
                            posts.append(reader.Post(src, m.id, m.message, m.date, reader._message_urls(m)))
                    await asyncio.sleep(reader.PAUSE_SECONDS)
                else:
                    posts, newest = await reader.fetch_posts(self.client, src, since, cutoff)
                async with self.lock:
                    for post in sorted(posts, key=lambda p: p.msg_id):
                        self.ingest(post)
                    self.store.set_last_msg_id(src.id, src.title, max(newest, self.store.last_msg_id(src.id)))
                    await self.publish_vacancies()
            except Exception as exc:
                failures += 1
                self.failure(exc)
        if not failures:
            self.store.set_meta("last_run", f"{self.clock():%Y-%m-%d %H:%M}")
            if self.rescan:
                self.store.set_meta("watch_labor_v1", "yes")
                self.rescan = False
        self.ready.set()
        log.info("Восстановление пропусков завершено; каналов с ошибками: %d", failures)

    async def recovery_loop(self):
        while True:
            try:
                await self.catch_up()
            except Exception as exc:
                self.failure(exc)
            await asyncio.sleep(RECOVERY_SECONDS)

    async def schedule_loop(self):
        await self.ready.wait()
        while True:
            try:
                self.store.set_meta("watch_heartbeat", self.clock().isoformat())
                async with self.lock:
                    await self.publish_vacancies()
                    await self.publish_morning()
            except Exception as exc:
                self.failure(exc)
            await asyncio.sleep(5)


async def cmd_watch(cfg):
    from .cli import connected, _deliver

    store = Store(cfg.db_path)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, stop.set)
    tasks = []
    try:
        async with connected(cfg) as client:
            store.set_meta("owner_id", str((await client.get_me()).id))
            watcher = Watcher(cfg, client, store, _deliver)
            client.add_event_handler(watcher.on_event, events.NewMessage())
            client.add_event_handler(watcher.on_event, events.MessageEdited())
            tasks = [asyncio.create_task(watcher.recovery_loop()), asyncio.create_task(watcher.schedule_loop()),
                     asyncio.create_task(stop.wait())]
            done, _ = await asyncio.wait([*tasks, client.disconnected], return_when=asyncio.FIRST_COMPLETED)
            if not stop.is_set():
                for task in done:
                    await task
                raise RuntimeError("Соединение Telegram закрыто; службу необходимо перезапустить")
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        loop.remove_signal_handler(signal.SIGTERM)
        store.close()
