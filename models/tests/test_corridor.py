"""Corridor model tests against the real snapshots in data/live/."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from models.plume.corridor import find_nearest_wind, predict_corridor

_LIVE = Path(__file__).resolve().parents[2] / "data" / "live"


@pytest.fixture(scope="module")
def wind():
    return json.loads((_LIVE / "wind.json").read_text())


@pytest.fixture(scope="module")
def sources():
    return json.loads((_LIVE / "sources.json").read_text())


def _start(wind):
    return datetime.fromisoformat(wind["generated_at"].replace("Z", "+00:00")).replace(
        minute=0, second=0, microsecond=0, tzinfo=timezone.utc
    )


def test_missing_wind_raises():
    with pytest.raises(ValueError):
        find_nearest_wind(30.0, 75.0, {"points": []}, datetime.now(timezone.utc))


def test_wind_at_grid_point_matches_snapshot(wind):
    p = wind["points"][0]
    h = p["hours"][10]
    when = datetime.fromisoformat(h["t"].replace("Z", "+00:00"))
    u, v, _ = find_nearest_wind(p["lat"], p["lon"], wind, when)
    # At a grid point the nearest neighbour dominates the IDW weights.
    assert u == pytest.approx(h["u_ms"], abs=0.5)
    assert v == pytest.approx(h["v_ms"], abs=0.5)


def test_first_step_follows_real_wind_sign(sources, wind):
    start = _start(wind)
    src = sources["sources"][0]
    u, v, _ = find_nearest_wind(src["lat"], src["lon"], wind, start)
    corridor = predict_corridor({"sources": [src]}, wind, forecast_hours=1, start=start)
    line = next(f for f in corridor["features"] if f["properties"]["kind"] == "centerline")
    (lon0, lat0), (lon1, lat1) = line["geometry"]["coordinates"]
    if abs(u) > 0.1:
        assert (lon1 - lon0) * u > 0
    if abs(v) > 0.1:
        assert (lat1 - lat0) * v > 0


def test_corridor_is_stamped_and_contract_shaped(sources, wind):
    # The captured wind stops before a full 48 h from capture time; replay a covered interval.
    corridor = predict_corridor(sources, wind, hours=2, start=_start(wind))
    assert corridor["type"] == "FeatureCollection"
    assert corridor["generated_at"].endswith("Z")
    kinds = {f["properties"]["kind"] for f in corridor["features"]}
    assert "centerline" in kinds
    assert kinds <= {"band", "centerline"}  # Below-threshold bands must not be fabricated.
    for f in corridor["features"]:
        if f["properties"]["kind"] == "band":
            assert 0 <= f["properties"]["risk"] <= 1
            ring = f["geometry"]["coordinates"][0]
            assert ring[0] == ring[-1]
