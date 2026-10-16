from __future__ import annotations

import hashlib
import hmac
import json
import pathlib

import pytest

from bridge.config import Settings
from bridge.engine import Engine
from bridge.flows import load_flows
from bridge.store import Store

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_SECRET = "test-app-secret"
VERIFY_TOKEN = "test-verify-token"


class FakeIG:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.usernames: dict[str, str] = {}
        self.fail_private_reply = False
        self.fail_dm = False

    async def send_dm(self, igsid, text):
        from bridge.graph import GraphError

        if self.fail_dm:
            raise GraphError("This message is sent outside of allowed window", 400, 10)
        self.calls.append(("dm", igsid, text))

    async def private_reply(self, comment_id, text):
        from bridge.graph import GraphError

        if self.fail_private_reply:
            raise GraphError("boom", 400, 100)
        self.calls.append(("private_reply", comment_id, text))

    async def reply_to_comment(self, comment_id, text):
        self.calls.append(("public_reply", comment_id, text))

    async def get_username(self, igsid):
        return self.usernames.get(igsid)

    def kinds(self):
        return [c[0] for c in self.calls]


class FakeTG:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, html_text, attempts=3):
        self.sent.append(html_text)
        return 500 + len(self.sent)  # message_id карточки: 501, 502, …


class Clock:
    def __init__(self) -> None:
        self.now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def settings() -> Settings:
    return Settings(
        ig_account_id="111",
        ig_access_token="env-token",
        ig_app_secret=APP_SECRET,
        ig_verify_token=VERIFY_TOKEN,
        telegram_bot_token="123:abc",
        telegram_manager_chat_id="-100500",
        db_path=":memory:",
        flows_path=str(ROOT / "config" / "flows.json"),
        site_url="https://example.com",
        payment_url="https://pay.example.com/x",
    )


@pytest.fixture
def store() -> Store:
    return Store(":memory:")


@pytest.fixture
def flows(settings):
    return load_flows(settings.flows_path, settings.links)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def engine(flows, store, settings, clock) -> Engine:
    return Engine(
        flows,
        store,
        self_id=settings.ig_account_id,
        human_mode_hours=settings.human_mode_hours,
        clock=clock,
    )


def sign(body: bytes, secret: str = APP_SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def comment_payload(text="консультация", comment_id="c1", from_id="222", username="ivan", parent_id=None, media_id="m1"):
    value = {
        "id": comment_id,
        "text": text,
        "from": {"id": from_id, "username": username},
        "media": {"id": media_id, "media_product_type": "FEED"},
    }
    if parent_id:
        value["parent_id"] = parent_id
    return {"object": "instagram", "entry": [{"id": "111", "time": 1, "changes": [{"field": "comments", "value": value}]}]}


def dm_payload(text, mid="mid1", sender="222", **message_extra):
    message = {"mid": mid, **({"text": text} if text is not None else {}), **message_extra}
    return {
        "object": "instagram",
        "entry": [
            {
                "id": "111",
                "time": 1,
                "messaging": [{"sender": {"id": sender}, "recipient": {"id": "111"}, "timestamp": 1, "message": message}],
            }
        ],
    }


def body_of(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode()
