"""Проверка настройки без риска утечек: python -m bridge.doctor [--url https://домен] [--subscribe] [--telegram-test]

Берёт настройки из переменных окружения, ходит в Instagram и Telegram и печатает отчёт.
Секреты в отчёт не попадают, его можно присылать целиком.
"""
from __future__ import annotations

import argparse
import sys

import httpx

from .config import Settings
from .flows import load_flows
from .graph import BASE

OK, WARN, FAIL = "✅", "⚠️", "❌"
NEEDED_FIELDS = {"comments", "messages"}

Line = tuple[str, str]


def _net_error(exc: Exception) -> str:
    return f"сетевая ошибка {type(exc).__name__}"  # без repr(exc): в нём может быть URL с токеном


def _api_error(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error", {})
        return f"HTTP {resp.status_code}: {err.get('message', resp.text[:150])} (code={err.get('code')})"
    except ValueError:
        return f"HTTP {resp.status_code}: {resp.text[:150]}"


def _collect_fields(data: dict) -> set[str]:
    found: set[str] = set()
    for item in data.get("data", []) or []:
        fields = item.get("subscribed_fields")
        if isinstance(fields, list):
            found.update(str(f) for f in fields)
    return found


def check_flows(settings: Settings) -> list[Line]:
    try:
        flows = load_flows(settings.flows_path, settings.links)
    except (OSError, ValueError) as exc:
        return [(FAIL, f"config/flows.json: {exc}")]
    ids = ", ".join(r.id for r in flows.rules)
    return [(OK, f"сценарии загружены: правил комментариев {len(flows.rules)} ({ids}), сегментов {len(flows.segments)}")]


def check_instagram(settings: Settings, http: httpx.Client, subscribe: bool) -> list[Line]:
    headers = {"Authorization": f"Bearer {settings.ig_access_token}"}
    base = f"{BASE}/{settings.graph_version}"
    lines: list[Line] = []
    try:
        resp = http.get(f"{base}/me", params={"fields": "user_id,username,account_type"}, headers=headers, timeout=20)
    except httpx.HTTPError as exc:
        return [(FAIL, f"Instagram: {_net_error(exc)} (для сервера в РФ graph.instagram.com, скорее всего, недоступен)")]
    if resp.status_code >= 400:
        return [(FAIL, f"Instagram: токен не принят — {_api_error(resp)}")]
    data = resp.json()
    username, account_type = data.get("username"), data.get("account_type")
    api_id = str(data.get("user_id") or data.get("id") or "")
    lines.append((OK, f"токен рабочий: @{username}, тип аккаунта {account_type}"))
    if account_type and account_type not in {"BUSINESS", "MEDIA_CREATOR"}:
        lines.append((FAIL, "аккаунт не профессиональный: переключите его на Business или Creator"))
    if api_id == settings.ig_account_id:
        lines.append((OK, "IG_ACCOUNT_ID совпадает с аккаунтом токена"))
    else:
        lines.append((WARN, f"IG_ACCOUNT_ID={settings.ig_account_id}, а API вернул {api_id}: в вебхуках приходит ID профессионального аккаунта, проверьте значение"))

    sub_url = f"{base}/{settings.ig_account_id}/subscribed_apps"
    try:
        if subscribe:
            resp = http.post(sub_url, params={"subscribed_fields": ",".join(sorted(NEEDED_FIELDS))}, headers=headers, timeout=20)
            if resp.status_code >= 400:
                lines.append((FAIL, f"подписка на вебхуки не создана: {_api_error(resp)}"))
                return lines
            lines.append((OK, "подписка на comments и messages запрошена"))
        resp = http.get(sub_url, headers=headers, timeout=20)
    except httpx.HTTPError as exc:
        lines.append((FAIL, f"подписки на вебхуки: {_net_error(exc)}"))
        return lines
    if resp.status_code >= 400:
        lines.append((WARN, f"подписки на вебхуки не прочитаны: {_api_error(resp)}"))
        return lines
    fields = _collect_fields(resp.json())
    missing = NEEDED_FIELDS - fields
    if not fields:
        lines.append((WARN, "подписок на вебхуки не найдено (или формат ответа другой): запустите с --subscribe"))
    elif missing:
        lines.append((WARN, f"нет подписки на поля {sorted(missing)}: запустите с --subscribe"))
    else:
        lines.append((OK, f"приложение подписано на вебхуки: {', '.join(sorted(fields))}"))
    return lines


def check_telegram(settings: Settings, http: httpx.Client, send_test: bool) -> list[Line]:
    api = f"https://api.telegram.org/bot{settings.telegram_bot_token}"
    lines: list[Line] = []
    try:
        me = http.get(f"{api}/getMe", timeout=20)
        if me.status_code != 200:
            return [(FAIL, f"Telegram: токен бота не принят (HTTP {me.status_code})")]
        lines.append((OK, f"бот: @{me.json()['result'].get('username')}"))
        chat = http.get(f"{api}/getChat", params={"chat_id": settings.telegram_manager_chat_id}, timeout=20)
        if chat.status_code != 200:
            lines.append((FAIL, f"чат менеджеров недоступен боту (HTTP {chat.status_code}): проверьте ID и что бот добавлен в группу"))
            return lines
        lines.append((OK, f"чат менеджеров найден: {chat.json()['result'].get('title') or 'личный чат'}"))
        if send_test:
            sent = http.post(f"{api}/sendMessage", json={"chat_id": settings.telegram_manager_chat_id, "text": "✅ Проверка связи: мост Instagram → Telegram настроен."}, timeout=20)
            lines.append((OK, "тестовое сообщение отправлено") if sent.status_code == 200 else (FAIL, f"сообщение не отправлено (HTTP {sent.status_code})"))
    except httpx.HTTPError as exc:
        lines.append((FAIL, f"Telegram: {_net_error(exc)}"))
    return lines


def check_public_url(settings: Settings, http: httpx.Client, url: str) -> list[Line]:
    url = url.rstrip("/")
    lines: list[Line] = []
    if not url.startswith("https://"):
        lines.append((WARN, "Meta принимает вебхуки только на HTTPS"))
    try:
        health = http.get(f"{url}/health", timeout=20)
        lines.append((OK, "сервис отвечает на /health") if health.status_code == 200 else (FAIL, f"/health вернул HTTP {health.status_code}"))
        params = {"hub.mode": "subscribe", "hub.verify_token": settings.ig_verify_token, "hub.challenge": "12345"}
        hook = http.get(f"{url}/webhook/instagram", params=params, timeout=20)
        if hook.status_code == 200 and hook.text == "12345":
            lines.append((OK, "проверка вебхука проходит: адрес и IG_VERIFY_TOKEN на сервере совпадают"))
        else:
            lines.append((FAIL, f"проверка вебхука не прошла (HTTP {hook.status_code}): IG_VERIFY_TOKEN на сервере не совпадает с вашим?"))
    except httpx.HTTPError as exc:
        lines.append((FAIL, f"{url}: {_net_error(exc)}"))
    return lines


def run(settings: Settings, http: httpx.Client, *, url: str | None = None, subscribe: bool = False, telegram_test: bool = False) -> list[Line]:
    lines = check_flows(settings)
    lines += check_instagram(settings, http, subscribe)
    lines += check_telegram(settings, http, telegram_test)
    if url:
        lines += check_public_url(settings, http, url)
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Проверка настройки моста Instagram → Telegram")
    parser.add_argument("--url", help="публичный адрес сервиса, например https://bridge.example.com")
    parser.add_argument("--subscribe", action="store_true", help="подписать приложение на вебхуки comments и messages")
    parser.add_argument("--telegram-test", action="store_true", help="отправить тестовое сообщение в чат менеджеров")
    args = parser.parse_args(argv)
    try:
        settings = Settings.from_env()
    except RuntimeError as exc:
        print(f"{FAIL} {exc}")
        return 1
    with httpx.Client() as http:
        lines = run(settings, http, url=args.url, subscribe=args.subscribe, telegram_test=args.telegram_test)
    for icon, text in lines:
        print(f"{icon} {text}")
    return 1 if any(icon == FAIL for icon, _ in lines) else 0


if __name__ == "__main__":
    sys.exit(main())
