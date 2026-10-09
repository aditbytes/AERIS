"""Deterministic calibration engine; optimization requires eligible real history."""

from __future__ import annotations

import argparse
import itertools
import json
import math
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from models.plume.advect import PlumeParams, WindField, decay_factor, dispersion_sigma, number, parse_time, simulate_source, utc_string
from models.plume.corridor import concentration_at
from models.plume.history import (
    BackgroundEstimator, EligibilityConfig, Match, check_history_population, chronological_split, content_hash,
    match_observations, parse_event, parse_observation, pre_event_median, provenance,
)
from models.plume.parameters import (
    MODEL_VERSION, PARAMETER_FILE, REAL_EVIDENCE, UNITS, atomic_json,
    deterministic_json, validate_document,
)

BLOCKED = "BLOCKED_NO_VALID_HISTORICAL_DATA"
_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Axis:
    lower: float
    upper: float
    values: tuple[float, ...]

    def __post_init__(self) -> None:
        lo, hi = number(self.lower, "lower bound"), number(self.upper, "upper bound")
        if lo > hi or not self.values or len(set(self.values)) != len(self.values):
            raise ValueError("Invalid/duplicate parameter grid bounds or values")
        for v in self.values:
            if not lo <= number(v, "grid value") <= hi:
                raise ValueError("Grid value lies outside declared bounds")


def default_axes() -> dict[str, Axis]:
    # Factor-of-two engineering priors around the existing baseline, not validated physics.
    return {"sigma0_m": Axis(1000, 4000, (1000, 1500, 2000, 3000, 4000)),
            "k_m_sqrt_hour": Axis(500, 2000, (500, 750, 1000, 1500, 2000)),
            "tau_hours": Axis(12, 48, (12, 18, 24, 36, 48)),
            "concentration_scale_ug": Axis(5e11, 2e12, (5e11, 7.5e11, 1e12, 1.5e12, 2e12))}


@dataclass(frozen=True)
class CalibrationConfig:
    eligibility: EligibilityConfig = field(default_factory=EligibilityConfig)
    axes: dict[str, Axis] = field(default_factory=default_axes)
    max_candidates: int = 625
    sensitivity_relative_tolerance: float = 0.01
    sensitivity_absolute_ugm3: float = 0.1

    def __post_init__(self) -> None:
        if set(self.axes) != set(UNITS) or any(not isinstance(a, Axis) for a in self.axes.values()):
            raise ValueError("Exactly the four physical parameter axes are required")
        if not isinstance(self.max_candidates, int) or isinstance(self.max_candidates, bool) or self.max_candidates < 1:
            raise ValueError("max_candidates must be a positive integer")
        if math.prod(len(a.values) for a in self.axes.values()) > self.max_candidates:
            raise ValueError("Parameter grid exceeds candidate budget")
        for name, axis in self.axes.items():
            for v in (axis.lower, axis.upper, *axis.values):
                PlumeParams(**{name: v})
            if getattr(PlumeParams(), name) not in axis.values:
                raise ValueError(f"Grid must include documented baseline {name}")
        for name in ("sensitivity_relative_tolerance", "sensitivity_absolute_ugm3"):
            if number(getattr(self, name), name) < 0:
                raise ValueError("Sensitivity tolerances must be nonnegative")


def error_metrics(predicted: list[float], observed: list[float]) -> dict[str, Any]:
    if not predicted or len(predicted) != len(observed):
        raise ValueError("Metrics require equal nonempty vectors")
    errors = [number(p, "prediction") - number(o, "target") for p, o in zip(predicted, observed)]
    for e in errors:
        number(e, "residual")
    n = len(errors)
    result = {"rmse": math.hypot(*errors) / math.sqrt(n),
              "mae": math.fsum(abs(e) / n for e in errors),
              "bias": math.fsum(e / n for e in errors), "observations": n}
    for key in ("rmse", "mae", "bias"):
        number(result[key], key)
    return result


@dataclass(frozen=True)
class GridSearchResult:
    selected: PlumeParams
    baseline_metrics: dict[str, Any]
    selected_metrics: dict[str, Any]
    identifiability: dict[str, Any]
    parameter_status: dict[str, str]
    candidates: int


