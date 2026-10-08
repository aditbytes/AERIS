"""Gaussian concentration grids and contract-compliant plume corridor GeoJSON."""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, mapping
from shapely.geometry.polygon import orient

from models.plume.advect import (
    Frame, LocalProjection, PlumeParams, WindField, parse_time, resolve_params,
    simulate_source, utc_string, validate_sources,
)
from pipeline.contracts import check_corridor

logger = logging.getLogger(__name__)
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_HOURS = 48
TIME_BANDS = ((0, 2), (2, 4), (4, 8), (8, 24))


def find_nearest_wind(lat: float, lon: float, wind_data: dict[str, Any],
                      when: datetime) -> tuple[float, float, float]:
    """Compatibility interface; performs IDW plus linear temporal interpolation."""
    return WindField(wind_data).interpolate(lat, lon, when)


@dataclass(frozen=True)
class Grid:
    x_min_m: float
    y_min_m: float
    cell_m: float
    nx: int
    ny: int

    @property
    def x_centers(self) -> np.ndarray:
        return self.x_min_m + (np.arange(self.nx) + 0.5) * self.cell_m

    @property
    def y_centers(self) -> np.ndarray:
        return self.y_min_m + (np.arange(self.ny) + 0.5) * self.cell_m


def make_grid(frames: list[Frame], params: PlumeParams) -> Grid:
    """Bound actual puff trajectories plus Gaussian support; allocate per source."""
    bounds = [(p.x_m, p.y_m, params.kernel_sigma_cutoff * p.sigma_m)
              for frame in frames for p in frame.puffs]
    if any(not math.isfinite(value) for bound in bounds for value in bound):
        raise ValueError("Puff position/spread exceeds the finite numeric range")
    cell = params.grid_cell_m
    extent = (min(x - r for x, y, r in bounds), min(y - r for x, y, r in bounds),
              max(x + r for x, y, r in bounds), max(y + r for x, y, r in bounds))
    if max(math.hypot(x, y) for x in (extent[0], extent[2]) for y in (extent[1], extent[3])) > params.max_projection_radius_km * 1000:
        raise ValueError("Concentration grid exceeds the supported local projection radius")
    xmin = math.floor(min(x - r for x, y, r in bounds) / cell) * cell
    ymin = math.floor(min(y - r for x, y, r in bounds) / cell) * cell
    xmax = math.ceil(max(x + r for x, y, r in bounds) / cell) * cell
    ymax = math.ceil(max(y + r for x, y, r in bounds) / cell) * cell
    nx, ny = max(1, round((xmax - xmin) / cell)), max(1, round((ymax - ymin) / cell))
    if nx * ny > params.max_grid_cells:
        raise ValueError(f"Plume grid requires {nx * ny} cells; maximum is {params.max_grid_cells}. "
                         "Choose a coarser explicit grid or a shorter covered forecast.")
    if max(math.hypot(x, y) for x in (xmin, xmax) for y in (ymin, ymax)) > params.max_projection_radius_km * 1000:
        raise ValueError("Concentration grid exceeds the supported local projection radius")
    return Grid(xmin, ymin, cell, nx, ny)


def concentration_grid(frame: Frame, grid: Grid, params: PlumeParams) -> np.ndarray:
    """Cell-centre Gaussian increments in ug/m3; never add an ambient background."""
    result = np.zeros((grid.ny, grid.nx), dtype=float)
    xs, ys = grid.x_centers, grid.y_centers
    for puff in frame.puffs:
        radius = params.kernel_sigma_cutoff * puff.sigma_m
        x0, x1 = np.searchsorted(xs, [puff.x_m - radius, puff.x_m + radius], side="left")
        y0, y1 = np.searchsorted(ys, [puff.y_m - radius, puff.y_m + radius], side="left")
        # Include an exact upper endpoint; the radial support mask is authoritative.
        x1, y1 = min(grid.nx, int(x1) + 1), min(grid.ny, int(y1) + 1)
        dx = xs[int(x0):x1] - puff.x_m
        dy = ys[int(y0):y1] - puff.y_m
        r2 = dy[:, None] ** 2 + dx[None, :] ** 2
        sigma2 = puff.sigma_m ** 2
        amplitude = (params.concentration_scale_ug * puff.strength * puff.decay
                     / (2 * math.pi * sigma2 * max(puff.pblh_m, params.pblh_floor_m)))
        local = amplitude * np.exp(-r2 / (2 * sigma2))
        local[r2 > radius * radius] = 0
        result[int(y0):y1, int(x0):x1] += local
    if not np.isfinite(result).all():
        raise ValueError("Concentration calculation produced a nonfinite value")
    return result


