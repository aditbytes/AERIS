"""
ingest/population/build_population.py
--------------------------------------
WorldPop population-grid builder.

Data source:
  WorldPop Global High Resolution Population Denominators Project
  URL: https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/0_Mosaicked/ppp_2020_1km_Aggregated.tif
  DOI: 10.5258/SOTON/WP00647
  Citation: WorldPop (www.worldpop.org) and CIESIN, Columbia University (2018).
  License: Creative Commons Attribution 4.0 International (CC BY 4.0)
  Description: Estimated total number of people per grid-cell, 2020 global mosaic.
               Resolution: 30 arc-seconds (~1 km at equator). WGS84.
               Units: number of people per pixel.

Output schema → docs/data-contracts.md (`population.json`):
  {
    "cell_km":   1.0,
    "generated_at": "<ISO-8601 UTC>",
    "source": {
      "name":    "WorldPop Global High Resolution Population Denominators",
      "url":     "https://data.worldpop.org/...",
      "doi":     "10.5258/SOTON/WP00647",
      "year":    2020,
      "license": "CC BY 4.0"
    },
    "bbox":     [west, south, east, north],
    "cells": [
      {"lat": <float>, "lon": <float>, "pop": <int>}
    ]
  }

Process:
  1. Download the WorldPop global GeoTIFF to data/raw/ (only once; skips if present).
  2. Clip to the project bbox using rasterio windowed reads.
  3. Extract per-cell population counts; skip nodata cells and cells with pop ≤ 0.
  4. Write data/live/population.json.

Requirements:
  rasterio, numpy  (see requirements.txt)

Usage (CLI):
  python -m ingest.population.build_population
  python -m ingest.population.build_population --bbox 73.5,28.0,77.5,32.5
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ingest.common.http import get as http_get

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WORLDPOP_URL = (
    "https://data.worldpop.org/GIS/Population/"
    "Global_2000_2020/2020/0_Mosaicked/ppp_2020_1km_Aggregated.tif"
)
WORLDPOP_DOI = "10.5258/SOTON/WP00647"
WORLDPOP_YEAR = 2020
WORLDPOP_LICENSE = "CC BY 4.0"
WORLDPOP_CITATION = (
    "WorldPop (www.worldpop.org — School of Geography and Environmental Science, "
    "University of Southampton; Department of Geography and Geosciences, University "
    "of Louisville; Departement de Geographie, Universite de Namur) and Center for "
    "International Earth Science Information Network (CIESIN), Columbia University "
    "(2018). Global High Resolution Population Denominators Project. "
    f"https://dx.doi.org/{WORLDPOP_DOI}"
)

DEFAULT_BBOX: list[float] = [73.5, 28.0, 77.5, 32.5]

_REPO_ROOT = Path(__file__).resolve().parents[3]
_DATA_RAW = _REPO_ROOT / "data" / "raw"
_TIFF_NAME = "ppp_2020_1km_Aggregated.tif"


# ---------------------------------------------------------------------------
# Download helper
# ---------------------------------------------------------------------------

def _download_worldpop(dest: Path) -> None:
    """
    Stream-download the WorldPop global GeoTIFF to `dest`.

    Uses chunked download to handle the ~829 MB file without loading it all
    into memory. Shows progress every 100 MB.
    """
    logger.info("[WorldPop] Downloading %s → %s", WORLDPOP_URL, dest)
    dest.parent.mkdir(parents=True, exist_ok=True)

    resp = http_get(
        WORLDPOP_URL,
        source_name="WorldPop",
        timeout=600,  # 10 min for large file
        stream=True,
    )

    chunk_size = 8 * 1024 * 1024  # 8 MB chunks
    downloaded = 0
    with dest.open("wb") as fh:
        for chunk in resp.iter_content(chunk_size=chunk_size):
            if chunk:
                fh.write(chunk)
                downloaded += len(chunk)
                if downloaded % (100 * 1024 * 1024) == 0:
                    logger.info("[WorldPop] Downloaded %.0f MB...", downloaded / 1e6)

    logger.info("[WorldPop] Download complete: %.1f MB", downloaded / 1e6)


# ---------------------------------------------------------------------------
# Raster processing
# ---------------------------------------------------------------------------

def _clip_and_extract(tiff_path: Path, bbox: list[float]) -> list[dict[str, Any]]:
    """
    Clip the WorldPop GeoTIFF to `bbox` and extract per-cell population counts.

    Returns a list of {"lat": float, "lon": float, "pop": int} dicts,
    one per populated cell (pop > 0, not nodata).

    Requires rasterio and numpy.
    """
    try:
        import numpy as np
        import rasterio
        from rasterio.windows import from_bounds
    except ImportError as exc:
        raise ImportError(
            "rasterio and numpy are required for population processing. "
            "Install them: pip install rasterio numpy"
        ) from exc

    w, s, e, n = bbox
    cells: list[dict[str, Any]] = []

    with rasterio.open(tiff_path) as src:
        # Compute the pixel window that covers our bbox
        window = from_bounds(w, s, e, n, transform=src.transform)
        # Clamp window to dataset bounds
        col_off = max(0, int(window.col_off))
        row_off = max(0, int(window.row_off))
        width = min(int(window.width), src.width - col_off)
        height = min(int(window.height), src.height - row_off)

        if width <= 0 or height <= 0:
            logger.warning("[WorldPop] Bbox %s does not overlap raster extent.", bbox)
            return []

        clipped_window = rasterio.windows.Window(col_off, row_off, width, height)
        data = src.read(1, window=clipped_window)
        nodata = src.nodata

        # Get the affine transform for the clipped window
        transform = src.window_transform(clipped_window)

        # Build (row, col) index arrays for all valid cells
        rows, cols = np.where((data != nodata) & (data > 0))
        logger.info("[WorldPop] Clipped grid: %d×%d pixels, %d non-zero cells.",
                    height, width, len(rows))

        for r, c in zip(rows, cols):
            # Pixel centre coordinates (upper-left of pixel + half-pixel offset)
            lon_centre = transform.c + (c + 0.5) * transform.a
            lat_centre = transform.f + (r + 0.5) * transform.e  # e is negative (north-up)
            pop_val = float(data[r, c])
            cells.append({
                "lat": round(lat_centre, 6),
                "lon": round(lon_centre, 6),
                "pop": int(round(pop_val)),
            })

    return cells


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_population(
    bbox: list[float] | None = None,
    tiff_path: Path | None = None,
    force_download: bool = False,
) -> dict[str, Any]:
    """
    Build the population grid for `bbox` from the WorldPop 2020 raster.

    Parameters
    ----------
    bbox:
        [west, south, east, north]. Defaults to the project bbox.
    tiff_path:
        Explicit path to an already-downloaded GeoTIFF. If None, downloads
        to data/raw/ (skips download if file already exists unless force_download).
    force_download:
        Re-download even if the GeoTIFF already exists locally.

    Returns
    -------
    dict
        population.json contract object.

    Raises
    ------
    ImportError:
        If rasterio or numpy is not installed.
    UpstreamError:
        If the WorldPop download fails.
    """
    if bbox is None:
        bbox = DEFAULT_BBOX

    if tiff_path is None:
        tiff_path = _DATA_RAW / _TIFF_NAME

    if force_download or not tiff_path.exists():
        _download_worldpop(tiff_path)
    else:
        logger.info("[WorldPop] Using cached raster at %s", tiff_path)

    logger.info("[WorldPop] Clipping to bbox %s", bbox)
    cells = _clip_and_extract(tiff_path, bbox)

    if not cells:
        logger.warning("[WorldPop] No populated cells found in bbox %s.", bbox)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "cell_km": 1.0,
        "generated_at": generated_at,
        "source": {
            "name": "WorldPop Global High Resolution Population Denominators",
            "url": WORLDPOP_URL,
            "doi": WORLDPOP_DOI,
            "year": WORLDPOP_YEAR,
            "license": WORLDPOP_LICENSE,
            "citation": WORLDPOP_CITATION,
        },
        "bbox": bbox,
        "cells": cells,
    }
