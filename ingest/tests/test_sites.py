"""
ingest/tests/test_sites.py
---------------------------
Tests for ingest/sites/fetch_sites.py.

Tests:
  - _haversine_m: pure geometry, no fabricated data
  - _site_type: tag-based classification
  - _occupancy: tag reading, null for absent tags
  - _element_to_feature: node, way (with center), missing coords
  - _dedup_features: deduplication within 50 m
  - fetch_sites: successful response, empty response, error, schema
"""

from __future__ import annotations

import math
from unittest.mock import MagicMock, patch

import pytest

from ingest.sites.fetch_sites import (
    _dedup_features,
    _element_to_feature,
    _haversine_m,
    _occupancy,
    _site_type,
    fetch_sites,
)


# ---------------------------------------------------------------------------
# Haversine distance — pure geometry
# ---------------------------------------------------------------------------

class TestHaversine:
    def test_same_point(self):
        assert _haversine_m(28.0, 77.0, 28.0, 77.0) == pytest.approx(0.0)

    def test_known_distance(self):
        # Delhi (28.6139, 77.2090) to Gurgaon (28.4595, 77.0266) ≈ 26.6 km
        dist = _haversine_m(28.6139, 77.2090, 28.4595, 77.0266)
        assert 22_000 < dist < 28_000

    def test_symmetry(self):
        d1 = _haversine_m(28.0, 77.0, 28.1, 77.1)
        d2 = _haversine_m(28.1, 77.1, 28.0, 77.0)
        assert d1 == pytest.approx(d2)

    def test_50m_threshold(self):
        """Two points ≈ 45 m apart should be within dedup threshold."""
        # 0.0004° ≈ 44 m at latitude 28°
        dist = _haversine_m(28.0, 77.0, 28.0004, 77.0)
        assert dist < 50.0


# ---------------------------------------------------------------------------
# Tag classification
# ---------------------------------------------------------------------------

class TestSiteType:
    def test_amenity_hospital(self):
        assert _site_type({"amenity": "hospital"}) == "hospital"

    def test_healthcare_hospital(self):
        assert _site_type({"healthcare": "hospital"}) == "hospital"

    def test_amenity_school(self):
        assert _site_type({"amenity": "school"}) == "school"

    def test_unknown_defaults_to_school(self):
        assert _site_type({"amenity": "clinic"}) == "school"


# ---------------------------------------------------------------------------
# Occupancy tag reading
# ---------------------------------------------------------------------------

class TestOccupancy:
    def test_beds_tag(self):
        assert _occupancy({"beds": "250"}) == 250

    def test_capacity_tag(self):
        assert _occupancy({"capacity": "800"}) == 800

    def test_absent_returns_none(self):
        assert _occupancy({}) is None

    def test_non_numeric_returns_none(self):
        assert _occupancy({"beds": "unknown"}) is None

    def test_beds_takes_priority(self):
        assert _occupancy({"beds": "200", "capacity": "1000"}) == 200


# ---------------------------------------------------------------------------
# Element to feature conversion
# ---------------------------------------------------------------------------

class TestElementToFeature:
    def _node(self, lat, lon, amenity="school", name="Test"):
        return {
            "type": "node",
            "id": 1001,
            "lat": lat,
            "lon": lon,
            "tags": {"amenity": amenity, "name": name},
        }

    def _way(self, lat, lon, amenity="hospital"):
        return {
            "type": "way",
            "id": 2001,
            "center": {"lat": lat, "lon": lon},
            "tags": {"amenity": amenity, "name": "Test Hospital"},
        }

    def test_node_converts(self):
        feat = _element_to_feature(self._node(28.6, 77.2), 1)
        assert feat is not None
        assert feat["geometry"]["type"] == "Point"
        assert feat["geometry"]["coordinates"] == [77.2, 28.6]
        assert feat["properties"]["type"] == "school"

    def test_way_uses_center(self):
        feat = _element_to_feature(self._way(28.5, 77.1), 2)
        assert feat is not None
        assert feat["geometry"]["coordinates"] == [77.1, 28.5]
        assert feat["properties"]["type"] == "hospital"

    def test_missing_coords_returns_none(self):
        el = {"type": "node", "id": 999, "tags": {"amenity": "school"}}
        assert _element_to_feature(el, 1) is None

    def test_occupancy_null_when_absent(self):
        feat = _element_to_feature(self._node(28.6, 77.2), 1)
        assert feat["properties"]["occupancy"] is None

    def test_occupancy_read_from_capacity(self):
        el = {
            "type": "node",
            "id": 1002,
            "lat": 28.6,
            "lon": 77.2,
            "tags": {"amenity": "school", "name": "Big School", "capacity": "1200"},
        }
        feat = _element_to_feature(el, 1)
        assert feat["properties"]["occupancy"] == 1200


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _make_feature(lat, lon, site_type="school", name="School A"):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"id": "s_0001", "name": name, "type": site_type, "occupancy": None, "source": "OSM"},
    }


