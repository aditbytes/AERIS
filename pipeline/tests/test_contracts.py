"""Contract checks on the real data/live snapshots, plus broken copies of them."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from pipeline.contracts import CHECKS, check_actions

_LIVE = Path(__file__).resolve().parents[2] / "data" / "live"
_FILES = {
    "sources": "sources.json",
    "corridor": "corridor.geojson",
    "sites": "sites.geojson",
    "ranked_sites": "ranked_sites.json",
    "actions": "actions.json",
    "aqi": "aqi.json",
}


def _real(name):
    return json.loads((_LIVE / _FILES[name]).read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", list(_FILES))
def test_real_snapshot_matches_contract(name):
    assert CHECKS[name](_real(name)) == []


def test_unstamped_file_fails():
    obj = _real("sources")
    del obj["generated_at"]
    assert any("generated_at" in p for p in CHECKS["sources"](obj))


def test_out_of_range_risk_fails():
    obj = copy.deepcopy(_real("corridor"))
    band = next(f for f in obj["features"] if f["properties"]["kind"] == "band")
    band["properties"]["risk"] = 1.5
    assert any("risk" in p for p in CHECKS["corridor"](obj))


def test_rank_order_enforced():
    obj = _real("ranked_sites")
    if len(obj["sites"]) < 2:
        pytest.skip("snapshot has fewer than two ranked sites")
    obj["sites"][0]["rank"], obj["sites"][1]["rank"] = 2, 1
    assert any("rank" in p for p in CHECKS["ranked_sites"](obj))


def test_action_for_unranked_site_fails():
    actions = _real("actions")
    if not actions["actions"]:
        pytest.skip("snapshot has no site actions")
    ranked_ids = {s["site_id"] for s in _real("ranked_sites")["sites"]}
    assert check_actions(actions, ranked_ids) == []
    assert any("not a ranked site" in p for p in check_actions(actions, set()))
