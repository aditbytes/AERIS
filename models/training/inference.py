"""Strict SageMaker JSON contracts. Load only artifacts from trusted local training."""

from __future__ import annotations

import hashlib
import json
import os
import pickle
import sys
from dataclasses import dataclass
from pathlib import Path

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from threadpoolctl import threadpool_limits

from models.training.features import DATA_TYPE, FEATURE_NAMES, FEATURE_RANGES, FEATURE_UNITS, SCOPE, TARGET_NAME, validate_features
from models.training.generate import ORIGIN, START, physics_signature
from models.plume.advect import utc_string
from models.training.train import HYPERPARAMETERS, MODEL_TYPE, software_versions


@dataclass(frozen=True)
class LoadedModel:
    estimator: HistGradientBoostingRegressor
    metadata: dict


def model_fn(model_dir, context=None, *, trusted_artifact: bool | None = None) -> LoadedModel:
    """Require caller/deployer trust before deserialization; checksums cannot grant it."""
    if trusted_artifact is not None and not isinstance(trusted_artifact, bool):
        raise ValueError("trusted_artifact must be a bool or None")
    trusted = (os.environ.get("AERIS_TRUST_MODEL_ARTIFACT") == "1"
               if trusted_artifact is None else trusted_artifact)
    if not trusted:
        raise PermissionError("Only trusted training artifacts may be loaded; explicitly acknowledge the trusted supplier before loading pickle")
    directory = Path(model_dir)
    metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
    expected = {"schema_version": 1, "model_type": MODEL_TYPE, "scope": SCOPE,
                "feature_names": FEATURE_NAMES, "feature_units": FEATURE_UNITS,
                "feature_ranges": FEATURE_RANGES, "target_name": TARGET_NAME,
                "target_units": "ug/m3", "training_data_type": DATA_TYPE,
                "physics": physics_signature(), "MODEL_DEFAULT": "PHYSICS_BASELINE",
                "physics_version": physics_signature()["physics_version"],
                "reference_origin": ORIGIN, "reference_time": utc_string(START),
                "MODEL_SURROGATE": "AVAILABLE_FOR_OPTIONAL_USE",
                "REAL_OBSERVATIONAL_VALIDATION": "NOT_AVAILABLE", "SURROGATE_VALIDATION": DATA_TYPE}
    if not isinstance(metadata, dict) or any(metadata.get(k) != v for k, v in expected.items()):
        raise ValueError("Incompatible artifact metadata/physics/provenance")
    if metadata.get("software_versions") != software_versions():
        raise ValueError("Artifact software versions differ; retrain in this environment")
    seed = metadata.get("seed")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise ValueError("Invalid artifact seed")
    if metadata.get("hyperparameters") != {**HYPERPARAMETERS, "random_state": seed}:
        raise ValueError("Artifact model configuration differs")
    for key in ("dataset_size", "scenario_counts"):
        sizes = metadata.get(key)
        if not isinstance(sizes, dict) or set(sizes) != {"train", "validation", "test"} or any(
                isinstance(n, bool) or not isinstance(n, int) or n < 1 for n in sizes.values()):
            raise ValueError(f"Invalid artifact {key}")
    for key, split in (("fit_scenario_ids", "train"), ("validation_scenario_ids", "validation")):
        identities = metadata.get(key)
        if not isinstance(identities, list) or len(identities) != metadata["scenario_counts"][split] or any(
                not isinstance(identity, str) or len(identity) != 64 for identity in identities):
            raise ValueError("Invalid artifact scenario identities")
    blob = (directory / "model.pkl").read_bytes()
    if hashlib.sha256(blob).hexdigest() != metadata.get("model_sha256"):
        raise ValueError("Artifact checksum mismatch")
    # Pickle is not a sandbox. Checksum protects integrity, not an untrusted supplier.
    estimator = pickle.loads(blob)
    if not isinstance(estimator, HistGradientBoostingRegressor) or estimator.n_features_in_ != len(FEATURE_NAMES):
        raise ValueError("Artifact estimator does not match its feature contract")
    return LoadedModel(estimator, metadata)


def input_fn(request_body, request_content_type, context=None) -> np.ndarray:
    if request_content_type != "application/json":
        raise ValueError("Only application/json input is supported")
    if not isinstance(request_body, (str, bytes)):
        raise ValueError("Request body must be JSON text or bytes")
    try:
        document = json.loads(request_body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid JSON request") from exc
    if not isinstance(document, dict) or set(document) != {"feature_names", "instances"}:
        raise ValueError("Request requires exactly feature_names and instances")
    return validate_features(document["instances"], document["feature_names"])


def predict_fn(input_data, model: LoadedModel, context=None) -> dict:
    # Also validate direct Python callers, who can bypass input_fn.
    if not isinstance(input_data, np.ndarray) or input_data.ndim != 2:
        raise ValueError("input_data must be a two-dimensional feature array")
    data = validate_features(input_data.tolist(), model.metadata["feature_names"])
    with threadpool_limits(limits=1):
        predictions = model.estimator.predict(data)
    if not np.all(np.isfinite(predictions)) or np.any(predictions < 0):
        raise ValueError("Surrogate produced invalid PM2.5 deltas")
    return {"target_name": TARGET_NAME, "predictions": predictions.tolist(),
            "model": "surrogate", "SURROGATE_VALIDATION": DATA_TYPE,
            "REAL_OBSERVATIONAL_VALIDATION": "NOT_AVAILABLE"}


def output_fn(prediction, accept, context=None) -> str:
    if accept != "application/json":
        raise ValueError("Only application/json output is supported")
    return json.dumps(prediction, allow_nan=False, sort_keys=True)
