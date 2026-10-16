import pytest
from fastapi.testclient import TestClient

from bridge.app import create_app
from conftest import VERIFY_TOKEN, FakeIG, FakeTG, body_of, comment_payload, dm_payload, sign

URL = "/webhook/instagram"


@pytest.fixture
def env(settings, store):
    ig, tg = FakeIG(), FakeTG()
    app = create_app(settings, ig=ig, tg=tg, store=store)
    with TestClient(app) as client:
        yield client, ig, tg


def post(client, payload, signature="auto"):
    body = body_of(payload)
    headers = {"content-type": "application/json"}
    if signature == "auto":
        headers["x-hub-signature-256"] = sign(body)
    elif signature:
        headers["x-hub-signature-256"] = signature
    return client.post(URL, content=body, headers=headers)


def test_health(env):
    client, *_ = env
    assert client.get("/health").json()["ok"] is True


def test_webhook_verification_handshake(env):
    client, *_ = env
    ok = client.get(URL, params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345"})
    assert ok.status_code == 200 and ok.text == "12345"
    bad = client.get(URL, params={"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345"})
    assert bad.status_code == 403


@pytest.mark.parametrize("signature", [None, "sha256=deadbeef", "md5=abc", sign(b"other body")])
def test_unsigned_or_badly_signed_requests_are_rejected(env, signature):
    client, ig, tg = env
    assert post(client, comment_payload(), signature=signature).status_code == 403
    assert ig.calls == [] and tg.sent == []


def test_signature_accepts_any_of_several_comma_separated_secrets():
    from bridge.webhook import verify_signature

    body = b'{"object":"instagram"}'
    header = sign(body, "second-secret")
    assert verify_signature("first-secret, second-secret", body, header)
    assert not verify_signature("first-secret,third-secret", body, header)
    assert not verify_signature("", body, header)  # пустой секрет не должен принимать ничего


def test_keyword_comment_end_to_end(env):
    client, ig, tg = env
    assert post(client, comment_payload("Консультация")).status_code == 200
    assert ig.kinds() == ["private_reply", "public_reply"]
    assert ig.calls[0][1] == "c1"


def test_public_reply_skipped_when_private_reply_fails(env):
    client, ig, _ = env
    ig.fail_private_reply = True
    assert post(client, comment_payload("Консультация")).status_code == 200
    assert ig.kinds() == []  # публично «отправили в директ» не пишем, если сообщение не ушло


def test_dm_flow_end_to_end_ends_with_card_in_telegram(env):
    client, ig, tg = env
    ig.usernames["222"] = "ivan_lawyer"
    post(client, dm_payload("привет", "m1"))
    post(client, dm_payload("3", "m2"))
    post(client, dm_payload("Корпоративное право, 7 лет", "m3"))
    post(client, dm_payload("Москва, гибрид", "m4"))
    post(client, dm_payload("+79990000000", "m5"))
    assert ig.kinds().count("dm") == 5
    assert len(tg.sent) == 1
    card = tg.sent[0]
    assert "Новая заявка из Instagram" in card
    assert "Кандидат" in card and "Корпоративное право, 7 лет" in card
    assert 'href="https://instagram.com/ivan_lawyer"' in card  # username подтянут по ID


def test_user_text_is_html_escaped_in_manager_card(env):
    client, ig, tg = env
    post(client, comment_payload("вакансии"))
    for i, text in enumerate(["<b>hack</b> & co", "Москва", "@x"], start=1):
        post(client, dm_payload(text, f"m{i}"))
    assert "&lt;b&gt;hack&lt;/b&gt; &amp; co" in tg.sent[0]
    assert "<b>hack</b>" not in tg.sent[0]


def test_echo_and_non_message_events_do_nothing(env):
    client, ig, tg = env
    assert post(client, dm_payload("привет", "m1", is_echo=True)).status_code == 200
    payload = {"object": "instagram", "entry": [{"id": "111", "messaging": [{"sender": {"id": "222"}, "read": {"mid": "m"}}]}]}
    assert post(client, payload).status_code == 200
    assert ig.calls == [] and tg.sent == []


def test_dashboard_test_payload_shape_is_supported(env):
    client, ig, _ = env
    payload = {
        "object": "instagram",
        "entry": [{"id": "111", "changes": [{"field": "messages", "value": {"sender": {"id": "222"}, "message": {"mid": "t1", "text": "привет"}}}]}],
    }
    assert post(client, payload).status_code == 200
    assert ig.kinds() == ["dm"]
