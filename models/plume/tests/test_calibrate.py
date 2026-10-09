"""Eligibility uses actual captures; numerical fixtures are MATHEMATICAL_TEST only.

No test constructs a claimed real historical calibration dataset. Successful
optimizer/artifact mechanics are labelled mathematical and cannot be deployed.
"""

from __future__ import annotations

import copy
import json
import math
import subprocess
import sys
from dataclasses import asdict, replace
from datetime import timedelta
from pathlib import Path

import pytest

from models.plume import calibrate as engine
from models.plume import parameters
from models.plume.advect import PlumeParams, Source, WindField, parse_time, simulate_source
from models.plume.corridor import Grid, concentration_at, concentration_grid, predict_corridor
from models.plume.history import (
    BackgroundEstimate, EligibilityConfig, Event, Match, Observation,
    check_chronology, check_history_population, chronological_split, estimate_background, match_observations,
    parse_event, parse_observation, plausible_transport, pre_event_median,
)
from models.plume.tests.test_plume import _ROOT, _START, mathematical_sources, mathematical_wind


def mathematical_match_inputs():
    """Abstract dates, coordinates and numbers for matching/split mathematics ONLY."""
    events, readings = [], []
    for day in (0, 7, 14):
        start = _START + timedelta(days=day)
        source = Source("geometry", 30, 75, 0.5, 0, start - timedelta(minutes=1))
        wind = mathematical_wind(u=1, hours=4)
        wind["generated_at"] = (start - timedelta(minutes=1)).isoformat()
        for h, row in enumerate(wind["points"][0]["hours"]):
            row["t"] = (start + timedelta(hours=h)).isoformat()
        event = Event(f"math_capture_{day}", f"math_event_{day}", source.last_seen, start,
                      (source,), wind, {"kind": "MATHEMATICAL_TEST"})
        events.append(event)
        projection, _ = simulate_source(source, WindField(wind), start, 2, PlumeParams())
        for station, x in (("math_station_a", 7200), ("math_station_b", 7400)):
            lat, lon = projection.latlon(x, 0)
            for i, value in enumerate((10.0, 20.0, 30.0)):
                t = source.last_seen - timedelta(hours=3 - i)
                readings.append(Observation(f"math_bg_{day}_{station}_{i}", station, lat, lon,
                                            t, t, t, value, {"kind": "MATHEMATICAL_TEST"}))
            t = start + timedelta(hours=2)
            readings.append(Observation(f"math_target_{day}_{station}", station, lat, lon,
                                        t, t, t, 40, {"kind": "MATHEMATICAL_TEST"}))
    return events, readings


def mathematical_search():
    def equation(p):
        return [p.sigma0_m / 1000, p.k_m_sqrt_hour / 1000,
                p.tau_hours / 12, p.concentration_scale_ug / 1e12]
    return engine.grid_search(equation, [3, 1.5, 3, 1.5]), equation


def mathematical_artifact_result():
    """Numerical serialization mechanics, NOT an event/observation evidence report."""
    search, _ = mathematical_search()
    report = engine.empty_report()
    report.update(status="CALIBRATED", fitted_parameters=asdict(search.selected),
                  optimizer_executed=True,
                  parameter_status=search.parameter_status, identifiability=search.identifiability,
                  calibration_timestamp=_START.isoformat(),
                  dataset={"evidence_kind": "MATHEMATICAL_TEST", "provenance": "numerical mechanics only",
                           "events": 3, "stations": 2, "observations": 8,
                           "time_from": _START.isoformat(), "time_to": _START.isoformat()},
                  split={"training_events": ["math_group_a", "math_group_b"], "holdout_events": ["math_group_c"]},
                  leakage_checks={"source_availability": "PASS", "background_independence": "PASS",
                                  "event_split_disjoint": "PASS", "holdout_used_for_selection": False},
                  metrics={"baseline": search.baseline_metrics, "calibrated": search.selected_metrics,
                           "baseline_holdout": search.baseline_metrics, "calibrated_holdout": search.selected_metrics})
    return engine.CalibrationResult(report)