def _polygon_parts(geometry: Any) -> list[Polygon]:
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [polygon for part in geometry.geoms for polygon in _polygon_parts(part)]
    return []


def _wgs84_polygon(polygon: Polygon, projection: LocalProjection) -> Polygon:
    polygon = shapely.transform(polygon, lambda coords: np.column_stack(
        projection.inverse.transform(coords[:, 0], coords[:, 1], errcheck=True)))
    polygon = orient(shapely.normalize(polygon), sign=1.0)
    coords = shapely.get_coordinates(polygon)
    if not np.isfinite(coords).all() or np.any(np.abs(coords[:, 0]) > 180) or np.any(np.abs(coords[:, 1]) > 90):
        raise ValueError("Forecast polygon cannot be represented as finite WGS84 coordinates")
    for ring in [polygon.exterior, *polygon.interiors]:
        if any(abs(a[0] - b[0]) > 180 for a, b in zip(ring.coords, list(ring.coords)[1:])):
            raise ValueError("Regional plume polygon crosses the antimeridian; geographic splitting is required")
    if not polygon.is_valid:
        raise ValueError("Projected plume polygon is invalid after WGS84 transformation")
    return polygon


def _band_features(source_id: str, hour_from: int, hour_to: int, values: np.ndarray,
                   grid: Grid, projection: LocalProjection, params: PlumeParams) -> list[dict[str, Any]]:
    rows, cols = np.nonzero(values >= params.threshold_ugm3)
    if not len(rows):
        return []
    x = grid.x_min_m + cols * grid.cell_m
    y = grid.y_min_m + rows * grid.cell_m
    geometry = shapely.union_all(shapely.box(x, y, x + grid.cell_m, y + grid.cell_m))
    if not geometry.is_valid:
        geometry = shapely.make_valid(geometry)
    polygons = sorted(_polygon_parts(geometry), key=lambda poly: (poly.bounds, shapely.normalize(poly).wkb))
    peak = float(values[rows, cols].max())
    risk = min(1.0, max(0.0, -math.expm1(-peak / params.risk_scale_ugm3)))
    return [{
        "type": "Feature",
        "geometry": mapping(_wgs84_polygon(polygon, projection)),
        "properties": {"kind": "band", "source_id": source_id, "hour_from": hour_from,
                       "hour_to": hour_to, "risk": risk, "pm25_delta_ugm3": peak},
    } for polygon in polygons]


def _centerline(source_id: str, frames: list[Frame], projection: LocalProjection) -> dict[str, Any] | None:
    # A stationary mass centre has no valid nonzero-length LineString. Do not invent motion.
    if all(math.hypot(frame.center_x_m, frame.center_y_m) <= 1e-7 for frame in frames):
        return None
    points = []
    for frame in frames:
        lat, lon = projection.latlon(frame.center_x_m, frame.center_y_m)
        points.append([lon, lat])
    if any(abs(a[0] - b[0]) > 180 for a, b in zip(points, points[1:])):
        raise ValueError("Regional plume centreline crosses the antimeridian; geographic splitting is required")
    if not LineString(points).is_valid:
        raise ValueError("Simulated centreline is geometrically invalid")
    return {
        "type": "Feature", "geometry": {"type": "LineString", "coordinates": points},
        "properties": {"kind": "centerline", "source_id": source_id,
                       "points_eta_hours": [frame.eta_hours for frame in frames]},
    }


