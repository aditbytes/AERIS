"""
models/common/geo.py
--------------------
Geographic calculation utilities (WGS-84 spherical approximation).
Zero-dependency, pure Python.
"""

from __future__ import annotations
import math

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in kilometres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_KM * c


def destination_point(lat: float, lon: float, distance_km: float, bearing_deg: float) -> tuple[float, float]:
    """
    Given a starting point, distance in km and bearing in degrees,
    compute the destination point (lat, lon).
    """
    theta = math.radians(bearing_deg)
    delta = distance_km / EARTH_RADIUS_KM
    phi1 = math.radians(lat)
    lambda1 = math.radians(lon)

    sin_phi2 = math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta)
    phi2 = math.asin(sin_phi2)

    y = math.sin(theta) * math.sin(delta) * math.cos(phi1)
    x = math.cos(delta) - math.sin(phi1) * math.sin(phi2)
    lambda2 = lambda1 + math.atan2(y, x)

    return math.degrees(phi2), (math.degrees(lambda2) + 540) % 360 - 180


def point_in_polygon(lon: float, lat: float, polygon_coords: list[list[float]]) -> bool:
    """
    Ray-casting algorithm to test whether point (lon, lat) is inside polygon_coords.
    polygon_coords is a list of [lon, lat] pairs.
    """
    n = len(polygon_coords)
    inside = False
    p1x, p1y = polygon_coords[0][0], polygon_coords[0][1]
    for i in range(n + 1):
        p2x, p2y = polygon_coords[i % n][0], polygon_coords[i % n][1]
        if lat > min(p1y, p2y):
            if lat <= max(p1y, p2y):
                if lon <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (lat - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or lon <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside
