"""Командная строка: login, channels, run."""
from __future__ import annotations

import argparse
import asyncio
import html
import logging
from pathlib import Path
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

from telethon import TelegramClient

from . import __version__, config, export, folders, login, notify, reader, render, rules, status, update
from .store import Item, Store
from .pipeline import ingest_post

log = logging.getLogger("digest")


def _now() -> datetime:
    return datetime.now()

# Что искать в канале в каждом режиме из channels.txt («off» каналы не читаются вовсе).
KINDS_BY_MODE = {
    "all": ("event", "vacancy", "news", "law"),
    "events": ("event",),
    "vacancies": ("vacancy",),
    "news": ("news",),
    "law": ("law",),
    "agency": ("vacancy",),
}
# Дневной запуск (--auto после полудня, если утренняя сводка уже ушла): шлём только новые вакансии, это лиды.
UPDATE_KINDS = ("vacancy",)
UPDATE_FROM_HOUR = 12
LAST_FULL_KEY = "last_full_digest"


@asynccontextmanager
async def connected(cfg: config.Config, interactive: bool = False, qr: bool = False):
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    # Больше попыток подключения: после пробуждения ноутбука Wi-Fi поднимается не сразу.
    client = TelegramClient(str(cfg.session_path), cfg.api_id, cfg.api_hash, connection_retries=10, retry_delay=5)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            if qr:
                await login.qr_login(client, cfg.data_dir)
            elif interactive:
                await login.phone_login(client)
            else:
                raise SystemExit("Вход в Telegram не выполнен. Сначала запустите: python -m digest login")
        if getattr(await client.get_me(), "bot", False):
            await client.log_out()  # сессия бота бесполезна и мешает: удаляем её
            raise SystemExit(
                "Выполнен вход как БОТ (по токену), а программе нужен аккаунт человека: боты не видят подписок. "
                "Сессия удалена. Запустите вход заново: python -m digest login. На вопрос введите НОМЕР ТЕЛЕФОНА "
                "аккаунта, а не токен бота."
            )
        yield client
    finally:
        await client.disconnect()


async def cmd_login(cfg: config.Config, qr: bool = False) -> None:
    async with connected(cfg, interactive=True, qr=qr) as client:
        me = await client.get_me()
        print(f"\nВход выполнен: {me.first_name} (id {me.id}). Сессия сохранена в {cfg.session_path}.session")
        if cfg.bot_token:
            print("Теперь откройте своего бота в Telegram и нажмите Start, иначе он не сможет вам писать.")


async def cmd_channels(cfg: config.Config) -> None:
    async with connected(cfg) as client:
        sources = await reader.list_sources(client, cfg.folder_name)
    print(f"Каналов для чтения: {len(sources)}  (в скобках режим из channels.txt)")
    for src in sources:
        mode = config.channel_mode(cfg.channel_modes, src.title, src.username)
        print(f"  [{mode}] {src.title}" + (f"  (@{src.username})" if src.username else "  (закрытый)"))


async def _deliver(cfg: config.Config, client: TelegramClient, messages: list[str]) -> None:
    if cfg.bot_token:
        chat_id = cfg.owner_chat_id or (await client.get_me()).id
        await asyncio.to_thread(notify.send_via_bot, cfg.bot_token, chat_id, messages)
    else:  # без бота пишем себе в «Избранное»
        for text in messages:
            await client.send_message("me", text, parse_mode="html", link_preview=False)


async def cmd_run(cfg: config.Config, print_only: bool, auto: bool = False, rescan_days: int = 0) -> None:
    """Прочитать новые посты и прислать сводку. С auto (так запускает расписание): первый запуск за день и любой
    запуск до полудня присылают всё, а дневной запуск после утренней сводки только новые вакансии и молчит,
    если новых нет. С rescan_days посты за последние N дней перечитываются заново по текущим правилам: уже
    присланное не повторяется, придёт только то, что раньше не находилось (например, новые разделы)."""
    store = Store(cfg.db_path)
    now = _now()
    today = now.date()
    update = auto and now.hour >= UPDATE_FROM_HOUR and store.get_meta(LAST_FULL_KEY) == today.isoformat()
    cutoff = datetime.now(timezone.utc) - timedelta(days=rescan_days or cfg.backfill_days)
    news_limit = max(cfg.news_days, rescan_days)
    async with connected(cfg) as client:
        if cfg.bot_token and not cfg.owner_chat_id:
            # Запоминаем, кому писать, если когда-нибудь запуск сорвётся (см. _report_failure).
            store.set_meta("owner_id", str((await client.get_me()).id))
        sources = await reader.list_sources(client, cfg.folder_name)
        modes = {src.id: config.channel_mode(cfg.channel_modes, src.title, src.username) for src in sources}
        sources = [src for src in sources if modes[src.id] != "off"]
        log.info("Версия %s. Каналов для чтения: %d", __version__, len(sources))
        found: Counter[str] = Counter()
        for n, src in enumerate(sources, 1):
            if n > 1 and (n - 1) % 25 == 0:
                log.info("Прочитано каналов: %d из %d", n - 1, len(sources))
            since = 0 if rescan_days else store.last_msg_id(src.id)
            try:
                posts, newest = await reader.fetch_posts(client, src, since, cutoff)
            except Exception as exc:  # один сбойный канал не должен ломать всю сводку
                log.warning("Пропускаю «%s»: %s", src.title, exc)
                continue
            mode = modes[src.id]
            for post in posts:
                found.update(ingest_post(cfg, store, src, post, mode, today, news_limit))
            store.set_last_msg_id(src.id, src.title, max(newest, store.last_msg_id(src.id)) if rescan_days else newest)
        log.info(
            "Найдено новых: мероприятий %d, вакансий %d, новостей о людях %d, законодательства и практики %d "
            "(повторов пропущено: %d, вакансий вне юридической сферы пропущено: %d, устаревших вакансий: %d)",
            found["event"], found["vacancy"], found["news"], found["law"], found["duplicate"], found["not_legal"],
            found["stale"],
        )

        store.set_meta("last_run", f"{now:%Y-%m-%d %H:%M}")
        items = store.pending_items(today, cfg.horizon_days)
        if update:
            items = [i for i in items if i.kind in UPDATE_KINDS]
            if not items:
                log.info("Новых вакансий нет, дневное обновление не отправляю")
                return
        elif auto and not items and store.get_meta(LAST_FULL_KEY) == today.isoformat():
            # Автозапуск мог сработать ещё раз (после пробуждения, перезагрузки): сообщение «ничего не нашлось»
            # за день уже приходило, второе не нужно.
            log.info("Нового нет, сводка за сегодня уже приходила: повторять не нужно")
            return
        open_vacancies = store.vacancy_counts(today)
        messages = render.build_digest(
            items, today, update=update, open_vacancies=open_vacancies, contacted=cfg.contacted,
        )
        if print_only:
            print("\n\n--------\n\n".join(messages))
            return
        await _deliver(cfg, client, messages)
    store.mark_sent(items)
    if not update:
        store.set_meta(LAST_FULL_KEY, today.isoformat())
    store.set_meta("last_sent", f"{now:%Y-%m-%d %H:%M}, сообщений: {len(messages)}" + (" (обновление)" if update else ""))
    store.set_meta("last_error", "")
    try:
        export.export_items(cfg.data_dir, items, today, open_vacancies, cfg.contacted)
    except OSError as exc:  # например, таблицу открыла другая программа; сводка уже отправлена
        log.warning("Не удалось дописать таблицы CSV: %s", exc)
    log.info("Сводка отправлена (%d сообщ.)", len(messages))


