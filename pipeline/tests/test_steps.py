"""
Run every pipeline step against a copy of the real snapshots in data/live/.
Local backend only; nothing here touches AWS.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from pipeline import steps

_LIVE = Path(__file__).resolve().parents[2] / "data" / "live"
_INPUTS = ["fires.json", "aqi.json", "wind.json", "sites.geojson", "population.json"]
_LOCAL_KEYS = {
    "fires_key": "fires",
    "aqi_key": "aqi",
    "wind_key": "wind",
    "sites_key": "sites",
    "population_key": "population",
}


@pytest.fixture
def live_copy(tmp_path, monkeypatch):
    for name in _INPUTS:
        shutil.copy(_LIVE / name, tmp_path / name)
    monkeypatch.setenv("AERIS_STORAGE", "local")
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("AGENT_MODEL_PROVIDER", raising=False)
    return tmp_path


def _covered_forecast_event(live_copy):
    # Explicit replay of real acquisition time; old captures do not support 48 h from now.
    fires = _load(live_copy / "fires.json")
    return {**_LOCAL_KEYS, "forecast_hours": 2,
            "forecast_start": max(fire["acq_time"] for fire in fires["fires"])}


def _load(path: Path):
    return json.loads(path.read_text())


def test_full_chain_writes_contract_files(live_copy):
    steps.publish_handler(_LOCAL_KEYS, None)
    assert steps.detect_handler(_LOCAL_KEYS, None)["sources"] > 0
    assert steps.corridor_handler(_covered_forecast_event(live_copy), None)["features"] > 0
    steps.rank_handler(_LOCAL_KEYS, None)
    out = steps.agent_handler(_LOCAL_KEYS, None)
    assert out["generator"] == "rules"

    sources = _load(live_copy / "sources.json")
    assert {"id", "lat", "lon", "fire_count", "emission_strength"} <= set(sources["sources"][0])
    corridor = _load(live_copy / "corridor.geojson")
    assert corridor["type"] == "FeatureCollection" and corridor["generated_at"]
    ranked = _load(live_copy / "ranked_sites.json")
    assert set(ranked["exposed_population"]) == {"estimate", "low", "high"}
    actions = _load(live_copy / "actions.json")
    assert actions["summary"] and actions["generated_at"]
    ranked_ids = {s["site_id"] for s in ranked["sites"]}
    assert all(a["site_id"] in ranked_ids for a in actions["actions"])


def test_detect_refuses_empty_fires(live_copy):
    (live_copy / "fires.json").write_text(json.dumps({"generated_at": "2026-10-08T00:00:00Z", "fires": []}))
    before = (live_copy / "fires.json").read_text()
    with pytest.raises(ValueError):
        steps.detect_handler(_LOCAL_KEYS, None)
    assert not (live_copy / "sources.json").exists()
    assert (live_copy / "fires.json").read_text() == before


def test_corridor_refuses_uncovered_forecast_preserving_result(live_copy):
    steps.detect_handler(_LOCAL_KEYS, None)
    steps.corridor_handler(_covered_forecast_event(live_copy), None)
    path = live_copy / "corridor.geojson"
    before = path.read_bytes()
    with pytest.raises(ValueError, match="outside real wind coverage"):
        steps.corridor_handler(_LOCAL_KEYS, None)
    assert path.read_bytes() == before


def test_agent_restores_data_dir(live_copy, monkeypatch):
    for step in (steps.detect_handler, steps.corridor_handler, steps.rank_handler, steps.agent_handler):
        step(_covered_forecast_event(live_copy), None)
    import os

    assert os.environ["AERIS_DATA_DIR"] == str(live_copy)
