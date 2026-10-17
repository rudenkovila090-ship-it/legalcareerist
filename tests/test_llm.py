import asyncio
import json
from datetime import date
from types import SimpleNamespace

import pytest

from bot import llm, sheets
from bot.models import Lists
from tests.conftest import TODAY

LISTS = Lists(sources=["Инстаграм", "Телеграм", "Другое"], who=["Кандидат", "Работодатель", "Партнёр"],
              stages=["Новый", "В работе", "Отказ"], directions=["Кадры", "Сообщество", "Другое"])

FORBIDDEN_KEYS = {"minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "pattern"}


def walk(schema, path="$"):
    """Yields (path, node) for every dict in the schema."""
    if isinstance(schema, dict):
        yield path, schema
        for k, v in schema.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(schema, list):
        for i, v in enumerate(schema):
            yield from walk(v, f"{path}[{i}]")


@pytest.mark.parametrize("schema", [
    llm.report_schema(LISTS), llm.goals_schema(LISTS), llm.week_schema(LISTS), llm.targets_schema(["A", "B"]),
])
def test_schemas_obey_structured_output_rules(schema):
    for path, node in walk(schema):
        assert not (FORBIDDEN_KEYS & node.keys()), path          # unsupported keywords -> 400
        if node.get("type") == "object":
            assert node["additionalProperties"] is False, path    # required for every object
            assert node["required"] == list(node["properties"]), path  # strict: all fields required


def test_enums_come_from_the_live_lists():
    s = llm.report_schema(LISTS)["properties"]["contacts"]["items"]["properties"]
    assert s["stage"]["enum"] == ["", "Новый", "В работе", "Отказ"]   # "" = no value
    assert llm.report_schema(Lists())["properties"]["contacts"]["items"]["properties"]["stage"] == {"type": "string"}


def test_schemas_have_no_unions_at_all():
    """Union/optional fields count against structured-output complexity limits: keep them at zero."""
    for schema in (llm.report_schema(LISTS), llm.goals_schema(LISTS), llm.week_schema(LISTS), llm.targets_schema(["A"])):
        for path, node in walk(schema):
            assert "anyOf" not in node and "oneOf" not in node, path
            assert not isinstance(node.get("type"), list), path


class FakeClient:
    """Records every request and tells which endpoint (plain / beta) received it."""

    def __init__(self, payload="{}", stop="end_turn"):
        self.calls = []
        self.reply = SimpleNamespace(stop_reason=stop, content=[
            SimpleNamespace(type="thinking", text=""), SimpleNamespace(type="text", text=payload)])
        self.messages = SimpleNamespace(create=self._create("plain"))
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create("beta")))

    def _create(self, kind):
        async def create(**kw):
            self.calls.append((kind, kw))
            return self.reply
        return create


def make(payload="{}", stop="end_turn", fallbacks=True):
    client = FakeClient(payload, stop)
    return llm.Claude("claude-opus-5-5", fallbacks, client), client


def run(coro):
    return asyncio.run(coro)


def test_request_shape_for_opus_5_5_with_fallbacks():
    c, client = make(json.dumps({"focus": "ф", "tasks": []}))
    run(c.plan_week("ctx", TODAY, LISTS))
    kind, kw = client.calls[0]
    assert kind == "beta" and kw["fallbacks"] == "default" and kw["betas"] == [llm.FALLBACK_BETA]
    assert kw["model"] == "claude-opus-5-5"
    # parameters that Opus 5.5 rejects with a 400 must never be sent
    assert not ({"temperature", "top_p", "top_k", "thinking", "tool_choice"} & kw.keys())
    assert kw["output_config"]["effort"] == "high" and kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["messages"][-1]["role"] == "user"  # no assistant prefill


def test_plain_endpoint_when_fallbacks_disabled():
    c, client = make("текст", fallbacks=False)
    assert run(c.focus("ctx")) == "текст"
    kind, kw = client.calls[0]
    assert kind == "plain" and "fallbacks" not in kw and "format" not in kw["output_config"]


def test_refusal_and_truncation_are_explicit_errors():
    with pytest.raises(llm.ModelRefused):
        run(make("{}", stop="refusal")[0].focus("x"))
    with pytest.raises(RuntimeError, match="обрезан"):
        run(make("{}", stop="max_tokens")[0].focus("x"))


def test_week_plan_dates_are_clamped_into_the_week():
    payload = json.dumps({"focus": "f", "tasks": [
        {"title": "прошлое", "due": "2026-10-01", "direction": "", "goal_id": ""},
        {"title": "далеко", "due": "2026-12-01", "direction": "Кадры", "goal_id": "G1"},
        {"title": "ок", "due": "2026-10-19", "direction": "", "goal_id": ""}]})
    _, tasks = run(make(payload)[0].plan_week("ctx", TODAY, LISTS))
    # TODAY is Saturday 17.10: past -> today, beyond the week (Sun 18.10) -> Sunday
    assert [t["due"] for t in tasks] == [date(2026, 10, 17), date(2026, 10, 18), date(2026, 10, 18)]


