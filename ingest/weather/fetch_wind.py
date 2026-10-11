"""
ingest/weather/fetch_wind.py
-----------------------------
Open-Meteo wind and boundary-layer height fetcher.

API:  https://open-meteo.com/en/docs  (no key required)
Endpoint:
  GET https://api.open-meteo.com/v1/forecast
    ?latitude={lat1,lat2,...}
    &longitude={lon1,lon2,...}
    &hourly=wind_speed_10m,wind_direction_10m,boundary_layer_height
    &wind_speed_unit=ms
    &forecast_days=4
    &timezone=UTC

Output schema → docs/data-contracts.md (`wind.json`):
  {
    "generated_at": "<ISO-8601 UTC>",
    "source": "Open-Meteo GFS",
    "points": [
      {
        "lat": <float>,
        "lon": <float>,
        "hours": [
          {
            "t":            "<ISO-8601 UTC>",
            "u_ms":         <float>,   # eastward (+east = +u)
            "v_ms":         <float>,   # northward (+north = +v)
            "speed_ms":     <float>,
            "dir_from_deg": <int>,     # compass direction wind blows FROM
            "pblh_m":       <float | null>
          }
        ]
      }
    ]
  }

Wind-vector convention (from docs/members/meenal-data-exposure.md):
  u = -speed * sin(dir_rad)   # eastward component
  v = -speed * cos(dir_rad)   # northward component
  where dir_rad is the meteorological "from" direction in radians.

  Physical interpretation:
    A north wind (dir_from = 0°) blows FROM the north TO the south:
      u = -speed * sin(0)   = 0
      v = -speed * cos(0)   = -speed  (southward → v < 0 ✓)

Grid:
  0.25° spacing covering the project bbox [73.5, 28.0, 77.5, 32.5]
  (~17 × 19 = 323 points; sent in a single API call as comma-separated lists)

Usage (CLI):
  python -m ingest.weather.fetch_wind
  python -m ingest.weather.fetch_wind --bbox 73.5,28.0,77.5,32.5 --step 0.25
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

from ingest.common.http import UpstreamError, get

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"

DEFAULT_BBOX: list[float] = [73.5, 28.0, 77.5, 32.5]
DEFAULT_STEP_DEG: float = 0.25
# Calendar-day responses start at today's UTC midnight and end at the final
# day's 23:00 sample. Two days never provide 48 future hours from capture;
# even three days fall short after 23:00. Four days buffer the 48-hour pipeline
# horizon without extrapolation. Actual per-point coverage is still validated.
DEFAULT_FORECAST_DAYS: int = 4

# Open-Meteo allows max 300 locations per call; our grid at 0.25° has ~323 →
# split into two requests if needed.
MAX_LOCATIONS_PER_CALL = 200


# ---------------------------------------------------------------------------
# Wind-vector conversion
# ---------------------------------------------------------------------------

def wind_components(speed_ms: float, dir_from_deg: float) -> tuple[float, float]:
    """
    Convert meteorological wind speed and direction to (u, v) components.

    Convention (per project docs/members/meenal-data-exposure.md):
      u_ms = -speed * sin(dir_rad)   # eastward
      v_ms = -speed * cos(dir_rad)   # northward

    A north wind (blows FROM the north, dir_from = 0°) gives:
      u = 0, v = -speed  →  v < 0 (wind going southward) ✓

    Parameters
    ----------
    speed_ms : float
        Wind speed in m/s.
    dir_from_deg : float
        Meteorological direction the wind blows FROM, in degrees clockwise from north (0–360).

    Returns
    -------
    (u_ms, v_ms) : tuple[float, float]
        Eastward and northward wind components in m/s.
    """
    dir_rad = math.radians(dir_from_deg)
    u = -speed_ms * math.sin(dir_rad)
    v = -speed_ms * math.cos(dir_rad)
    return u, v


# ---------------------------------------------------------------------------
# Grid building
# ---------------------------------------------------------------------------

def build_grid(
    bbox: list[float], step_deg: float = DEFAULT_STEP_DEG
) -> list[tuple[float, float]]:
    """
    Build a regular grid of (lat, lon) points covering bbox at step_deg spacing.

    Parameters
    ----------
    bbox : [west, south, east, north]
    step_deg : grid spacing in degrees

    Returns
    -------
    List of (lat, lon) tuples.
    """
    w, s, e, n = bbox
    points: list[tuple[float, float]] = []
    lat = s
    while lat <= n + 1e-9:
        lon = w
        while lon <= e + 1e-9:
            points.append((round(lat, 4), round(lon, 4)))
            lon += step_deg
        lat += step_deg
    return points


# ---------------------------------------------------------------------------
# Open-Meteo API call
# ---------------------------------------------------------------------------

def _fetch_batch(
    lats: list[float],
    lons: list[float],
    forecast_days: int,
) -> list[dict[str, Any]]:
    """
    Fetch hourly wind data for a batch of (lat, lon) pairs.

    Returns the raw ``hourly`` blocks from the API response, one per point.
    """
    params = {
        "latitude": ",".join(str(lat) for lat in lats),
        "longitude": ",".join(str(lon) for lon in lons),
        "hourly": "wind_speed_10m,wind_direction_10m,boundary_layer_height",
        "wind_speed_unit": "ms",
        "forecast_days": forecast_days,
        "timezone": "UTC",
        "format": "json",
    }
    resp = get(
        OPEN_METEO_FORECAST,
        params=params,
        source_name="Open-Meteo",
        timeout=60,
    )
    raw = resp.json()

    # Open-Meteo returns a single dict if one point, list if multiple
    if isinstance(raw, dict):
        return [raw]
    return raw


def _parse_point_hourly(
    lat: float,
    lon: float,
    hourly: dict[str, Any],
) -> dict[str, Any]:
    """
    Parse the hourly block for one grid point into the wind.json format.
    """
    times = hourly.get("time", [])
    speeds = hourly.get("wind_speed_10m", [])
    dirs = hourly.get("wind_direction_10m", [])
    pblhs = hourly.get("boundary_layer_height", [None] * len(times))

    hours: list[dict[str, Any]] = []
    for i, t_str in enumerate(times):
        try:
            speed = float(speeds[i]) if speeds[i] is not None else None
            direction = float(dirs[i]) if dirs[i] is not None else None
        except (TypeError, ValueError, IndexError):
            logger.debug("Skipping malformed hourly entry at index %d for point (%s, %s)", i, lat, lon)
            continue

        if speed is None or direction is None or not math.isfinite(speed) or not math.isfinite(direction) or speed < 0 or not 0 <= direction <= 360:
            # Missing value — skip this hour (do not fabricate)
            continue

        u, v = wind_components(speed, direction)

        pblh_raw = pblhs[i] if i < len(pblhs) else None
        try:
            pblh: float | None = float(pblh_raw) if pblh_raw is not None else None
        except (TypeError, ValueError):
            pblh = None
        if pblh is not None and (not math.isfinite(pblh) or pblh < 0):
            pblh = None

        # Normalise timestamp to ISO-8601 UTC
        try:
            dt = datetime.fromisoformat(t_str.replace("Z", "+00:00"))
            # The request explicitly asks for timezone=UTC. A naive API time is
            # UTC, not the execution host's local timezone (e.g. Asia/Kolkata).
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            t_iso = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except (ValueError, AttributeError):
            continue

        hours.append(
            {
                "t": t_iso,
                "u_ms": round(u, 4),
                "v_ms": round(v, 4),
                "speed_ms": round(speed, 4),
                "dir_from_deg": int(round(direction)) % 360,
                "pblh_m": round(pblh, 1) if pblh is not None else None,
            }
        )

    return {"lat": lat, "lon": lon, "hours": hours}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_wind(
    bbox: list[float] | None = None,
    step_deg: float = DEFAULT_STEP_DEG,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
) -> dict[str, Any]:
    """
    Fetch hourly wind and boundary-layer-height forecasts from Open-Meteo.

    Parameters
    ----------
    bbox:
        [west, south, east, north] in WGS84 degrees.
    step_deg:
        Grid spacing in degrees (default 0.25).
    forecast_days:
        Calendar days to request (default 4, buffering 48 hours after capture).
        This requests coverage; it does not guarantee usable wind/PBLH samples.

    Returns
    -------
    dict
        wind.json contract object.

    Raises
    ------
    UpstreamError:
        If Open-Meteo API returns a non-retriable error for all batches.
    """
    if bbox is None:
        bbox = DEFAULT_BBOX

    grid = build_grid(bbox, step_deg)
    logger.info("[Wind] Grid: %d points at %.2f° spacing", len(grid), step_deg)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Split grid into batches ≤ MAX_LOCATIONS_PER_CALL
    batches = [grid[i : i + MAX_LOCATIONS_PER_CALL] for i in range(0, len(grid), MAX_LOCATIONS_PER_CALL)]
    all_points: list[dict[str, Any]] = []
    batches_succeeded = 0
    batches_failed = 0
    points_incomplete = 0

    for batch_idx, batch in enumerate(batches, start=1):
        lats = [p[0] for p in batch]
        lons = [p[1] for p in batch]
        logger.info("[Wind] Fetching batch %d/%d (%d points)", batch_idx, len(batches), len(batch))

        try:
            raw_list = _fetch_batch(lats, lons, forecast_days)
        except UpstreamError as exc:
            logger.error("[Wind] Batch %d failed: %s", batch_idx, exc)
            batches_failed += 1
            continue

        batches_succeeded += 1
        for i, raw_point in enumerate(raw_list):
            lat, lon = batch[i]
            hourly = raw_point.get("hourly") or {}
            point_data = _parse_point_hourly(lat, lon, hourly)
            if not point_data["hours"] or len(point_data["hours"]) != len(hourly.get("time", [])) or any(h["pblh_m"] is None for h in point_data["hours"]):
                points_incomplete += 1
            all_points.append(point_data)

    if not all_points:
        raise UpstreamError("Open-Meteo", None, "No wind data retrieved for any grid point.")

    coverage_complete = batches_failed == 0
    usable_hourly_coverage_complete = coverage_complete and len(all_points) == len(grid) and points_incomplete == 0
    if batches_failed:
        logger.warning(
            "[Wind] Partial coverage: %d/%d batch(es) failed. %d grid points retrieved.",
            batches_failed, len(batches), len(all_points),
        )
    logger.info("[Wind] Parsed %d grid points.", len(all_points))

    result: dict[str, Any] = {
        "generated_at": generated_at,
        "source": "Open-Meteo GFS",
        "coverage_complete": coverage_complete,
        "usable_hourly_coverage_complete": usable_hourly_coverage_complete,
        "points": all_points,
        "points_requested": len(grid),
        "points_incomplete": points_incomplete,
    }
    if batches_failed:
        result["batches_total"] = len(batches)
        result["batches_succeeded"] = batches_succeeded
        result["batches_failed"] = batches_failed
    return result
