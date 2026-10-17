from __future__ import annotations

import asyncio
import hmac
import json
import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from .cards import format_card
from .config import Settings, TelegramSettings
from .engine import Action, Engine
from .flows import load_flows
from .graph import GraphError, InstagramClient, TokenManager
from .logging_setup import setup_logging
from .store import Store
from .telegram import TelegramNotifier
from .tgbot import LeadBot, TelegramAPI, TelegramError, build_funnels
from .webhook import parse_events, verify_signature

log = logging.getLogger("bridge")

TOKEN_CHECK_INTERVAL = 6 * 3600
TOKEN_ALERT_AFTER_FAILURES = 3
TOKEN_ALERT_EVERY = 86400


class Dispatcher:
    """Выполняет действия движка: сообщения в Instagram и карточки менеджеру в Telegram."""

    def __init__(self, ig: InstagramClient, tg: TelegramNotifier, store: Store, manager_chat_id: str = "") -> None:
        self._ig, self._tg, self._store, self._chat_id = ig, tg, store, manager_chat_id

    async def run(self, actions: list[Action]) -> None:
        reply_sent = True  # публичное «ответили в директ» только если личное сообщение реально ушло
        for action in actions:
            try:
                if action.kind == "dm":
                    await self._ig.send_dm(action.to, action.text)
                elif action.kind == "private_reply":
                    reply_sent = False
                    await self._ig.private_reply(action.to, action.text)
                    reply_sent = True
                elif action.kind == "public_reply":
                    if reply_sent:
                        await self._ig.reply_to_comment(action.to, action.text)
                elif action.kind == "notify":
                    await self._notify(action.card or {})
            except GraphError as exc:
                log.warning("Instagram API (%s): %s", action.kind, exc)
            except Exception:  # одно сломанное действие не должно ронять остальные
                log.exception("Сбой при выполнении действия %s", action.kind)

    async def _notify(self, card: dict) -> None:
        if not card.get("username") and card.get("igsid"):
            username = await self._ig.get_username(card["igsid"])
            if username:
                card = {**card, "username": username}
                self._store.set_username(card["igsid"], username)
        message_id = await self._tg.send(format_card(card))
        if message_id and card.get("igsid"):
            # запоминаем карточку: ответ менеджера на неё уйдёт этому клиенту (см. LeadBot._forward_reply)
            self._store.add_card_message(self._chat_id, message_id, card["igsid"])


async def telegram_polling(
    settings: Settings, http: httpx.AsyncClient, engine: Engine, flows, store: Store, ig: InstagramClient
) -> None:
    """Опрос Telegram рядом с вебхуками Instagram: ответы менеджеров на карточки уходят клиентам в Instagram,
    а Telegram-бот параллельно принимает заявки. Не стартует, если у бота включён чужой webhook."""
    api = TelegramAPI(settings.telegram_bot_token, http)
    tg_settings = TelegramSettings(
        bot_token=settings.telegram_bot_token,
        manager_chat_id=settings.telegram_manager_chat_id,
        human_mode_hours=settings.human_mode_hours,
    )
    while True:
        try:
            info = await api.get_webhook_info()
        except TelegramError as exc:
            log.warning("Telegram недоступен, повтор через минуту: %s", exc)
            await asyncio.sleep(60)
            continue
        if info.get("url"):
            log.error(
                "У бота включён webhook (токен использует другой процесс): ответы менеджеров из Telegram в Instagram "
                "не будут работать. Отключите чужой процесс или задайте TELEGRAM_POLLING=0."
            )
            return
        funnels = build_funnels(settings, flows, store)
        await LeadBot(tg_settings, api, engine, flows, store, ig=ig, funnels=funnels).run()


