"""Controlled geometric inputs are mathematical tests, NOT real weather results."""

from __future__ import annotations

import copy
import json
import math
import subprocess
import sys
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
import shapely
from pyproj import Geod
from shapely.geometry import shape

from models.plume.advect import (
    LocalProjection, PlumeParams, WindField, decay_factor, dispersion_sigma,
    simulate_source, validate_sources,
)
from models.plume.corridor import Grid, _band_features, concentration_grid, main, make_grid, predict_corridor
from pipeline.contracts import check_corridor

_ROOT = Path(__file__).resolve().parents[3]
_START = datetime(2026, 10, 7, 8, 41, tzinfo=timezone.utc)


def mathematical_sources(strength=0.5, locations=((30.0, 75.0),), radius_km=0):
    """Minimal contract-shaped mathematical source state, not detected observations."""
    return {"generated_at": _START.isoformat(), "sources": [
        {"id": f"geometry_{i}", "type": "fire", "lat": lat, "lon": lon,
         "fire_count": 3, "total_frp_mw": 1.0, "radius_km": radius_km,
         "first_seen": _START.isoformat(), "last_seen": _START.isoformat(),
         "confidence": 0.5, "emission_strength": strength}
        for i, (lat, lon) in enumerate(locations)]}


def mathematical_wind(u=0.0, v=0.0, pblh=500.0, hours=48, locations=((30.0, 75.0),)):
    """Uniform mathematical vectors (u east, v north); not invented real weather."""
    return {"generated_at": _START.isoformat(), "source": "mathematical vector test; not observations",
            "points": [{"lat": lat, "lon": lon, "hours": [
                {"t": (_START + timedelta(hours=h)).isoformat(), "u_ms": u, "v_ms": v,
                 "pblh_m": pblh} for h in range(hours + 1)]} for lat, lon in locations]}


def simulation(sources=None, wind=None, hours=2, params=None):
    params = params or PlumeParams()
    _, parsed = validate_sources(sources or mathematical_sources())
    field = WindField(wind or mathematical_wind(), params)
    projection, frames = simulate_source(parsed[0], field, _START, hours, params)
    return projection, frames, params


def test_transport_uses_eastward_u_and_northward_v():
    # u > 0 and v < 0 explicitly mean southeast transport. Direction is not reversed.
    source = mathematical_sources()
    wind = mathematical_wind(u=2, v=-2, hours=2)
    projection, frames, _ = simulation(source, wind)
    oldest = frames[-1].puffs[0]
    assert oldest.x_m > 14000 and oldest.y_m < -14000
    output = predict_corridor(source, wind, hours=2)
    line = next(f for f in output["features"] if f["properties"]["kind"] == "centerline")
    start, end = line["geometry"]["coordinates"][0], line["geometry"]["coordinates"][-1]
    assert end[0] > start[0] and end[1] < start[1]
    polygons = [shape(f["geometry"]) for f in output["features"] if f["properties"]["kind"] == "band"]
    union = shapely.union_all(polygons)
    assert union.centroid.x > 75 and union.centroid.y < 30


def test_meteorological_from_direction_already_converted_to_uv():
    wind = mathematical_wind(u=0, v=-5, hours=1)
    for hour in wind["points"][0]["hours"]:
        hour.update(speed_ms=5, dir_from_deg=0)  # FROM north, travels south.
    _, frames, _ = simulation(wind=wind, hours=1)
    assert frames[-1].puffs[0].y_m == pytest.approx(-18000, abs=0.1)
    assert frames[-1].puffs[0].x_m == pytest.approx(0, abs=0.1)


def test_zero_wind_center_and_symmetric_distribution():
    projection, frames, params = simulation()
    grid = make_grid(frames, params)
    values = concentration_grid(frames[-1], grid, params)
    assert np.allclose(values, values[::-1, :], atol=1e-12)
    assert np.allclose(values, values[:, ::-1], atol=1e-12)
    assert all(frame.center_x_m == frame.center_y_m == 0 for frame in frames)
    output = predict_corridor(mathematical_sources(), mathematical_wind(), hours=2)
    assert output["features"]
    # A stationary centre has no geometrically valid LineString; no fake motion.
    assert all(f["properties"]["kind"] == "band" for f in output["features"])
    for feature in output["features"]:
        polygon = shapely.transform(shape(feature["geometry"]), lambda coords: np.column_stack(
            projection.forward.transform(coords[:, 0], coords[:, 1])))
        assert polygon.centroid.x == pytest.approx(0, abs=1e-6)
        assert polygon.centroid.y == pytest.approx(0, abs=1e-6)


