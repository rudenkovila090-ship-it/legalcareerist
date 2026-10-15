import asyncio
import json

import httpx
import pytest

from bridge.graph import MAX_DM_BYTES, GraphError, InstagramClient, TokenManager, chunk_text


def make_client(settings, store, handler):
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    tokens = TokenManager(settings, store, http)
    return InstagramClient(settings, tokens, http), tokens, http


def test_chunk_text_respects_byte_limit_and_keeps_order():
    text = "\n\n".join(f"Абзац {i}: " + "я" * 200 for i in range(8))
    chunks = chunk_text(text)
    assert len(chunks) > 1
    assert all(len(c.encode()) <= MAX_DM_BYTES for c in chunks)
    assert "\n\n".join(chunks) == text


def test_chunk_text_splits_one_huge_paragraph():
    chunks = chunk_text("я" * 2000)
    assert all(len(c.encode()) <= MAX_DM_BYTES for c in chunks)
    assert "".join(chunks) == "я" * 2000


def test_requests_have_expected_shape_and_token_only_in_header(settings, store):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"ok": True, "username": "ivan"})

    async def scenario():
        client, _, http = make_client(settings, store, handler)
        await client.send_dm("222", "привет")
        await client.private_reply("c1", "в личку")
        await client.reply_to_comment("c1", "в директ")
        username = await client.get_username("222")
        await http.aclose()
        return username

    assert asyncio.run(scenario()) == "ivan"
    dm, private, public, profile = seen
    assert str(dm.url) == "https://graph.instagram.com/v23.0/111/messages"
    assert json.loads(dm.content) == {"recipient": {"id": "222"}, "message": {"text": "привет"}}
    assert json.loads(private.content) == {"recipient": {"comment_id": "c1"}, "message": {"text": "в личку"}}
    assert str(public.url) == "https://graph.instagram.com/v23.0/c1/replies"
    assert json.loads(public.content) == {"message": "в директ"}
    assert str(profile.url).startswith("https://graph.instagram.com/v23.0/222?fields=username")
    for request in seen:
        assert request.headers["authorization"] == "Bearer env-token"
        assert "env-token" not in str(request.url)


def test_api_error_becomes_graph_error_with_code(settings, store):
    def handler(request):
        return httpx.Response(400, json={"error": {"message": "Outside of allowed window", "code": 10, "error_subcode": 2534022}})

    async def scenario():
        client, _, http = make_client(settings, store, handler)
        try:
            await client.send_dm("222", "привет")
        finally:
            await http.aclose()

    with pytest.raises(GraphError) as info:
        asyncio.run(scenario())
    assert info.value.code == 10 and "allowed window" in str(info.value)


def test_private_reply_longer_than_limit_is_not_sent(settings, store):
    calls = []
    client, _, http = make_client(settings, store, lambda r: calls.append(r) or httpx.Response(200, json={}))
    with pytest.raises(GraphError):
        asyncio.run(client.private_reply("c1", "я" * 600))
    assert calls == []


def test_token_refresh_stores_new_token_and_new_env_token_wins(settings, store):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/refresh_access_token"
        assert request.url.params["grant_type"] == "ig_refresh_token"
        return httpx.Response(200, json={"access_token": "fresh-token", "expires_in": 5184000})

    client, tokens, http = make_client(settings, store, handler)
    assert tokens.current() == "env-token" and tokens.due()  # возраст нового токена неизвестен -> продлить
    asyncio.run(tokens.refresh())
    assert tokens.current() == "fresh-token" and not tokens.due()

    # владелец выпустил и прописал в env новый токен — он главнее сохранённого
    from dataclasses import replace

    tokens2 = TokenManager(replace(settings, ig_access_token="manual-token"), store, http)
    assert tokens2.current() == "manual-token" and tokens2.due()


def test_refresh_error_does_not_leak_token(settings, store):
    def handler(request):
        raise httpx.ConnectError("boom", request=request)

    client, tokens, http = make_client(settings, store, handler)
    with pytest.raises(GraphError) as info:
        asyncio.run(tokens.refresh())
    assert "env-token" not in str(info.value)
