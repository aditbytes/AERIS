"""Explicit optional point backend; no effect on the production corridor pipeline."""

from __future__ import annotations

from pathlib import Path

from models.training.features import DATA_TYPE, FEATURE_NAMES, TARGET_NAME, construct_features
from models.training.generate import point_label, simulate_case


def predict_point(case: dict, east_m: float, north_m: float, *, model: str = "physics",
                  model_dir: str | Path | None = None, trusted_artifact: bool | None = None) -> dict:
    """Reference-origin, steady-weather point only; coordinates are projected metres."""
    features = construct_features(case, east_m, north_m)
    if model == "physics":
        projection, frame = simulate_case(case)
        return {"model": "physics", TARGET_NAME: point_label(projection, frame, east_m, north_m),
                "validation_type": DATA_TYPE}
    if model != "surrogate":
        raise ValueError("model must be physics or surrogate")
    if model_dir is None:
        raise FileNotFoundError("Explicit surrogate selection requires a trained local artifact")
    import numpy as np
    from models.training.inference import model_fn, predict_fn
    loaded = model_fn(model_dir, trusted_artifact=trusted_artifact)
    prediction = predict_fn(np.asarray([features]), loaded)
    return {"model": "surrogate", TARGET_NAME: prediction["predictions"][0],
            "validation_type": DATA_TYPE}