def test_stronger_source_increases_pm25_and_risk():
    outputs = [predict_corridor(mathematical_sources(strength=s), mathematical_wind(), hours=2)
               for s in (0.25, 0.75)]
    peaks = [max(f["properties"]["pm25_delta_ugm3"] for f in output["features"]) for output in outputs]
    risks = [max(f["properties"]["risk"] for f in output["features"]) for output in outputs]
    assert peaks[1] == pytest.approx(3 * peaks[0])
    assert risks[1] > risks[0]


def test_decay_monotonic_and_exact_formula():
    values = [decay_factor(age, 24) for age in (0, 1, 12, 24, 48)]
    assert values[0] == 1
    assert values == sorted(values, reverse=True)
    assert values[3] == pytest.approx(math.exp(-1))
    _, frames, _ = simulation(hours=2)
    assert frames[2].puffs[0].decay < frames[1].puffs[0].decay


def test_decay_alone_cannot_increase_kernel_concentration():
    _, frames, params = simulation(hours=1)
    grid = make_grid(frames, params)
    frame = frames[0]
    before = concentration_grid(frame, grid, params)
    after = concentration_grid(replace(frame, puffs=(replace(frame.puffs[0], decay=math.exp(-1)),)),
                               grid, params)
    assert np.all(after <= before)
    assert after == pytest.approx(before * math.exp(-1))


def test_sigma_nondecreasing_and_parameter_units():
    params = PlumeParams(sigma0_m=2000, k_m_sqrt_hour=1000)
    values = [dispersion_sigma(age, 2000, params) for age in (0, 1, 4, 16, 48)]
    assert values == sorted(values)
    assert values[:4] == [2000, 3000, 4000, 6000]


def test_source_radius_sets_documented_initial_gaussian_spread():
    _, frames, _ = simulation(sources=mathematical_sources(radius_km=10))
    assert frames[0].puffs[0].sigma_m == pytest.approx(10000 / math.sqrt(2 * math.log(10)))


def test_lower_pblh_increases_concentration_and_floor_prevents_division_by_zero():
    peaks = []
    for pblh in (0, 100, 200, 400):
        _, frames, params = simulation(wind=mathematical_wind(pblh=pblh))
        grid = make_grid(frames, params)
        peaks.append(float(concentration_grid(frames[0], grid, params).max()))
    assert peaks[0] == peaks[1] == peaks[2]
    assert peaks[2] == pytest.approx(2 * peaks[3])


def test_gaussian_mass_normalization_in_projected_units():
    params = PlumeParams(grid_cell_m=100, kernel_sigma_cutoff=5)
    _, frames, _ = simulation(params=params, hours=1)
    grid = make_grid(frames, params)
    integrated = concentration_grid(frames[0], grid, params).sum() * grid.cell_m ** 2 * 500
    assert integrated == pytest.approx(params.concentration_scale_ug * 0.5, rel=1e-5)


def test_hourly_puffs_preserve_source_time_and_age():
    _, frames, _ = simulation(hours=4)
    assert [len(frame.puffs) for frame in frames] == [1, 2, 3, 4, 4]
    final = frames[-1].puffs
    assert [p.age_hours for p in final] == [4, 3, 2, 1]
    assert [p.emitted_at for p in final] == [_START + timedelta(hours=i) for i in range(4)]
    assert all(p.source_id == "geometry_0" and p.strength == 0.5 for p in final)


def test_changing_wind_bends_actual_mass_centerline():
    wind = mathematical_wind(hours=4)
    for i, hour in enumerate(wind["points"][0]["hours"]):
        hour.update(u_ms=2 if i < 2 else 0, v_ms=0 if i < 2 else 2)
    output = predict_corridor(mathematical_sources(), wind, hours=4)
    line = next(f for f in output["features"] if f["properties"]["kind"] == "centerline")
    coords = line["geometry"]["coordinates"]
    assert coords[1][0] > coords[0][0]
    assert abs(coords[1][1] - coords[0][1]) < 1e-5
    assert coords[-1][1] > coords[2][1]
    a, b, c = np.array(coords[0]), np.array(coords[2]), np.array(coords[-1])
    first_leg, second_leg = b - a, c - b
    assert abs(first_leg[0] * second_leg[1] - first_leg[1] * second_leg[0]) > 1e-6


def test_centreline_is_mass_weighted_across_all_puffs():
    _, frames, params = simulation(wind=mathematical_wind(u=1), hours=2)
    # New puff at source and older decayed puff at x=3600: not a single-puff path.
    expected = 3600 * math.exp(-1 / params.tau_hours) / (1 + math.exp(-1 / params.tau_hours))
    assert frames[1].center_x_m == pytest.approx(expected, abs=0.1)
    assert frames[1].center_x_m < frames[1].puffs[0].x_m