@pytest.mark.parametrize("history", [None, {}, {"schema_version": 1, "evidence_kind": "MATHEMATICAL_TEST"}])
def test_missing_or_mathematical_history_never_runs_optimizer(history, monkeypatch):
    monkeypatch.setattr(engine, "grid_search", lambda *a, **kw: pytest.fail("optimizer must not run"))
    result = engine.calibrate(history)
    assert result.status == engine.BLOCKED
    assert not result.report["optimizer_executed"] and result.report["fitted_parameters"] is None
    assert result.report["metrics"]["baseline"] is None
    assert set(result.report["parameter_status"].values()) == {"ASSUMED"}


def test_actual_one_reading_per_station_audit_is_blocked():
    report = engine.audit_repository(_ROOT)
    aqi = next(d for d in report["dataset"]["discovered"] if d["path"].endswith("aqi.json"))
    assert aqi["stations"] == 60 and aqi["pm25_observations"] == 59
    assert "MISSING_BACKGROUND_HISTORY" in report["reason"]
    assert "INSUFFICIENT_EVENTS" in report["reason"]
    assert report["status"] == engine.BLOCKED and not report["optimizer_executed"]


def test_background_requires_repeated_same_station_readings():
    events, obs = mathematical_match_inputs()
    target = obs[3]
    for insufficient in ([target], obs[:2] + [target], [replace(o, station_id="other") for o in obs[:3]]):
        with pytest.raises(ValueError, match="MISSING_BACKGROUND_HISTORY"):
            estimate_background(target, insufficient, events[0], EligibilityConfig(), pre_event_median)


def test_background_plugin_receives_only_pre_event_readings_and_never_target():
    events, obs = mathematical_match_inputs()
    target = obs[3]
    called = []
    def plugin(candidates):
        called.extend(candidates)
        return pre_event_median(candidates)
    estimate = estimate_background(target, obs, events[0], EligibilityConfig(), plugin)
    assert estimate.value_ugm3 == 20
    assert all(o.observed_at < events[0].source_event_time and o.id != target.id for o in called)
    mutated = replace(target, pm25_ugm3=100000)
    assert estimate_background(mutated, obs, events[0], EligibilityConfig(), plugin) == estimate


def test_background_rejects_future_available_readings_and_target_references():
    events, obs = mathematical_match_inputs()
    late = [replace(o, available_at=events[0].forecast_start + timedelta(hours=1)) for o in obs[:3]]
    with pytest.raises(ValueError, match="MISSING_BACKGROUND_HISTORY"):
        estimate_background(obs[3], late, events[0], EligibilityConfig(), pre_event_median)
    with pytest.raises(ValueError, match="BACKGROUND_LEAKAGE"):
        estimate_background(obs[3], obs, events[0], EligibilityConfig(),
                            lambda candidates: BackgroundEstimate(20, (obs[3].id, "x", "y"), "invalid"))


def test_background_rejects_arbitrary_constant_outside_cited_readings():
    events, obs = mathematical_match_inputs()
    with pytest.raises(ValueError, match="within its cited"):
        estimate_background(obs[3], obs, events[0], EligibilityConfig(),
                            lambda candidates: BackgroundEstimate(100, tuple(o.id for o in candidates), "bad"))


@pytest.mark.parametrize("field", ["source", "wind", "fire"])
def test_future_source_or_wind_chronology_rejected(field):
    earlier = _START - timedelta(minutes=1)
    times = [earlier, earlier, earlier]
    times[("source", "wind", "fire").index(field)] = _START + timedelta(seconds=1)
    with pytest.raises(ValueError, match="FUTURE_SOURCE_OR_WIND"):
        check_chronology(*times, _START, _START + timedelta(hours=1))


def test_actual_late_source_snapshot_cannot_predict_0800_target():
    sources = json.loads((_ROOT / "data/live/sources.json").read_text(encoding="utf-8"))
    wind = json.loads((_ROOT / "data/live/wind.json").read_text(encoding="utf-8"))
    with pytest.raises(ValueError, match="FUTURE_SOURCE_OR_WIND"):
        parse_event({"sources": sources, "wind": wind, "forecast_start": "2026-10-07T07:59:00Z"})


def test_target_interval_cannot_overlap_prediction():
    earlier = _START - timedelta(minutes=1)
    with pytest.raises(ValueError, match="TARGET_PRECEDES_FORECAST"):
        check_chronology(earlier, earlier, earlier, _START, _START)


def test_mathematical_matching_uses_puff_geometry_without_target_values():
    events, obs = mathematical_match_inputs()
    matches, _ = match_observations(events, obs, EligibilityConfig())
    assert len(matches) == 6
    mutated = [replace(o, pm25_ugm3=o.pm25_ugm3 * 100) if "target" in o.id else o for o in obs]
    changed, _ = match_observations(events, mutated, EligibilityConfig())
    assert [(m.observation.id, m.source_ids, m.transport_hours) for m in matches] == [
        (m.observation.id, m.source_ids, m.transport_hours) for m in changed]
    assert all(m.background.value_ugm3 == 20 and m.observed_delta == 20 for m in matches)
    assert all(m.wind_at_station[0] == 1 and m.wind_at_station[2] == 500 for m in matches)


def test_upwind_and_zero_transport_are_not_radius_only_matches():
    events, obs = mathematical_match_inputs()
    event, target = events[0], obs[3]
    source = event.sources[0]
    projection, frames = simulate_source(source, WindField(event.wind), event.forecast_start, 2, PlumeParams())
    lat, lon = projection.latlon(-7200, 0)
    assert plausible_transport(source, projection, frames, replace(target, lat=lat, lon=lon), 2, 2, EligibilityConfig()) == ()
    still = mathematical_wind(hours=2)
    projection, frames = simulate_source(source, WindField(still), _START, 2, PlumeParams())
    assert plausible_transport(source, projection, frames, target, 2, 2, EligibilityConfig()) == ()


def test_chronological_event_split_keeps_repeated_captures_together():
    events, obs = mathematical_match_inputs()
    matches, _ = match_observations(events, obs, EligibilityConfig())
    repeated = replace(matches[0], event=replace(matches[0].event, capture_id="math_repeated_capture"))
    train, held = chronological_split(matches + [repeated], EligibilityConfig())
    assert {m.event.event_id for m in train} == {"math_event_0", "math_event_7"}
    assert {m.event.event_id for m in held} == {"math_event_14"}
    assert repeated in train
    assert max(m.observation.observed_at for m in train) < min(m.event.forecast_start for m in held)


def test_insufficient_events_do_not_create_holdout():
    events, obs = mathematical_match_inputs()
    matches, _ = match_observations(events[:1], obs[:8], EligibilityConfig())
    with pytest.raises(ValueError, match="INSUFFICIENT_EVENTS"):
        chronological_split(matches, EligibilityConfig())


def test_population_gate_rejects_one_reading_per_station_and_same_fire_group_leakage():
    events, obs = mathematical_match_inputs()
    one_each = [obs[3], obs[7]]
    with pytest.raises(ValueError, match="MISSING_BACKGROUND_HISTORY"):
        check_history_population(events, one_each, EligibilityConfig(), _START + timedelta(days=20))
    repeated_fire = [replace(e, fire_keys=frozenset({"mathematical-identity"})) for e in events]
    with pytest.raises(ValueError, match="SAME_FIRE_DIFFERENT_EVENTS"):
        check_history_population(repeated_fire, obs, EligibilityConfig(), _START + timedelta(days=20))


