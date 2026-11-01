"""Вход в Telegram: по номеру телефона с понятными подсказками про код или по QR-коду.

QR-вход нужен на случай, когда код не приходит (ограничения Telegram, разные устройства, SMS недоступны):
вы просто наводите камеру телефона с этим аккаунтом на код на экране Mac.
"""
from __future__ import annotations

import asyncio
import getpass
import re
import webbrowser
from pathlib import Path

from telethon import errors, utils
from telethon.tl.functions.auth import ResendCodeRequest

QR_PAGE = "login-qr.html"
QR_ATTEMPTS = 15  # по ~20 секунд на код: около 5 минут на то, чтобы навести камеру
CODE_ATTEMPTS = 5
QR_HINT = "Можно войти без кода, по QR-коду: python -m digest login --qr"

# Как Telegram отправил код (по названию типа в ответе).
_HOW_SENT = {
    "SentCodeTypeApp": (
        "Код отправлен СООБЩЕНИЕМ В ПРИЛОЖЕНИЕ Telegram, где сейчас открыт этот аккаунт. Ищите чат «Telegram» "
        "(с синей галочкой): он может быть внизу списка чатов или в архиве. Смотреть нужно именно в этом аккаунте."
    ),
    "SentCodeTypeSms": "Код отправлен по SMS на этот номер.",
    "SentCodeTypeCall": "Код продиктует робот по телефонному звонку на этот номер.",
    "SentCodeTypeFlashCall": "Telegram позвонит на номер и сбросит звонок: код это последние цифры входящего номера.",
    "SentCodeTypeMissedCall": "Telegram позвонит на номер и сбросит звонок: код это последние цифры входящего номера.",
    "SentCodeTypeFragmentSms": "Код отправлен через Fragment (для анонимных номеров): откройте fragment.com и войдите.",
}
_NEXT_WAY = {
    "CodeTypeSms": "по SMS",
    "CodeTypeCall": "звонком",
    "CodeTypeFlashCall": "звонком-сбросом",
    "CodeTypeMissedCall": "звонком-сбросом",
    "CodeTypeFragmentSms": "через Fragment",
}


def ask_phone() -> str:
    """Спрашивает номер телефона аккаунта. Токен бота не принимаем: по токену Telegram входит как бот,
    а бот не видит подписок и читать каналы не может."""
    while True:
        value = input("Номер телефона аккаунта, например +79991234567: ").strip()
        if ":" in value:
            print("Это похоже на токен бота. Здесь нужен НОМЕР ТЕЛЕФОНА аккаунта, который будет читать каналы.")
        elif re.fullmatch(r"\+?\d[\d\s\-()]{8,18}", value):
            return value
        else:
            print("Не похоже на номер телефона. Пример: +79991234567")


def ask_password() -> str:
    return getpass.getpass("Пароль двухфакторной защиты (символы не видны): ")


def describe_sent(sent) -> str:
    """Человеческое описание: куда Telegram отправил код и можно ли запросить другой способ."""
    kind = type(sent.type).__name__
    text = _HOW_SENT.get(kind, f"Telegram отправил код (способ: {kind}). Проверьте приложение Telegram и SMS.")
    following = getattr(sent, "next_type", None)
    if following is not None:
        way = _NEXT_WAY.get(type(following).__name__, "другим способом")
        text += f"\nНе пришёл? Введите r, и Telegram отправит код ещё и {way}."
    return text


def _wait_text(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} сек."
    minutes = round(seconds / 60)
    return f"{minutes} мин." if minutes < 90 else f"{round(minutes / 60)} ч."


async def _cloud_password(client) -> None:
    for _ in range(3):
        try:
            await client.sign_in(password=ask_password())
            return
        except errors.PasswordHashInvalidError:
            print("Пароль не подошёл, попробуйте ещё раз.")
    raise SystemExit("Пароль двухфакторной защиты не подошёл три раза. Запустите вход заново.")