def test_independent_sources_keep_identity_and_geometry():
    locations = ((30, 75), (30.5, 75.5))
    output = predict_corridor(mathematical_sources(locations=locations),
                              mathematical_wind(u=1, locations=locations), hours=2)
    assert {f["properties"]["source_id"] for f in output["features"]} == {"geometry_0", "geometry_1"}
    lines = [f for f in output["features"] if f["properties"]["kind"] == "centerline"]
    assert len(lines) == 2
    assert [f["geometry"]["coordinates"][0] for f in lines] == [[75, 30], [75.5, 30.5]]


def test_full_48_hour_simulation_and_required_band_limits():
    output = predict_corridor(mathematical_sources(), mathematical_wind(u=0.1), hours=48)
    line = next(f for f in output["features"] if f["properties"]["kind"] == "centerline")
    assert len(line["geometry"]["coordinates"]) == 49
    assert line["properties"]["points_eta_hours"] == list(range(49))
    assert {(f["properties"]["hour_from"], f["properties"]["hour_to"])
            for f in output["features"] if f["properties"]["kind"] == "band"} == {(0, 2), (2, 4), (4, 8), (8, 24)}


def test_geometry_contract_and_no_extra_fields():
    output = predict_corridor(mathematical_sources(), mathematical_wind(u=1), hours=2)
    assert check_corridor(output) == []
    assert set(output) == {"type", "generated_at", "forecast_start", "wind_generated_at", "features"}
    json.dumps(output, allow_nan=False)
    for feature in output["features"]:
        geometry = shape(feature["geometry"])
        assert geometry.is_valid and not geometry.is_empty
        if feature["properties"]["kind"] == "band":
            assert geometry.geom_type == "Polygon"
            assert set(feature["properties"]) == {"kind", "source_id", "hour_from", "hour_to", "risk", "pm25_delta_ugm3"}
        else:
            assert set(feature["properties"]) == {"kind", "source_id", "points_eta_hours"}


def test_disconnected_cells_emit_polygons_with_preserved_source_and_band():
    params = PlumeParams()
    grid = Grid(-3000, -1000, 2000, 3, 1)
    values = np.array([[10, 0, 10]], dtype=float)
    features = _band_features("geometry_0", 0, 2, values, grid, LocalProjection(30, 75, 1000), params)
    assert len(features) == 2
    assert all(shape(f["geometry"]).is_valid and f["geometry"]["type"] == "Polygon" for f in features)
    assert all(f["properties"]["source_id"] == "geometry_0" and f["properties"]["hour_to"] == 2
               for f in features)


def test_polygon_holes_remain_holes_instead_of_filled_exposure():
    params = PlumeParams()
    grid = Grid(-3000, -3000, 2000, 3, 3)
    values = np.full((3, 3), 10.0)
    values[1, 1] = 0
    features = _band_features("geometry_0", 0, 2, values, grid, LocalProjection(30, 75, 1000), params)
    assert len(features) == 1
    assert len(shape(features[0]["geometry"]).interiors) == 1


def test_no_forced_polygon_or_fabricated_zero_strength_line():
    assert predict_corridor(mathematical_sources(strength=0), mathematical_wind(), hours=2)["features"] == []
    output = predict_corridor(mathematical_sources(), mathematical_wind(u=1), hours=2,
                              params={"threshold_ugm3": 1e20})
    assert [f["properties"]["kind"] for f in output["features"]] == ["centerline"]


def test_determinism_and_input_immutability():
    sources = mathematical_sources(locations=((30, 75), (30.25, 75.25)))
    wind = mathematical_wind(u=0.5, locations=((30, 75), (30.25, 75.25)))
    before = copy.deepcopy((sources, wind))
    encoded = [json.dumps(predict_corridor(sources, wind, hours=2), allow_nan=False) for _ in range(3)]
    assert len(set(encoded)) == 1
    assert (sources, wind) == before
    sources["sources"].reverse()
    wind["points"].reverse()
    for point in wind["points"]:
        point["hours"].reverse()
    assert json.dumps(predict_corridor(sources, wind, hours=2), allow_nan=False) == encoded[0]


def test_exact_grid_point_and_linear_temporal_interpolation():
    wind = mathematical_wind(hours=1)
    wind["points"][0]["hours"][0].update(u_ms=2, v_ms=-4, pblh_m=200)
    wind["points"][0]["hours"][1].update(u_ms=6, v_ms=4, pblh_m=600)
    field = WindField(wind)
    assert field.interpolate(30, 75, _START) == (2, -4, 200)
    assert field.interpolate(30, 75, _START + timedelta(minutes=30)) == pytest.approx((4, 0, 400))
    assert field.interpolate(30, 75, _START + timedelta(hours=1)) == (6, 4, 600)


