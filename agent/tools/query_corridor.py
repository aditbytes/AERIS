"""
agent/tools/query_corridor.py
-----------------------------
Strands agent tool: query corridor bands and arrival ETAs for a specific source.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]


def query_corridor(source_id: str | None = None) -> list[dict[str, Any]]:
    """
    Return corridor bands and ETAs from corridor.geojson.
    If source_id is provided, filters to that source's bands.
    """
    data_dir = Path(os.environ.get("AERIS_DATA_DIR", _REPO_ROOT / "data" / "live"))
    corridor_path = data_dir / "corridor.geojson"

    if not corridor_path.exists():
        return []

    with corridor_path.open(encoding="utf-8") as f:
        data = json.load(f)

    bands = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        if props.get("kind") == "band":
            if source_id is None or props.get("source_id") == source_id:
                bands.append(props)

    bands.sort(key=lambda b: b.get("hour_from", 0))
    return bands
