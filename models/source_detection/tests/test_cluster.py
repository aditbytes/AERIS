"""Tiny geometric inputs test mathematics, not environmental observations.

Integration tests read the existing, provenance-stamped NASA FIRMS capture in
data/live/fires.json. No invented measurement is presented as real data.
"""

from __future__ import annotations

import copy
import json
import math
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from models.common.geo import EARTH_RADIUS_KM, haversine_km
from models.source_detection.cluster import SourceDetectionParams, cluster_fires, detect_sources, main
from pipeline.contracts import check_sources

_ROOT = Path(__file__).resolve().parents[3]
_AS_OF = datetime(2026, 10, 8, 12, tzinfo=timezone.utc)
_SOURCE_FIELDS = {"id", "type", "lat", "lon", "fire_count", "total_frp_mw", "radius_km",
                  "first_seen", "last_seen", "confidence", "emission_strength"}


def geometric_snapshot(points, *, frps=None, confidence="high", age_hours=1, as_of=_AS_OF):
    """Contract-shaped mathematical coordinates; explicitly NOT a real snapshot."""
    when = (as_of - timedelta(hours=age_hours)).isoformat()
    return {
        "generated_at": as_of.isoformat(),
        "source": "mathematical test inputs; not observations",
        "bbox": [-180, -90, 180, 90],
        "fires": [{"id": f"geometry_{i}", "lat": lat, "lon": lon, "acq_time": when,
                   "frp_mw": frps[i] if frps is not None else 1.0,
                   "brightness_k": 0.0, "confidence": confidence}
                  for i, (lat, lon) in enumerate(points)],
    }


@pytest.fixture
def triangle():
    return geometric_snapshot([(0, 0), (0, 0.02), (0.02, 0)])


@pytest.fixture
def real_snapshot():
    """Actual NASA FIRMS capture, with its original source and fetch timestamp."""
    return json.loads((_ROOT / "data/live/fires.json").read_text(encoding="utf-8"))


def test_two_distinct_clusters():
    snapshot = geometric_snapshot([(0, 0), (0, 0.02), (0.02, 0),
                                   (1, 1), (1, 1.02), (1.02, 1)])
    result = detect_sources(snapshot)
    assert len(result["sources"]) == 2
    assert [source["fire_count"] for source in result["sources"]] == [3, 3]
    for source, lower in zip(result["sources"], [0, 1]):
        assert lower <= source["lat"] <= lower + 0.02
        assert lower <= source["lon"] <= lower + 0.02


def test_isolated_low_confidence_filtered_under_both_noise_policies(triangle):
    isolated = geometric_snapshot([(10, 10)], confidence="low")["fires"][0]
    isolated["id"] = "isolated_geometry"
    triangle["fires"].append(isolated)
    for policy in ("drop", "individual_minor_sources"):
        result = detect_sources(triangle, params={"noise_policy": policy})
        assert len(result["sources"]) == 1
        assert result["sources"][0]["fire_count"] == 3


def test_all_low_confidence_never_falls_back(triangle):
    for fire in triangle["fires"]:
        fire["confidence"] = "low"
    assert detect_sources(triangle)["sources"] == []
    assert detect_sources(triangle, params={"min_confidence": "low"})["sources"][0]["fire_count"] == 3


def test_nominal_supported_and_high_threshold(triangle):
    for fire in triangle["fires"]:
        fire["confidence"] = "nominal"
    assert len(detect_sources(triangle)["sources"]) == 1
    assert detect_sources(triangle, params={"min_confidence": "high"})["sources"] == []


def test_noise_policies():
    snapshot = geometric_snapshot([(0, 0), (1, 1)])
    assert detect_sources(snapshot)["sources"] == []
    sources = detect_sources(snapshot, params={"noise_policy": "individual_minor_sources"})["sources"]
    assert len(sources) == 2
    assert all(source["fire_count"] == 1 and source["radius_km"] == pytest.approx(0, abs=1e-9)
               for source in sources)


def test_empty_valid_input():
    result = detect_sources(geometric_snapshot([]))
    assert result == {"generated_at": "2026-10-08T12:00:00Z", "sources": []}
    assert cluster_fires([]) == []


@pytest.mark.parametrize("field", ["id", "lat", "lon", "acq_time", "frp_mw", "brightness_k", "confidence"])
def test_missing_record_fields_rejected(triangle, field):
    del triangle["fires"][0][field]
    with pytest.raises(ValueError):
        detect_sources(triangle)


@pytest.mark.parametrize("field", ["generated_at", "source", "bbox", "fires"])
def test_missing_snapshot_fields_rejected(triangle, field):
    del triangle[field]
    with pytest.raises(ValueError):
        detect_sources(triangle)