def grid_search(evaluator: Callable[[PlumeParams], list[float]], observed: list[float],
                config: CalibrationConfig | None = None) -> GridSearchResult:
    """Generic numerical mechanics; no claim that vectors are historical evidence."""
    config = config or CalibrationConfig()
    baseline = PlumeParams()
    names = tuple(UNITS)
    results = []
    baseline_metrics = error_metrics(evaluator(baseline), observed)
    for values in itertools.product(*(sorted(config.axes[n].values) for n in names)):
        params = replace(baseline, **dict(zip(names, values)))
        metrics = error_metrics(evaluator(params), observed)
        distance = math.fsum(abs(getattr(params, n) - getattr(baseline, n))
                             / max(1.0, getattr(baseline, n)) for n in names)
        results.append((metrics["rmse"], distance, values, params, metrics))
    results.sort(key=lambda r: r[:3])
    best = results[0]
    tolerance = max(config.sensitivity_absolute_ugm3, best[0] * config.sensitivity_relative_tolerance)
    equivalent = [r for r in results if r[0] <= best[0] + tolerance]
    diagnostics, statuses = {}, {}
    for i, name in enumerate(names):
        varied = sorted({r[2][i] for r in equivalent})
        neighbors = [{"value": r[2][i], "rmse": r[0]}
                     for r in results if all(r[2][j] == best[2][j] for j in range(4) if i != j)]
        neighbors.sort(key=lambda d: d["value"])
        weak = len(varied) > 1
        at_boundary = best[2][i] in (config.axes[name].lower, config.axes[name].upper)
        # A boundary optimum also cannot justify an independently fitted estimate.
        statuses[name] = "ASSUMED" if weak or at_boundary else "CALIBRATED"
        diagnostics[name] = {"weakly_identified": weak, "at_boundary": at_boundary,
                             "equivalent_grid_values": varied, "fixed_other_parameter_sensitivity": neighbors,
                             "rmse_tolerance_ugm3": tolerance}
    # Retain baseline for every unsupported parameter, then reselect using TRAINING only.
    for _ in range(5):
        supported = [r for r in results if all(statuses[n] == "CALIBRATED" or r[2][i] == getattr(baseline, n)
                                             for i, n in enumerate(names))]
        selected = supported[0]
        retained_tolerance = max(config.sensitivity_absolute_ugm3,
                                 selected[0] * config.sensitivity_relative_tolerance)
        near = [r for r in supported if r[0] <= selected[0] + retained_tolerance]
        changed = False
        for i, name in enumerate(names):
            if statuses[name] == "ASSUMED":
                continue
            varied = sorted({r[2][i] for r in near})
            boundary = selected[2][i] in (config.axes[name].lower, config.axes[name].upper)
            if len(varied) > 1 or boundary:
                statuses[name] = "ASSUMED"
                diagnostics[name].update(weakly_identified=len(varied) > 1, at_boundary=boundary,
                                          equivalent_grid_values=varied, rmse_tolerance_ugm3=retained_tolerance)
                changed = True
        if not changed:
            break
    # Sensitivity must describe the actual retained optimum, not only the unconstrained winner.
    for i, name in enumerate(names):
        diagnostics[name]["selected_value"] = selected[2][i]
        diagnostics[name]["search_optimum_value"] = best[2][i]
        diagnostics[name]["fixed_other_parameter_sensitivity"] = sorted(
            [{"value": r[2][i], "rmse": r[0]} for r in results
             if all(r[2][j] == selected[2][j] for j in range(4) if i != j)], key=lambda d: d["value"])
    return GridSearchResult(selected[3], baseline_metrics, selected[4], diagnostics, statuses, len(results))


def make_predictor(matches: list[Match]) -> Callable[[PlumeParams], list[float]]:
    """Cache transport, which is independent of the four fitted physical scalars."""
    cached = {}
    for m in matches:
        for source in m.event.sources:
            if source.id not in m.source_ids:
                continue
            key = (m.event.capture_id, source.id, m.hour_to)
            if key not in cached:
                projection, frames = simulate_source(source, WindField(m.event.wind, PlumeParams()),
                                                     m.event.forecast_start, m.hour_to, PlumeParams())
                cached[key] = (source, projection, frames)

    def predict(params: PlumeParams) -> list[float]:
        predictions = []
        for m in matches:
            values = []
            for h in range(m.hour_from, m.hour_to + 1):
                contributions = []
                for source_id in m.source_ids:
                    source, projection, frames = cached[(m.event.capture_id, source_id, m.hour_to)]
                    initial = max(params.sigma0_m, source.radius_km * 1000 / math.sqrt(2 * math.log(10)))
                    puffs = tuple(replace(p, sigma_m=dispersion_sigma(p.age_hours, initial, params),
                                          decay=decay_factor(p.age_hours, params.tau_hours))
                                  for p in frames[h].puffs)
                    contributions.append(concentration_at(replace(frames[h], puffs=puffs), projection,
                                                          m.observation.lat, m.observation.lon, params))
                values.append(math.fsum(contributions))
            # Instantaneous frame or trapezoidal hourly mean across recorded averaging interval.
            predictions.append(values[0] if len(values) == 1 else
                               math.fsum((a + b) / 2 for a, b in zip(values, values[1:])) / (len(values) - 1))
        return predictions
    return predict