async def phone_login(client) -> None:
    """Вход по номеру: показывает, как отправлен код, умеет запросить другой способ (r) и подсказывает про QR."""
    phone = utils.parse_phone(ask_phone())
    try:
        sent = await client.send_code_request(phone)
    except errors.FloodWaitError as exc:
        raise SystemExit(f"Telegram временно ограничил запросы кода для этого номера: подождите "
                         f"{_wait_text(exc.seconds)} и повторите. {QR_HINT}") from None
    except errors.PhoneNumberFloodError:
        raise SystemExit(f"Для этого номера запрошено слишком много кодов, Telegram просит подождать (обычно "
                         f"несколько часов). {QR_HINT}") from None
    except errors.PhoneNumberInvalidError:
        raise SystemExit("Telegram не принимает этот номер. Проверьте цифры и код страны.") from None
    except errors.PhoneNumberBannedError:
        raise SystemExit("Этот номер заблокирован в Telegram.") from None
    except errors.ApiIdInvalidError:
        raise SystemExit("TG_API_ID или TG_API_HASH из файла .env не подходят. Проверьте их на my.telegram.org: "
                         "ключи должны быть созданы под этим же аккаунтом.") from None

    print(describe_sent(sent))
    print(f"Если кода нет совсем: введите q и выберите другой способ. {QR_HINT}")
    failed = 0
    while True:
        answer = input("Код из Telegram (r: отправить другим способом, q: выйти): ").strip()
        if answer.lower() == "q":
            raise SystemExit(f"Вход отменён. {QR_HINT}")
        if answer.lower() == "r":
            try:
                sent = await client(ResendCodeRequest(phone_number=phone, phone_code_hash=sent.phone_code_hash))
            except errors.SendCodeUnavailableError:
                print(f"Других способов отправки у Telegram сейчас нет. Подождите или выберите QR-вход (введите q). {QR_HINT}")
            except errors.FloodWaitError as exc:
                print(f"Telegram просит подождать {_wait_text(exc.seconds)} перед новой отправкой.")
            else:
                print(describe_sent(sent))
            continue
        code = re.sub(r"\D", "", answer)
        if not code:
            print("Введите цифры кода из сообщения.")
            continue
        try:
            await client.sign_in(phone=phone, code=code, phone_code_hash=sent.phone_code_hash)
            return
        except errors.SessionPasswordNeededError:
            await _cloud_password(client)
            return
        except errors.PhoneCodeInvalidError:
            failed += 1
            if failed >= CODE_ATTEMPTS:
                raise SystemExit("Код не подошёл несколько раз. Запустите вход заново.") from None
            print("Неверный код, введите ещё раз.")
        except errors.PhoneCodeExpiredError:
            print("Код устарел. Введите r, чтобы получить новый.")


_PAGE = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="4">
<title>Вход в Telegram по QR-коду</title>
<style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;text-align:center;margin:40px;background:#fff;color:#111}
.qr{background:#fff;display:inline-block;padding:16px}
svg{width:340px;height:340px}
</style></head><body>
<h2>Вход в Telegram по QR-коду</h2>
<p>На телефоне, где открыт нужный аккаунт: <b>Настройки → Устройства → Подключить устройство</b>,<br>
затем наведите камеру на этот код. Код обновляется каждые несколько секунд.</p>
<div class="qr">{svg}</div>
<p>Это окно можно закрыть, когда в Терминале появится «Вход выполнен».</p>
</body></html>
"""


def _qr_page(url: str) -> str:
    try:
        import qrcode
        from qrcode.image.svg import SvgPathImage
    except ImportError:
        raise SystemExit("Для входа по QR нужна библиотека qrcode. Установите: .venv/bin/pip install -r requirements.txt") from None
    qr = qrcode.QRCode(border=4)
    qr.add_data(url)
    qr.make(fit=True)
    svg = qr.make_image(image_factory=SvgPathImage).to_string().decode("utf-8").strip()
    if svg.startswith("<?xml"):
        svg = svg.split("?>", 1)[1].strip()
    return _PAGE.replace("{svg}", svg)


async def qr_login(client, data_dir: Path) -> None:
    """Вход по QR-коду без кода из сообщения: страница с кодом открывается в браузере и сама обновляется."""
    qr = await client.qr_login()
    page = Path(data_dir) / QR_PAGE
    try:
        for attempt in range(QR_ATTEMPTS):
            page.write_text(_qr_page(qr.url), encoding="utf-8")
            if attempt == 0:
                print(f"QR-код открыт в браузере (файл {page}). На телефоне с нужным аккаунтом: Настройки → Устройства "
                      "→ Подключить устройство → наведите камеру на код. Ждём до 5 минут.")
                webbrowser.open(page.resolve().as_uri())
            try:
                await qr.wait(20)
                return
            except asyncio.TimeoutError:
                await qr.recreate()  # код живёт недолго: выпускаем новый
            except errors.SessionPasswordNeededError:
                await _cloud_password(client)
                return
        raise SystemExit("Время на вход по QR вышло. Запустите вход заново: python -m digest login --qr")
    finally:
        page.unlink(missing_ok=True)  # в файле временный токен входа: не оставляем его на диске