@pytest.mark.parametrize("field,value", [("lat", 91), ("lat", -91), ("lon", 181), ("lon", -181),
                                         ("lat", float("nan")), ("lon", float("inf")), ("lat", True),
                                         ("lon", "0"), ("lat", None)])
def test_invalid_coordinates(triangle, field, value):
    triangle["fires"][0][field] = value
    with pytest.raises(ValueError):
        detect_sources(triangle)


@pytest.mark.parametrize("value", [-1, None, "1", True, float("nan"), float("inf"), float("-inf")])
def test_invalid_frp(triangle, value):
    triangle["fires"][0]["frp_mw"] = value
    with pytest.raises(ValueError):
        detect_sources(triangle)


@pytest.mark.parametrize("value", [None, "", "not-a-time", "2026-10-08", "2026-10-08T11:00:00",
                                  "2026-13-08T11:00:00Z"])
def test_invalid_timestamps(triangle, value):
    triangle["fires"][0]["acq_time"] = value
    with pytest.raises(ValueError):
        detect_sources(triangle)


@pytest.mark.parametrize("value", ["h", "n", "unknown", "HIGH", 90, None, []])
def test_unsupported_confidence(triangle, value):
    triangle["fires"][0]["confidence"] = value
    with pytest.raises(ValueError, match="confidence"):
        detect_sources(triangle)


def test_invalid_old_low_confidence_record_still_rejected(triangle):
    fire = triangle["fires"][0]
    fire.update(confidence="low", acq_time="2026-10-01T00:00:00Z", frp_mw=None)
    with pytest.raises(ValueError, match="frp_mw"):
        detect_sources(triangle)


def test_temporal_cutoff_is_inclusive_and_configurable():
    points = [(0, 0), (0, 0.02), (0.02, 0)]
    snapshot = geometric_snapshot(points, age_hours=24)
    assert len(detect_sources(snapshot)["sources"]) == 1
    for fire in snapshot["fires"]:
        fire["acq_time"] = (_AS_OF - timedelta(hours=24, microseconds=1)).isoformat()
    assert detect_sources(snapshot)["sources"] == []
    assert len(detect_sources(snapshot, params={"window_hours": 25})["sources"]) == 1


def test_as_of_override_filters_stale_snapshot(triangle):
    result = detect_sources(triangle, params={"as_of": _AS_OF + timedelta(days=2)})
    assert result == {"generated_at": "2026-10-10T12:00:00Z", "sources": []}


def test_offsets_normalized_and_time_order_is_chronological(triangle):
    triangle["fires"][0]["acq_time"] = "2026-10-08T15:30:00+05:30"  # 10:00 UTC
    triangle["fires"][1]["acq_time"] = "2026-10-08T10:30:00Z"
    triangle["fires"][2]["acq_time"] = "2026-10-08T07:00:00-04:00"  # 11:00 UTC
    source = detect_sources(triangle)["sources"][0]
    assert source["first_seen"] == "2026-10-08T10:00:00Z"
    assert source["last_seen"] == "2026-10-08T11:00:00Z"


def test_future_acquisition_rejected(triangle):
    triangle["fires"][0]["acq_time"] = "2026-10-08T13:00:00Z"
    with pytest.raises(ValueError, match="after snapshot"):
        detect_sources(triangle)
    triangle["fires"][0]["acq_time"] = "2026-10-08T11:00:00Z"
    with pytest.raises(ValueError, match="after as_of"):
        detect_sources(triangle, params={"as_of": _AS_OF - timedelta(hours=2)})


def test_centroid_inside_small_geometric_triangle(triangle):
    from shapely.geometry import Point, Polygon

    source = detect_sources(triangle)["sources"][0]
    hull = Polygon([(fire["lon"], fire["lat"]) for fire in triangle["fires"]])
    assert hull.contains(Point(source["lon"], source["lat"]))


def test_frp_weighted_centroid_uses_spherical_vectors():
    snapshot = geometric_snapshot([(0, 0), (0, 0.02), (0, 0.04)], frps=[0, 1, 3])
    source = detect_sources(snapshot)["sources"][0]
    angles = [math.radians(0.02), math.radians(0.04)]
    expected = math.degrees(math.atan2(math.sin(angles[0]) + 3 * math.sin(angles[1]),
                                     math.cos(angles[0]) + 3 * math.cos(angles[1])))
    assert source["lat"] == pytest.approx(0)
    assert source["lon"] == pytest.approx(expected, abs=1e-12)
    assert source["lon"] > 0.03
    assert source["total_frp_mw"] == 4