def grouped_metrics(matches: list[Match], predictions: list[float], field_name: str) -> dict[str, Any]:
    groups = {}
    for m, p in zip(matches, predictions):
        key = m.event.event_id if field_name == "event" else m.observation.station_id
        groups.setdefault(key, []).append((p, m.observed_delta))
    return {key: error_metrics([p for p, o in rows], [o for p, o in rows]) for key, rows in sorted(groups.items())}


@dataclass(frozen=True)
class CalibrationResult:
    report: dict[str, Any]

    @property
    def status(self) -> str:
        return self.report["status"]

    def to_dict(self) -> dict[str, Any]:
        return json.loads(deterministic_json(self.report))


def empty_report(metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"schema_version": 1, "model_version": MODEL_VERSION, "status": BLOCKED,
            "reason": "No eligible real historical targets", "dataset": metadata or {},
            "matched_events": 0, "matched_stations": 0, "matched_observations": 0,
            "matches": [], "rejected": [], "optimizer_executed": False, "fitted_parameters": None,
            "parameter_status": {name: "ASSUMED" for name in UNITS},
            "parameter_source": "BASELINE", "baseline_parameters": asdict(PlumeParams()),
            "metrics": {name: None for name in ("baseline", "calibrated", "baseline_holdout", "calibrated_holdout")},
            "holdout_status": "NOT_AVAILABLE", "identifiability": None,
            "leakage_checks": {"source_availability": "NOT_AVAILABLE", "background_independence": "NOT_AVAILABLE",
                               "event_split_disjoint": "NOT_AVAILABLE", "holdout_used_for_selection": False},
            "warnings": []}


