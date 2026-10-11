"""Deserialization probes use incompatible test bytes, never an executable pickle."""

import hashlib
import json

import pytest

from models.plume.advect import utc_string
from models.training import inference
from models.training.features import DATA_TYPE, FEATURE_NAMES, FEATURE_RANGES, FEATURE_UNITS, SCOPE, TARGET_NAME
from models.training.generate import ORIGIN, START, physics_signature
from models.training.train import HYPERPARAMETERS, MODEL_TYPE, software_versions


@pytest.fixture
def supplied_artifact(tmp_path, monkeypatch):
    """A supplier can self-declare compatibility and update its own checksum."""
    monkeypatch.delenv("AERIS_TRUST_MODEL_ARTIFACT", raising=False)
    blob = b"negative deserialization fixture; not a trained model or observation"
    metadata = {
        "schema_version": 1, "model_type": MODEL_TYPE, "scope": SCOPE,
        "feature_names": FEATURE_NAMES, "feature_units": FEATURE_UNITS,
        "feature_ranges": FEATURE_RANGES, "target_name": TARGET_NAME,
        "target_units": "ug/m3", "training_data_type": DATA_TYPE,
        "physics": physics_signature(), "physics_version": physics_signature()["physics_version"],
        "reference_origin": ORIGIN, "reference_time": utc_string(START),
        "MODEL_DEFAULT": "PHYSICS_BASELINE", "MODEL_SURROGATE": "AVAILABLE_FOR_OPTIONAL_USE",
        "REAL_OBSERVATIONAL_VALIDATION": "NOT_AVAILABLE", "SURROGATE_VALIDATION": DATA_TYPE,
        "software_versions": software_versions(), "seed": 42,
        "hyperparameters": {**HYPERPARAMETERS, "random_state": 42},
        "dataset_size": {"train": 1, "validation": 1, "test": 1},
        "scenario_counts": {"train": 1, "validation": 1, "test": 1},
        "fit_scenario_ids": ["a" * 64], "validation_scenario_ids": ["b" * 64],
        "model_sha256": hashlib.sha256(blob).hexdigest(),
    }
    (tmp_path / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    (tmp_path / "model.pkl").write_bytes(blob)

    def reached(*args, **kwargs):
        raise RuntimeError("deserializer reached; no pickle was executed")

    monkeypatch.setattr(inference.pickle, "loads", reached)
    return tmp_path


def test_supplier_checksum_does_not_authorize_deserialization(supplied_artifact):
    with pytest.raises(PermissionError, match="trusted"):
        inference.model_fn(supplied_artifact)


def test_trust_gate_precedes_all_file_reads(supplied_artifact, monkeypatch):
    from pathlib import Path

    def forbidden(*args, **kwargs):
        raise AssertionError("Untrusted artifacts must not be read")

    monkeypatch.setattr(Path, "read_text", forbidden)
    monkeypatch.setattr(Path, "read_bytes", forbidden)
    with pytest.raises(PermissionError, match="trusted"):
        inference.model_fn(supplied_artifact, context={"trusted_artifact": True, "metadata": {"trusted": True}})


def test_request_context_cannot_grant_artifact_trust(supplied_artifact):
    with pytest.raises(PermissionError, match="trusted"):
        inference.model_fn(supplied_artifact, context={"trusted_artifact": True})


@pytest.mark.parametrize("value", ["", "0", "true", "yes", " 1", "1 "])
def test_only_explicit_server_trust_grants_loading(supplied_artifact, monkeypatch, value):
    monkeypatch.setenv("AERIS_TRUST_MODEL_ARTIFACT", value)
    with pytest.raises(PermissionError, match="trusted"):
        inference.model_fn(supplied_artifact)


def test_trusted_local_call_reaches_existing_loader(supplied_artifact):
    with pytest.raises(RuntimeError, match="deserializer reached"):
        inference.model_fn(supplied_artifact, trusted_artifact=True)


def test_sagemaker_context_and_explicit_server_trust(supplied_artifact, monkeypatch):
    monkeypatch.setenv("AERIS_TRUST_MODEL_ARTIFACT", "1")
    with pytest.raises(RuntimeError, match="deserializer reached"):
        inference.model_fn(supplied_artifact, context={})


def test_explicit_distrust_overrides_server_trust(supplied_artifact, monkeypatch):
    monkeypatch.setenv("AERIS_TRUST_MODEL_ARTIFACT", "1")
    with pytest.raises(PermissionError, match="trusted"):
        inference.model_fn(supplied_artifact, trusted_artifact=False)


@pytest.mark.parametrize("value", [1, "true", [], {}])
def test_trust_argument_is_not_coerced(supplied_artifact, value):
    with pytest.raises(ValueError, match="trusted_artifact"):
        inference.model_fn(supplied_artifact, trusted_artifact=value)


def test_trust_does_not_bypass_integrity_validation(supplied_artifact):
    (supplied_artifact / "model.pkl").write_bytes(b"modified negative fixture")
    with pytest.raises(ValueError, match="checksum"):
        inference.model_fn(supplied_artifact, trusted_artifact=True)


def test_point_interface_requires_artifact_trust(supplied_artifact):
    from models.training.predict import predict_point

    case = {"u_ms": 4, "v_ms": 0, "forecast_hours": 1, "pblh_m": 800,
            "source_emission_strength": 0.5, "source_radius_m": 2000}
    with pytest.raises(PermissionError, match="trusted"):
        predict_point(case, 0, 0, model="surrogate", model_dir=supplied_artifact)
    with pytest.raises(RuntimeError, match="deserializer reached"):
        predict_point(case, 0, 0, model="surrogate", model_dir=supplied_artifact, trusted_artifact=True)
    assert predict_point(case, 0, 0)["model"] == "physics"
