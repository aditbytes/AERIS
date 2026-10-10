"""
agent/tools/get_sources.py
--------------------------
Strands agent tool: retrieve detected pollution sources.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]


def get_sources() -> list[dict[str, Any]]:
    """
    Return detected pollution sources with emission strength, fire count, and confidence.
    Reads from AERIS_DATA_DIR / sources.json.
    """
    data_dir = Path(os.environ.get("AERIS_DATA_DIR", _REPO_ROOT / "data" / "live"))
    sources_path = data_dir / "sources.json"

    if not sources_path.exists():
        return []

    with sources_path.open(encoding="utf-8") as f:
        data = json.load(f)

    return data.get("sources", [])
