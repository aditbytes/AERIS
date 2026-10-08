"""
agent/tools/get_ranked_sites.py
-------------------------------
Strands agent tool: retrieve ranked vulnerable facilities (schools, hospitals).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]


def get_ranked_sites(top_n: int = 10, site_type: str | None = None) -> list[dict[str, Any]]:
    """
    Return top ranked facilities ordered by risk score.
    Filters optionally by site_type ('school' | 'hospital').
    """
    data_dir = Path(os.environ.get("AERIS_DATA_DIR", _REPO_ROOT / "data" / "live"))
    ranked_path = data_dir / "ranked_sites.json"

    if not ranked_path.exists():
        return []

    with ranked_path.open() as f:
        data = json.load(f)

    sites = data.get("sites", [])
    if site_type:
        sites = [s for s in sites if s.get("type") == site_type]

    return sites[:top_n]