def test_zero_frp_uses_equal_spherical_weights():
    snapshot = geometric_snapshot([(0, 0), (0, 0.02), (0, 0.04)], frps=[0, 0, 0])
    source = detect_sources(snapshot)["sources"][0]
    assert source["lon"] == pytest.approx(0.02)
    assert source["total_frp_mw"] == source["emission_strength"] == 0


def test_antimeridian_cluster_and_centroid():
    source = detect_sources(geometric_snapshot([(0, 179.98), (0, -179.98), (0, 180)]))["sources"][0]
    assert abs(source["lon"]) == pytest.approx(180)
    assert source["radius_km"] == pytest.approx(EARTH_RADIUS_KM * math.radians(0.02))


def test_haversine_high_latitude_clustering():
    assert len(cluster_fires([{"lat": 80, "lon": lon} for lon in (0, 0.1, 0.2)], eps_km=3)) == 1


def test_dbscan_connectivity_border_points_and_unique_membership():
    points = [{"lat": 0, "lon": lon} for lon in (0, 0.009, 0.018, 0.027)]
    clusters = cluster_fires(points, eps_km=1.1)
    assert len(clusters) == 1
    assert len(clusters[0]) == 4  # endpoints are border points, not cores
    assert len({id(point) for point in clusters[0]}) == 4


def test_radius_nearest_rank_encloses_at_least_ninety_percent():
    snapshot = geometric_snapshot([(0, 0)] * 9 + [(0, 0.09)])
    source = detect_sources(snapshot, params={"eps_km": 11})["sources"][0]
    distances = sorted(haversine_km(source["lat"], source["lon"], fire["lat"], fire["lon"])
                       for fire in snapshot["fires"])
    assert source["radius_km"] == pytest.approx(distances[8], abs=1e-10)
    assert source["radius_km"] < distances[9]
    assert sum(distance <= source["radius_km"] + 1e-10 for distance in distances) == 9


def test_emission_strength_monotonic_and_formula():
    strengths = []
    for total in (0, 1e-10, 1, 50, 500, 1000, 1e6):
        snapshot = geometric_snapshot([(0, 0), (0, 0.02), (0, 0.04)], frps=[total / 3] * 3)
        source = detect_sources(snapshot)["sources"][0]
        strengths.append(source["emission_strength"])
        assert strengths[-1] == pytest.approx(-math.expm1(-total / 500))
        assert 0 <= strengths[-1] <= 1
    assert strengths == sorted(strengths)
    assert strengths[1] > 0  # stable at tiny FRP; no cancellation/rounding to zero


def test_emission_reference_scale_is_configurable(triangle):
    assert detect_sources(triangle, params={"frp_scale_mw": 100})["sources"][0]["emission_strength"] > \
        detect_sources(triangle)["sources"][0]["emission_strength"]


def test_confidence_formula_and_newer_recency():
    scores = []
    for age in (24, 12, 6, 0):
        source = detect_sources(geometric_snapshot([(0, 0), (0, 0.02), (0, 0.04)], age_hours=age))["sources"][0]
        expected = 0.4 * (1 - math.exp(-3 / 10)) + 0.3 + 0.3 * (1 - age / 24)
        assert source["confidence"] == pytest.approx(expected)
        assert 0 <= source["confidence"] <= 1
        scores.append(source["confidence"])
    assert scores == sorted(scores)
    assert len(set(scores)) == 4


def test_high_share_and_count_increase_confidence():
    points = [(0, 0), (0, 0.02), (0, 0.04)]
    nominal = detect_sources(geometric_snapshot(points, confidence="nominal"))["sources"][0]["confidence"]
    high = detect_sources(geometric_snapshot(points))["sources"][0]["confidence"]
    more = detect_sources(geometric_snapshot(points * 2))["sources"][0]["confidence"]
    assert high - nominal == pytest.approx(0.3)
    assert nominal < high < more <= 1


@pytest.mark.parametrize("month,point,expected", [(10, (30, 75), "stubble_burning"),
                                                 (11, (30, 75), "stubble_burning"),
                                                 (9, (30, 75), "fire"), (12, (30, 75), "fire"),
                                                 (10, (20, 75), "fire"), (10, (30, 80), "fire")])
def test_source_type_bbox_and_detection_season(month, point, expected):
    when = _AS_OF.replace(month=month)
    source = detect_sources(geometric_snapshot([point] * 3, as_of=when))["sources"][0]
    assert source["type"] == expected


def test_source_type_uses_detection_month_not_reference_month():
    reference = datetime(2026, 12, 1, 1, tzinfo=timezone.utc)
    snapshot = geometric_snapshot([(30, 75)] * 3, as_of=reference, age_hours=2)
    assert detect_sources(snapshot)["sources"][0]["type"] == "stubble_burning"


