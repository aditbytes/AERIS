"""
ingest/firms/fetch_fires.py
---------------------------
NASA FIRMS active-fire fetcher.

API:  https://firms.modaps.eosdis.nasa.gov/api/
Endpoint pattern:
  GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE}

Sources used (in priority order):
  VIIRS_NOAA21_NRT   — NOAA-21 (most current; launched 2022)
  VIIRS_NOAA20_NRT   — NOAA-20 (operational since 2018)
  VIIRS_SNPP_NRT     — Suomi-NPP (retiring Nov 2026 per NASA announcement)

Output schema  →  docs/data-contracts.md  (`fires.json`):
  {
    "generated_at": "<ISO-8601 UTC>",
    "source": "NASA FIRMS VIIRS_NOAA21_NRT+VIIRS_NOAA20_NRT+VIIRS_SNPP_NRT",
    "bbox": [west, south, east, north],
    "fires": [
      {
        "id":            "f_<N>",
        "lat":           <float>,
        "lon":           <float>,
        "acq_time":      "<ISO-8601 UTC>",   # acq_date + acq_time (HHMM)
        "frp_mw":        <float>,
        "brightness_k":  <float>,            # bright_ti4 (VIIRS) / brightness (MODIS)
        "confidence":    "low" | "nominal" | "high",
        "satellite":     "<VIIRS_NOAA21_NRT | …>"
      },
      …
    ]
  }

Confidence mapping:
  VIIRS: 'l' → 'low', 'n' → 'nominal', 'h' → 'high'
  MODIS: '0–40' → 'low', '41–80' → 'nominal', '81–100' → 'high'

Usage (CLI):
  python -m ingest.firms.fetch_fires
  python -m ingest.firms.fetch_fires --bbox 73.5,28.0,77.5,32.5 --days 1 --sources VIIRS_NOAA21_NRT
"""

from __future__ import annotations

import csv
import io
import logging
import math
import os
from datetime import datetime, timezone
from typing import Any

from ingest.common.http import UpstreamError, get

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

# Default: project bbox — Punjab, Haryana, NW Delhi (west, south, east, north)
DEFAULT_BBOX: list[float] = [73.5, 28.0, 77.5, 32.5]
DEFAULT_DAY_RANGE: int = 1

# Sources in priority order (newest satellite first)
DEFAULT_SOURCES: list[str] = [
    "VIIRS_NOAA21_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_SNPP_NRT",
]

# Confidence thresholds
# VIIRS uses letter codes; MODIS uses integer 0–100
_VIIRS_CONF_MAP: dict[str, str] = {"l": "low", "n": "nominal", "h": "high"}

