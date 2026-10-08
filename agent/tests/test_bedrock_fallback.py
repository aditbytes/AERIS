"""Model fallback order for the Bedrock agent. The Bedrock call is stubbed; no AWS."""

from __future__ import annotations

import pytest

from agent import bedrock_agent
from agent.agent import AuthorityAction


def _plan():
    return bedrock_agent._Plan(
        summary="s",
        actions=[],
        authority_actions=[AuthorityAction(who="w", action="a", reason="r")],
    )


@pytest.fixture
def ids(monkeypatch):
    monkeypatch.setenv("AGENT_MODEL_ID", "claude")
    monkeypatch.setenv("AGENT_FALLBACK_MODEL_IDS", "nova-pro, nova-lite,claude")
    return ["claude", "nova-pro", "nova-lite"]


def test_order_and_dedupe(ids):
    assert bedrock_agent._model_ids(None) == ids


def test_falls_back_to_nova_when_claude_fails(ids, monkeypatch):
    calls = []

    def fake(mid):
        calls.append(mid)
        if mid == "claude":
            raise PermissionError("INVALID_PAYMENT_INSTRUMENT")
        return _plan()

    monkeypatch.setattr(bedrock_agent, "_run_model", fake)
    out = bedrock_agent.generate_bedrock_plan()
    assert calls == ["claude", "nova-pro"]
    assert out["generator"] == "bedrock:nova-pro"


def test_uses_claude_when_it_works(ids, monkeypatch):
    monkeypatch.setattr(bedrock_agent, "_run_model", lambda mid: _plan())
    assert bedrock_agent.generate_bedrock_plan()["generator"] == "bedrock:claude"


def test_raises_when_every_model_fails(ids, monkeypatch):
    def fail(mid):
        raise RuntimeError("down")

    monkeypatch.setattr(bedrock_agent, "_run_model", fail)
    with pytest.raises(RuntimeError, match="All Bedrock models failed"):
        bedrock_agent.generate_bedrock_plan()


def test_stops_starting_models_when_time_budget_is_used(ids, monkeypatch):
    calls = []

    def fail(mid):
        calls.append(mid)
        raise RuntimeError("throttled")

    monkeypatch.setattr(bedrock_agent, "_run_model", fail)
    with pytest.raises(RuntimeError, match="time budget used up"):
        bedrock_agent.generate_bedrock_plan(time_budget_s=bedrock_agent.MIN_SECONDS_PER_MODEL - 1)
    assert calls == []
