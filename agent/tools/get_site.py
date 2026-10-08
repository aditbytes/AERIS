"""
agent/tools/get_site.py
-----------------------
Strands agent tool: retrieve detailed information for a single site by ID.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]


def get_site(site_id: str) -> dict[str, Any] | None:
    """
    Return detailed information for a specific facility by its site_id.
    """
    data_dir = Path(os.environ.get("AERIS_DATA_DIR", _REPO_ROOT / "data" / "live"))
    ranked_path = data_dir / "ranked_sites.json"

    if ranked_path.exists():
        with ranked_path.open() as f:
            data = json.load(f)
        for s in data.get("sites", []):
            if s.get("site_id") == site_id:
                return s

    # Fallback to sites.geojson
    sites_path = data_dir / "sites.geojson"
    if sites_path.exists():
        with sites_path.open() as f:
            data = json.load(f)
        for f_feat in data.get("features", []):
            props = f_feat.get("properties", {})
            if props.get("id") == site_id:
                return props

    return None
