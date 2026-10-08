"""
models/plume/corridor.py
------------------------
Lagrangian plume dispersion & corridor generator.
Advects pollution from detected fire sources along GFS wind vectors over 0–24 hours.
Follows docs/members/pritam-models.md and docs/data-contracts.md.
"""

from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from models.common.geo import destination_point, haversine_km

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DATA_LIVE = _REPO_ROOT / "data" / "live"


def _parse_time(t: str) -> datetime:
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def _hour_at(hours: list[dict[str, Any]], when: datetime) -> dict[str, Any]:
    """Forecast hour closest to ``when`` (persistence beyond the forecast range)."""
    return min(hours, key=lambda h: abs((_parse_time(h["t"]) - when).total_seconds()))


def find_nearest_wind(lat: float, lon: float, wind_data: dict[str, Any], when: datetime) -> tuple[float, float, float]:
    """
    Find real forecast wind (u_ms, v_ms, pblh_m) at (lat, lon) at time ``when``.
    Uses inverse distance weighting across the closest 4 grid points.
    Raises ValueError if wind.json has no usable values; wind is never invented.
    """
    points = [p for p in wind_data.get("points", []) if p.get("hours")]
    if not points:
        raise ValueError("wind.json has no forecast points; cannot advect a corridor")

    dists = sorted(((haversine_km(lat, lon, p["lat"], p["lon"]), p) for p in points), key=lambda x: x[0])

    total_weight = 0.0
    u_sum, v_sum, pblh_sum, pblh_weight = 0.0, 0.0, 0.0, 0.0

    for d, p in dists[:4]:
        h = _hour_at(p["hours"], when)
        if h.get("u_ms") is None or h.get("v_ms") is None:
            continue
        weight = 1.0 / max(d, 0.1)
        u_sum += weight * float(h["u_ms"])
        v_sum += weight * float(h["v_ms"])
        total_weight += weight
        if h.get("pblh_m") is not None:
            pblh_sum += weight * float(h["pblh_m"])
            pblh_weight += weight

    if total_weight == 0:
        raise ValueError(f"No wind values near ({lat:.3f}, {lon:.3f}) at {when.isoformat()}")

    pblh_val = pblh_sum / pblh_weight if pblh_weight else float("nan")
    return (u_sum / total_weight, v_sum / total_weight, pblh_val)