# Drop low-confidence detections by default (project rule)
_KEEP_CONFIDENCE: set[str] = {"nominal", "high"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalise_viirs_confidence(raw: str) -> str:
    """Map VIIRS single-letter confidence to project string."""
    cleaned = raw.strip().lower()
    return _VIIRS_CONF_MAP.get(cleaned, "nominal")  # unknown → nominal


def _normalise_modis_confidence(raw: str) -> str:
    """Map MODIS integer confidence (0–100) to project string."""
    try:
        val = int(raw.strip())
    except ValueError:
        return "nominal"
    if val <= 40:
        return "low"
    if val <= 80:
        return "nominal"
    return "high"


def _parse_acq_time(acq_date: str, acq_time: str) -> str:
    """
    Convert FIRMS CSV acq_date (YYYY-MM-DD) + acq_time (HHMM) → ISO-8601 UTC.

    FIRMS documents acq_time as integer HHMM (e.g. "0542" or "542").
    """
    hhmm = acq_time.strip().zfill(4)
    hh = int(hhmm[:2])
    mm = int(hhmm[2:])
    date_str = acq_date.strip()
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(
        hour=hh, minute=mm, second=0, tzinfo=timezone.utc
    )
    return dt.isoformat().replace("+00:00", "Z")


def _parse_csv(raw_csv: str, source_name: str) -> list[dict[str, Any]]:
    """
    Parse the FIRMS CSV text into a list of normalised fire dicts.

    Returns an empty list for empty or header-only responses.
    Raises ValueError on unrecognised CSV structure.
    """
    reader = csv.DictReader(io.StringIO(raw_csv.strip()))
    # Normalise field names: strip whitespace
    rows = []
    for row in reader:
        row = {k.strip(): v.strip() for k, v in row.items()}
        rows.append(row)

    if not rows:
        logger.info("[FIRMS] %s: no fire detections in response.", source_name)
        return []

    # Detect VIIRS vs MODIS by presence of 'bright_ti4' vs 'brightness'
    sample = rows[0]
    is_viirs = "bright_ti4" in sample

    fires: list[dict[str, Any]] = []
    for row in rows:
        try:
            lat = float(row.get("latitude", row.get("latitude", "NaN")))
            lon = float(row.get("longitude", "NaN"))
            frp = float(row.get("frp", "NaN"))
            acq_date = row.get("acq_date", "")
            acq_time_raw = row.get("acq_time", "0000")

            if is_viirs:
                brightness = float(row.get("bright_ti4", "NaN"))
                conf_raw = row.get("confidence", "n")
                confidence = _normalise_viirs_confidence(conf_raw)
            else:
                brightness = float(row.get("brightness", "NaN"))
                conf_raw = row.get("confidence", "50")
                confidence = _normalise_modis_confidence(conf_raw)

        except (ValueError, KeyError) as exc:
            logger.warning("[FIRMS] Skipping malformed row from %s: %s — %s", source_name, row, exc)
            continue

        if any(math.isnan(x) for x in [lat, lon, frp, brightness]):
            logger.warning("[FIRMS] Skipping row with NaN values from %s: %s", source_name, row)
            continue

        fires.append(
            {
                "lat": lat,
                "lon": lon,
                "acq_time": _parse_acq_time(acq_date, acq_time_raw),
                "frp_mw": frp,
                "brightness_k": brightness,
                "confidence": confidence,
                "satellite": source_name,
            }
        )

    return fires


def _build_url(key: str, source: str, bbox: list[float], day_range: int) -> str:
    """
    Build the FIRMS Area CSV URL.

    URL structure:
      /api/area/csv/{MAP_KEY}/{SOURCE}/{W},{S},{E},{N}/{DAY_RANGE}

    The key is embedded in the path (not a query param), so we never log this URL.
    """
    w, s, e, n = bbox
    return f"{FIRMS_BASE}/{key}/{source}/{w},{s},{e},{n}/{day_range}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_fires(
    bbox: list[float] | None = None,
    day_range: int = DEFAULT_DAY_RANGE,
    key: str | None = None,
    sources: list[str] | None = None,
    min_confidence: set[str] = _KEEP_CONFIDENCE,
) -> dict[str, Any]:
    """
    Fetch active-fire detections from NASA FIRMS.

    Parameters
    ----------
    bbox:
        [west, south, east, north] in WGS84 degrees.
        Defaults to the project NCR bbox.
    day_range:
        Number of past days to query (1–10). Default 1.
    key:
        FIRMS MAP_KEY. Reads ``FIRMS_MAP_KEY`` env var if not given.
    sources:
        FIRMS source identifiers to query.
        Defaults to DEFAULT_SOURCES.
    min_confidence:
        Set of confidence strings to keep.
        Default: {'nominal', 'high'} (drops 'low').

    Returns
    -------
    dict
        fires.json contract object.

    Raises
    ------
    EnvironmentError:
        If no FIRMS_MAP_KEY is available.
    UpstreamError:
        If the FIRMS API returns a non-retriable error.
    """
    if bbox is None:
        bbox = DEFAULT_BBOX
    if sources is None:
        sources = DEFAULT_SOURCES

    key = key or os.environ.get("FIRMS_MAP_KEY", "")
    if not key:
        raise EnvironmentError(
            "FIRMS_MAP_KEY environment variable is not set. "
            "Get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/"
        )

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    all_fires: list[dict[str, Any]] = []
    sources_used: list[str] = []
    sources_failed: list[str] = []

    for source in sources:
        url = _build_url(key, source, bbox, day_range)
        # Log only the safe part (no key)
        safe_url = f"{FIRMS_BASE}/***/{source}/{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}/{day_range}"
        logger.info("[FIRMS] Fetching %s from %s", source, safe_url)

        try:
            resp = get(url, source_name=f"FIRMS/{source}", timeout=30)
        except UpstreamError as exc:
            logger.error("[FIRMS] Failed to fetch %s: %s", source, exc)
            sources_failed.append(source)
            continue

        text = resp.text
        # FIRMS returns an error message (not CSV) when the key is invalid
        if text.strip().startswith("You don't") or "error" in text[:50].lower():
            logger.error("[FIRMS] API returned error for %s: %.200s", source, text)
            sources_failed.append(source)
            continue

        fires = _parse_csv(text, source)
        logger.info("[FIRMS] %s: parsed %d detections.", source, len(fires))

        # Apply confidence filter
        kept = [f for f in fires if f["confidence"] in min_confidence]
        logger.info(
            "[FIRMS] %s: %d kept after confidence filter (min: %s).",
            source,
            len(kept),
            min_confidence,
        )
        all_fires.extend(kept)
        sources_used.append(source)

    # If every requested source failed, raise so callers (handler/CLI) do not
    # write a misleading empty snapshot with a fresh success timestamp.
    if sources_failed and not sources_used:
        raise UpstreamError(
            "FIRMS",
            None,
            f"All FIRMS sources failed: {', '.join(sources_failed)}. "
            "No data written; existing snapshot preserved.",
        )

    # Assign IDs
    for i, fire in enumerate(all_fires, start=1):
        fire["id"] = f"f_{i:04d}"

    source_label = "+".join(sources_used) if sources_used else "+".join(sources)
    result: dict[str, Any] = {
        "generated_at": generated_at,
        "source": f"NASA FIRMS {source_label}",
        "bbox": bbox,
        "fires": all_fires,
    }
    if sources_failed:
        result["sources_failed"] = sources_failed
        logger.warning(
            "[FIRMS] Partial result: %d source(s) failed: %s",
            len(sources_failed),
            sources_failed,
        )
    logger.info("[FIRMS] Total: %d fires from %s.", len(all_fires), source_label)
    return result
