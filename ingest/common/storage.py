"""
ingest/common/storage.py
------------------------
Local-file storage stub for the output writer interface.

Aditya will replace/extend this with an S3 implementation.
The interface is: write_json(key, obj) where `key` is the filename stem
(e.g. "fires") and `obj` is the dict/list to serialise.

Local output lands in data/live/<key>.json (or data/live/<key>.geojson
if the object contains a GeoJSON FeatureCollection).
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Resolved at import time relative to the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_DATA_LIVE = _REPO_ROOT / "data" / "live"


def write_json(key: str, obj: Any, *, geojson: bool = False) -> Path:
    """
    Write ``obj`` as JSON to ``data/live/<key>.json`` (or ``.geojson``).

    Parameters
    ----------
    key:
        Filename stem, e.g. ``"fires"``.
    obj:
        JSON-serialisable object (dict, list, …).
    geojson:
        If True, use the ``.geojson`` extension.

    Returns
    -------
    Path
        The path the file was written to.
    """
    _DATA_LIVE.mkdir(parents=True, exist_ok=True)
    ext = ".geojson" if geojson else ".json"
    out_path = _DATA_LIVE / f"{key}{ext}"
    with out_path.open("w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
    logger.info("Wrote %s (%d bytes)", out_path, out_path.stat().st_size)
    return out_path


def read_json(key: str, *, geojson: bool = False) -> Any:
    """
    Read a previously-written snapshot from ``data/live/<key>.json``.

    Raises
    ------
    FileNotFoundError
        If no snapshot exists yet.
    """
    ext = ".geojson" if geojson else ".json"
    in_path = _DATA_LIVE / f"{key}{ext}"
    if not in_path.exists():
        raise FileNotFoundError(
            f"No snapshot at {in_path}. Run the fetcher first to generate live data."
        )
    with in_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)
