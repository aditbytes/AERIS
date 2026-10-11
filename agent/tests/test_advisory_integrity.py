"""Advisory plans must not fabricate absent observations or arrival times."""
import pytest
from agent import agent


@pytest.fixture
def evidence(monkeypatch):
    monkeypatch.setattr(agent, "get_sources", lambda: [])
    monkeypatch.setattr(agent, "get_exposed_population", lambda: {"data_available": False})
    monkeypatch.setattr(agent, "get_ranked_sites", lambda **kw: [])


def test_absent_evidence_has_no_fabricated_threat_or_arrival(evidence):
    plan = agent.generate_action_plan()
    assert plan.actions == []
    assert "Arrival estimate unavailable" in plan.summary
    assert "Source evidence unavailable" in plan.summary
    assert "population data unavailable" in plan.summary
    text = plan.model_dump_json().lower()
    for claim in ("smoke approaches", "grap", "oxygen", "threshold exceedance", "mandated", "2-4 hour"):
        assert claim not in text


@pytest.mark.parametrize("eta,delta", [(None, None), (float("nan"), float("inf")), (0, 0)])
def test_zero_and_missing_site_numbers_do_not_get_defaults(evidence, monkeypatch, eta, delta):
    monkeypatch.setattr(agent, "get_ranked_sites", lambda **kw: [{"site_id": "BOUNDARY_TEST", "eta_hours": eta, "pm25_delta_ugm3": delta, "occupancy": 0}])
    action = agent.generate_action_plan().actions[0]
    assert action.deadline_hours == 0
    assert "0 recorded occupants" in action.reason
    if eta == 0:
        assert "arrival 0.0h" in action.reason and "+0 µg/m³" in action.reason
    else:
        assert "Arrival unavailable" in action.reason and "PM2.5 change unavailable" in action.reason
