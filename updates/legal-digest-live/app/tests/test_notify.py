import io
import json
import unittest
import urllib.error
from unittest import mock

from digest import notify

TOKEN = "123456:SECRET-TOKEN"


class SendViaBotTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(notify.time, "sleep")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_sends_each_message_as_html_to_chat(self):
        sent = []

        def fake_urlopen(request, timeout):
            sent.append((request.full_url, json.loads(request.data)))
            return io.BytesIO(b'{"ok": true}')

        with mock.patch.object(notify.urllib.request, "urlopen", fake_urlopen):
            notify.send_via_bot(TOKEN, 555, ["первое", "второе"])
        self.assertEqual([body["text"] for _, body in sent], ["первое", "второе"])
        self.assertTrue(all(url == f"https://api.telegram.org/bot{TOKEN}/sendMessage" for url, _ in sent))
        self.assertTrue(all(b["chat_id"] == 555 and b["parse_mode"] == "HTML" for _, b in sent))

    def test_error_explains_start_and_never_leaks_token(self):
        body = io.BytesIO(b'{"ok": false, "description": "Forbidden: bot can\'t initiate conversation with a user"}')
        error = urllib.error.HTTPError(f"https://api.telegram.org/bot{TOKEN}/sendMessage", 403, "Forbidden", {}, body)
        with mock.patch.object(notify.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(RuntimeError) as ctx:
                notify.send_via_bot(TOKEN, 555, ["текст"])
        message = str(ctx.exception)
        self.assertIn("нажмите Start", message)
        self.assertIn("can't initiate", message)
        self.assertNotIn("SECRET-TOKEN", message)
        self.assertIsNone(ctx.exception.__cause__)
        self.assertTrue(ctx.exception.__suppress_context__)

    def test_network_error_is_retried_then_readable(self):
        with mock.patch.object(notify.urllib.request, "urlopen", side_effect=urllib.error.URLError("timed out")) as urlopen:
            with self.assertRaises(RuntimeError) as ctx:
                notify.send_via_bot(TOKEN, 555, ["текст"])
        self.assertEqual(urlopen.call_count, notify.NETWORK_ATTEMPTS)
        self.assertIn("timed out", str(ctx.exception))
        self.assertNotIn("SECRET-TOKEN", str(ctx.exception))

    def test_message_is_sent_once_when_network_recovers(self):
        results = [urllib.error.URLError("network is down"), urllib.error.URLError("network is down"), io.BytesIO(b'{"ok": true}')]

        def flaky_urlopen(request, timeout):
            result = results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with mock.patch.object(notify.urllib.request, "urlopen", flaky_urlopen):
            notify.send_via_bot(TOKEN, 555, ["текст"])
        self.assertEqual(results, [])

    def test_bot_rejection_is_not_retried(self):
        error = urllib.error.HTTPError("https://x", 400, "Bad Request", {}, io.BytesIO(b'{"description": "chat not found"}'))
        with mock.patch.object(notify.urllib.request, "urlopen", side_effect=error) as urlopen:
            with self.assertRaises(RuntimeError):
                notify.send_via_bot(TOKEN, 555, ["текст"])
        self.assertEqual(urlopen.call_count, 1)


if __name__ == "__main__":
    unittest.main()
