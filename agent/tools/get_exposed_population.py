"""
agent/tools/get_exposed_population.py
-------------------------------------
Strands agent tool: retrieve estimated exposed population and uncertainty range.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]


def get_exposed_population() -> dict[str, Any]:
    """
    Return estimated exposed population with low and high uncertainty bounds and metadata.
    """
    data_dir = Path(os.environ.get("AERIS_DATA_DIR", _REPO_ROOT / "data" / "live"))
    ranked_path = data_dir / "ranked_sites.json"

    if not ranked_path.exists():
        return {"estimate": 0, "low": 0, "high": 0, "method": "", "data_available": False}

    with ranked_path.open(encoding="utf-8") as f:
        data = json.load(f)

    return data.get(
        "exposed_population",
        {"estimate": 0, "low": 0, "high": 0, "method": "", "data_available": False},
    )
