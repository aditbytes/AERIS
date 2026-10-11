"""
ingest/tests/test_aqi.py
-------------------------
Tests for ingest/aqi/fetch_aqi.py.

Pure-function tests use the official CPCB AQI breakpoints mathematically.
The OpenAQ / CPCB response fixtures mirror the documented API schema —
they are format-correct stubs, not real captured observations.
Note: full end-to-end tests against live APIs are run by running the fetchers
directly; the unit tests here test parsing, AQI calculation, and schema.

Tests:
  - CPCB AQI computation (breakpoint boundaries)
  - AQI category mapping
  - OpenAQ location/latest response parsing
  - CPCB data.gov.in response parsing
  - Missing coordinates handling
  - Missing PM2.5 → no AQI computed
  - Negative PM2.5 → ValueError
  - Empty station list
  - Upstream error handling
  - Output schema validation
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from ingest.aqi.fetch_aqi import (
    _CPCB_BREAKPOINTS,
    compute_pm25_aqi,
    fetch_aqi,
    fetch_cpcb,
    fetch_openaq,
)


# ---------------------------------------------------------------------------
# AQI calculation — pure mathematical tests
# ---------------------------------------------------------------------------

class TestComputePm25Aqi:
    """
    Test CPCB AQI computation against the official breakpoint table.
    Values are derived from the formula, not from observed air quality.
    """

    def test_good_lower_bound(self):
        aqi, cat = compute_pm25_aqi(0.0)
        assert aqi == 0
        assert cat == "Good"

    def test_good_upper_bound(self):
        aqi, cat = compute_pm25_aqi(30.0)
        assert aqi == 50
        assert cat == "Good"

    def test_satisfactory_midpoint(self):
        aqi, cat = compute_pm25_aqi(45.0)  # midpoint 30.1–60
        assert cat == "Satisfactory"
        assert 51 <= aqi <= 100

    def test_satisfactory_upper(self):
        aqi, cat = compute_pm25_aqi(60.0)
        assert cat == "Satisfactory"
        assert aqi == 100

    def test_moderate_lower(self):
        aqi, cat = compute_pm25_aqi(60.1)
        assert cat == "Moderate"
        assert aqi >= 101

    def test_poor_range(self):
        aqi, cat = compute_pm25_aqi(105.0)
        assert cat == "Poor"
        assert 201 <= aqi <= 300

    def test_very_poor_range(self):
        aqi, cat = compute_pm25_aqi(185.0)
        assert cat == "Very Poor"
        assert 301 <= aqi <= 400

    def test_severe_lower(self):
        aqi, cat = compute_pm25_aqi(250.1)
        assert cat == "Severe"
        assert aqi >= 401

    def test_severe_cap_at_500(self):
        # At any PM2.5 in the Severe range (>250.1), AQI must be in [401, 500]
        aqi, cat = compute_pm25_aqi(1000.0)
        assert cat == "Severe"
        assert 401 <= aqi <= 500

    def test_negative_raises_value_error(self):
        with pytest.raises(ValueError):
            compute_pm25_aqi(-1.0)

    def test_zero_pm25(self):
        aqi, cat = compute_pm25_aqi(0.0)
        assert aqi == 0
        assert cat == "Good"

    def test_linear_interpolation_good(self):
        # At 15 µg/m³ (midpoint of 0–30 → AQI midpoint of 0–50 = 25)
        aqi, cat = compute_pm25_aqi(15.0)
        assert cat == "Good"
        assert aqi == 25

    def test_aqi_increases_monotonically(self):
        """AQI must never decrease as PM2.5 increases."""
        pm25_values = [0, 15, 30, 31, 60, 61, 90, 91, 120, 121, 250, 251, 500]
        prev_aqi = -1
        for pm25 in pm25_values:
            aqi, _ = compute_pm25_aqi(float(pm25))
            assert aqi >= prev_aqi, f"AQI decreased at PM2.5={pm25}"
            prev_aqi = aqi


# ---------------------------------------------------------------------------
# OpenAQ response parsing
# ---------------------------------------------------------------------------

# Minimal OpenAQ v3 /locations response — includes datetimeLast and sensors[]
_OAQ_LOCATIONS_RESP = {
    "results": [
        {
            "id": 12345,
            "name": "Test Station",
            "coordinates": {"latitude": 28.647, "longitude": 77.316},
            # Active within last 90 days (tests run after this date)
            "datetimeLast": {"utc": "2099-01-01T00:00:00Z"},
            "sensors": [
                {"id": 9001, "parameter": {"name": "pm25"}},
                {"id": 9002, "parameter": {"name": "pm10"}},
            ],
        }
    ]
}

# OpenAQ v3 /locations/{id}/latest response
_OAQ_LOCATION_LATEST_RESP = {
    "results": [
        {
            "sensorsId": 9001,
            "value": 182.0,
            "datetime": {"utc": "2026-10-07T05:30:00Z"},
        },
        {
            "sensorsId": 9002,
            "value": 310.0,
            "datetime": {"utc": "2026-10-07T05:30:00Z"},
        }
    ]
}

class TestFetchOpenAQ:
    def test_no_key_returns_empty(self):
        stations = fetch_openaq([73.5, 28.0, 77.5, 32.5], key="")
        assert stations == []

    def test_normal_response_parsed(self):
        """Mock /locations (with sensors[]) + /locations/{id}/latest calls."""
        def mock_get(url, **kwargs):
            resp = MagicMock()
            if url.endswith("/latest"):
                resp.json.return_value = _OAQ_LOCATION_LATEST_RESP
            elif "/locations" in url:
                resp.json.return_value = _OAQ_LOCATIONS_RESP
            else:
                resp.json.return_value = {"results": []}
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            stations = fetch_openaq([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")

        assert len(stations) == 1
        s = stations[0]
        assert s["id"] == "OAQ_12345"
        assert s["name"] == "Test Station"
        assert s["lat"] == pytest.approx(28.647)
        assert s["lon"] == pytest.approx(77.316)
        assert s["pm25"] == pytest.approx(182.0)
        assert s["pm10"] == pytest.approx(310.0)
        assert s["aqi"] is not None
        assert s["aqi_category"] == "Very Poor"  # 182 µg/m³
        assert s["source"] == "OpenAQ"

    def test_upstream_error_returns_empty(self):
        from ingest.common.http import UpstreamError
        with patch("ingest.aqi.fetch_aqi.get", side_effect=UpstreamError("OpenAQ", 502, "error")):
            stations = fetch_openaq([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")
        assert stations == []

    def test_empty_results_returns_empty(self):
        def mock_get(url, **kwargs):
            resp = MagicMock()
            resp.json.return_value = {"results": []}
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            stations = fetch_openaq([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")
        assert stations == []

    def test_missing_coordinates_skipped(self):
        resp_no_coords = {
            "results": [{
                "id": 99,
                "name": "No Coords",
                "datetimeLast": {"utc": "2099-01-01T00:00:00Z"},
                "sensors": [{"id": 9999, "parameter": {"name": "pm25"}}],
            }]
        }

        def mock_get(url, **kwargs):
            resp = MagicMock()
            resp.json.return_value = resp_no_coords
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            stations = fetch_openaq([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")
        assert stations == []

    def test_station_schema_fields(self):
        """All required output fields must be present."""
        def mock_get(url, **kwargs):
            resp = MagicMock()
            if "/locations" in url:
                resp.json.return_value = _OAQ_LOCATIONS_RESP
            elif "/sensors/9001/" in url:
                resp.json.return_value = _OAQ_SENSOR_PM25_RESP
            elif "/sensors/9002/" in url:
                resp.json.return_value = _OAQ_SENSOR_PM10_RESP
            else:
                resp.json.return_value = {"results": []}
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            stations = fetch_openaq([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")

        for s in stations:
            for field in ("id", "name", "lat", "lon", "pm25", "pm10", "aqi", "aqi_category", "observed_at", "source"):
                assert field in s, f"Missing field: {field}"


# ---------------------------------------------------------------------------
# CPCB / data.gov.in response parsing
# ---------------------------------------------------------------------------

_CPCB_RESP = {
    "records": [
        {
            "state": "Delhi",
            "city": "Delhi",
            "station": "Anand Vihar",
            "latitude": "28.647",
            "longitude": "77.316",
            "pollutant_id": "PM2.5",
            "pollutant_avg": "182.0",
            "last_update": "07-10-2026 05:30:00",
        }
    ]
}

_CPCB_EMPTY_RESP = {"records": []}


class TestFetchCPCB:
    def test_no_key_returns_empty(self):
        stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="")
        assert stations == []

    def test_normal_record_parsed(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = _CPCB_RESP
        with patch("ingest.aqi.fetch_aqi.get", return_value=mock_resp):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")
        assert len(stations) >= 1
        s = stations[0]
        assert s["source"] == "CPCB/data.gov.in"
        assert s["pm25"] == pytest.approx(182.0)

    def test_empty_records_returns_empty(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = _CPCB_EMPTY_RESP
        with patch("ingest.aqi.fetch_aqi.get", return_value=mock_resp):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")
        assert stations == []

    def test_malformed_json_returns_empty(self):
        mock_resp = MagicMock()
        mock_resp.json.side_effect = ValueError("not json")
        with patch("ingest.aqi.fetch_aqi.get", return_value=mock_resp):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")
        assert stations == []

    def test_upstream_error_returns_empty(self):
        from ingest.common.http import UpstreamError
        with patch("ingest.aqi.fetch_aqi.get", side_effect=UpstreamError("CPCB", 500, "err")):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="test_key_placeholder")
        assert stations == []


# ---------------------------------------------------------------------------
# Full fetch_aqi function output schema
# ---------------------------------------------------------------------------

class TestFetchAqi:
    def test_output_schema(self):
        def mock_get(url, **kwargs):
            resp = MagicMock()
            if "openaq" in url:
                if "latest" not in url:
                    resp.json.return_value = {"results": []}
                else:
                    resp.json.return_value = {"results": []}
            else:
                resp.json.return_value = {"records": []}
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            result = fetch_aqi(bbox=[73.5, 28.0, 77.5, 32.5], openaq_key="k", cpcb_key="k")

        assert "generated_at" in result
        assert "stations" in result
        assert isinstance(result["stations"], list)


# ---------------------------------------------------------------------------
# Regression tests: failure handling and data-integrity (added 2026-10-10)
# ---------------------------------------------------------------------------

class TestAqiFailureHandling:
    """Regression tests for AQI failure modes identified in the audit."""

    def test_both_sources_unavailable_returns_empty_stations(self):
        """Both OpenAQ and CPCB fail → stations list is empty, source='none', sources_failed recorded."""
        from ingest.common.http import UpstreamError

        with patch("ingest.aqi.fetch_aqi.get", side_effect=UpstreamError("AQI", 503, "down")):
            result = fetch_aqi(
                bbox=[73.5, 28.0, 77.5, 32.5],
                openaq_key="k",
                cpcb_key="k",
            )
        assert result["stations"] == []
        assert "generated_at" in result
        assert result["source"] == "none"
        assert result.get("sources_failed") == ["OpenAQ", "CPCB/data.gov.in"]

    def test_openaq_succeeds_cpcb_fails_returns_openaq_only(self):
        """OpenAQ returns data; CPCB fails → only OpenAQ stations, source='OpenAQ'."""
        from ingest.common.http import UpstreamError

        def mock_get(url, **kwargs):
            if "openaq" in url or "api.openaq" in url:
                resp = MagicMock()
                if "/latest" in url:
                    resp.json.return_value = _OAQ_LOCATION_LATEST_RESP
                else:
                    resp.json.return_value = _OAQ_LOCATIONS_RESP
                return resp
            raise UpstreamError("CPCB", 500, "server error")

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            result = fetch_aqi(
                bbox=[73.5, 28.0, 77.5, 32.5],
                openaq_key="k",
                cpcb_key="k",
            )
        assert len(result["stations"]) >= 1
        sources = {s["source"] for s in result["stations"]}
        assert "OpenAQ" in sources
        assert "CPCB/data.gov.in" not in sources
        assert result["source"] == "OpenAQ"
        assert result.get("sources_failed") == ["CPCB/data.gov.in"]

    def test_cpcb_succeeds_openaq_fails_returns_cpcb_only(self):
        """CPCB returns data; OpenAQ fails → only CPCB stations, source='CPCB/data.gov.in'."""
        from ingest.common.http import UpstreamError

        def mock_get(url, **kwargs):
            if "openaq" in url or "api.openaq" in url:
                raise UpstreamError("OpenAQ", 503, "unavailable")
            resp = MagicMock()
            resp.json.return_value = _CPCB_RESP
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            result = fetch_aqi(
                bbox=[73.5, 28.0, 77.5, 32.5],
                openaq_key="k",
                cpcb_key="k",
            )
        sources = {s["source"] for s in result["stations"]}
        assert "CPCB/data.gov.in" in sources
        assert "OpenAQ" not in sources
        assert result["source"] == "CPCB/data.gov.in"
        assert result.get("sources_failed") == ["OpenAQ"]

    def test_both_sources_contribute_identifies_both_in_source(self):
        """Both OpenAQ and CPCB return data → top-level source identifies both."""
        def mock_get(url, **kwargs):
            resp = MagicMock()
            if "openaq" in url or "api.openaq" in url:
                if "/latest" in url:
                    resp.json.return_value = _OAQ_LOCATION_LATEST_RESP
                else:
                    resp.json.return_value = _OAQ_LOCATIONS_RESP
            else:
                resp.json.return_value = _CPCB_RESP
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            result = fetch_aqi(
                bbox=[73.5, 28.0, 77.5, 32.5],
                openaq_key="k",
                cpcb_key="k",
            )
        assert len(result["stations"]) >= 2
        station_sources = {s["source"] for s in result["stations"]}
        assert "OpenAQ" in station_sources
        assert "CPCB/data.gov.in" in station_sources
        assert result["source"] == "OpenAQ+CPCB/data.gov.in"
        assert "sources_failed" not in result

    def test_cpcb_record_without_coordinates_excluded(self):
        """CPCB records missing lat/lon must not appear in the station list.
        Coordinate-less records cannot be placed on the geospatial map."""
        cpcb_resp_no_coords = {
            "records": [
                {
                    "state": "Delhi",
                    "city": "Delhi",
                    "station": "No-Coords Station",
                    # lat/lon intentionally absent
                    "pollutant_id": "PM2.5",
                    "pollutant_avg": "150.0",
                    "last_update": "07-10-2026 05:30:00",
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.json.return_value = cpcb_resp_no_coords
        with patch("ingest.aqi.fetch_aqi.get", return_value=mock_resp):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="k")
        assert stations == [], (
            "Stations without coordinates must be excluded from the dataset"
        )

    def test_cpcb_record_out_of_bbox_excluded(self):
        """CPCB records with coordinates outside the bbox must be excluded."""
        cpcb_resp_out_of_bbox = {
            "records": [
                {
                    "state": "Tamil Nadu",
                    "city": "Chennai",
                    "station": "Chennai Central",
                    "latitude": "13.082",
                    "longitude": "80.275",
                    "pollutant_id": "PM2.5",
                    "pollutant_avg": "45.0",
                    "last_update": "07-10-2026 05:30:00",
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.json.return_value = cpcb_resp_out_of_bbox
        with patch("ingest.aqi.fetch_aqi.get", return_value=mock_resp):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="k")
        assert stations == [], "Stations outside bbox must be excluded"

    def test_station_lat_lon_are_floats_not_null(self):
        """After the coordinate fix, every returned station must have float lat/lon."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = _CPCB_RESP
        with patch("ingest.aqi.fetch_aqi.get", return_value=mock_resp):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="k")
        for s in stations:
            assert isinstance(s["lat"], float), f"lat is {type(s['lat'])}, expected float"
            assert isinstance(s["lon"], float), f"lon is {type(s['lon'])}, expected float"

    def test_both_sources_return_empty_valid_response(self):
        """Both sources respond but have no data for bbox → empty stations, source='none', no failure."""
        def mock_get(url, **kwargs):
            resp = MagicMock()
            if "openaq" in url or "api.openaq" in url:
                resp.json.return_value = {"results": []}
            else:
                resp.json.return_value = {"records": []}
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            result = fetch_aqi(
                bbox=[73.5, 28.0, 77.5, 32.5],
                openaq_key="k",
                cpcb_key="k",
            )
        assert result["stations"] == []
        assert result["source"] == "none"
        assert "sources_failed" not in result

    def test_cpcb_malformed_json_skips_gracefully(self):
        """Malformed CPCB JSON → empty list, no exception propagated."""
        mock_resp = MagicMock()
        mock_resp.json.side_effect = ValueError("not json")
        with patch("ingest.aqi.fetch_aqi.get", return_value=mock_resp):
            stations = fetch_cpcb([73.5, 28.0, 77.5, 32.5], key="k")
        assert stations == []

    def test_aqi_contract_validation_with_source(self):
        """Verify pipeline contract checker accepts AQI output with top-level source."""
        from pipeline.contracts import check_aqi

        def mock_get(url, **kwargs):
            resp = MagicMock()
            if "openaq" in url or "api.openaq" in url:
                if "/latest" in url:
                    resp.json.return_value = _OAQ_LOCATION_LATEST_RESP
                else:
                    resp.json.return_value = _OAQ_LOCATIONS_RESP
            else:
                resp.json.return_value = _CPCB_RESP
            return resp

        with patch("ingest.aqi.fetch_aqi.get", side_effect=mock_get):
            result = fetch_aqi(
                bbox=[73.5, 28.0, 77.5, 32.5],
                openaq_key="k",
                cpcb_key="k",
            )
        problems = check_aqi(result)
        assert problems == [], f"check_aqi reported contract problems: {problems}"