class TestDedupFeatures:
    def test_identical_location_deduped(self):
        f1 = _make_feature(28.6, 77.2, "school", "School A")
        f2 = _make_feature(28.6, 77.2, "school", "School A duplicate")
        kept = _dedup_features([f1, f2])
        assert len(kept) == 1

    def test_within_50m_deduped(self):
        # 0.0003° ≈ 33 m apart
        f1 = _make_feature(28.6000, 77.2000, "school")
        f2 = _make_feature(28.6003, 77.2000, "school")
        kept = _dedup_features([f1, f2])
        assert len(kept) == 1

    def test_beyond_50m_kept(self):
        # 0.01° ≈ 1.1 km apart
        f1 = _make_feature(28.600, 77.200, "school")
        f2 = _make_feature(28.610, 77.200, "school")
        kept = _dedup_features([f1, f2])
        assert len(kept) == 2

    def test_different_types_not_deduped(self):
        """A school and hospital at the same location are separate real facilities."""
        f1 = _make_feature(28.6, 77.2, "school")
        f2 = _make_feature(28.6, 77.2, "hospital")
        kept = _dedup_features([f1, f2])
        assert len(kept) == 2


# ---------------------------------------------------------------------------
# fetch_sites function
# ---------------------------------------------------------------------------

_OVERPASS_RESP = {
    "elements": [
        {
            "type": "node",
            "id": 1001,
            "lat": 28.64,
            "lon": 77.21,
            "tags": {"amenity": "school", "name": "Delhi School"},
        },
        {
            "type": "way",
            "id": 2001,
            "center": {"lat": 28.57, "lon": 77.21},
            "tags": {"amenity": "hospital", "name": "Delhi Hospital", "beds": "300"},
        },
    ]
}


class TestFetchSites:
    def test_normal_response_parsed(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = _OVERPASS_RESP
        with patch("ingest.sites.fetch_sites.post", return_value=mock_resp):
            result = fetch_sites(bbox=[76.5, 28.0, 77.8, 29.2])
        features = result["features"]
        assert len(features) == 2
        types = {f["properties"]["type"] for f in features}
        assert "school" in types
        assert "hospital" in types

    def test_hospital_occupancy_from_beds(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = _OVERPASS_RESP
        with patch("ingest.sites.fetch_sites.post", return_value=mock_resp):
            result = fetch_sites(bbox=[76.5, 28.0, 77.8, 29.2])
        hospital = next(f for f in result["features"] if f["properties"]["type"] == "hospital")
        assert hospital["properties"]["occupancy"] == 300

    def test_empty_elements_returns_empty_collection(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"elements": []}
        with patch("ingest.sites.fetch_sites.post", return_value=mock_resp):
            result = fetch_sites(bbox=[76.5, 28.0, 77.8, 29.2])
        assert result["features"] == []

    def test_upstream_error_raises(self):
        from ingest.common.http import UpstreamError
        with patch("ingest.sites.fetch_sites.post", side_effect=UpstreamError("Overpass", 502, "err")):
            with pytest.raises(UpstreamError):
                fetch_sites(bbox=[76.5, 28.0, 77.8, 29.2])

    def test_schema_fields(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = _OVERPASS_RESP
        with patch("ingest.sites.fetch_sites.post", return_value=mock_resp):
            result = fetch_sites(bbox=[76.5, 28.0, 77.8, 29.2])
        assert result["type"] == "FeatureCollection"
        assert "attribution" in result
        assert "generated_at" in result
        assert "© OpenStreetMap contributors" in result["attribution"]
        for feat in result["features"]:
            props = feat["properties"]
            for field in ("id", "name", "type", "occupancy", "source"):
                assert field in props

    def test_sequential_ids_assigned(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = _OVERPASS_RESP
        with patch("ingest.sites.fetch_sites.post", return_value=mock_resp):
            result = fetch_sites(bbox=[76.5, 28.0, 77.8, 29.2])
        ids = [f["properties"]["id"] for f in result["features"]]
        assert ids == ["s_0001", "s_0002"]