def test_year_plan_flags_unrecognised_period_and_numbers_goals():
    payload = json.dumps({"questions": [], "goals": [
        {"period": "2026-Q4", "direction": "Кадры", "goal": "20 договоров", "metric": "договоры", "target": "20",
         "unit": "шт", "priority": "высокий", "comment": ""},
        {"period": "осенью", "direction": "Другое", "goal": "Выйти на Москву", "metric": "", "target": "",
         "unit": "", "priority": "средний", "comment": ""}]})
    goals, questions = run(make(payload)[0].parse_year_plan("план", None, TODAY, LISTS))
    assert [g.id for g in goals] == ["G1", "G2"] and goals[0].target == "20"
    assert any("осенью" in q for q in questions)


def test_year_plan_pdf_is_sent_as_document_block():
    c, client = make(json.dumps({"goals": [], "questions": []}))
    run(c.parse_year_plan(None, b"%PDF-1.4 fake", TODAY, LISTS))
    block = client.calls[0][1]["messages"][0]["content"][0]
    assert block["type"] == "document" and block["source"]["media_type"] == "application/pdf"


# --- validation of what the model returned -----------------------------------------------

def contacts_fixture(contacts_values):
    return sheets.parse_contacts(contacts_values)


def base(**over):
    d = {"actions": [], "contacts": [], "sales": [], "tasks_done": [], "tasks_cancelled": [],
         "tasks_moved": [], "tasks_new": [], "questions": []}
    d.update(over)
    return d


def contact(**over):
    c = {"action": "new", "row": 0, "date": "2026-10-17", "name": "Иван", "source": "Телеграм",
         "who": "Работодатель", "request": "Вакансия", "stage": "В работе", "next_step": "Позвонить",
         "next_step_due": "2026-10-20", "step_done": False, "comment": ""}
    c.update(over)
    return c


def test_validation_drops_future_negative_and_unknown_items(contacts_values):
    cs = contacts_fixture(contacts_values)
    data = base(
        actions=[{"metric": "touches", "value": 5, "mode": "add", "date": "2026-10-17"},
                 {"metric": "replies", "value": 2, "mode": "add", "date": "2026-10-25"},      # future
                 {"metric": "calls", "value": -1, "mode": "add", "date": "2026-10-17"},       # negative
                 {"metric": "ghost", "value": 1, "mode": "add", "date": "2026-10-17"}],       # unknown metric
        tasks_done=[1, 99], contacts=[contact(action="update", row=77, name="Призрак")])
    p = llm.to_parsed_report(data, TODAY, LISTS, cs, [], [])
    assert [(a.metric, a.value) for a in p.actions] == [("touches", 5)]
    assert p.tasks_done == []
    text = " | ".join(p.warnings)
    for needle in ("в будущем", "отрицательное", "ghost", "#1 ", "#99", "Призрак"):
        assert needle in text, needle
    assert len(p.warnings) == 6
    assert p.contacts[0].row is None  # row 77 does not exist


def test_update_keeps_valid_row_and_past_due_is_warned(contacts_values):
    cs = contacts_fixture(contacts_values)
    data = base(contacts=[contact(action="update", row=5, name="Полина", next_step_due="2026-10-10")])
    p = llm.to_parsed_report(data, TODAY, LISTS, cs, [], [])
    assert p.contacts[0].row == 5 and any("в прошлом" in w for w in p.warnings)


def test_payment_without_matching_debt_is_dropped():
    sale = {"action": "add_payment", "row": 9, "date": "2026-10-17", "direction": "", "client": "Анна",
            "what": "", "amount": 0, "paid": 500, "source": "", "comment": ""}
    p = llm.to_parsed_report(base(sales=[sale]), TODAY, LISTS, [], [], [])
    assert p.sales == [] and p.warnings


def test_report_context_lists_only_open_items_with_row_numbers(contacts_values):
    cs = contacts_fixture(contacts_values)
    cs[0].stage = "Отказ"
    ctx = llm.report_context("написал 3 работодателям", TODAY, LISTS, cs, [], [])
    assert "2026-10-17 (суббота)" in ctx and "ОТЧЁТ:\nнаписал 3 работодателям" in ctx
    assert "\n5 | Полина" in ctx and "khaustovasya" not in ctx


def test_empty_sentinels_become_none_so_update_means_unchanged(contacts_values):
    cs = contacts_fixture(contacts_values)
    data = base(contacts=[contact(action="update", row=5, name="Полина", source="", who="", request="", stage="",
                                  next_step="", next_step_due="", comment="", step_done=True)])
    ch = llm.to_parsed_report(data, TODAY, LISTS, cs, [], []).contacts[0]
    assert (ch.source, ch.who, ch.request, ch.stage, ch.next_step, ch.due, ch.comment) == (None,) * 7
    assert ch.step_done and ch.row == 5


def test_new_sale_without_amount_is_flagged():
    sale = {"action": "new", "row": 0, "date": "2026-10-17", "direction": "Сообщество", "client": "Анна",
            "what": "Резидентство", "amount": 0, "paid": 0, "source": "", "comment": ""}
    p = llm.to_parsed_report(base(sales=[sale]), TODAY, LISTS, [], [], [])
    assert len(p.sales) == 1 and any("сумма 0" in w for w in p.warnings)
