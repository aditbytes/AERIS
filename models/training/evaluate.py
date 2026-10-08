"""Protected generated-test evaluation; no observational forecast-skill claim."""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

from models.plume.parameters import atomic_json, deterministic_json
from models.training.features import DATA_TYPE, TARGET_NAME
from models.training.generate import arrays, digest, point_label, read_dataset, simulate_case, validate_dataset
from models.training.inference import model_fn, predict_fn


def _vector(values, name):
    result = np.asarray(values, dtype=float)
    if result.ndim != 1 or result.size == 0 or not np.all(np.isfinite(result)):
        raise ValueError(f"{name} must be a nonempty finite numeric vector")
    return result


def distribution(values) -> dict:
    values = _vector(values, "distribution")
    return {"min": float(values.min()), "max": float(values.max()), "mean": float(values.mean()),
            "p50": float(np.percentile(values, 50)), "p90": float(np.percentile(values, 90)),
            "p99": float(np.percentile(values, 99)), "zero_count": int(np.sum(values == 0))}


def metrics(targets, predictions) -> dict:
    target, prediction = _vector(targets, "targets"), _vector(predictions, "predictions")
    if target.shape != prediction.shape:
        raise ValueError("Target/prediction lengths differ")
    if np.any(target < 0) or np.any(prediction < 0):
        raise ValueError("PM2.5 delta comparison requires nonnegative values")
    residual = prediction - target
    absolute = np.abs(residual)
    positive = target > 0
    relative = absolute[positive] / target[positive]
    return {"count": len(target), "rmse_ugm3": float(np.sqrt(np.mean(residual**2))),
            "mae_ugm3": float(absolute.mean()), "bias_ugm3": float(residual.mean()),
            "worst_absolute_error_ugm3": float(absolute.max()),
            "relative_error": {"definition": "abs(prediction-target)/target; zero targets excluded",
                               "eligible_count": int(positive.sum()), "zero_target_count": int((~positive).sum()),
                               "mean": float(relative.mean()) if relative.size else None,
                               "median": float(np.median(relative)) if relative.size else None,
                               "p90": float(np.percentile(relative, 90)) if relative.size else None,
                               "max": float(relative.max()) if relative.size else None},
            "normalized_mae": float(absolute.sum() / target.sum()) if target.sum() > 0 else None,
            "target_distribution": distribution(target), "prediction_distribution": distribution(prediction)}


def compare_predictions(targets, physics_predictions, surrogate_predictions) -> dict:
    """Reusable numeric comparison for future independently vetted, background-subtracted history.

    This function assigns no provenance or real-validation status. A future history adapter
    must enforce Task 3 eligibility, temporal independence, units and supported weather scope.
    """
    return {"physics": metrics(targets, physics_predictions), "surrogate": metrics(targets, surrogate_predictions)}


def evaluate_model(document: dict, loaded) -> dict:
    validate_dataset(document)
    metadata = loaded.metadata
    if metadata["dataset_sha256"] != digest(document) or any(
            metadata["split_sha256"][s] != digest(document["splits"][s]) for s in document["splits"]):
        raise ValueError("Protected evaluation dataset differs from the recorded training protocol")
    ids = {s["scenario_id"] for s in document["splits"]["test"]}
    if ids.intersection(metadata["fit_scenario_ids"] + metadata["validation_scenario_ids"]):
        raise ValueError("Protected test scenarios overlap fitting/validation")
    x, targets = arrays(document, "test")
    predictions = np.asarray(predict_fn(x, loaded)["predictions"])
    physics, rows = [], []
    # Replay actual teacher calls; do not simply report cached labels as predictions.
    for scenario in document["splits"]["test"]:
        projection, frame = simulate_case(scenario["inputs"])
        for row in scenario["samples"]:
            label = point_label(projection, frame, row["east_m"], row["north_m"])
            if not math.isclose(label, row[TARGET_NAME], rel_tol=1e-12, abs_tol=1e-12):
                raise ValueError("Stored target does not reproduce the recorded physics baseline")
            physics.append(label)
            rows.append({"scenario_id": scenario["scenario_id"], "point_id": row["point_id"],
                         "features": row["features"], "target_ugm3": row[TARGET_NAME]})
    comparison = compare_predictions(targets, physics, predictions)
    ranking = np.argsort(-np.abs(predictions - targets), kind="stable")[:5]
    worst = [{**rows[i], "prediction_ugm3": float(predictions[i]),
              "error_ugm3": float(predictions[i] - targets[i])} for i in ranking]
    return {"schema_version": 1, "target_name": TARGET_NAME, "units": "ug/m3",
            "dataset_sha256": digest(document), "dataset_size": metadata["dataset_size"],
            "scenario_counts": metadata["scenario_counts"], "model_bytes": metadata["model_bytes"],
            "model_sha256": metadata["model_sha256"], "software_versions": metadata["software_versions"],
            "generation_seed": metadata["generation_seed"], "generation_protocol": metadata["generation_protocol"],
            "physics_configuration": metadata["physics"], "scope": metadata["scope"],
            "feature_names": metadata["feature_names"], "hyperparameters": metadata["hyperparameters"],
            "reference_origin": metadata["reference_origin"], "reference_time": metadata["reference_time"],
            "seed": metadata["seed"], "physics_version": metadata["physics_version"],
            "MODEL_DEFAULT": "PHYSICS_BASELINE", "MODEL_SURROGATE": "AVAILABLE_FOR_OPTIONAL_USE",
            "REAL_OBSERVATIONAL_VALIDATION": "NOT_AVAILABLE", "SURROGATE_VALIDATION": DATA_TYPE,
            "comparison_basis": "Teacher reproduction: generated labels and replayed physics share the same equations/parameters; zero physics error is an identity check, not observed accuracy.",
            **comparison, "validation": metadata["validation_metrics"], "worst_cases": worst}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    report = evaluate_model(read_dataset(args.data), model_fn(args.model_dir))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atomic_json(args.output, report)
    print(deterministic_json(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
