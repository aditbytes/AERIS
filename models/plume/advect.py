"""Validated local wind interpolation and projected hourly puff transport."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from pyproj import CRS, Geod, Transformer


def number(value: Any, name: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{name} must be a finite JSON number")
    try:
        value = float(value)
    except OverflowError as exc:
        raise ValueError(f"{name} must be finite") from exc
    if not math.isfinite(value):
        raise ValueError(f"{name} must be finite")
    return value


def parse_time(value: Any, name: str) -> datetime:
    if not isinstance(value, str) or "T" not in value:
        raise ValueError(f"{name} must be an aware ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.utcoffset() is None:
            raise ValueError("timezone missing")
        return parsed.astimezone(timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise ValueError(f"{name} must be an aware ISO-8601 timestamp") from exc


def utc_string(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def coordinates(obj: Any, name: str) -> tuple[float, float]:
    if not isinstance(obj, dict):
        raise ValueError(f"{name} must be an object")
    lat, lon = number(obj.get("lat"), f"{name}.lat"), number(obj.get("lon"), f"{name}.lon")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError(f"{name} has coordinates outside WGS84 ranges")
    return lat, lon


@dataclass(frozen=True)
class PlumeParams:
    """Baseline assumptions, not fitted or calibrated values; all distances SI."""

    sigma0_m: float = 2000.0
    k_m_sqrt_hour: float = 1000.0
    tau_hours: float = 24.0
    concentration_scale_ug: float = 1e12
    grid_cell_m: float = 2000.0
    threshold_ugm3: float = 5.0
    risk_scale_ugm3: float = 50.0
    pblh_floor_m: float = 200.0
    wind_neighbors: int = 4
    idw_power: float = 2.0
    max_time_gap_hours: float = 3.0
    max_wind_distance_km: float = 50.0
    kernel_sigma_cutoff: float = 4.0
    max_grid_cells: int = 250000
    max_projection_radius_km: float = 1000.0

    def __post_init__(self) -> None:
        for name in ("sigma0_m", "tau_hours", "concentration_scale_ug", "grid_cell_m",
                     "threshold_ugm3", "risk_scale_ugm3", "pblh_floor_m", "idw_power",
                     "max_time_gap_hours", "max_wind_distance_km", "kernel_sigma_cutoff",
                     "max_projection_radius_km"):
            if number(getattr(self, name), name) <= 0:
                raise ValueError(f"{name} must be positive")
        if number(self.k_m_sqrt_hour, "k_m_sqrt_hour") < 0:
            raise ValueError("k_m_sqrt_hour must be nonnegative")
        for name in ("wind_neighbors", "max_grid_cells"):
            value = getattr(self, name)
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                raise ValueError(f"{name} must be a positive integer")


def resolve_params(params: PlumeParams | dict[str, Any] | None) -> PlumeParams:
    if params is None:
        return PlumeParams()
    if isinstance(params, PlumeParams):
        return params
    if isinstance(params, dict):
        try:
            return PlumeParams(**params)
        except TypeError as exc:
            raise ValueError(f"Invalid plume parameters: {exc}") from exc
    raise ValueError("params must be PlumeParams, a parameter dict, or None")


@dataclass(frozen=True)
class WindPoint:
    lat: float
    lon: float
    times: np.ndarray
    values: np.ndarray


class WindField:
    """Linear time interpolation and inverse-geodesic-distance spatial weights.

    Null u/v/PBLH samples are unavailable. No temporal extrapolation, no bridging
    gaps longer than max_time_gap_hours, and no distant spatial fallback.
    """

    def __init__(self, wind: dict[str, Any], params: PlumeParams | None = None):
        self.params = params or PlumeParams()
        if not isinstance(wind, dict) or not isinstance(wind.get("points"), list) or not wind["points"]:
            raise ValueError("wind.json has no forecast points")
        self.generated_at = parse_time(wind.get("generated_at"), "wind.generated_at")
        if not isinstance(wind.get("source"), str) or not wind["source"].strip():
            raise ValueError("wind.source must identify the captured forecast")
        self.points = []
        seen = set()
        for i, point in enumerate(wind["points"]):
            name = f"wind.points[{i}]"
            lat, lon = coordinates(point, name)
            if (lat, lon) in seen:
                raise ValueError(f"{name}: duplicate grid coordinates")
            seen.add((lat, lon))
            if not isinstance(point.get("hours"), list):
                raise ValueError(f"{name}.hours must be a list")
            samples = []
            times_seen = set()
            for j, hour in enumerate(point["hours"]):
                where = f"{name}.hours[{j}]"
                if not isinstance(hour, dict):
                    raise ValueError(f"{where} must be an object")
                when = parse_time(hour.get("t"), f"{where}.t").timestamp()
                if when in times_seen:
                    raise ValueError(f"{where}: duplicate forecast timestamp")
                times_seen.add(when)
                values = []
                for key in ("u_ms", "v_ms", "pblh_m"):
                    raw = hour.get(key)
                    values.append(None if raw is None else number(raw, f"{where}.{key}"))
                if values[2] is not None and values[2] < 0:
                    raise ValueError(f"{where}.pblh_m must be nonnegative or null")
                if all(v is not None for v in values):
                    samples.append((when, values))
            if samples:
                samples.sort(key=lambda sample: sample[0])
                self.points.append(WindPoint(lat, lon, np.array([s[0] for s in samples]),
                                             np.array([s[1] for s in samples], dtype=float)))
        if not self.points:
            raise ValueError("wind.json has no usable samples with real u_ms, v_ms and pblh_m")
        self.points.sort(key=lambda point: (point.lat, point.lon))
        self.lats = np.array([p.lat for p in self.points])
        self.lons = np.array([p.lon for p in self.points])
        self.geod = Geod(ellps="WGS84")
        self.first_time = datetime.fromtimestamp(min(p.times[0] for p in self.points), timezone.utc)
        self.last_time = datetime.fromtimestamp(max(p.times[-1] for p in self.points), timezone.utc)

    def _at_time(self, point: WindPoint, when: float) -> np.ndarray | None:
        index = int(np.searchsorted(point.times, when))
        if index < len(point.times) and point.times[index] == when:
            return point.values[index]
        if index == 0 or index == len(point.times):
            return None
        before, after = point.times[index - 1], point.times[index]
        if after - before > self.params.max_time_gap_hours * 3600:
            return None
        fraction = (when - before) / (after - before)
        return point.values[index - 1] * (1 - fraction) + point.values[index] * fraction

    def interpolate(self, lat: float, lon: float, when: datetime) -> tuple[float, float, float]:
        coordinates({"lat": lat, "lon": lon}, "interpolation location")
        if not isinstance(when, datetime) or when.utcoffset() is None:
            raise ValueError("Wind interpolation time must be timezone-aware")
        stamp = when.timestamp()
        _, _, distances = self.geod.inv(np.full(len(self.points), lon), np.full(len(self.points), lat),
                                         self.lons, self.lats)
        samples, weights = [], []
        for i in np.argsort(distances, kind="stable"):
            distance = float(distances[i])
            if distance > self.params.max_wind_distance_km * 1000:
                break
            values = self._at_time(self.points[i], stamp)
            if values is None:
                continue
            if distance <= 1e-6:
                return tuple(float(v) for v in values)
            samples.append(values)
            weights.append(distance)
            if len(samples) == self.params.wind_neighbors:
                break
        if not samples:
            raise ValueError(f"No usable local wind/PBLH at ({lat:.5f}, {lon:.5f}) at {utc_string(when)}; "
                             f"available times {utc_string(self.first_time)}..{utc_string(self.last_time)}; "
                             f"no extrapolation beyond {self.params.max_wind_distance_km:g} km")
        # Relative distances avoid overflow/underflow from absolute inverse powers.
        relative = np.array(weights) / min(weights)
        normalized = relative ** (-self.params.idw_power)
        normalized /= normalized.sum()
        result = np.sum(np.array(samples) * normalized[:, None], axis=0)
        return tuple(float(v) for v in result)


class LocalProjection:
    """Per-source WGS84 azimuthal equidistant projection, with metre coordinates."""

    def __init__(self, lat: float, lon: float, max_radius_km: float):
        if abs(lat) > 85:
            raise ValueError("This regional plume baseline does not support polar sources above 85 degrees")
        self.origin_lat, self.origin_lon = lat, lon
        self.max_radius_m = max_radius_km * 1000
        crs = CRS.from_proj4(f"+proj=aeqd +lat_0={lat:.15g} +lon_0={lon:.15g} +datum=WGS84 +units=m")
        self.forward = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        self.inverse = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        self.geod = Geod(ellps="WGS84")

    def latlon(self, x: float, y: float) -> tuple[float, float]:
        if math.hypot(x, y) > self.max_radius_m:
            raise ValueError("Puff exceeded the supported local projection radius")
        if x == 0 and y == 0:
            return self.origin_lat, self.origin_lon
        lon, lat = self.inverse.transform(x, y, errcheck=True)
        return lat, lon

    def velocity(self, x: float, y: float, u: float, v: float) -> tuple[float, float]:
        lat, lon = self.latlon(x, y)
        # Transform true east/north tangent vectors, including convergence and scale.
        east_lon, east_lat, _ = self.geod.fwd(lon, lat, 90, 1.0)
        north_lon, north_lat, _ = self.geod.fwd(lon, lat, 0, 1.0)
        ex, ey = self.forward.transform(east_lon, east_lat, errcheck=True)
        nx, ny = self.forward.transform(north_lon, north_lat, errcheck=True)
        return u * (ex - x) + v * (nx - x), u * (ey - y) + v * (ny - y)


@dataclass(frozen=True)
class Source:
    id: str
    lat: float
    lon: float
    emission_strength: float
    radius_km: float
    last_seen: datetime


def validate_sources(data: Any) -> tuple[datetime | None, list[Source]]:
    if not isinstance(data, dict) or not isinstance(data.get("sources"), list):
        raise ValueError("sources must be a parsed sources.json object with a sources list")
    generated = parse_time(data["generated_at"], "sources.generated_at") if "generated_at" in data else None
    seen, sources = set(), []
    for i, source in enumerate(data["sources"]):
        where = f"sources[{i}]"
        lat, lon = coordinates(source, where)
        identity = source.get("id")
        if not isinstance(identity, str) or not identity.strip() or identity in seen:
            raise ValueError(f"{where}.id must be a unique nonempty string")
        seen.add(identity)
        strength = number(source.get("emission_strength"), f"{where}.emission_strength")
        confidence = number(source.get("confidence"), f"{where}.confidence")
        radius = number(source.get("radius_km"), f"{where}.radius_km")
        frp = number(source.get("total_frp_mw"), f"{where}.total_frp_mw")
        count = source.get("fire_count")
        if not (0 <= strength <= 1 and 0 <= confidence <= 1 and radius >= 0 and frp >= 0):
            raise ValueError(f"{where}: source scores/FRP/radius outside contract bounds")
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            raise ValueError(f"{where}.fire_count must be a positive integer")
        if not isinstance(source.get("type"), str) or not source["type"].strip():
            raise ValueError(f"{where}.type must be a nonempty string")
        first = parse_time(source.get("first_seen"), f"{where}.first_seen")
        last = parse_time(source.get("last_seen"), f"{where}.last_seen")
        if first > last or (generated is not None and last > generated):
            raise ValueError(f"{where}: observation times are inconsistent")
        sources.append(Source(identity, lat, lon, strength, radius, last))
    return generated, sorted(sources, key=lambda source: source.id)


@dataclass(frozen=True)
class Puff:
    source_id: str
    emitted_at: datetime
    age_hours: float
    x_m: float
    y_m: float
    strength: float
    sigma_m: float
    decay: float
    pblh_m: float


@dataclass(frozen=True)
class Frame:
    eta_hours: int
    puffs: tuple[Puff, ...]
    center_x_m: float
    center_y_m: float


def dispersion_sigma(age_hours: float, sigma0_m: float, params: PlumeParams) -> float:
    if number(age_hours, "puff age_hours") < 0 or number(sigma0_m, "puff sigma0_m") <= 0:
        raise ValueError("Puff age must be nonnegative and initial sigma positive")
    return sigma0_m + params.k_m_sqrt_hour * math.sqrt(age_hours)


def decay_factor(age_hours: float, tau_hours: float) -> float:
    if number(age_hours, "puff age_hours") < 0 or number(tau_hours, "tau_hours") <= 0:
        raise ValueError("Puff age must be nonnegative and decay timescale positive")
    return math.exp(-age_hours / tau_hours)


def simulate_source(source: Source, wind: WindField, start: datetime, hours: int,
                    params: PlumeParams) -> tuple[LocalProjection, list[Frame]]:
    """Emit at hours 0..hours-1, sample hours 0..hours, Euler steps of 3600 s."""
    projection = LocalProjection(source.lat, source.lon, params.max_projection_radius_km)
    # A circular 2D Gaussian contains 90% of its mass at sqrt(2 ln 10) sigma.
    sigma0 = max(params.sigma0_m, source.radius_km * 1000 / math.sqrt(2 * math.log(10)))
    if not math.isfinite(sigma0) or sigma0 * params.kernel_sigma_cutoff > projection.max_radius_m:
        raise ValueError("Initial source spread exceeds the supported local projection radius")
    puffs, frames = [], []
    for hour in range(hours + 1):
        when = start + timedelta(hours=hour)
        if hour < hours:
            _, _, pblh = wind.interpolate(source.lat, source.lon, when)
            puffs.append(Puff(source.id, when, 0.0, 0.0, 0.0, source.emission_strength, sigma0, 1.0, pblh))
        masses = [puff.strength * puff.decay for puff in puffs]
        total_mass = math.fsum(masses)
        if total_mass <= 0:
            raise ValueError("Cannot define centre of mass for a source with zero surviving puff mass")
        cx = math.fsum(m * puff.x_m for m, puff in zip(masses, puffs)) / total_mass
        cy = math.fsum(m * puff.y_m for m, puff in zip(masses, puffs)) / total_mass
        frames.append(Frame(hour, tuple(puffs), cx, cy))
        if hour == hours:
            break
        advanced = []
        for puff in puffs:
            lat, lon = projection.latlon(puff.x_m, puff.y_m)
            u, v, _ = wind.interpolate(lat, lon, when)
            vx, vy = projection.velocity(puff.x_m, puff.y_m, u, v)
            x, y = puff.x_m + vx * 3600, puff.y_m + vy * 3600
            next_lat, next_lon = projection.latlon(x, y)
            _, _, pblh = wind.interpolate(next_lat, next_lon, when + timedelta(hours=1))
            age = hour + 1 - (puff.emitted_at - start).total_seconds() / 3600
            advanced.append(Puff(source.id, puff.emitted_at, age, x, y, puff.strength,
                                 dispersion_sigma(age, sigma0, params), decay_factor(age, params.tau_hours), pblh))
        puffs = advanced
    return projection, frames
