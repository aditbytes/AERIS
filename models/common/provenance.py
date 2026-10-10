"""Hash-bound companion metadata; never infer observations or calibration from a file."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pipeline.contracts import check_corridor, check_sources

ARCHIVE_REGISTRY = Path(__file__).resolve().parents[1] / "ARCHIVED_OUTPUTS.json"
_CHECKS = {"sources": check_sources, "corridor": check_corridor}


def _nonfinite(value: str) -> None:
    raise ValueError(f"Nonfinite JSON value: {value}")


def _document(body: bytes) -> dict[str, Any]:
    value = json.loads(body.decode("utf-8", errors="strict"), parse_constant=_nonfinite)
    if not isinstance(value, dict):
        raise ValueError("Artifact must be a JSON object")
    return value


def _validate_artifact(document: dict[str, Any], kind: str) -> None:
    if kind not in _CHECKS:
        raise ValueError("Artifact kind must be sources or corridor")
    try:
        problems = _CHECKS[kind](document)
        stamp = datetime.fromisoformat(document["generated_at"])
        if stamp.utcoffset() is None:
            raise ValueError("Artifact timestamp must include its timezone")
    except (KeyError, TypeError, AttributeError, IndexError) as exc:
        raise ValueError("Malformed derived artifact") from exc
    if problems:
        raise ValueError(f"Invalid {kind} artifact: {problems}")


def _sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _validate_companion(metadata: dict[str, Any], kind: str, digest: str) -> None:
    if type(metadata.get("schema_version")) is not int or metadata["schema_version"] != 1 or metadata.get("output_kind") != kind:
        raise ValueError("Companion provenance schema/kind mismatch")
    if metadata.get("output_sha256") != digest:
        raise ValueError("Companion output hash mismatch")
    if not isinstance(metadata.get("model_version"), str) or not metadata["model_version"].strip() or not _sha256(metadata.get("model_code_sha256")):
        raise ValueError("Invalid companion model declaration")
    for field in ("parameters", "semantics", "inputs"):
        if not isinstance(metadata.get(field), dict) or not metadata[field]:
            raise ValueError(f"Invalid companion {field}")
    if not isinstance(metadata.get("parameter_source"), str) or not metadata["parameter_source"].strip():
        raise ValueError("Invalid companion parameter source")
    expected_inputs = {"fires"} if kind == "sources" else {"sources", "wind"}
    if set(metadata["inputs"]) != expected_inputs or any(
            not isinstance(v, dict) or not _sha256(v.get("sha256")) for v in metadata["inputs"].values()):
        raise ValueError("Invalid companion input bindings")


def describe_bytes(body: bytes, kind: str, *, companion: bytes | None = None) -> dict[str, Any]:
    """Describe stored bytes, including their newlines, before API serialization."""
    document = _document(body)
    _validate_artifact(document, kind)
    digest = hashlib.sha256(body).hexdigest()
    result = {"schema_version": 1, "artifact_kind": kind, "artifact_sha256": digest,
              "artifact_status": "UNVERSIONED_UNKNOWN",
              "operational_validation": "NOT_ESTABLISHED",
              "generated_at": document["generated_at"]}
    if kind == "corridor":
        result.update({k: document.get(k) for k in ("forecast_start", "wind_generated_at")})
    registry = _document(ARCHIVE_REGISTRY.read_bytes())
    for record in registry["artifacts"]:
        if record["kind"] == kind and record["sha256"] == digest:
            result.update({k: v for k, v in record.items() if k not in ("path", "sha256", "kind")})
            # A supplied sidecar must never relabel these exact known legacy bytes.
            break
    if companion is not None:
        metadata = _document(companion)
        _validate_companion(metadata, kind, digest)
        if result["artifact_status"] != "ARCHIVED_LEGACY":
            result["artifact_status"] = "MODELLED_WITH_COMPANION_PROVENANCE"
            result["declared_model_version"] = metadata["model_version"]
            result["declared_parameter_source"] = metadata["parameter_source"]
            for field in ("parameters", "semantics", "inputs", "analysis_reference", "coordinate_reference_system", "component_code_sha256"):
                if field in metadata:
                    result[field] = metadata[field]
        # A checksum is an integrity binding, not authentication or observed skill.
        result["companion_binding"] = "MATCHES_OUTPUT_BYTES_NOT_SUPPLIER_AUTHENTICATION"
    return result


def inspect_artifact(path: Path, kind: str, *, provenance_path: Path | None = None) -> dict[str, Any]:
    """Identify exact known bytes, or verify a companion's binding, without publishing."""
    return describe_bytes(Path(path).read_bytes(), kind,
                          companion=Path(provenance_path).read_bytes() if provenance_path is not None else None)