def calibrate(history: dict[str, Any] | None, *, config: CalibrationConfig | None = None,
              background_estimator: BackgroundEstimator = pre_event_median) -> CalibrationResult:
    config = config or CalibrationConfig()
    report = empty_report()
    if not isinstance(history, dict):
        report["reason"] = "MISSING_HISTORY: a provenance-bearing historical manifest is required"
        return CalibrationResult(report)
    try:
        if history.get("schema_version") != 1 or history.get("evidence_kind") != REAL_EVIDENCE:
            raise ValueError("REAL_HISTORY_REQUIRED: mathematical fixtures/model outputs cannot be calibration evidence")
        metadata = provenance(history.get("provenance"), "dataset.provenance")
        report["dataset"] = {"evidence_kind": REAL_EVIDENCE, "provenance": metadata,
                             "content_sha256": content_hash(history), "accepted": []}
        stamp = parse_time(history.get("calibration_timestamp"), "calibration_timestamp")
        raw_events, raw_obs = history.get("events"), history.get("observations")
        if not isinstance(raw_events, list) or not isinstance(raw_obs, list):
            raise ValueError("events and observations must be lists")
        if len(raw_events) > config.eligibility.max_events or len(raw_obs) > config.eligibility.max_observations:
            raise ValueError("History exceeds configured resource budget")
        events, observations = [], []
        for kind, rows, parser, parsed in (("event", raw_events, parse_event, events),
                                           ("observation", raw_obs, parse_observation, observations)):
            for i, row in enumerate(rows):
                try:
                    parsed.append(parser(row))
                except (ValueError, TypeError, KeyError, AttributeError, OverflowError) as exc:
                    report["rejected"].append({"kind": kind, "index": i, "reason": str(exc)})
        if report["rejected"]:
            raise ValueError("INVALID_HISTORY: invalid provenance/timing/schema records; fix rather than silently drop them")
        check_history_population(events, observations, config.eligibility, stamp)
        matches, rejected = match_observations(events, observations, config.eligibility, background_estimator)
        report["rejected"].extend(rejected)
        report.update(matched_events=len({m.event.event_id for m in matches}),
                      matched_stations=len({m.observation.station_id for m in matches}),
                      matched_observations=len(matches), matches=[m.to_dict() for m in matches])
        train, holdout = chronological_split(matches, config.eligibility)
        report["dataset"]["accepted"] = [{"kind": "historical_manifest", "event_captures": len(events),
                                           "observation_records": len(observations), "matched_targets": len(matches)}]
        report["leakage_checks"].update(source_availability="PASS", background_independence="PASS", event_split_disjoint="PASS")
        report["holdout_status"] = "PROTECTED_CHRONOLOGICAL"
        report["warnings"].append("Eligibility minimums are engineering policies, not evidence of statistical generalization")
        report["split"] = {"training_events": sorted({m.event.event_id for m in train}),
                           "holdout_events": sorted({m.event.event_id for m in holdout})}
        predictor = make_predictor(train)
        targets = [m.observed_delta for m in train]
        report["optimizer_executed"] = True
        search = grid_search(predictor, targets, config)
        report["metrics"].update(baseline=search.baseline_metrics, calibrated=search.selected_metrics)
        report["parameter_status"] = search.parameter_status
        report["identifiability"] = search.identifiability
        report["search"] = {"candidates": search.candidates, "axes": {k: asdict(v) for k, v in config.axes.items()}}
        held_predictor = make_predictor(holdout)
        held_targets = [m.observed_delta for m in holdout]
        baseline_held = held_predictor(PlumeParams())
        calibrated_held = held_predictor(search.selected)
        report["metrics"].update(baseline_holdout=error_metrics(baseline_held, held_targets),
                                  calibrated_holdout=error_metrics(calibrated_held, held_targets))
        report["group_metrics"] = {}
        for label, rows, predicted in (("baseline", train, predictor(PlumeParams())),
                                       ("calibrated", train, predictor(search.selected)),
                                       ("baseline_holdout", holdout, baseline_held),
                                       ("calibrated_holdout", holdout, calibrated_held)):
            report["group_metrics"][label] = {"events": grouped_metrics(rows, predicted, "event"),
                                               "stations": grouped_metrics(rows, predicted, "station")}
        fractions = {key: value["observations"] / len(train)
                     for key, value in report["group_metrics"]["baseline"]["events"].items()}
        report["training_event_observation_fractions"] = fractions
        if max(fractions.values()) > 0.5:
            report["warnings"].append("One event supplies more than half of training targets")
        if not any(v == "CALIBRATED" for v in search.parameter_status.values()):
            raise ValueError("UNIDENTIFIABLE: no independently supported physical parameter")
        if search.selected_metrics["rmse"] >= search.baseline_metrics["rmse"]:
            raise ValueError("NO_TRAINING_IMPROVEMENT: baseline retained")
        if report["metrics"]["calibrated_holdout"]["rmse"] >= report["metrics"]["baseline_holdout"]["rmse"]:
            raise ValueError("NO_HOLDOUT_IMPROVEMENT: baseline retained; holdout was not used to retune")
        report["status"] = "CALIBRATED" if all(v == "CALIBRATED" for v in search.parameter_status.values()) else "PARTIALLY_CALIBRATED"
        report["reason"] = "Identified parameters improve training and protected holdout RMSE"
        report["fitted_parameters"] = asdict(search.selected)
        report["parameter_source"] = "CALIBRATED"
        report["calibration_timestamp"] = utc_string(stamp)
        report["dataset"].update(events=len({m.event.event_id for m in matches}),
                                 stations=len({m.observation.station_id for m in matches}), observations=len(matches),
                                 time_from=utc_string(min(m.observation.period_start for m in matches)),
                                 time_to=utc_string(max(m.observation.observed_at for m in matches)))
        if report["status"] == "PARTIALLY_CALIBRATED":
            report["warnings"].append("Weak/boundary parameters retain documented baseline; no independent precision claim")
    except (ValueError, TypeError, KeyError, AttributeError, ArithmeticError, RuntimeError) as exc:
        report["status"] = "FAILED" if report["optimizer_executed"] else BLOCKED
        report["reason"] = str(exc)
        report["fitted_parameters"] = None
        report["parameter_status"] = {name: "ASSUMED" for name in UNITS}
    return CalibrationResult(json.loads(deterministic_json(report)))


def parameter_document(result: CalibrationResult, *, mathematical_test: bool = False) -> dict[str, Any]:
    r = result.to_dict()
    if r["status"] not in ("CALIBRATED", "PARTIALLY_CALIBRATED") or not r["fitted_parameters"]:
        raise ValueError("Blocked/failed calibration cannot produce parameters")
    if not r["optimizer_executed"]:
        raise ValueError("Unexecuted optimization cannot produce parameters")
    document = {"schema_version": 1, "model_version": MODEL_VERSION, "status": r["status"],
                "evidence_kind": r["dataset"].get("evidence_kind"), "parameters": r["fitted_parameters"],
                "units": dict(UNITS), "dataset": r["dataset"], "objective": "training_rmse_ugm3",
                "calibration_timestamp": r["calibration_timestamp"], "parameter_status": r["parameter_status"],
                "metrics": r["metrics"], "identifiability": r["identifiability"],
                "leakage_checks": r["leakage_checks"], "split": r["split"]}
    validate_document(document, allow_mathematical_test=mathematical_test)
    return document


