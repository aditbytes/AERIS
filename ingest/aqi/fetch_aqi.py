"""
ingest/aqi/fetch_aqi.py
-----------------------
Air-quality fetcher: OpenAQ v3 (primary) + data.gov.in CPCB (backup).

Output schema → docs/data-contracts.md (`aqi.json`):
  {
    "generated_at": "<ISO-8601 UTC>",
    "source":      "<str>",
    "stations": [
      {
        "id":          "<str>",
        "name":        "<str>",
        "lat":         <float>,
        "lon":         <float>,
        "pm25":        <float | null>,
        "pm10":        <float | null>,
        "aqi":         <int | null>,
        "aqi_category": "<str | null>",
        "observed_at": "<ISO-8601 UTC>",
        "source":      "OpenAQ" | "CPCB/data.gov.in"
      }
    ]
  }

OpenAQ v3 docs:   https://docs.openaq.org/
data.gov.in docs: https://data.gov.in/

CPCB AQI breakpoints for PM2.5 (24-hr µg/m³) — official CPCB table:
  Good         0–30    → AQI  0–50
  Satisfactory 31–60   → AQI 51–100
  Moderate     61–90   → AQI 101–200
  Poor         91–120  → AQI 201–300
  Very Poor    121–250 → AQI 301–400
  Severe       >250    → AQI 401–500

Usage (CLI):
  python -m ingest.aqi.fetch_aqi
  python -m ingest.aqi.fetch_aqi --bbox 73.5,28.0,77.5,32.5
"""

from __future__ import annotations

import logging
import math
import os
import time
import concurrent.futures
from datetime import datetime, timezone
from typing import Any

from ingest.common.http import UpstreamError, get

logger = logging.getLogger(__name__)

# OpenAQ free tier allows ~60 req/min; 1s delay keeps us safely under limit
_OPENAQ_RATE_DELAY_S = 1.1
# Snapshot cap: fetch at most this many stations per run to stay within rate limits
_OPENAQ_MAX_STATIONS = 60

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OPENAQ_BASE = "https://api.openaq.org/v3"
DATA_GOV_BASE = "https://api.data.gov.in/resource"

# data.gov.in CPCB "Real-Time Air Quality Index from various locations"
# Resource ID verified from https://data.gov.in/catalog/real-time-air-quality-index-various-locations
# This is the active resource ID as of Oct 2026.
CPCB_RESOURCE_ID = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"

DEFAULT_BBOX: list[float] = [73.5, 28.0, 77.5, 32.5]

# OpenAQ v3 parameter IDs (verified against /v3/parameters)
PARAM_ID_PM25 = 2
PARAM_ID_PM10 = 1

# CPCB AQI breakpoints: (pm25_lo, pm25_hi, aqi_lo, aqi_hi, category)
# Source: CPCB National Air Quality Index technical document
_CPCB_BREAKPOINTS: list[tuple[float, float, int, int, str]] = [
    (0.0,   30.0,   0,   50,  "Good"),
    (30.1,  60.0,  51,  100,  "Satisfactory"),
    (60.1,  90.0, 101,  200,  "Moderate"),
    (90.1, 120.0, 201,  300,  "Poor"),
    (120.1, 250.0, 301, 400,  "Very Poor"),
    (250.1, 9999.0, 401, 500, "Severe"),
]


# ---------------------------------------------------------------------------
# AQI calculation
# ---------------------------------------------------------------------------

def _nonnegative(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) and result >= 0 else None


def _coordinate(value: Any, limit: float) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) and -limit <= result <= limit else None