def manifest_for_bytes(*, body: bytes, kind: str, inputs: dict[str, bytes],
                       model_version: str, model_code: Path, parameters: dict[str, Any],
                       parameter_source: str, semantics: dict[str, Any]) -> dict[str, Any]:
    """Prepare production metadata using the same bytes consumed by the engine."""
    document = _document(body)
    _validate_artifact(document, kind)
    bindings = {}
    for name, raw in inputs.items():
        source = _document(raw)
        binding = {"sha256": hashlib.sha256(raw).hexdigest(),
                   "generated_at": source.get("generated_at"), "declared_source": source.get("source")}
        if name == "sources":
            binding.update(describe_bytes(raw, "sources"))
        if name == "wind":
            binding["feed_coverage_complete"] = source.get("coverage_complete")
            binding["usable_hourly_coverage_complete"] = source.get("usable_hourly_coverage_complete")
        bindings[name] = binding
    metadata = {"schema_version": 1, "generated_at": document["generated_at"],
                "output_kind": kind, "output_sha256": hashlib.sha256(body).hexdigest(),
                "model_version": model_version,
                "model_code_sha256": hashlib.sha256(model_code.read_bytes()).hexdigest(),
                "component_code_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                          for p in sorted(model_code.parent.glob("*.py"))},
                "parameters": parameters, "parameter_source": parameter_source,
                "analysis_reference": document["generated_at"], "semantics": semantics, "inputs": bindings,
                "coordinate_reference_system": "WGS84 longitude/latitude degrees",
                "operational_validation": "NOT_ESTABLISHED"}
    if kind == "corridor":
        metadata.update({k: document[k] for k in ("forecast_start", "wind_generated_at")})
    _validate_companion(metadata, kind, metadata["output_sha256"])
    json.dumps(metadata, allow_nan=False)
    return metadata


def prepare_manifest(*, path: Path, output: Path, body: str, kind: str,
                     inputs: dict[str, Path], model_version: str, model_code: Path,
                     parameters: dict[str, Any], parameter_source: str,
                     semantics: dict[str, Any]) -> dict[str, Any]:
    """Bind the exact UTF-8 text, including writer newlines, before touching outputs."""
    path, output = Path(path), Path(output)
    resolved = path.resolve()
    if resolved == output.resolve() or resolved in {p.resolve() for p in inputs.values()} or resolved == Path(model_code).resolve():
        raise ValueError("Provenance output must not overwrite inputs, code or the model output")
    if not path.parent.is_dir() or path.is_dir():
        raise ValueError("Provenance output requires an existing directory and a file path")
    document = _document(body.encode("utf-8"))
    _validate_artifact(document, kind)
    bindings = {}
    for name, input_path in inputs.items():
        raw = input_path.read_bytes()
        source = _document(raw)
        binding = {"sha256": hashlib.sha256(raw).hexdigest(),
                   "generated_at": source.get("generated_at"),
                   "declared_source": source.get("source")}
        if name == "sources":
            binding.update(inspect_artifact(input_path, "sources"))
        bindings[name] = binding
    metadata = {"schema_version": 1, "output_kind": kind,
                "output_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
                "model_version": model_version,
                "model_code_sha256": hashlib.sha256(Path(model_code).read_bytes()).hexdigest(),
                "parameters": parameters, "parameter_source": parameter_source,
                "analysis_reference": document["generated_at"],
                "semantics": semantics, "inputs": bindings,
                "coordinate_reference_system": "WGS84 longitude/latitude degrees",
                "operational_validation": "NOT_ESTABLISHED"}
    if kind == "corridor":
        metadata["forecast_start"] = document["forecast_start"]
        metadata["wind_generated_at"] = document["wind_generated_at"]
    json.dumps(metadata, allow_nan=False)  # No partial writes for invalid metadata.
    return metadata


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--kind", choices=tuple(_CHECKS), required=True)
    parser.add_argument("--provenance", type=Path)
    args = parser.parse_args(argv)
    try:
        result = inspect_artifact(args.path, args.kind, provenance_path=args.provenance)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Provenance inspection failed: {exc}\n")
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))


if __name__ == "__main__":
    main()