def test_inverse_geodesic_distance_weighting():
    locations = ((30, 75), (30, 75.2))
    wind = mathematical_wind(hours=1, locations=locations)
    for hour in wind["points"][0]["hours"]:
        hour["u_ms"] = 2
    for hour in wind["points"][1]["hours"]:
        hour["u_ms"] = 10
    actual = WindField(wind).interpolate(30, 75.05, _START)[0]
    geod = Geod(ellps="WGS84")
    distances = [geod.inv(75.05, 30, lon, lat)[2] for lat, lon in locations]
    expected = sum(u / d ** 2 for u, d in zip((2, 10), distances)) / sum(1 / d ** 2 for d in distances)
    assert actual == pytest.approx(expected)
    assert 2 < actual < 6


def test_missing_samples_interpolate_only_short_valid_gaps():
    wind = mathematical_wind(hours=4)
    wind["points"][0]["hours"][1]["u_ms"] = None
    assert WindField(wind).interpolate(30, 75, _START + timedelta(hours=1)) == (0, 0, 500)
    wind["points"][0]["hours"][2]["pblh_m"] = None
    wind["points"][0]["hours"][3]["v_ms"] = None
    with pytest.raises(ValueError, match="No usable local"):
        WindField(wind).interpolate(30, 75, _START + timedelta(hours=2))


def test_missing_pblh_never_fabricated():
    wind = mathematical_wind(pblh=None)
    with pytest.raises(ValueError, match="no usable samples"):
        predict_corridor(mathematical_sources(), wind, hours=2)


def test_missing_local_point_uses_only_available_real_samples_in_radius():
    wind = mathematical_wind(locations=((30, 75), (30, 75.1)))
    for hour in wind["points"][0]["hours"]:
        hour["pblh_m"] = None
    for hour in wind["points"][1]["hours"]:
        hour.update(u_ms=2, v_ms=-3, pblh_m=450)
    assert WindField(wind).interpolate(30, 75, _START) == (2, -3, 450)


@pytest.mark.parametrize("delta", [-1, 3])
def test_outside_time_range_is_error(delta):
    field = WindField(mathematical_wind(hours=2))
    with pytest.raises(ValueError, match="No usable local"):
        field.interpolate(30, 75, _START + timedelta(hours=delta))


def test_no_distant_spatial_wind_fallback():
    with pytest.raises(ValueError, match="No usable local"):
        WindField(mathematical_wind()).interpolate(20, 70, _START)


def test_horizon_cannot_extrapolate_or_shift_reference():
    with pytest.raises(ValueError, match="outside real wind coverage"):
        predict_corridor(mathematical_sources(), mathematical_wind(hours=2), hours=48)


def test_projection_uses_metres_and_true_east_north_axes():
    projection = LocalProjection(30, 75, 1000)
    dx, dy = projection.velocity(0, 0, 1, 0)
    assert dx == pytest.approx(1, abs=1e-7) and dy == pytest.approx(0, abs=1e-7)
    x, y = projection.forward.transform(78, 34)
    assert math.hypot(x, y) > 400000
    dx, dy = projection.velocity(x, y, 1, 0)
    lat, lon = projection.latlon(x + dx * 1000, y + dy * 1000)
    azimuth, _, distance = Geod(ellps="WGS84").inv(78, 34, lon, lat)
    assert azimuth == pytest.approx(90, abs=0.01)
    assert distance == pytest.approx(1000, abs=0.1)


def test_grid_budget_fails_before_massive_allocation():
    with pytest.raises(ValueError, match="grid requires"):
        predict_corridor(mathematical_sources(), mathematical_wind(), hours=2,
                         params={"grid_cell_m": 1, "max_grid_cells": 100})


def test_unsupported_antimeridian_output_fails_instead_of_drawing_global_polygon():
    location = ((30, 179.99),)
    with pytest.raises(ValueError, match="antimeridian"):
        predict_corridor(mathematical_sources(locations=location),
                         mathematical_wind(u=2, locations=location), hours=2)


def test_extreme_source_extent_fails_clearly_without_nonfinite_output():
    with pytest.raises(ValueError, match="source spread"):
        predict_corridor(mathematical_sources(radius_km=1e308), mathematical_wind(), hours=2)


def test_negative_puff_age_rejected_by_both_physical_factors():
    with pytest.raises(ValueError):
        dispersion_sigma(-1, 2000, PlumeParams())
    with pytest.raises(ValueError):
        decay_factor(-1, 24)