def test_population_gate_rejects_duplicate_and_overlapping_measurements():
    events, obs = mathematical_match_inputs()
    with pytest.raises(ValueError, match="DUPLICATE_OBSERVATION"):
        check_history_population(events, obs + [obs[0]], EligibilityConfig(), _START + timedelta(days=20))
    overlapping = obs.copy()
    overlapping[1] = replace(obs[1], period_start=obs[0].period_start - timedelta(minutes=1))
    with pytest.raises(ValueError, match="OVERLAPPING_MEASUREMENTS"):
        check_history_population(events, overlapping, EligibilityConfig(), _START + timedelta(days=20))


def test_split_rejects_shared_background_and_targets():
    events, obs = mathematical_match_inputs()
    matches, _ = match_observations(events, obs, EligibilityConfig())
    shared = replace(matches[-1], background=matches[0].background)
    with pytest.raises(ValueError, match="SPLIT_OBSERVATION_OVERLAP"):
        chronological_split(matches[:-1] + [shared], EligibilityConfig())


@pytest.mark.parametrize("name,value", [("sigma0_m", -1), ("k_m_sqrt_hour", -1),
                                        ("tau_hours", 0), ("concentration_scale_ug", 0),
                                        ("sigma0_m", float("nan")), ("tau_hours", float("inf"))])
def test_optimizer_rejects_invalid_parameter_bounds(name, value):
    axes = engine.default_axes()
    with pytest.raises(ValueError):
        axes[name] = engine.Axis(value, max(value, getattr(PlumeParams(), name)), (value,))
        engine.CalibrationConfig(axes=axes)


def test_grid_rejects_values_outside_bounds_and_excess_budget():
    with pytest.raises(ValueError, match="outside"):
        engine.Axis(1, 2, (3,))
    with pytest.raises(ValueError, match="budget"):
        engine.CalibrationConfig(max_candidates=10)


def test_metrics_bias_sign_and_rmse_mae():
    assert engine.error_metrics([2, 4], [1, 6]) == {"rmse": pytest.approx(math.sqrt(2.5)),
                                                  "mae": 1.5, "bias": -0.5, "observations": 2}


@pytest.mark.parametrize("predicted,observed", [([], []), ([1], [1, 2]),
                                               ([float("nan")], [1]), ([1], [float("inf")])])
def test_metrics_reject_unavailable_or_nonfinite_vectors(predicted, observed):
    with pytest.raises(ValueError):
        engine.error_metrics(predicted, observed)


def test_bounded_optimizer_determinism_and_baseline_comparison():
    result, _ = mathematical_search()
    other, _ = mathematical_search()
    assert result == other and result.candidates == 625
    assert result.selected_metrics["rmse"] == 0 < result.baseline_metrics["rmse"]
    for name, axis in engine.default_axes().items():
        assert axis.lower <= getattr(result.selected, name) <= axis.upper
    assert set(result.parameter_status.values()) == {"CALIBRATED"}


def test_flat_objective_retains_weak_parameters_as_baseline():
    result = engine.grid_search(lambda p: [1], [1])
    assert result.selected == PlumeParams()
    assert set(result.parameter_status.values()) == {"ASSUMED"}
    assert all(d["weakly_identified"] for d in result.identifiability.values())


def test_boundary_optimum_is_not_accepted_as_identified():
    result = engine.grid_search(lambda p: [p.sigma0_m / 1000], [4])
    assert result.parameter_status["sigma0_m"] == "ASSUMED"
    assert result.selected.sigma0_m == PlumeParams().sigma0_m


def test_partial_identifiability_only_changes_supported_parameter():
    search = engine.grid_search(lambda p: [p.concentration_scale_ug / 1e12], [1.5])
    assert search.parameter_status["concentration_scale_ug"] == "CALIBRATED"
    assert search.selected.concentration_scale_ug == 1.5e12
    for name in ("sigma0_m", "k_m_sqrt_hour", "tau_hours"):
        assert search.parameter_status[name] == "ASSUMED"
        assert getattr(search.selected, name) == getattr(PlumeParams(), name)