@pytest.mark.parametrize("params", [{"window_hours": 0}, {"eps_km": -1}, {"min_samples": 0},
                                    {"min_samples": True}, {"min_samples": 2.5}, {"frp_scale_mw": 0},
                                    {"confidence_count_scale": float("inf")}, {"min_confidence": "h"},
                                    {"noise_policy": "unknown"}, {"as_of": datetime(2026, 1, 1)},
                                    {"agricultural_bbox": [80, 30, 70, 20]}, {"unknown": 1}])
def test_invalid_parameters(triangle, params):
    with pytest.raises(ValueError):
        detect_sources(triangle, params=params)


def test_dataclass_parameters_and_input_immutability(triangle):
    before = copy.deepcopy(triangle)
    assert detect_sources(triangle, params=SourceDetectionParams()) == detect_sources(triangle)
    assert triangle == before


def test_deterministic_output_under_record_permutations(real_snapshot):
    expected = json.dumps(detect_sources(real_snapshot), allow_nan=False)
    rng = random.Random(0)
    for _ in range(5):
        rng.shuffle(real_snapshot["fires"])
        assert json.dumps(detect_sources(real_snapshot), allow_nan=False) == expected


def test_real_capture_contract_and_sanity(real_snapshot):
    result = detect_sources(real_snapshot)
    assert result["sources"]
    assert check_sources(result) == []
    assert set(result) == {"generated_at", "sources"}
    json.dumps(result, allow_nan=False)
    for source in result["sources"]:
        assert set(source) == _SOURCE_FIELDS
        assert -90 <= source["lat"] <= 90 and -180 <= source["lon"] <= 180
        assert 0 <= source["confidence"] <= 1 and 0 <= source["emission_strength"] <= 1
        assert source["radius_km"] >= 0 and source["total_frp_mw"] >= 0 and source["fire_count"] >= 1
        assert source["first_seen"] <= source["last_seen"] <= result["generated_at"]
    assert sum(source["fire_count"] for source in result["sources"]) <= len(real_snapshot["fires"])


def test_aqi_optional_without_unjustified_boost(real_snapshot):
    aqi = json.loads((_ROOT / "data/live/aqi.json").read_text(encoding="utf-8"))
    assert detect_sources(real_snapshot, aqi=aqi) == detect_sources(real_snapshot)


def test_cli_module_on_real_snapshot_preserves_input(tmp_path, real_snapshot, monkeypatch):
    input_path = tmp_path / "fires.json"
    input_path.write_text(json.dumps(real_snapshot), encoding="utf-8")
    before = input_path.read_bytes()
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    completed = subprocess.run([sys.executable, "-m", "models.source_detection.cluster", "--live"],
                               cwd=_ROOT, capture_output=True, text=True, check=False)
    assert completed.returncode == 0, completed.stderr
    result = json.loads((tmp_path / "sources.json").read_text(encoding="utf-8"))
    assert result == detect_sources(real_snapshot)
    assert input_path.read_bytes() == before


def test_cli_output_override_and_as_of(tmp_path, real_snapshot, monkeypatch):
    (tmp_path / "fires.json").write_text(json.dumps(real_snapshot), encoding="utf-8")
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    output = tmp_path / "validation.json"
    main(["--live", "--output", str(output), "--as-of", "2026-10-09T12:00:00Z"])
    assert json.loads(output.read_text(encoding="utf-8"))["sources"] == []
    assert not (tmp_path / "sources.json").exists()


def test_cli_missing_input_preserves_existing_result(tmp_path, monkeypatch, capsys):
    output = tmp_path / "sources.json"
    output.write_bytes((_ROOT / "data/live/sources.json").read_bytes())
    before = output.read_bytes()
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit) as exc:
        main(["--live"])
    assert exc.value.code == 1
    assert "fires.json" in capsys.readouterr().err
    assert output.read_bytes() == before


def test_cli_invalid_input_preserves_existing_result(tmp_path, real_snapshot, monkeypatch):
    real_snapshot["fires"][0]["frp_mw"] = None
    (tmp_path / "fires.json").write_text(json.dumps(real_snapshot), encoding="utf-8")
    output = tmp_path / "sources.json"
    output.write_bytes((_ROOT / "data/live/sources.json").read_bytes())
    before = output.read_bytes()
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit) as exc:
        main(["--live"])
    assert exc.value.code == 1
    assert output.read_bytes() == before


def test_cli_refuses_to_overwrite_input(tmp_path, real_snapshot, monkeypatch):
    input_path = tmp_path / "fires.json"
    input_path.write_text(json.dumps(real_snapshot), encoding="utf-8")
    before = input_path.read_bytes()
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit):
        main(["--live", "--output", str(input_path)])
    assert input_path.read_bytes() == before