@pytest.mark.parametrize("hours", [0, 49, -1, True, 2.5])
def test_invalid_horizon(hours):
    with pytest.raises(ValueError):
        predict_corridor(mathematical_sources(), mathematical_wind(), hours=hours)


@pytest.mark.parametrize("params", [{"sigma0_m": 0}, {"k_m_sqrt_hour": -1}, {"tau_hours": 0},
                                    {"concentration_scale_ug": float("inf")}, {"grid_cell_m": -1},
                                    {"threshold_ugm3": 0}, {"risk_scale_ugm3": float("nan")},
                                    {"wind_neighbors": True}, {"max_grid_cells": 0}, {"unknown": 1}])
def test_invalid_parameters(params):
    with pytest.raises(ValueError):
        predict_corridor(mathematical_sources(), mathematical_wind(), hours=2, params=params)


@pytest.mark.parametrize("key,value", [("u_ms", float("nan")), ("v_ms", "2"),
                                       ("pblh_m", -1), ("t", "2026-10-07T08:41:00")])
def test_invalid_wind_samples(key, value):
    wind = mathematical_wind()
    wind["points"][0]["hours"][0][key] = value
    with pytest.raises(ValueError):
        WindField(wind)


@pytest.mark.parametrize("key,value", [("lat", 91), ("lon", float("inf")),
                                       ("emission_strength", -1), ("emission_strength", 2),
                                       ("radius_km", None), ("fire_count", 0)])
def test_invalid_source_records(key, value):
    sources = mathematical_sources()
    sources["sources"][0][key] = value
    with pytest.raises(ValueError):
        predict_corridor(sources, mathematical_wind(), hours=2)


def test_actual_captures_insufficient_48_hours_fail_honestly():
    sources = json.loads((_ROOT / "data/live/sources.json").read_text(encoding="utf-8"))
    wind = json.loads((_ROOT / "data/live/wind.json").read_text(encoding="utf-8"))
    with pytest.raises(ValueError, match="outside real wind coverage"):
        predict_corridor(sources, wind)


def test_real_capture_short_replay_passes_contract():
    sources = json.loads((_ROOT / "data/live/sources.json").read_text(encoding="utf-8"))
    wind = json.loads((_ROOT / "data/live/wind.json").read_text(encoding="utf-8"))
    start = max(datetime.fromisoformat(s["last_seen"]) for s in sources["sources"])
    output = predict_corridor(sources, wind, hours=2, start=start)
    assert output["features"] and check_corridor(output) == []
    assert all(shape(f["geometry"]).is_valid for f in output["features"])


def test_cli_real_snapshot_replay_and_input_preservation(tmp_path, monkeypatch):
    for name in ("sources.json", "wind.json"):
        (tmp_path / name).write_bytes((_ROOT / "data/live" / name).read_bytes())
    before = {name: (tmp_path / name).read_bytes() for name in ("sources.json", "wind.json")}
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    sources = json.loads(before["sources.json"])
    start = max(s["last_seen"] for s in sources["sources"])
    completed = subprocess.run([sys.executable, "-m", "models.plume.corridor", "--live",
                                "--hours", "2", "--start", start], cwd=_ROOT,
                               capture_output=True, text=True, check=False)
    assert completed.returncode == 0, completed.stderr
    assert check_corridor(json.loads((tmp_path / "corridor.geojson").read_text(encoding="utf-8"))) == []
    assert before == {name: (tmp_path / name).read_bytes() for name in before}


@pytest.mark.parametrize("missing", ["sources.json", "wind.json"])
def test_cli_missing_inputs_preserve_previous_result(tmp_path, monkeypatch, missing):
    for name in ("sources.json", "wind.json"):
        if name != missing:
            (tmp_path / name).write_bytes((_ROOT / "data/live" / name).read_bytes())
    output = tmp_path / "corridor.geojson"
    before = (_ROOT / "data/live/corridor.geojson").read_bytes()
    output.write_bytes(before)
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit) as exc:
        main(["--live"])
    assert exc.value.code == 1
    assert output.read_bytes() == before


def test_cli_insufficient_time_coverage_preserves_previous_result(tmp_path, monkeypatch):
    for name in ("sources.json", "wind.json"):
        (tmp_path / name).write_bytes((_ROOT / "data/live" / name).read_bytes())
    output = tmp_path / "corridor.geojson"
    before = (_ROOT / "data/live/corridor.geojson").read_bytes()
    output.write_bytes(before)
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    with pytest.raises(SystemExit) as exc:
        main(["--live"])
    assert exc.value.code == 1 and output.read_bytes() == before
