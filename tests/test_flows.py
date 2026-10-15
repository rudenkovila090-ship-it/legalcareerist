import json

import pytest

from bridge.flows import Matcher, load_flows, normalize, render
from bridge.graph import MAX_DM_BYTES
from conftest import ROOT


def test_normalize_strips_punctuation_emoji_and_yo():
    assert normalize("  ЁЛКА!!! 🔥 Вакансии?  ") == "елка вакансии"


@pytest.mark.parametrize(
    "keyword,text,expected",
    [
        ("вакансии", "Вакансии!", True),
        ("вакансии", "а есть вакансии для юристов?", True),
        ("вакансии", "вакансиями", False),  # целое слово
        ("ивент*", "расскажите про ивенты", True),  # префиксный режим
        ("не пишите", "пожалуйста не пишите мне", True),  # фраза
        ("стоп", "стоп-кран", True),  # дефис — граница слова
    ],
)
def test_matcher(keyword, text, expected):
    assert Matcher([keyword]).search(normalize(text)) is expected


def test_short_match_ignores_long_messages():
    matcher = Matcher(["человек"])
    assert matcher.search_short(normalize("человек"))
    assert not matcher.search_short(normalize("я юрист, человек с опытом в 5 лет в корпоративном праве"))


def test_render_none_when_link_missing_and_error_on_typo():
    assert render("Оплата: {payment_url}", {"payment_url": ""}) is None
    assert render("Оплата: {payment_url}", {"payment_url": "https://x"}) == "Оплата: https://x"
    with pytest.raises(ValueError):
        render("Оплата: {paymnet_url}", {"payment_url": "https://x"})


def test_default_flows_load_and_fit_instagram_limit(flows):
    assert {r.id for r in flows.rules} == {"client", "employer", "candidate", "community", "pay", "site"}
    for rule in flows.rules:
        assert len(rule.dm.encode()) <= MAX_DM_BYTES, rule.id
    assert "1 — " in flows.menu_text() and "4 — " in flows.menu_text()


def test_rules_with_missing_links_are_disabled(settings):
    flows = load_flows(settings.flows_path, {**settings.links, "payment_url": "", "site_url": ""})
    assert {r.id for r in flows.rules} == {"client", "employer", "candidate", "community"}


def test_rule_over_byte_limit_is_rejected(tmp_path):
    raw = json.loads((ROOT / "config" / "flows.json").read_text(encoding="utf-8"))
    raw["comment_rules"][0]["dm"] = "я" * 600  # 1200 байт
    path = tmp_path / "flows.json"
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match="лимит"):
        load_flows(str(path), {"bot_url": "https://t.me/x", "site_url": "", "payment_url": ""})


def test_match_comment_respects_media_filter(flows):
    rule = flows.match_comment("Вакансии", "any-media")
    assert rule and rule.id == "candidate"
    assert flows.match_comment("просто красивый пост", "m1") is None


def test_choose_segment_by_digit_and_alias(flows):
    assert flows.choose_segment("2") == "employer"
    assert flows.choose_segment("5") is None
    assert flows.choose_segment(normalize("хочу в сообщество")) == "community"  # короткая фраза со словом-синонимом
    assert flows.choose_segment(normalize("вакансии")) == "candidate"
    long_text = normalize("расскажите подробно про всё что у вас есть и в целом про сообщество тоже")
    assert flows.choose_segment(long_text) is None  # длинный текст не принимаем за выбор пункта
