"""Read hash-verified source/corridor context without inventing missing lineage."""
import os
from pathlib import Path

from models.common.provenance import inspect_artifact


def get_model_context():
    root = Path(os.environ.get("AERIS_DATA_DIR", Path(__file__).resolve().parents[2] / "data/live"))
    result = {}
    for kind, name in (("sources", "sources.json"), ("corridor", "corridor.geojson")):
        path = root / name
        if not path.exists():
            result[kind] = {"artifact_status": "UNAVAILABLE"}
            continue
        companion = root / f"{kind}.provenance.json"
        result[kind] = inspect_artifact(path, kind, provenance_path=companion if companion.exists() else None)
    return result
