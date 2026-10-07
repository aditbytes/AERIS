"""
ingest/sites/fetch_sites.py
----------------------------
OpenStreetMap Overpass API fetcher for schools and hospitals.

Attribution required: © OpenStreetMap contributors
API:  https://overpass-api.de/api/interpreter
Docs: https://wiki.openstreetmap.org/wiki/Overpass_API

Queries:
  amenity=school
  amenity=hospital
  healthcare=hospital

Output schema → docs/data-contracts.md (`sites.geojson`):
  {
    "type": "FeatureCollection",
    "attribution": "© OpenStreetMap contributors",
    "generated_at": "<ISO-8601 UTC>",
    "features": [
      {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
          "id":        "s_<N>",
          "name":      "<str>",
          "type":      "school" | "hospital",
          "occupancy": <int | null>,
          "source":    "OSM"
        }
      }
    ]
  }

Notes:
  - Ways and relations are converted to their centroid point (via `center` output).
  - No fabricated capacity/occupancy values: we read OSM tags `capacity`/`beds`
    if present; otherwise occupancy is null (NOT estimated, per project rules
    against fabricated data). The project doc Task 5 mentions defaults, but
    the strict project rule "Do not fabricate capacity/occupancy values" takes
    precedence; we preserve null and note this in the README.
  - One bulk query, result cached to data/live/sites.geojson. Not polled.
  - Deduplication: by (name, lat/lon within 50 m) to remove OSM duplicates.

Usage (CLI):
  python -m ingest.sites.fetch_sites
  python -m ingest.sites.fetch_sites --bbox 76.5,28.0,77.8,29.2
"""

from __future__ import annotations

import hashlib
import logging
import math
from datetime import datetime, timezone
from typing import Any

from ingest.common.http import UpstreamError, post

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OVERPASS_URL = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
# Fallback: https://overpass.kumi.systems/api/interpreter
# Note: overpass-api.de blocks some IPs; mail.ru mirror is reliable

_OVERPASS_USER_AGENT = "AERIS-disaster-response/1.0 (academic project)"

# NCR bbox for schools/hospitals (slightly tighter than fire bbox)
# west, south, east, north — covers Delhi + surrounding NCR districts
DEFAULT_BBOX: list[float] = [76.5, 28.0, 77.8, 29.2]

OSM_ATTRIBUTION = "© OpenStreetMap contributors"

# Deduplication radius in metres
_DEDUP_RADIUS_M = 50.0


# ---------------------------------------------------------------------------
# Overpass query builder
# ---------------------------------------------------------------------------

