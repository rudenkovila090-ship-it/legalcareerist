import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

from telethon import errors

from digest import cli, config, login


class SentCodeTypeApp: pass
class SentCodeTypeSms: pass
class SentCodeTypeSomethingNew: pass
class CodeTypeSms: pass


def sent(kind=SentCodeTypeApp, following=CodeTypeSms, code_hash="h1"):
    return NS(type=kind(), next_type=following() if following else None, phone_code_hash=code_hash)


class FakeClient:
    """Подставной клиент Telegram для проверки сценариев входа."""

    def __init__(self, first_sent=None, sign_in_effects=(), resend=None, qr=None):
        self.first_sent = first_sent or sent()
        self.sign_in_effects = list(sign_in_effects)
        self.resend = resend
        self.qr = qr
        self.sign_in_calls = []
        self.requests = []
        self.phone = None

    async def send_code_request(self, phone):
        self.phone = phone
        if isinstance(self.first_sent, Exception):
            raise self.first_sent
        return self.first_sent

    async def __call__(self, request):
        self.requests.append(request)
        if isinstance(self.resend, Exception):
            raise self.resend
        return self.resend or sent(SentCodeTypeSms, None, "h2")

    async def sign_in(self, **kwargs):
        self.sign_in_calls.append(kwargs)
        effect = self.sign_in_effects.pop(0) if self.sign_in_effects else None
        if isinstance(effect, Exception):
            raise effect

    async def qr_login(self):
        return self.qr


def inputs(*answers):
    return mock.patch("builtins.input", side_effect=list(answers))


class AskPhoneTests(unittest.TestCase):
    def test_bot_token_and_garbage_are_rejected_until_a_real_phone_number_is_entered(self):
        with inputs("123456789:AAEexampleTokenFromBotFather", "привет", "12345", "+7 (999) 123-45-67"), \
                mock.patch("builtins.print") as printed:
            self.assertEqual(login.ask_phone(), "+7 (999) 123-45-67")
        said = " ".join(str(call.args[0]) for call in printed.call_args_list)
        self.assertIn("токен бота", said)
        self.assertIn("Не похоже на номер", said)

    def test_both_phone_formats_are_accepted(self):
        for value in ("89991234567", "+79991234567", "8 999 123 45 67"):
            with inputs(value):
                self.assertEqual(login.ask_phone(), value)


class DescribeSentTests(unittest.TestCase):
    def test_app_delivery_points_to_the_telegram_chat_and_offers_another_way(self):
        text = login.describe_sent(sent())
        self.assertIn("ПРИЛОЖЕНИЕ", text)
        self.assertIn("«Telegram»", text)
        self.assertIn("Введите r", text)
        self.assertIn("по SMS", text)

    def test_sms_without_another_way_and_unknown_type(self):
        self.assertEqual(login.describe_sent(sent(SentCodeTypeSms, None)), "Код отправлен по SMS на этот номер.")
        self.assertIn("SentCodeTypeSomethingNew", login.describe_sent(sent(SentCodeTypeSomethingNew, None)))