def test_optimizer_rejects_nonfinite_evaluator_output():
    with pytest.raises(ValueError):
        engine.grid_search(lambda p: [float("nan")], [1])


def test_receptor_sampler_matches_grid_and_predictor_matches_direct_physics():
    events, obs = mathematical_match_inputs()
    matches, _ = match_observations(events, obs, EligibilityConfig())
    match = matches[0]
    source = match.event.sources[0]
    params = PlumeParams()
    projection, frames = simulate_source(source, WindField(match.event.wind), match.event.forecast_start, 2, params)
    lat, lon = projection.latlon(1000, 1000)
    grid = Grid(0, 0, 2000, 1, 1)
    assert concentration_at(frames[2], projection, lat, lon, params) == pytest.approx(concentration_grid(frames[2], grid, params)[0, 0])
    candidate = replace(params, sigma0_m=3000, k_m_sqrt_hour=750, tau_hours=36, concentration_scale_ug=1.5e12)
    projection, direct = simulate_source(source, WindField(match.event.wind, candidate), match.event.forecast_start, 2, candidate)
    expected = concentration_at(direct[2], projection, match.observation.lat, match.observation.lon, candidate)
    assert engine.make_predictor([match])(candidate) == pytest.approx([expected])


def test_recorded_averaging_interval_uses_hourly_trapezoidal_mean():
    events, obs = mathematical_match_inputs()
    matches, _ = match_observations(events, obs, EligibilityConfig())
    match = replace(matches[0], hour_from=1)
    predictor = engine.make_predictor([match])
    source = match.event.sources[0]
    projection, frames = simulate_source(source, WindField(match.event.wind), match.event.forecast_start, 2, PlumeParams())
    expected = sum(concentration_at(frames[h], projection, match.observation.lat, match.observation.lon, PlumeParams()) for h in (1, 2)) / 2
    assert predictor(PlumeParams()) == pytest.approx([expected])


def test_mathematical_params_serialization_succeeds_but_is_not_deployable(tmp_path):
    result = mathematical_artifact_result()
    path = tmp_path / "mathematical-parameters.json"
    engine.write_parameters(result, path, mathematical_test=True)
    before = path.read_bytes()
    engine.write_parameters(result, path, mathematical_test=True)
    assert path.read_bytes() == before
    document = json.loads(before)
    assert document["evidence_kind"] == "MATHEMATICAL_TEST"
    assert parameters.validate_document(document, allow_mathematical_test=True) == PlumeParams(**result.report["fitted_parameters"])
    with pytest.raises(ValueError, match="not deployable"):
        parameters.load_parameters(path=path)
    with pytest.raises(ValueError, match="deployable"):
        engine.write_parameters(result, tmp_path / "params.json", mathematical_test=True)
    assert not (tmp_path / "params.json").exists()


def test_blocked_or_worse_holdout_never_overwrites_parameters(tmp_path):
    path = tmp_path / "mathematical-parameters.json"
    path.write_text("previous artifact", encoding="utf-8")
    with pytest.raises(ValueError, match="Blocked"):
        engine.write_parameters(engine.calibrate(None), path)
    result = mathematical_artifact_result()
    result.report["metrics"]["calibrated_holdout"] = {"rmse": 100, "mae": 100, "bias": 100}
    with pytest.raises(ValueError, match="holdout"):
        engine.write_parameters(result, path, mathematical_test=True)
    assert path.read_text(encoding="utf-8") == "previous artifact"


