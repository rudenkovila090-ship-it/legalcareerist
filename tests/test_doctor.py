import httpx

from bridge.doctor import FAIL, OK, WARN, run


def make_http(*, token_ok=True, user_id="111", chat_ok=True, fields=("comments", "messages"), account_type="BUSINESS", hook_ok=True):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        host, path = request.url.host, request.url.path
        if host == "graph.instagram.com" and path.endswith("/me"):
            if not token_ok:
                return httpx.Response(400, json={"error": {"message": "Invalid OAuth access token", "code": 190}})
            return httpx.Response(200, json={"id": "app-scoped", "user_id": user_id, "username": "legalcareerist", "account_type": account_type})
        if host == "graph.instagram.com" and path.endswith("/subscribed_apps"):
            if request.method == "POST":
                return httpx.Response(200, json={"success": True})
            return httpx.Response(200, json={"data": [{"subscribed_fields": list(fields)}] if fields else []})
        if host == "api.telegram.org" and path.endswith("/getMe"):
            return httpx.Response(200, json={"ok": True, "result": {"username": "LegalcareeristBot"}})
        if host == "api.telegram.org" and path.endswith("/getChat"):
            return httpx.Response(200, json={"ok": True, "result": {"title": "Менеджеры"}}) if chat_ok else httpx.Response(400, json={"ok": False})
        if host == "api.telegram.org" and path.endswith("/sendMessage"):
            return httpx.Response(200, json={"ok": True})
        if host == "bridge.example.com" and path == "/health":
            return httpx.Response(200, json={"ok": True})
        if host == "bridge.example.com" and path == "/webhook/instagram":
            return httpx.Response(200, text=request.url.params["hub.challenge"]) if hook_ok else httpx.Response(403)
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(handler)), calls


def icons(lines):
    return [icon for icon, _ in lines]


def test_everything_ok(settings):
    http, _ = make_http()
    lines = run(settings, http, url="https://bridge.example.com")
    assert FAIL not in icons(lines) and WARN not in icons(lines)
    assert sum(1 for i in icons(lines) if i == OK) >= 8


def test_invalid_token_is_reported_with_api_message(settings):
    http, _ = make_http(token_ok=False)
    lines = run(settings, http)
    assert any(icon == FAIL and "Invalid OAuth access token" in text for icon, text in lines)


def test_account_id_mismatch_is_a_warning_with_hint(settings):
    http, _ = make_http(user_id="999")
    lines = run(settings, http)
    assert any(icon == WARN and "IG_ACCOUNT_ID=111" in text and "999" in text for icon, text in lines)


def test_personal_account_is_a_failure(settings):
    http, _ = make_http(account_type="PERSONAL")
    assert any(icon == FAIL and "не профессиональный" in text for icon, text in run(settings, http))


def test_missing_webhook_subscription_warns_and_subscribe_flag_posts(settings):
    http, calls = make_http(fields=())
    assert any(icon == WARN and "--subscribe" in text for icon, text in run(settings, http))
    http, calls = make_http()
    run(settings, http, subscribe=True)
    post = next(c for c in calls if c.method == "POST")
    assert post.url.params["subscribed_fields"] == "comments,messages"


def test_telegram_chat_unreachable_is_failure(settings):
    http, _ = make_http(chat_ok=False)
    assert any(icon == FAIL and "чат менеджеров недоступен" in text for icon, text in run(settings, http))


def test_wrong_verify_token_on_server_is_failure(settings):
    http, _ = make_http(hook_ok=False)
    assert any(icon == FAIL and "IG_VERIFY_TOKEN" in text for icon, text in run(settings, http, url="https://bridge.example.com"))


def test_report_never_contains_secrets(settings):
    for kwargs in ({}, {"token_ok": False}, {"chat_ok": False}):
        http, _ = make_http(**kwargs)
        report = "\n".join(text for _, text in run(settings, http, url="https://bridge.example.com"))
        for secret in (settings.ig_access_token, settings.ig_app_secret, settings.telegram_bot_token, settings.ig_verify_token):
            assert secret not in report


def test_network_failure_does_not_crash_or_leak(settings):
    def boom(request):
        raise httpx.ConnectError("boom", request=request)

    http = httpx.Client(transport=httpx.MockTransport(boom))
    lines = run(settings, http, url="https://bridge.example.com")
    assert FAIL in icons(lines)
    report = "\n".join(text for _, text in lines)
    assert settings.ig_access_token not in report and settings.telegram_bot_token not in report
