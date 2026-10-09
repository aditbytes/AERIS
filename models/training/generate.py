"""Deterministic simulated scenarios labelled only by the existing plume engine."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from models.plume.advect import LocalProjection, PlumeParams, Source, WindField, simulate_source, utc_string
from models.plume.corridor import concentration_at
from models.plume.parameters import MODEL_VERSION, atomic_json, deterministic_json
from models.training.features import DATA_TYPE, FEATURE_NAMES, SCOPE, construct_features

ORIGIN = {"lat": 30.0, "lon": 75.0}
START = datetime(2020, 1, 1, tzinfo=timezone.utc)  # Numerical reference, not an observation.
TEACHER_PARAMS = PlumeParams()  # Explicit uncalibrated defaults; never load params.json.
PROTOCOL = "steady-weather-mixture-v1"
SPLITS = ("train", "validation", "test")


def digest(value) -> str:
    return hashlib.sha256(deterministic_json(value).encode("utf-8")).hexdigest()


def physics_signature() -> dict:
    root = Path(__file__).parents[1] / "plume"
    return {"physics_version": MODEL_VERSION, "parameters": asdict(TEACHER_PARAMS),
            "source_sha256": {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                              for name in ("advect.py", "corridor.py", "parameters.py")}}


def simulate_case(case: dict):
    construct_features(case, 0, 0)  # Validate before creating any weather/source inputs.
    hours = int(case["forecast_hours"])
    projection = LocalProjection(ORIGIN["lat"], ORIGIN["lon"], TEACHER_PARAMS.max_projection_radius_km)
    times = [utc_string(START + timedelta(hours=h)) for h in range(hours + 1)]
    points = []
    node_count = hours + 1 if case["u_ms"] != 0 or case["v_ms"] != 0 else 1
    for h in range(node_count):
        lat, lon = projection.latlon(case["u_ms"] * 3600 * h, case["v_ms"] * 3600 * h)
        points.append({"lat": lat, "lon": lon, "hours": [
            {"t": t, "u_ms": case["u_ms"], "v_ms": case["v_ms"], "pblh_m": case["pblh_m"]}
            for t in times]})
    source = Source("simulated-reference", ORIGIN["lat"], ORIGIN["lon"],
                    case["source_emission_strength"], case["source_radius_m"] / 1000, START)
    wind = WindField({"generated_at": utc_string(START), "source": DATA_TYPE, "points": points})
    projection, frames = simulate_source(source, wind, START, hours, TEACHER_PARAMS)
    return projection, frames[-1]


def point_label(projection, frame, east_m: float, north_m: float) -> float:
    lat, lon = projection.latlon(east_m, north_m)
    return concentration_at(frame, projection, lat, lon, TEACHER_PARAMS)


def scenario_identity(scenario: dict) -> str:
    # Weather/source/forecast defines the group, even if its receptor points differ.
    return digest(scenario["inputs"])


def generate_dataset(*, seed: int = 42, train: int = 1000, validation: int = 200,
                     test: int = 200, points_per_scenario: int = 8) -> dict:
    for name, value in (("seed", seed), ("train", train), ("validation", validation),
                        ("test", test), ("points_per_scenario", points_per_scenario)):
        if isinstance(value, bool) or not isinstance(value, int) or value < (0 if name == "seed" else 1):
            raise ValueError(f"{name} must be a {'nonnegative' if name == 'seed' else 'positive'} integer")
    document = {"schema_version": 1, "training_data_type": DATA_TYPE, "scope": SCOPE,
                "generation_protocol": PROTOCOL, "seed": seed, "origin": ORIGIN,
                "reference_time": utc_string(START), "physics": physics_signature(),
                "feature_names": FEATURE_NAMES, "splits": {}}
    for split_index, (split, count) in enumerate(zip(SPLITS, (train, validation, test))):
        scenarios = []
        for index in range(count):
            scenario_seed = [seed, split_index, index]
            rng = np.random.default_rng(np.random.SeedSequence(scenario_seed))
            # Includes occasional calm wind and samples every whole forecast hour.
            speed = 0.0 if index % 20 == 0 else float(rng.uniform(0.1, 6))
            angle = float(rng.uniform(0, 2 * math.pi))
            case = {"u_ms": speed * math.sin(angle), "v_ms": speed * math.cos(angle),
                    "forecast_hours": int(rng.integers(1, 13)),
                    "pblh_m": float(np.exp(rng.uniform(math.log(50), math.log(3000)))),
                    "source_emission_strength": float(rng.uniform(0.05, 1)),
                    "source_radius_m": float(rng.uniform(0, 15000))}
            projection, frame = simulate_case(case)
            sx, sy = (case["u_ms"] / speed, case["v_ms"] / speed) if speed else (0.0, 1.0)
            samples = []
            for point in range(points_per_scenario):
                if point % 2 == 0:
                    down = float(rng.uniform(-25000, speed * 3600 * case["forecast_hours"] + 25000))
                    cross = float(rng.uniform(-50000, 50000))
                    east, north = down * sx + cross * sy, down * sy - cross * sx
                else:
                    puff = frame.puffs[int(rng.integers(len(frame.puffs)))]
                    east, north = rng.normal([puff.x_m, puff.y_m], puff.sigma_m)
                    east, north = float(east), float(north)
                samples.append({"point_id": point, "east_m": east, "north_m": north,
                                "features": construct_features(case, east, north),
                                "pm25_delta_ugm3": point_label(projection, frame, east, north)})
            scenario = {"seed": scenario_seed, "inputs": case, "samples": samples}
            scenario["scenario_id"] = scenario_identity(scenario)
            scenarios.append(scenario)
        document["splits"][split] = scenarios
    validate_dataset(document)
    return document


def validate_dataset(document: dict) -> None:
    if not isinstance(document, dict) or document.get("schema_version") != 1:
        raise ValueError("Unsupported dataset schema")
    if (document.get("training_data_type") != DATA_TYPE or document.get("scope") != SCOPE
            or document.get("generation_protocol") != PROTOCOL
            or document.get("physics") != physics_signature()
            or document.get("origin") != ORIGIN or document.get("reference_time") != utc_string(START)
            or document.get("feature_names") != FEATURE_NAMES):
        raise ValueError("Dataset provenance/physics/feature schema does not match this generator")
    if set(document.get("splits", {})) != set(SPLITS):
        raise ValueError("Dataset requires independent train, validation and test splits")
    seed = document.get("seed")
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("Invalid dataset generation seed")
    seen = set()
    for split_index, split in enumerate(SPLITS):
        scenarios = document["splits"][split]
        if not isinstance(scenarios, list) or not scenarios:
            raise ValueError(f"Empty {split} split")
        for index, scenario in enumerate(scenarios):
            if not isinstance(scenario, dict) or set(scenario) != {"seed", "inputs", "samples", "scenario_id"}:
                raise ValueError("Invalid scenario schema")
            if scenario["seed"] != [document["seed"], split_index, index]:
                raise ValueError("Scenario seeds do not match independent split streams")
            if not isinstance(scenario["samples"], list) or not scenario["samples"] or scenario["scenario_id"] != scenario_identity(scenario):
                raise ValueError("Invalid scenario fingerprint")
            if scenario["scenario_id"] in seen:
                raise ValueError("Duplicate scenario: split leakage")
            seen.add(scenario["scenario_id"])
            for point, row in enumerate(scenario["samples"]):
                if not isinstance(row, dict) or set(row) != {"point_id", "east_m", "north_m", "features", "pm25_delta_ugm3"}:
                    raise ValueError("Invalid sample schema")
                expected = construct_features(scenario["inputs"], row["east_m"], row["north_m"])
                if row["point_id"] != point or row["features"] != expected:
                    raise ValueError("Inconsistent point features/order")
                target = row["pm25_delta_ugm3"]
                if isinstance(target, bool) or not isinstance(target, (int, float)) or not math.isfinite(target) or target < 0:
                    raise ValueError("Targets must be finite, nonnegative physics outputs")


def verify_labels(document: dict, splits=SPLITS) -> None:
    """Fail closed on edited/handwritten labels, not just their provenance declaration."""
    for split in splits:
        for scenario in document["splits"][split]:
            projection, frame = simulate_case(scenario["inputs"])
            for row in scenario["samples"]:
                actual = point_label(projection, frame, row["east_m"], row["north_m"])
                if not math.isclose(actual, row["pm25_delta_ugm3"], rel_tol=1e-12, abs_tol=1e-12):
                    raise ValueError("Stored target does not reproduce the recorded physics baseline")


def arrays(document: dict, split: str):
    rows = [row for scenario in document["splits"][split] for row in scenario["samples"]]
    return np.asarray([row["features"] for row in rows]), np.asarray([row["pm25_delta_ugm3"] for row in rows])


def read_dataset(path: str | Path) -> dict:
    path = Path(path)
    if path.is_dir():
        path = path / "dataset.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    validate_dataset(document)
    return document


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    for name, default in (("seed", 42), ("train", 1000), ("validation", 200), ("test", 200), ("points-per-scenario", 8)):
        parser.add_argument("--" + name, type=int, default=default)
    args = parser.parse_args(argv)
    document = generate_dataset(seed=args.seed, train=args.train, validation=args.validation,
                                test=args.test, points_per_scenario=args.points_per_scenario)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atomic_json(args.output, document)
    print(deterministic_json({"training_data_type": DATA_TYPE, "dataset_sha256": digest(document),
                              "samples": {s: len(arrays(document, s)[1]) for s in SPLITS}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
