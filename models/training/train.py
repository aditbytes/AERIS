"""Local or SageMaker CPU training; physics remains the operational default."""

from __future__ import annotations

import argparse
import hashlib
import os
import pickle
import platform
import sys
from pathlib import Path

# SageMaker/local script entry points also work without `python -m`.
if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from threadpoolctl import threadpool_limits

from models.plume.parameters import atomic_json, deterministic_json
from models.training.features import DATA_TYPE, FEATURE_NAMES, FEATURE_RANGES, FEATURE_UNITS, SCOPE, TARGET_NAME
from models.training.generate import ORIGIN, START, SPLITS, arrays, digest, physics_signature, read_dataset, validate_dataset, verify_labels
from models.plume.advect import utc_string

MODEL_TYPE = "HistGradientBoostingRegressor"
HYPERPARAMETERS = {"loss": "poisson", "learning_rate": 0.07, "max_iter": 220,
                   "max_leaf_nodes": 31, "min_samples_leaf": 12,
                   "l2_regularization": 0.1, "early_stopping": False}


def software_versions() -> dict:
    return {"python": platform.python_version(), "numpy": np.__version__, "scikit_learn": sklearn.__version__}


def train_model(document: dict, model_dir: str | Path, *, seed: int = 42) -> dict:
    validate_dataset(document)
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise ValueError("Model seed must be an integer in [0, 2**32)")
    verify_labels(document, ("train", "validation"))
    x, y = arrays(document, "train")
    if not np.any(y > 0):
        raise ValueError("Poisson-link regression requires at least one positive training target")
    estimator = HistGradientBoostingRegressor(random_state=seed, **HYPERPARAMETERS)
    with threadpool_limits(limits=1):
        estimator.fit(x, y)
        validation_predictions = estimator.predict(arrays(document, "validation")[0])
    # A fixed configuration: validation is diagnostic; test never affects fitting/selection.
    from models.training.evaluate import metrics
    blob = pickle.dumps(estimator, protocol=5)
    metadata = {"schema_version": 1, "model_type": MODEL_TYPE, "scope": SCOPE,
                "feature_names": FEATURE_NAMES, "feature_units": FEATURE_UNITS,
                "feature_ranges": FEATURE_RANGES, "target_name": TARGET_NAME,
                "target_units": "ug/m3", "training_data_type": DATA_TYPE,
                "dataset_size": {split: len(arrays(document, split)[1]) for split in SPLITS},
                "scenario_counts": {split: len(document["splits"][split]) for split in SPLITS},
                "seed": seed, "generation_seed": document["seed"],
                "generation_protocol": document["generation_protocol"],
                "physics_version": document["physics"]["physics_version"],
                "physics": physics_signature(), "reference_origin": ORIGIN,
                "reference_time": utc_string(START), "software_versions": software_versions(),
                "hyperparameters": {**HYPERPARAMETERS, "random_state": seed},
                "dataset_sha256": digest(document),
                "split_sha256": {s: digest(document["splits"][s]) for s in SPLITS},
                "fit_scenario_ids": [s["scenario_id"] for s in document["splits"]["train"]],
                "validation_scenario_ids": [s["scenario_id"] for s in document["splits"]["validation"]],
                "validation_metrics": metrics(arrays(document, "validation")[1], validation_predictions),
                "model_sha256": hashlib.sha256(blob).hexdigest(), "model_bytes": len(blob),
                "MODEL_DEFAULT": "PHYSICS_BASELINE", "MODEL_SURROGATE": "AVAILABLE_FOR_OPTIONAL_USE",
                "REAL_OBSERVATIONAL_VALIDATION": "NOT_AVAILABLE", "SURROGATE_VALIDATION": DATA_TYPE}
    directory = Path(model_dir)
    directory.mkdir(parents=True, exist_ok=True)
    # Metadata published last: an interrupted update fails the loader's checksum check.
    temporary = directory / "model.pkl.tmp"
    temporary.write_bytes(blob)
    temporary.replace(directory / "model.pkl")
    atomic_json(directory / "metadata.json", metadata)
    return metadata


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=os.environ.get("SM_CHANNEL_TRAIN"))
    parser.add_argument("--model-dir", default=os.environ.get("SM_MODEL_DIR"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)
    if not args.data or not args.model_dir:
        parser.error("Provide --data/--model-dir locally or SM_CHANNEL_TRAIN/SM_MODEL_DIR")
    metadata = train_model(read_dataset(args.data), args.model_dir, seed=args.seed)
    print(deterministic_json({key: metadata[key] for key in
                              ("training_data_type", "dataset_size", "seed", "model_bytes", "validation_metrics")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