def _build_query(bbox: list[float]) -> str:
    """
    Build an Overpass QL query for schools and hospitals within bbox.

    Uses `out center tags` so that ways and relations also return a centroid.
    """
    w, s, e, n = bbox
    # Overpass bbox order: south,west,north,east
    bb = f"{s},{w},{n},{e}"
    return f"""[out:json][timeout:120];
(
  nwr["amenity"="school"]({bb});
  nwr["amenity"="hospital"]({bb});
  nwr["healthcare"="hospital"]({bb});
);
out center tags;"""


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _element_latlon(el: dict[str, Any]) -> tuple[float, float] | None:
    """Extract (lat, lon) from an OSM element (node, way, or relation)."""
    etype = el.get("type")
    if etype == "node":
        lat = el.get("lat")
        lon = el.get("lon")
    else:
        # way / relation: use `center` block produced by `out center tags`
        center = el.get("center") or {}
        lat = center.get("lat")
        lon = center.get("lon")

    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in metres between two WGS84 points."""
    R = 6_371_000.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(
        math.radians(lat2)
    ) * math.sin(d_lon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def _site_type(tags: dict[str, str]) -> str:
    """Determine whether the site is a 'school' or 'hospital'."""
    amenity = tags.get("amenity", "")
    healthcare = tags.get("healthcare", "")
    if amenity == "hospital" or healthcare == "hospital":
        return "hospital"
    return "school"


def _occupancy(tags: dict[str, str]) -> int | None:
    """
    Read occupancy from OSM tags.

    For hospitals: 'beds' tag.
    For schools:   'capacity' tag.
    Returns None if the tag is absent or non-numeric.
    We do NOT insert estimated defaults (project rule: no fabricated data).
    """
    for key in ("beds", "capacity"):
        raw = tags.get(key)
        if raw:
            try:
                return int(raw)
            except ValueError:
                pass
    return None


def _element_to_feature(el: dict[str, Any], idx: int) -> dict[str, Any] | None:
    """Convert an OSM element to a GeoJSON Feature, or return None if unusable."""
    latlon = _element_latlon(el)
    if latlon is None:
        logger.debug("OSM element %s has no usable coordinates; skipping.", el.get("id"))
        return None

    lat, lon = latlon
    tags: dict[str, str] = el.get("tags") or {}
    name = tags.get("name") or tags.get("name:en") or f"site_{el.get('id', idx)}"
    site_type = _site_type(tags)
    occ = _occupancy(tags)

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "id": f"s_{idx:04d}",
            "name": name,
            "type": site_type,
            "occupancy": occ,
            "source": "OSM",
            "_osm_id": el.get("id"),
            "_osm_type": el.get("type"),
        },
    }


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _dedup_features(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Remove OSM duplicate physical locations within _DEDUP_RADIUS_M.

    Strategy:
    - Sort by number of tags (prefer richer records).
    - For each feature, if it is within _DEDUP_RADIUS_M of an already-kept
      feature of the same type, drop it.
    """
    kept: list[dict[str, Any]] = []
    for feat in features:
        coords = feat["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]
        site_type = feat["properties"]["type"]
        duplicate = False
        for k in kept:
            k_coords = k["geometry"]["coordinates"]
            k_lon, k_lat = k_coords[0], k_coords[1]
            if k["properties"]["type"] != site_type:
                continue
            dist = _haversine_m(lat, lon, k_lat, k_lon)
            if dist < _DEDUP_RADIUS_M:
                duplicate = True
                break
        if not duplicate:
            kept.append(feat)
    return kept


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_sites(bbox: list[float] | None = None) -> dict[str, Any]:
    """
    Fetch schools and hospitals from OpenStreetMap Overpass API.

    Parameters
    ----------
    bbox:
        [west, south, east, north] in WGS84 degrees.
        Defaults to the NCR bbox.

    Returns
    -------
    dict
        GeoJSON FeatureCollection in the sites.geojson contract format.

    Raises
    ------
    UpstreamError:
        If the Overpass API is unreachable or returns an error.
    ValueError:
        If the API response is not valid JSON.
    """
    if bbox is None:
        bbox = DEFAULT_BBOX

    query = _build_query(bbox)
    logger.info("[Sites] Querying Overpass API for bbox %s", bbox)

    resp = post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": _OVERPASS_USER_AGENT},
        source_name="Overpass",
        timeout=130,
    )

    try:
        raw = resp.json()
    except ValueError as exc:
        raise ValueError(f"Overpass returned non-JSON response: {exc}") from exc

    elements = raw.get("elements", [])
    logger.info("[Sites] Overpass returned %d elements.", len(elements))

    if not elements:
        logger.warning("[Sites] No schools or hospitals returned for bbox %s.", bbox)

    features: list[dict[str, Any]] = []
    for i, el in enumerate(elements, start=1):
        feat = _element_to_feature(el, i)
        if feat is not None:
            features.append(feat)

    logger.info("[Sites] Parsed %d valid features before dedup.", len(features))
    features = _dedup_features(features)
    logger.info("[Sites] %d features after deduplication.", len(features))

    # Re-assign sequential IDs after dedup
    for i, feat in enumerate(features, start=1):
        feat["properties"]["id"] = f"s_{i:04d}"

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "type": "FeatureCollection",
        "attribution": OSM_ATTRIBUTION,
        "generated_at": generated_at,
        "features": features,
    }