class PhoneLoginTests(unittest.IsolatedAsyncioTestCase):
    async def run_login(self, client, *answers):
        with inputs("+7 999 123-45-67", *answers), mock.patch("builtins.print") as printed:
            await login.phone_login(client)
        return " ".join(str(call.args[0]) for call in printed.call_args_list)

    async def test_happy_path_cleans_the_code_and_signs_in_with_the_code_hash(self):
        client = FakeClient()
        said = await self.run_login(client, "12-345")
        self.assertEqual(client.phone, "79991234567")
        self.assertEqual(client.sign_in_calls, [{"phone": "79991234567", "code": "12345", "phone_code_hash": "h1"}])
        self.assertIn("ПРИЛОЖЕНИЕ", said)
        self.assertIn("--qr", said)

    async def test_wrong_code_then_right_code(self):
        client = FakeClient(sign_in_effects=[errors.PhoneCodeInvalidError(None)])
        said = await self.run_login(client, "11111", "22222")
        self.assertEqual([c["code"] for c in client.sign_in_calls], ["11111", "22222"])
        self.assertIn("Неверный код", said)

    async def test_too_many_wrong_codes_stop_the_login(self):
        client = FakeClient(sign_in_effects=[errors.PhoneCodeInvalidError(None)] * login.CODE_ATTEMPTS)
        with self.assertRaises(SystemExit) as ctx:
            await self.run_login(client, *["11111"] * login.CODE_ATTEMPTS)
        self.assertIn("заново", str(ctx.exception))

    async def test_r_asks_telegram_for_another_delivery_and_uses_the_new_hash(self):
        client = FakeClient()
        said = await self.run_login(client, "r", "54321")
        self.assertEqual(len(client.requests), 1)
        self.assertEqual(client.requests[0].phone_number, "79991234567")
        self.assertEqual(client.requests[0].phone_code_hash, "h1")
        self.assertIn("по SMS", said)
        self.assertEqual(client.sign_in_calls[0]["phone_code_hash"], "h2")

    async def test_resend_unavailable_and_flood_are_explained_without_crashing(self):
        for failure, fragment in ((errors.SendCodeUnavailableError(None), "Других способов"),
                                  (errors.FloodWaitError(None, 300), "5 мин.")):
            client = FakeClient(resend=failure)
            said = await self.run_login(client, "r", "54321")
            self.assertIn(fragment, said)
            self.assertEqual(len(client.sign_in_calls), 1)

    async def test_q_quits_with_the_qr_hint(self):
        with self.assertRaises(SystemExit) as ctx:
            await self.run_login(FakeClient(), "q")
        self.assertIn("--qr", str(ctx.exception))

    async def test_empty_answer_asks_again(self):
        client = FakeClient()
        said = await self.run_login(client, "   ", "abc", "12345")
        self.assertEqual(len(client.sign_in_calls), 1)
        self.assertIn("Введите цифры", said)

    async def test_expired_code_suggests_r(self):
        client = FakeClient(sign_in_effects=[errors.PhoneCodeExpiredError(None)])
        said = await self.run_login(client, "11111", "r", "22222")
        self.assertIn("устарел", said)
        self.assertEqual(client.sign_in_calls[-1]["phone_code_hash"], "h2")

    async def test_cloud_password_is_asked_after_the_code(self):
        client = FakeClient(sign_in_effects=[errors.SessionPasswordNeededError(None), errors.PasswordHashInvalidError(None)])
        with mock.patch.object(login, "ask_password", side_effect=["wrong", "right"]):
            await self.run_login(client, "12345")
        self.assertEqual([c.get("password") for c in client.sign_in_calls], [None, "wrong", "right"])

    async def test_errors_while_requesting_the_code_are_explained(self):
        cases = (
            (errors.FloodWaitError(None, 7200), "2 ч."),
            (errors.FloodWaitError(None, 120), "2 мин."),
            (errors.PhoneNumberFloodError(None), "слишком много кодов"),
            (errors.PhoneNumberInvalidError(None), "не принимает этот номер"),
            (errors.PhoneNumberBannedError(None), "заблокирован"),
            (errors.ApiIdInvalidError(None), "TG_API_ID"),
        )
        for failure, fragment in cases:
            with self.assertRaises(SystemExit) as ctx:
                await self.run_login(FakeClient(first_sent=failure))
            self.assertIn(fragment, str(ctx.exception))
        with self.assertRaises(SystemExit) as ctx:
            await self.run_login(FakeClient(first_sent=errors.FloodWaitError(None, 600)))
        self.assertIn("--qr", str(ctx.exception))


class FakeQR:
    def __init__(self, waits):
        self.url = "tg://login?token=first"
        self.waits = list(waits)
        self.recreated = 0

    async def wait(self, timeout=None):
        effect = self.waits.pop(0)
        if isinstance(effect, BaseException):
            raise effect
        return effect

    async def recreate(self):
        self.recreated += 1
        self.url = f"tg://login?token=new{self.recreated}"


