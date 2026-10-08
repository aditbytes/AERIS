"""Local, fail-closed parameter artifacts; no network or implicit calibration."""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from models.plume.advect import PlumeParams, number, parse_time

MODEL_VERSION = "lagrangian-puff-v1"
PARAMETER_FILE = Path(__file__).with_name("params.json")
UNITS = {"sigma0_m": "m", "k_m_sqrt_hour": "m/sqrt(hour)",
         "tau_hours": "hour", "concentration_scale_ug": "ug/nominal-puff-strength"}
REAL_EVIDENCE = "REAL_CAPTURED_HISTORY"


def deterministic_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + "\n"


def atomic_json(path: Path, value: Any) -> None:
    """Serialize completely before touching an existing result."""
    body = deterministic_json(value)
    path = Path(path)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                         dir=path.parent, delete=False,
                                         prefix=path.name + ".", suffix=".tmp") as handle:
            temporary = Path(handle.name)
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def validate_document(document: Any, *, allow_mathematical_test: bool = False) -> PlumeParams:
    if not isinstance(document, dict):
        raise ValueError("Parameter artifact must be an object")
    if document.get("schema_version") != 1 or document.get("model_version") != MODEL_VERSION:
        raise ValueError("Unsupported parameter schema/model version")
    if document.get("status") not in ("CALIBRATED", "PARTIALLY_CALIBRATED"):
        raise ValueError("Parameter artifact does not describe successful calibration")
    evidence = document.get("evidence_kind")
    if evidence != REAL_EVIDENCE and not (allow_mathematical_test and evidence == "MATHEMATICAL_TEST"):
        raise ValueError("Parameters require real captured history; mathematical artifacts are not deployable")
    if document.get("units") != UNITS:
        raise ValueError("Parameter units do not match this model")
    parse_time(document.get("calibration_timestamp"), "calibration_timestamp")
    dataset = document.get("dataset")
    if not isinstance(dataset, dict) or not dataset.get("provenance"):
        raise ValueError("Missing calibration dataset provenance")
    for field in ("events", "stations", "observations"):
        count = dataset.get(field)
        if not isinstance(count, int) or isinstance(count, bool) or count <= 0:
            raise ValueError(f"Missing positive dataset count: {field}")
    start = parse_time(dataset.get("time_from"), "dataset.time_from")
    end = parse_time(dataset.get("time_to"), "dataset.time_to")
    if start > end:
        raise ValueError("Invalid calibration time range")
    if parse_time(document["calibration_timestamp"], "calibration_timestamp") < end:
        raise ValueError("Calibration timestamp predates calibration targets")
    if document.get("objective") != "training_rmse_ugm3":
        raise ValueError("Unknown calibration objective")
    statuses = document.get("parameter_status", {})
    if set(statuses) != set(UNITS) or not any(v == "CALIBRATED" for v in statuses.values()):
        raise ValueError("No identified calibrated parameter")
    if any(v not in ("CALIBRATED", "ASSUMED") for v in statuses.values()):
        raise ValueError("Invalid parameter status")
    expected_status = "CALIBRATED" if all(v == "CALIBRATED" for v in statuses.values()) else "PARTIALLY_CALIBRATED"
    if document["status"] != expected_status:
        raise ValueError("Calibration status disagrees with individual parameter statuses")
    if not isinstance(document.get("identifiability"), dict) or set(document["identifiability"]) != set(UNITS):
        raise ValueError("Missing identifiability diagnostics")
    try:
        if set(document["parameters"]) != set(PlumeParams.__dataclass_fields__):
            raise ValueError("Artifact must record every physical and numerical parameter")
        parameters = PlumeParams(**document["parameters"])
    except (KeyError, TypeError) as exc:
        raise ValueError("Invalid parameter values") from exc
    baseline = PlumeParams()
    for name, status in statuses.items():
        if status == "ASSUMED" and getattr(parameters, name) != getattr(baseline, name):
            raise ValueError(f"Assumed parameter {name} must retain baseline")
        diagnostic = document["identifiability"][name]
        if not isinstance(diagnostic, dict):
            raise ValueError("Invalid identifiability record")
        if status == "CALIBRATED" and (diagnostic.get("weakly_identified") is not False or diagnostic.get("at_boundary") is not False):
            raise ValueError("Unsupported parameter cannot be labelled calibrated")
    for name in set(PlumeParams.__dataclass_fields__) - set(UNITS):
        if getattr(parameters, name) != getattr(baseline, name):
            raise ValueError("This model version calibrates only the four declared physical parameters")
    metrics = document.get("metrics", {})
    for partition in ("baseline", "calibrated", "baseline_holdout", "calibrated_holdout"):
        values = metrics.get(partition)
        if not isinstance(values, dict):
            raise ValueError("Protected holdout metrics are required for automatic adoption")
        for name in ("rmse", "mae", "bias"):
            value = number(values.get(name), f"{partition}.{name}")
            if name != "bias" and value < 0:
                raise ValueError("Error metrics cannot be negative")
    if metrics["calibrated"]["rmse"] >= metrics["baseline"]["rmse"]:
        raise ValueError("Calibration did not improve training RMSE")
    if metrics["calibrated_holdout"]["rmse"] >= metrics["baseline_holdout"]["rmse"]:
        raise ValueError("Calibration did not improve protected holdout RMSE")
    checks = document.get("leakage_checks", {})
    if any(checks.get(n) != "PASS" for n in ("source_availability", "background_independence", "event_split_disjoint")) or checks.get("holdout_used_for_selection") is not False:
        raise ValueError("Missing successful leakage protection")
    split = document.get("split", {})
    train, held = split.get("training_events"), split.get("holdout_events")
    if not isinstance(train, list) or not isinstance(held, list) or len(train) < 2 or not held or set(train) & set(held):
        raise ValueError("Missing disjoint protected event split")
    if len(set(train)) != len(train) or len(set(held)) != len(held) or dataset["events"] != len(train) + len(held):
        raise ValueError("Dataset event count disagrees with protected split")
    counts = []
    for a, b, minimum in (("baseline", "calibrated", 4), ("baseline_holdout", "calibrated_holdout", 2)):
        count = metrics[a].get("observations")
        if not isinstance(count, int) or isinstance(count, bool) or count < minimum or metrics[b].get("observations") != count:
            raise ValueError("Metrics require identical eligible targets and sufficient observations")
        counts.append(count)
    if dataset["stations"] < 2 or dataset["observations"] != sum(counts):
        raise ValueError("Dataset counts disagree with evaluation records")
    deterministic_json(document)
    return parameters


@dataclass(frozen=True)
class LoadedParameters:
    params: PlumeParams
    provenance: str
    metadata: dict[str, Any] | None = None


def load_parameters(explicit: PlumeParams | dict[str, Any] | None = None,
                    *, path: Path | None = None) -> LoadedParameters:
    """Explicit values bypass the file; partial explicit dicts use baseline defaults."""
    if explicit is not None:
        if isinstance(explicit, PlumeParams):
            return LoadedParameters(explicit, "EXPLICIT")
        if not isinstance(explicit, dict):
            raise ValueError("Explicit parameters must be PlumeParams or a dict")
        try:
            return LoadedParameters(PlumeParams(**explicit), "EXPLICIT")
        except TypeError as exc:
            raise ValueError(f"Invalid explicit parameters: {exc}") from exc
    location = PARAMETER_FILE if path is None else Path(path)
    if not location.exists():
        return LoadedParameters(PlumeParams(), "BASELINE")
    document = json.loads(location.read_text(encoding="utf-8"))
    return LoadedParameters(validate_document(document), "CALIBRATED", document)