def predict_corridor(
    sources_data: dict[str, Any],
    wind_data: dict[str, Any],
    forecast_hours: int = 24,
    start: datetime | None = None,
) -> dict[str, Any]:
    """
    Predict advection corridor for each source and output GeoJSON FeatureCollection.
    Hour 0 is ``start`` (default: now, UTC); each hour uses the forecast for that time.
    Produces:
      - 'band' Polygons for 0-2h, 2-4h, 4-8h, 8-24h
      - 'centerline' LineString with points_eta_hours
    """
    if start is None:
        start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    features: list[dict[str, Any]] = []

    # Bands definition: (hour_from, hour_to)
    time_bands = [(0, 2), (2, 4), (4, 8), (8, 24)]

    sources = sources_data.get("sources", [])

    for src in sources:
        src_id = src["id"]
        start_lat = src["lat"]
        start_lon = src["lon"]
        emission_str = float(src.get("emission_strength", 0.5))
        base_radius = float(src.get("radius_km", 10.0))

        # Advect hourly trajectory
        trajectory = []  # list of (hour, lat, lon, sigma_km)
        curr_lat, curr_lon = start_lat, start_lon

        for hr in range(forecast_hours + 1):
            # Puff spread grows over travel time: sigma = base_radius + 2.5 * sqrt(hr)
            sigma_km = base_radius + 3.2 * math.sqrt(hr)
            trajectory.append((hr, curr_lat, curr_lon, sigma_km))

            if hr < forecast_hours:
                u, v, _ = find_nearest_wind(curr_lat, curr_lon, wind_data, start + timedelta(hours=hr))
                # Note: u is eastward (lon), v is northward (lat).
                # Move in meters over 1 hour (3600 seconds)
                dx_km = (u * 3600.0) / 1000.0
                dy_km = (v * 3600.0) / 1000.0

                dist_km = math.hypot(dx_km, dy_km)
                # Mathematical bearing from displacement
                bearing = (math.degrees(math.atan2(dx_km, dy_km)) + 360) % 360
                curr_lat, curr_lon = destination_point(curr_lat, curr_lon, dist_km, bearing)

        # 1. Create centerline LineString
        centerline_coords = [[round(lon, 5), round(lat, 5)] for _, lat, lon, _ in trajectory]
        eta_hours = [hr for hr, _, _, _ in trajectory]

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": centerline_coords,
            },
            "properties": {
                "kind": "centerline",
                "source_id": src_id,
                "points_eta_hours": eta_hours,
            },
        })

        # 2. Create corridor band Polygons for each time band
        traj_by_hour = {t[0]: t for t in trajectory}

        for hour_from, hour_to in time_bands:
            band_pts = [traj_by_hour[h] for h in range(hour_from, min(hour_to + 1, forecast_hours + 1)) if h in traj_by_hour]
            if len(band_pts) < 2:
                continue

            left_rim = []
            right_rim = []

            for i, (hr, lat, lon, sigma) in enumerate(band_pts):
                # Calculate tangent angle along trajectory
                if i < len(band_pts) - 1:
                    next_pt = band_pts[i + 1]
                    dlat = next_pt[1] - lat
                    dlon = next_pt[2] - lon
                else:
                    prev_pt = band_pts[i - 1]
                    dlat = lat - prev_pt[1]
                    dlon = lon - prev_pt[2]

                bearing = (math.degrees(math.atan2(dlon, dlat)) + 360) % 360
                left_bearing = (bearing - 90) % 360
                right_bearing = (bearing + 90) % 360

                lat_l, lon_l = destination_point(lat, lon, sigma, left_bearing)
                lat_r, lon_r = destination_point(lat, lon, sigma, right_bearing)

                left_rim.append([round(lon_l, 5), round(lat_l, 5)])
                right_rim.append([round(lon_r, 5), round(lat_r, 5)])

            # Polygon ring: start left rim -> end -> reverse right rim -> close ring
            poly_ring = left_rim + list(reversed(right_rim)) + [left_rim[0]]

            # Concentration decay: exp(-travel_time / 18h)
            avg_h = (hour_from + hour_to) / 2.0
            decay = math.exp(-avg_h / 20.0)
            pm25_delta = round(max(15.0, 160.0 * emission_str * decay), 1)
            risk = round(min(0.98, max(0.20, emission_str * (1.0 - hour_from / 30.0))), 2)

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [poly_ring],
                },
                "properties": {
                    "kind": "band",
                    "source_id": src_id,
                    "hour_from": hour_from,
                    "hour_to": hour_to,
                    "risk": risk,
                    "pm25_delta_ugm3": pm25_delta,
                },
            })

    return {
        "type": "FeatureCollection",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "forecast_start": start.isoformat().replace("+00:00", "Z"),
        "wind_generated_at": wind_data.get("generated_at"),
        "features": features,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    sources_path = _DATA_LIVE / "sources.json"
    wind_path = _DATA_LIVE / "wind.json"

    if not sources_path.exists():
        logger.error("Missing %s. Run cluster.py first.", sources_path)
        raise SystemExit(1)
    if not wind_path.exists():
        logger.error("Missing %s", wind_path)
        raise SystemExit(1)

    with sources_path.open() as f:
        sources_data = json.load(f)
    with wind_path.open() as f:
        wind_data = json.load(f)

    corridor_geojson = predict_corridor(sources_data, wind_data, forecast_hours=24)

    out_path = _DATA_LIVE / "corridor.geojson"
    with out_path.open("w") as f:
        json.dump(corridor_geojson, f, indent=2)

    logger.info("Generated %s with %d features", out_path, len(corridor_geojson["features"]))


if __name__ == "__main__":
    main()