def write_parameters(result: CalibrationResult, path: Path = PARAMETER_FILE,
                     *, mathematical_test: bool = False) -> None:
    document = parameter_document(result, mathematical_test=mathematical_test)
    if mathematical_test and Path(path).name == "params.json":
        raise ValueError("Mathematical mechanics artifacts cannot use the deployable params.json filename")
    atomic_json(Path(path), document)


def audit_repository(root: Path) -> dict[str, Any]:
    report = empty_report({"discovered": [], "accepted": [], "rejected": []})
    reasons = ["MISSING_HISTORY: no normalized historical calibration manifest",
               "MISSING_BACKGROUND_HISTORY: no independently observed pre-event station series",
               "INSUFFICIENT_EVENTS: protected chronological holdout NOT_AVAILABLE"]
    for name, key in (("aqi.json", "stations"), ("fires.json", "fires"),
                      ("wind.json", "points"), ("sources.json", "sources")):
        path = root / "data/live" / name
        if not path.exists():
            report["dataset"]["rejected"].append({"path": path.relative_to(root).as_posix(), "reason": "MISSING_INPUT"})
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        rows = data.get(key, [])
        item = {"path": path.relative_to(root).as_posix(), "generated_at": data.get("generated_at"),
                "records": len(rows), "content_sha256": content_hash(data), "source": data.get("source")}
        if name == "aqi.json":
            item.update(stations=len({s["id"] for s in rows}),
                        pm25_observations=sum(s.get("pm25") is not None and s.get("observed_at") is not None for s in rows))
            item["reason"] = "Bare latest readings lack independent background, averaging interval, availability and provenance metadata"
        elif name == "wind.json":
            item["hourly_records"] = sum(len(p.get("hours", [])) for p in rows)
            item["reason"] = "Stored wind timestamp provenance is unverified; no historical input-availability manifest"
        else:
            item["reason"] = "Single fire window/derived source capture; no independent matched historical events"
        report["dataset"]["discovered"].append(item)
        report["dataset"]["rejected"].append(item)
    report["reason"] = "; ".join(reasons)
    return report


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Audit local real history and calibrate only after strict eligibility")
    parser.add_argument("--history", type=Path, help="Normalized captured-history manifest (schema documented in README)")
    parser.add_argument("--report", type=Path, help="Optional deterministic audit/result JSON; stdout is always emitted")
    parser.add_argument("--params-output", type=Path, default=PARAMETER_FILE)
    args = parser.parse_args(argv)
    inputs = {p.resolve() for p in (_ROOT / "data/live").glob("*") if p.is_file()}
    try:
        candidates = [p for p in (_ROOT / "data/history/calibration.json", _ROOT / "data/historical/calibration.json") if p.exists()]
        if args.history is None and len(candidates) > 1:
            raise ValueError("Multiple historical manifests found; select one explicitly with --history")
        path = args.history or (candidates[0] if candidates else None)
        if path is not None:
            inputs.add(path.resolve())
        outputs = [args.params_output] + ([args.report] if args.report else [])
        if any(p.resolve() in inputs for p in outputs) or (args.report and args.report.resolve() == args.params_output.resolve()):
            raise ValueError("Calibration outputs must not overwrite inputs or each other")
        if args.report and args.report.resolve() == PARAMETER_FILE.resolve():
            raise ValueError("An audit report cannot overwrite deployable parameters")
        if path is None:
            result = CalibrationResult(audit_repository(_ROOT))
        elif not path.is_file():
            result = calibrate(None)
            result.report["reason"] = f"MISSING_HISTORY: {path}"
        else:
            result = calibrate(json.loads(path.read_text(encoding="utf-8")))
            result.report["dataset"]["path"] = path.as_posix()
        if result.status in ("CALIBRATED", "PARTIALLY_CALIBRATED"):
            write_parameters(result, args.params_output)
        if args.report:
            atomic_json(args.report, result.to_dict())
        print(deterministic_json(result.to_dict()), end="")
    except (OSError, ValueError, TypeError) as exc:
        report = empty_report()
        report.update(status="FAILED", reason=str(exc))
        print(deterministic_json(report), end="")
        raise SystemExit(1) from exc
    if result.status not in ("CALIBRATED", "PARTIALLY_CALIBRATED"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