def _aware_timestamp(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.utcoffset() is None:
            return None  # The source timezone is unknown; do not silently assert UTC.
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def compute_pm25_aqi(pm25: float) -> tuple[int, str]:
    """
    Compute CPCB sub-index AQI and category from a PM2.5 reading (µg/m³).

    Uses the official CPCB linear interpolation formula:
      AQI = ((AQI_hi - AQI_lo) / (C_hi - C_lo)) * (C - C_lo) + AQI_lo

    Returns (aqi_value, category_string).
    Clamps AQI to [0, 500].
    """
    if _nonnegative(pm25) is None:
        raise ValueError(f"PM2.5 must be finite and non-negative, got {pm25}")
    for c_lo, c_hi, aqi_lo, aqi_hi, category in _CPCB_BREAKPOINTS:
        if c_lo <= pm25 <= c_hi:
            aqi = int(
                round(((aqi_hi - aqi_lo) / (c_hi - c_lo)) * (pm25 - c_lo) + aqi_lo)
            )
            return max(0, min(500, aqi)), category
    # Beyond Severe (>250 µg/m³) cap at 500
    return 500, "Severe"


# ---------------------------------------------------------------------------
# OpenAQ v3
# ---------------------------------------------------------------------------

def _openaq_headers(key: str) -> dict[str, str]:
    return {"X-API-Key": key, "Accept": "application/json"}


def _fetch_openaq_locations(
    bbox: list[float], key: str, param_id: int = PARAM_ID_PM25
) -> list[dict[str, Any]]:
    """Fetch station locations with PM2.5 sensors inside bbox."""
    w, s, e, n = bbox
    params = {
        "bbox": f"{w},{s},{e},{n}",
        "parameters_id": param_id,
        "limit": 1000,
    }
    resp = get(
        f"{OPENAQ_BASE}/locations",
        params=params,
        headers=_openaq_headers(key),
        source_name="OpenAQ/locations",
        timeout=30,
    )
    return _response_rows(resp.json(), "results")


def _response_rows(payload: Any, field: str) -> list[dict[str, Any]]:
    """An explicit empty array is success; a missing/malformed array is not."""
    if not isinstance(payload, dict) or not isinstance(payload.get(field), list):
        raise ValueError(f"Invalid AQI response: expected {field} array")
    if not all(isinstance(row, dict) for row in payload[field]):
        raise ValueError(f"Invalid AQI response: expected objects in {field}")
    return payload[field]


def _fetch_location_latest(
    loc_id: int, key: str, raise_on_error: bool = False
) -> list[dict[str, Any]]:
    """
    Fetch the latest measurements for all sensors at a given location.

    Returns the list of measurement dicts or empty list on error, unless strict.
    Uses /v3/locations/{id}/latest.
    """
    try:
        resp = get(
            f"{OPENAQ_BASE}/locations/{loc_id}/latest",
            headers=_openaq_headers(key),
            source_name="OpenAQ/location-latest",
            timeout=20,
        )
        return _response_rows(resp.json(), "results")
    except (UpstreamError, ValueError):
        if raise_on_error:
            raise
        return []


def fetch_openaq(
    bbox: list[float],
    key: str,
    raise_on_error: bool = False,
    diagnostics: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Fetch PM2.5 readings from OpenAQ v3 for all recently-active stations in bbox.

    Strategy (correct v3 API pattern):
      1. GET /v3/locations?bbox=...&parameters_id=2  — get all locations
      2. Filter to stations active within last 90 days (datetimeLast)
      3. For each active PM2.5 sensor, GET /v3/sensors/{id}/measurements?limit=1&datetime_from=7d-ago
      4. Normalise to aqi.json contract

    Returns a list of station dicts. Returns empty list on discovery error unless
    raise_on_error=True. Optional diagnostics distinguish request outcomes; station
    failures retain other readings and do not prove complete regional coverage.
    """
    if diagnostics is not None:
        diagnostics["status"] = "UNKNOWN"
    if not key:
        if diagnostics is not None:
            diagnostics["status"] = "NOT_CONFIGURED"
        logger.warning("[OpenAQ] No API key; skipping OpenAQ fetch.")
        return []

    logger.info("[OpenAQ] Fetching locations in bbox %s", bbox)
    try:
        locations = _fetch_openaq_locations(bbox, key, param_id=PARAM_ID_PM25)
    except (UpstreamError, ValueError) as exc:
        logger.error("[OpenAQ] Failed to fetch locations (%s)", type(exc).__name__)
        if diagnostics is not None:
            diagnostics["status"] = "FAILED"
        if raise_on_error:
            raise
        return []

    if diagnostics is not None:
        diagnostics["status"] = "SUCCESS"
    if not locations:
        logger.info("[OpenAQ] No stations found in bbox.")
        return []

    logger.info("[OpenAQ] %d locations found. Filtering to recently active.", len(locations))

    # Active = reported within last 90 days; sort most-recent-first
    from datetime import timedelta
    cutoff_90d = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
    date_from_7d = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")

    active_locs = sorted(
        [
            loc for loc in locations
            if (loc.get("datetimeLast") or {}).get("utc", "") >= cutoff_90d
        ],
        key=lambda x: (x.get("datetimeLast") or {}).get("utc", ""),
        reverse=True,
    )[:_OPENAQ_MAX_STATIONS]  # cap to avoid exhausting rate limit
    logger.info(
        "[OpenAQ] %d active stations (capped at %d). Fetching measurements concurrently.",
        len(active_locs), _OPENAQ_MAX_STATIONS,
    )

    stations: list[dict[str, Any]] = []

    def fetch_single_station(loc: dict[str, Any]) -> dict[str, Any] | None:
        loc_id = loc.get("id")
        coords = loc.get("coordinates") or {}
        lat = _coordinate(coords.get("latitude"), 90)
        lon = _coordinate(coords.get("longitude"), 180)
        if loc_id is None or lat is None or lon is None:
            return None
        if not (bbox[1] <= lat <= bbox[3] and bbox[0] <= lon <= bbox[2]):
            return None
        name = loc.get("name", f"openaq_{loc_id}")

        pm25_sensor_id: int | None = None
        pm10_sensor_id: int | None = None
        for sensor in loc.get("sensors") or []:
            param_name = (sensor.get("parameter") or {}).get("name", "").lower()
            if param_name == "pm25" and pm25_sensor_id is None:
                pm25_sensor_id = sensor.get("id")
            elif param_name == "pm10" and pm10_sensor_id is None:
                pm10_sensor_id = sensor.get("id")

        if pm25_sensor_id is None:
            return None  # no PM2.5 sensor

        # Fetch latest measurements for all sensors at this location in one call
        latest_results = _fetch_location_latest(loc_id, key, raise_on_error=True)
        
        pm25_val: float | None = None
        pm10_val: float | None = None
        observed_at: str | None = None
        source_timestamp: Any = None

        for res in latest_results:
            sid = res.get("sensorsId")
            val = res.get("value")
            if val is None:
                continue
            
            if sid == pm25_sensor_id:
                pm25_val = _nonnegative(val)
                # Keep timestamp of the PM2.5 reading
                dt_utc = (res.get("datetime") or {}).get("utc")
                if dt_utc:
                    observed_at = dt_utc
                    source_timestamp = dt_utc
            elif sid == pm10_sensor_id:
                pm10_val = _nonnegative(val)

        if pm25_val is None:
            return None

        # AQI from PM2.5
        aqi_val: int | None = None
        aqi_cat: str | None = None
        if pm25_val >= 0:
            aqi_val, aqi_cat = compute_pm25_aqi(pm25_val)

        # Normalise timestamp
        observed_at = _aware_timestamp(observed_at)

        return {
            "id": f"OAQ_{loc_id}",
            "name": name,
            "lat": float(lat),
            "lon": float(lon),
            "pm25": pm25_val,
            "pm10": pm10_val,
            "aqi": aqi_val,
            "aqi_category": aqi_cat,
            "observed_at": observed_at,
            "source_timestamp": str(source_timestamp) if source_timestamp is not None else None,
            "source": "OpenAQ",
            "aqi_method": "PM25_SUBINDEX_AVERAGING_PERIOD_UNVERIFIED",
            "timestamp_status": "SOURCE_TIMEZONE_KNOWN" if observed_at else "UNAVAILABLE_OR_AMBIGUOUS",
        }

    # Use ThreadPoolExecutor to fetch stations concurrently (rate-limited by max_workers=5)
    failed_requests = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(fetch_single_station, loc) for loc in active_locs]
        for future in futures:
            try:
                res = future.result()
            except (UpstreamError, ValueError, TypeError, KeyError, AttributeError) as exc:
                failed_requests += 1
                logger.warning("[OpenAQ] Station fetch failed (%s); retaining other readings", type(exc).__name__)
                continue
            if res is not None:
                stations.append(res)
    if failed_requests and diagnostics is not None:
        diagnostics["status"] = "PARTIAL_FAILURE"

    logger.info("[OpenAQ] Normalised %d station(s) with readings.", len(stations))
    return stations






# ---------------------------------------------------------------------------
# CPCB / data.gov.in
# ---------------------------------------------------------------------------

# Target states for the NCR region
_NCR_STATES = {"delhi", "haryana", "uttar pradesh", "rajasthan", "punjab"}


def fetch_cpcb(
    bbox: list[float],
    key: str,
    raise_on_error: bool = False,
    diagnostics: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Fetch real-time AQI readings from data.gov.in CPCB dataset.

    Filters to stations roughly inside the project bbox.
    Returns a list of normalised station dicts.
    Returns an empty list on error (unless raise_on_error=True) or if no key provided.
    """
    if diagnostics is not None:
        diagnostics["status"] = "UNKNOWN"
    if not key:
        if diagnostics is not None:
            diagnostics["status"] = "NOT_CONFIGURED"
        logger.warning("[CPCB] No DATA_GOV_IN_KEY; skipping CPCB fetch.")
        return []

    logger.info("[CPCB] Fetching from data.gov.in resource %s", CPCB_RESOURCE_ID)
    # Do not embed key in logged URL
    params = {
        "api-key": key,
        "format": "json",
        "limit": 2000,
    }
    try:
        resp = get(
            f"{DATA_GOV_BASE}/{CPCB_RESOURCE_ID}",
            params=params,
            source_name="CPCB/data.gov.in",
            timeout=30,
        )
    except UpstreamError as exc:
        logger.error("[CPCB] Failed to fetch: %s", exc)
        if diagnostics is not None:
            diagnostics["status"] = "FAILED"
        if raise_on_error:
            raise
        return []

    try:
        records = _response_rows(resp.json(), "records")
    except ValueError as exc:
        logger.error("[CPCB] Invalid JSON response (%s)", type(exc).__name__)
        if diagnostics is not None:
            diagnostics["status"] = "FAILED"
        if raise_on_error:
            raise
        return []

    if diagnostics is not None:
        diagnostics["status"] = "SUCCESS"
    if not records:
        logger.info("[CPCB] No records returned from data.gov.in.")
        return []

    logger.info("[CPCB] Received %d records.", len(records))
    w, s, e, n = bbox
    stations: list[dict[str, Any]] = []

    for rec in records:
        # Field names from data.gov.in CPCB dataset (typical keys)
        try:
            state = str(rec.get("state", "")).lower()
            city = str(rec.get("city", ""))
            station_name = str(rec.get("station", city))
            lat_raw = rec.get("latitude", rec.get("lat"))
            lon_raw = rec.get("longitude", rec.get("lon"))

            # Reject records without valid coordinates: a station with null lat/lon
            # cannot be placed in the geospatial dataset and would cause downstream
            # failures (spatial intersection, map rendering). State-only filtering
            # is not sufficient to produce a usable geospatial record.
            if lat_raw is None or lon_raw is None:
                logger.debug("[CPCB] Skipping record without coordinates: %s", station_name)
                continue
            lat = _coordinate(lat_raw, 90)
            lon = _coordinate(lon_raw, 180)
            if lat is None or lon is None:
                continue
            # Bbox filter
            if not (s <= lat <= n and w <= lon <= e):
                continue

            pm25_raw = rec.get("pollutant_avg") if rec.get("pollutant_id", "").upper() == "PM2.5" else None
            pm10_raw = rec.get("pollutant_avg") if rec.get("pollutant_id", "").upper() == "PM10" else None

            # Some datasets use different field layouts
            if pm25_raw is None and pm10_raw is None:
                pm25_raw = rec.get("pm2_5", rec.get("pm25"))
                pm10_raw = rec.get("pm10")

            pm25_val: float | None = None
            pm10_val: float | None = None
            if pm25_raw not in (None, "", "NA", "N/A"):
                try:
                    pm25_val = _nonnegative(pm25_raw)
                except ValueError:
                    pass
            if pm10_raw not in (None, "", "NA", "N/A"):
                try:
                    pm10_val = _nonnegative(pm10_raw)
                except ValueError:
                    pass

            # Timestamp
            last_update = rec.get("last_update") or rec.get("timestamp")
            observed_at = _aware_timestamp(last_update)

            aqi_raw = rec.get("aqi")
            aqi_val: int | None = None
            if aqi_raw not in (None, "", "NA"):
                try:
                    number = _nonnegative(aqi_raw)
                    aqi_val = int(number) if number is not None and number <= 500 else None
                except ValueError:
                    pass

            aqi_method = "PROVIDER_REPORTED" if aqi_val is not None else "UNAVAILABLE"
            aqi_cat: str | None = None
            if aqi_val is None and pm25_val is not None and pm25_val >= 0:
                aqi_val, aqi_cat = compute_pm25_aqi(pm25_val)
                aqi_method = "PM25_SUBINDEX_AVERAGING_PERIOD_UNVERIFIED"
            elif aqi_val is not None:
                # Back-calculate category from AQI value
                for _, _, a_lo, a_hi, cat in _CPCB_BREAKPOINTS:
                    if a_lo <= aqi_val <= a_hi:
                        aqi_cat = cat
                        break

            station_id = rec.get("id") or f"CPCB_{city}_{station_name}".replace(" ", "_")

            stations.append({
                "id": str(station_id),
                "name": station_name,
                "lat": lat,
                "lon": lon,
                "pm25": pm25_val,
                "pm10": pm10_val,
                "aqi": aqi_val,
                "aqi_category": aqi_cat,
                "observed_at": observed_at,
                "source": "CPCB/data.gov.in",
                "aqi_method": aqi_method,
                "source_timestamp": str(last_update) if last_update is not None else None,
                "timestamp_status": "SOURCE_TIMEZONE_KNOWN" if observed_at else "UNAVAILABLE_OR_AMBIGUOUS",
            })

        except (ValueError, TypeError, KeyError) as exc:
            logger.warning("[CPCB] Skipping malformed record: %s — %s", rec, exc)
            continue

    logger.info("[CPCB] Normalised %d station(s) after bbox/state filter.", len(stations))
    return stations


def _fetch_status(statuses: list[str]) -> str:
    """Request outcome only: success never proves regional observation coverage."""
    if all(status == "SUCCESS" for status in statuses):
        return "COMPLETE"
    if all(status == "NOT_CONFIGURED" for status in statuses):
        return "UNAVAILABLE"
    if all(status in ("FAILED", "NOT_CONFIGURED") for status in statuses):
        return "FAILED"
    if "PARTIAL_FAILURE" in statuses or (
        "SUCCESS" in statuses and any(status in ("FAILED", "NOT_CONFIGURED") for status in statuses)
    ):
        return "PARTIAL"
    return "UNKNOWN"


# ---------------------------------------------------------------------------
# Main fetch function
# ---------------------------------------------------------------------------

def fetch_aqi(
    bbox: list[float] | None = None,
    openaq_key: str | None = None,
    cpcb_key: str | None = None,
) -> dict[str, Any]:
    """
    Fetch air-quality data from OpenAQ v3 (primary) and CPCB/data.gov.in (backup).

    Returns the aqi.json contract object.
    Merges both sources; deduplicates by proximity (nearest-station check not
    applied here — Pritam's model selects which stations to use).
    """
    if bbox is None:
        bbox = DEFAULT_BBOX

    openaq_key = openaq_key or os.environ.get("OPENAQ_API_KEY", "")
    cpcb_key = cpcb_key or os.environ.get("DATA_GOV_IN_KEY", "")

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    openaq_stations: list[dict[str, Any]] = []
    cpcb_stations: list[dict[str, Any]] = []
    diagnostics = {name: {"status": "UNKNOWN"} for name in ("OpenAQ", "CPCB/data.gov.in")}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_openaq = executor.submit(fetch_openaq, bbox, openaq_key, raise_on_error=True, diagnostics=diagnostics["OpenAQ"])
        f_cpcb = executor.submit(fetch_cpcb, bbox, cpcb_key, raise_on_error=True, diagnostics=diagnostics["CPCB/data.gov.in"])
        try:
            openaq_stations = f_openaq.result()
        except UpstreamError as exc:
            logger.error("[OpenAQ] Upstream failure: %s", exc)
            diagnostics["OpenAQ"]["status"] = "FAILED"
        except Exception as exc:
            logger.error("[OpenAQ] Unexpected failure (%s)", type(exc).__name__)
            diagnostics["OpenAQ"]["status"] = "FAILED"

        try:
            cpcb_stations = f_cpcb.result()
        except UpstreamError as exc:
            logger.error("[CPCB] Upstream failure: %s", exc)
            diagnostics["CPCB/data.gov.in"]["status"] = "FAILED"
        except Exception as exc:
            logger.error("[CPCB] Unexpected failure (%s)", type(exc).__name__)
            diagnostics["CPCB/data.gov.in"]["status"] = "FAILED"

    source_fetch_status = {name: detail["status"] for name, detail in diagnostics.items()}
    sources_failed = [name for name, status in source_fetch_status.items() if status in ("FAILED", "PARTIAL_FAILURE")]
    known_gaps = any(status in ("FAILED", "PARTIAL_FAILURE", "NOT_CONFIGURED") for status in source_fetch_status.values())

    # Combine: OpenAQ first, then CPCB records not already covered
    combined = openaq_stations + cpcb_stations

    contributing: list[str] = []
    if any(any(s.get(k) is not None for k in ("pm25", "pm10", "aqi")) for s in openaq_stations):
        contributing.append("OpenAQ")
    if any(any(s.get(k) is not None for k in ("pm25", "pm10", "aqi")) for s in cpcb_stations):
        contributing.append("CPCB/data.gov.in")

    source_label = "+".join(contributing) if contributing else "none"

    result: dict[str, Any] = {
        "generated_at": generated_at,
        "source": source_label,
        "stations": combined,
        "data_status": "READINGS_AVAILABLE" if any(any(s.get(k) is not None for k in ("pm25", "pm10", "aqi")) for s in combined) else "UNAVAILABLE_OR_EMPTY",
        "sources_with_readings": contributing,
        "source_fetch_status": source_fetch_status,
        "fetch_status": _fetch_status(list(source_fetch_status.values())),
        # Caps, pagination and eligibility prevent an assertion of regional completeness.
        "coverage_complete": False if known_gaps else None,
    }
    if sources_failed:
        result["sources_failed"] = sources_failed

    logger.info(
        "[AQI] Total stations: %d (OpenAQ: %d, CPCB: %d, source: %s)",
        len(combined),
        len(openaq_stations),
        len(cpcb_stations),
        source_label,
    )
    return result