def _is_failure(exc: BaseException) -> bool:
    if isinstance(exc, KeyboardInterrupt):
        return False
    return not (isinstance(exc, SystemExit) and exc.code in (None, 0))


def _report_failure(cfg: config.Config, exc: BaseException) -> None:
    """Если запуск сорвался (слетел вход в Telegram, ошибка бота), пишем об этом в бот, а не молчим."""
    try:
        store = Store(cfg.db_path)
        reason = str(exc.code if isinstance(exc, SystemExit) else exc) or type(exc).__name__
        store.set_meta("last_error", f"{_now():%Y-%m-%d %H:%M} · {reason[:300]}")  # видно в `python -m digest status`
        owner = cfg.owner_chat_id or store.get_meta("owner_id")
        if not cfg.bot_token or not owner:
            return
        text = (
            "<b>Дайджест не сформирован</b>\n" + html.escape(reason[:500], quote=False)
            + "\n\nПрограмма попробует снова при следующем запуске. Подробности в data/run.log."
        )
        notify.send_via_bot(cfg.bot_token, int(owner), [text])
    except Exception:  # сообщение о сбое не должно само превращаться в новый сбой
        log.warning("Не удалось отправить сообщение о сбое")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m digest", description="Дайджест мероприятий и вакансий из Telegram-каналов")
    parser.add_argument("--version", action="version", version=f"digest {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)
    login_cmd = sub.add_parser("login", help="один раз войти в Telegram (телефон, код, пароль 2FA)")
    login_cmd.add_argument("--qr", action="store_true", help="войти по QR-коду, если код из сообщения не приходит")
    sub.add_parser("channels", help="показать, какие каналы будут читаться и в каком режиме")
    sub.add_parser("watch", help="вакансии по новым сообщениям, утренняя сводка в 09:00 МСК")
    sub.add_parser("status", help="проверить, всё ли настроено: вход, бот, автозапуск, последний запуск, ошибки")
    update_cmd = sub.add_parser("update", help="обновить программу из распакованного архива в «Загрузках»")
    update_cmd.add_argument("--from", dest="source", type=Path, metavar="ПАПКА",
                            help="папка telegram-digest из архива (по умолчанию ищется в «Загрузках»)")
    run = sub.add_parser("run", help="прочитать новые посты и прислать сводку")
    run.add_argument("--print-only", action="store_true", help="только показать сводку здесь, ничего не отправлять")
    run.add_argument(
        "--rescan", type=int, default=0, metavar="ДНЕЙ",
        help="перечитать посты за последние ДНЕЙ по текущим правилам; уже присланное не повторится",
    )
    run.add_argument(
        "--auto", action="store_true",
        help="режим расписания: после утренней сводки днём присылает только новые вакансии (и молчит, если их нет)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("telethon").setLevel(logging.WARNING)
    if args.command == "update":  # обновлению не нужны ни ключи, ни .env
        raise SystemExit(update.run(config.ROOT, args.source))
    cfg = config.load()
    try:
        if args.command == "status":
            print(status.report(cfg, config.ROOT))
        elif args.command == "login":
            asyncio.run(cmd_login(cfg, args.qr))
        elif args.command == "watch":
            from .watch import cmd_watch
            asyncio.run(cmd_watch(cfg))
        elif args.command == "channels":
            asyncio.run(cmd_channels(cfg))
        else:
            try:
                asyncio.run(cmd_run(cfg, args.print_only, args.auto, max(args.rescan, 0)))
            except BaseException as exc:
                if not args.print_only and _is_failure(exc):
                    _report_failure(cfg, exc)
                raise
    except (folders.FolderNotFound, RuntimeError) as exc:
        raise SystemExit(str(exc)) from None