def predict_corridor(
    sources_data: dict[str, Any],
    wind_data: dict[str, Any],
    hours: int = DEFAULT_HOURS,
    params: PlumeParams | dict[str, Any] | None = None,
    *,
    forecast_hours: int | None = None,
    start: datetime | None = None,
) -> dict[str, Any]:
    """Deterministic puff baseline; default reference is the latest input capture.

    forecast_hours is a backward-compatible alias for hours. An explicit start
    enables replay, but cannot precede the latest source observation. Wind time
    coverage is strict. Output bands stop at 24 h; centreline extends to hours.
    """
    params = resolve_params(params)
    if forecast_hours is not None:
        if hours != DEFAULT_HOURS and hours != forecast_hours:
            raise ValueError("hours and forecast_hours disagree")
        hours = forecast_hours
    if not isinstance(hours, int) or isinstance(hours, bool) or not 1 <= hours <= DEFAULT_HOURS:
        raise ValueError("Forecast hours must be an integer in [1, 48]")
    generated, sources = validate_sources(sources_data)
    wind = WindField(wind_data, params)
    if start is None:
        if generated is None:
            raise ValueError("sources.generated_at is required unless an explicit start is supplied")
        start = max(generated, wind.generated_at)
    if not isinstance(start, datetime) or start.utcoffset() is None:
        raise ValueError("Forecast start must be a timezone-aware datetime")
    start = start.astimezone(timezone.utc)
    if sources and start < max(source.last_seen for source in sources):
        raise ValueError("Forecast start precedes a source observation; choose an explicit later reference")
    try:
        end = start + timedelta(hours=hours)
    except OverflowError as exc:
        raise ValueError("Forecast end exceeds the supported datetime range") from exc
    if start < wind.first_time or end > wind.last_time:
        raise ValueError(f"Requested {hours} h forecast {utc_string(start)}..{utc_string(end)} "
                         f"is outside real wind coverage {utc_string(wind.first_time)}..{utc_string(wind.last_time)}; "
                         "supply a covered explicit start/hours or refresh wind outside the model")
    features = []
    for source in sources:
        if source.emission_strength == 0:
            continue
        projection, frames = simulate_source(source, wind, start, hours, params)
        grid = make_grid(frames, params)
        bands = [(lo, min(hi, hours)) for lo, hi in TIME_BANDS if lo < hours]
        envelopes = {band: np.zeros((grid.ny, grid.nx), dtype=float) for band in bands}
        # Compute all forecast hours, including 25..48 even though the contract has no late band.
        for frame in frames:
            values = concentration_grid(frame, grid, params)
            for band in bands:
                if band[0] <= frame.eta_hours <= band[1]:
                    np.maximum(envelopes[band], values, out=envelopes[band])
        line = _centerline(source.id, frames, projection)
        if line is not None:
            features.append(line)
        for lo, hi in bands:
            features.extend(_band_features(source.id, lo, hi, envelopes[(lo, hi)], grid, projection, params))
    result = {"type": "FeatureCollection", "generated_at": utc_string(start),
              "forecast_start": utc_string(start), "wind_generated_at": utc_string(wind.generated_at),
              "features": features}
    problems = check_corridor(result)
    if problems:
        raise ValueError(f"corridor.geojson contract validation failed: {problems}")
    # Normalize geometry coordinate tuples to JSON arrays and prohibit nonfinite output.
    return json.loads(json.dumps(result, allow_nan=False))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Local Lagrangian puff baseline using captured real source/wind files")
    parser.add_argument("--live", action="store_true", required=True)
    parser.add_argument("--hours", "--forecast-hours", type=int, default=DEFAULT_HOURS)
    parser.add_argument("--start", help="Aware ISO-8601 forecast reference (default: latest input capture)")
    parser.add_argument("--params", type=Path, help="JSON object of PlumeParams overrides; not assumed calibrated")
    parser.add_argument("--output", type=Path, help="Output path (default: corridor.geojson beside local inputs)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    data_dir = Path(os.environ.get("AERIS_DATA_DIR", "data/live"))
    if not data_dir.is_absolute():
        data_dir = _REPO_ROOT / data_dir
    sources_path, wind_path = data_dir / "sources.json", data_dir / "wind.json"
    output = args.output if args.output is not None else data_dir / "corridor.geojson"
    temporary = None
    try:
        if output.resolve() in (sources_path.resolve(), wind_path.resolve()):
            raise ValueError("Corridor output must not overwrite source or wind inputs")
        sources = json.loads(sources_path.read_text(encoding="utf-8"))
        wind = json.loads(wind_path.read_text(encoding="utf-8"))
        params = json.loads(args.params.read_text(encoding="utf-8")) if args.params else None
        result = predict_corridor(sources, wind, hours=args.hours, params=params,
                                  start=parse_time(args.start, "start") if args.start else None)
        problems = check_corridor(result)
        if problems:
            raise ValueError(f"corridor.geojson contract validation failed: {problems}")
        body = json.dumps(result, indent=2, allow_nan=False) + "\n"
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=output.name + ".", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(body)
        temporary.replace(output)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Plume forecast failed: {exc}\n")
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    logger.info("Validated %s: reference %s, horizon %d h, %d polygons, %d centrelines",
                output, result["forecast_start"], args.hours,
                sum(f["properties"]["kind"] == "band" for f in result["features"]),
                sum(f["properties"]["kind"] == "centerline" for f in result["features"]))


if __name__ == "__main__":
    main()