class QrLoginTests(unittest.IsolatedAsyncioTestCase):
    async def test_page_is_shown_refreshed_and_removed_after_login(self):
        opened = {}

        def fake_open(uri):
            path = Path(uri.removeprefix("file://"))
            opened["html"] = path.read_text(encoding="utf-8")
            opened["path"] = path

        qr = FakeQR([asyncio.TimeoutError(), None])
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(login.webbrowser, "open", fake_open), \
                mock.patch("builtins.print"):
            await login.qr_login(FakeClient(qr=qr), Path(tmp))
            self.assertFalse((Path(tmp) / login.QR_PAGE).exists(), "временный токен входа не должен оставаться на диске")
        self.assertIn("<svg", opened["html"])
        self.assertIn('http-equiv="refresh"', opened["html"])
        self.assertEqual(qr.recreated, 1)

    async def test_cloud_password_after_scanning(self):
        client = FakeClient(qr=FakeQR([errors.SessionPasswordNeededError(None)]))
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(login.webbrowser, "open"), \
                mock.patch("builtins.print"), mock.patch.object(login, "ask_password", return_value="secret"):
            await login.qr_login(client, Path(tmp))
        self.assertEqual(client.sign_in_calls, [{"password": "secret"}])

    async def test_gives_up_after_the_time_limit_and_cleans_up(self):
        client = FakeClient(qr=FakeQR([asyncio.TimeoutError()] * 2))
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(login, "QR_ATTEMPTS", 2), \
                mock.patch.object(login.webbrowser, "open"), mock.patch("builtins.print"):
            with self.assertRaises(SystemExit) as ctx:
                await login.qr_login(client, Path(tmp))
            self.assertFalse((Path(tmp) / login.QR_PAGE).exists())
        self.assertIn("login --qr", str(ctx.exception))


class FakeTelegramClient:
    authorized = True
    is_bot = False
    last = None

    def __init__(self, *args, **kwargs):
        FakeTelegramClient.last = self
        self.logged_out = False
        self.disconnected = False

    async def connect(self):
        pass

    async def is_user_authorized(self):
        return FakeTelegramClient.authorized

    async def get_me(self):
        return NS(bot=FakeTelegramClient.is_bot, first_name="longlist", id=1)

    async def log_out(self):
        self.logged_out = True

    async def disconnect(self):
        self.disconnected = True


class ConnectedTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeTelegramClient.authorized, FakeTelegramClient.is_bot = True, False

    def cfg(self, tmp):
        return config.Config(1, "hash", None, None, "Папка", 14, 14, (), (), Path(tmp))

    async def test_a_bot_session_is_dropped_with_an_explanation(self):
        FakeTelegramClient.is_bot = True
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cli, "TelegramClient", FakeTelegramClient):
            with self.assertRaises(SystemExit) as ctx:
                async with cli.connected(self.cfg(tmp)):
                    self.fail("с ботом работать нельзя")
        self.assertIn("БОТ", str(ctx.exception))
        self.assertIn("НОМЕР ТЕЛЕФОНА", str(ctx.exception))
        self.assertTrue(FakeTelegramClient.last.logged_out)
        self.assertTrue(FakeTelegramClient.last.disconnected)

    async def test_an_authorized_user_session_works_without_any_prompt(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cli, "TelegramClient", FakeTelegramClient), \
                mock.patch.object(login, "phone_login", new=mock.AsyncMock()) as phone:
            async with cli.connected(self.cfg(tmp), interactive=True) as client:
                self.assertIs(client, FakeTelegramClient.last)
        phone.assert_not_called()
        self.assertFalse(FakeTelegramClient.last.logged_out)

    async def test_interactive_login_goes_through_the_phone_flow_when_not_authorized(self):
        FakeTelegramClient.authorized = False
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cli, "TelegramClient", FakeTelegramClient), \
                mock.patch.object(login, "phone_login", new=mock.AsyncMock()) as phone, \
                mock.patch.object(login, "qr_login", new=mock.AsyncMock()) as qr:
            async with cli.connected(self.cfg(tmp), interactive=True):
                pass
        phone.assert_awaited_once()
        qr.assert_not_called()

    async def test_qr_flag_uses_the_qr_flow_with_the_data_folder(self):
        FakeTelegramClient.authorized = False
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cli, "TelegramClient", FakeTelegramClient), \
                mock.patch.object(login, "phone_login", new=mock.AsyncMock()) as phone, \
                mock.patch.object(login, "qr_login", new=mock.AsyncMock()) as qr:
            async with cli.connected(self.cfg(tmp), interactive=True, qr=True):
                pass
            qr.assert_awaited_once()
            self.assertEqual(qr.await_args.args[1], Path(tmp))
        phone.assert_not_called()

    async def test_other_commands_do_not_start_a_login(self):
        FakeTelegramClient.authorized = False
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(cli, "TelegramClient", FakeTelegramClient):
            with self.assertRaises(SystemExit) as ctx:
                async with cli.connected(self.cfg(tmp)):
                    self.fail("без входа работать нельзя")
        self.assertIn("python -m digest login", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