@pytest.mark.parametrize("mutation", ["units", "split", "status", "nonfinite", "counts", "sensitivity"])
def test_parameter_schema_rejects_tampering_even_for_mathematical_mechanics(mutation):
    document = engine.parameter_document(mathematical_artifact_result(), mathematical_test=True)
    if mutation == "units":
        document["units"] = {**document["units"], "tau_hours": "seconds"}
    elif mutation == "split":
        document["split"]["holdout_events"] = document["split"]["training_events"]
    elif mutation == "status":
        document["status"] = "PARTIALLY_CALIBRATED"
    elif mutation == "nonfinite":
        document["parameters"]["tau_hours"] = float("nan")
    elif mutation == "counts":
        document["dataset"]["observations"] = 100
    else:
        document["identifiability"]["tau_hours"]["weakly_identified"] = True
    with pytest.raises(ValueError):
        parameters.validate_document(document, allow_mathematical_test=True)


def test_loading_precedence_and_provenance_with_isolated_validator_stub(tmp_path, monkeypatch):
    path = tmp_path / "unit-loader-stub.json"
    baseline = parameters.load_parameters(path=path)
    assert baseline.provenance == "BASELINE" and baseline.params == PlumeParams()
    path.write_text('{"test_kind":"MATHEMATICAL_LOADER_STUB"}', encoding="utf-8")
    selected = replace(PlumeParams(), tau_hours=36)
    monkeypatch.setattr(parameters, "validate_document", lambda document: selected)
    loaded = parameters.load_parameters(path=path)
    assert loaded.provenance == "CALIBRATED" and loaded.params == selected
    explicit = parameters.load_parameters({"tau_hours": 18}, path=path)
    assert explicit.provenance == "EXPLICIT" and explicit.params.tau_hours == 18
    assert explicit.params.sigma0_m == PlumeParams().sigma0_m


def test_corrupt_default_file_fails_closed_but_explicit_override_is_allowed(tmp_path, monkeypatch):
    path = tmp_path / "params.json"
    path.write_text("invalid json", encoding="utf-8")
    monkeypatch.setattr(parameters, "PARAMETER_FILE", path)
    with pytest.raises(ValueError):
        predict_corridor(mathematical_sources(), mathematical_wind(), hours=2)
    assert predict_corridor(mathematical_sources(), mathematical_wind(), hours=2, params={})["features"]


def test_actual_calibration_cli_blocked_deterministic_no_params_or_snapshot_changes(tmp_path):
    files = list((_ROOT / "data/live").glob("*"))
    before = {p: p.read_bytes() for p in files if p.is_file()}
    parameter_before = parameters.PARAMETER_FILE.read_bytes() if parameters.PARAMETER_FILE.exists() else None
    command = [sys.executable, "-X", "utf8", "-m", "models.plume.calibrate", "--report", str(tmp_path / "audit.json"),
               "--params-output", str(tmp_path / "params.json")]
    runs = [subprocess.run(command, cwd=_ROOT, capture_output=True, text=True, check=False) for _ in range(2)]
    assert all(r.returncode == 1 for r in runs)
    assert runs[0].stdout == runs[1].stdout
    result = json.loads(runs[0].stdout)
    assert result["status"] == engine.BLOCKED and not result["optimizer_executed"]
    assert result["fitted_parameters"] is None and result["dataset"]["accepted"] == []
    assert not (tmp_path / "params.json").exists()
    assert (parameters.PARAMETER_FILE.read_bytes() if parameters.PARAMETER_FILE.exists() else None) == parameter_before
    assert before == {p: p.read_bytes() for p in before}


def test_missing_history_cli_and_output_input_collision(tmp_path, capsys):
    with pytest.raises(SystemExit) as exc:
        engine.main(["--history", str(tmp_path / "absent.json"), "--params-output", str(tmp_path / "params.json")])
    assert exc.value.code == 1 and not (tmp_path / "params.json").exists()
    assert json.loads(capsys.readouterr().out)["status"] == engine.BLOCKED
    source = _ROOT / "data/live/aqi.json"
    before = source.read_bytes()
    with pytest.raises(SystemExit):
        engine.main(["--report", str(source)])
    assert source.read_bytes() == before