async def token_loop(tokens: TokenManager, tg: TelegramNotifier) -> None:
    """Раз в несколько часов проверяет, не пора ли продлить токен; при затяжном сбое пишет менеджеру."""
    failures, last_alert = 0, 0.0
    while True:
        try:
            if tokens.due():
                await tokens.refresh()
            failures = 0
        except GraphError as exc:
            failures += 1
            log.warning("Не удалось продлить токен Instagram (%d): %s", failures, exc)
            if failures >= TOKEN_ALERT_AFTER_FAILURES and time.time() - last_alert > TOKEN_ALERT_EVERY:
                last_alert = time.time()
                await tg.send(
                    "⚠️ <b>Мост Instagram: не удаётся продлить токен.</b>\n"
                    "Если не исправить, через ~60 дней с момента выпуска токена бот перестанет отвечать в Instagram. "
                    "Выпустите новый токен в Meta for Developers и обновите IG_ACCESS_TOKEN."
                )
        await asyncio.sleep(TOKEN_CHECK_INTERVAL)


def create_app(
    settings: Settings,
    *,
    ig: InstagramClient | None = None,
    tg: TelegramNotifier | None = None,
    store: Store | None = None,
) -> FastAPI:
    store = store or Store(settings.db_path)
    http = httpx.AsyncClient()
    tokens = TokenManager(settings, store, http)
    ig = ig or InstagramClient(settings, tokens, http)
    tg = tg or TelegramNotifier(settings.telegram_bot_token, settings.telegram_manager_chat_id, http)
    flows = load_flows(settings.flows_path, settings.links)
    engine = Engine(
        flows,
        store,
        self_id=settings.ig_account_id,
        human_mode_hours=settings.human_mode_hours,
        notify_comment_leads=settings.notify_comment_leads,
    )
    dispatcher = Dispatcher(ig, tg, store, settings.telegram_manager_chat_id)
    run_background = isinstance(ig, InstagramClient)  # в тестах подставляются заглушки: фоновые задачи не нужны

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        store.purge_seen()
        tasks: list[asyncio.Task] = []
        if run_background:
            tasks.append(asyncio.create_task(token_loop(tokens, tg)))
            if settings.telegram_polling:
                tasks.append(asyncio.create_task(telegram_polling(settings, http, engine, flows, store, ig)))
        log.info(
            "Мост запущен: правил комментариев=%d, сегментов=%d, опрос Telegram=%s",
            len(flows.rules),
            len(flows.segments),
            "вкл" if run_background and settings.telegram_polling else "выкл",
        )
        yield
        for task in tasks:
            task.cancel()
        await http.aclose()

    app = FastAPI(title="Legalcareerist Instagram bridge", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True, "rules": len(flows.rules), "leads": store.count_leads()}

    @app.get("/webhook/instagram")
    async def verify(
        mode: str | None = Query(None, alias="hub.mode"),
        token: str | None = Query(None, alias="hub.verify_token"),
        challenge: str | None = Query(None, alias="hub.challenge"),
    ) -> PlainTextResponse:
        if mode == "subscribe" and token and hmac.compare_digest(token, settings.ig_verify_token):
            return PlainTextResponse(challenge or "")
        raise HTTPException(status_code=403, detail="verify token mismatch")

    @app.post("/webhook/instagram")
    async def receive(request: Request, background: BackgroundTasks) -> dict:
        body = await request.body()
        if not verify_signature(settings.ig_app_secret, body, request.headers.get("x-hub-signature-256")):
            raise HTTPException(status_code=403, detail="bad signature")
        try:
            payload = json.loads(body)
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid json") from None

        comments, dms = parse_events(payload)
        actions: list[Action] = []
        for comment in comments:
            actions += engine.on_comment(comment)
        for dm in dms:
            actions += engine.on_dm(dm)
        if actions:
            background.add_task(dispatcher.run, actions)  # Meta ждёт быстрый 200, отправку делаем после ответа
        return {"ok": True}

    return app


def create_app_from_env() -> FastAPI:
    settings = Settings.from_env()
    setup_logging(settings.log_level)
    return create_app(settings)
