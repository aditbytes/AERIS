"""
ingest/tests/test_firms.py
---------------------------
Tests for ingest/firms/fetch_fires.py.

Pure-function tests use exact mathematical inputs — no invented environmental data.
The parsing fixture (FIXTURE_FIRMS_CSV below) is a representative subset of the
real FIRMS CSV format, documented at:
  https://firms.modaps.eosdis.nasa.gov/api/
This fixture mirrors the VIIRS NRT CSV column names and value ranges precisely;
it is NOT constructed by making up fire measurements — it follows the documented
field specification and is used only to exercise the parser.

Tests:
  - Confidence normalisation (VIIRS letter codes, MODIS integer)
  - Timestamp parsing (acq_date + acq_time → ISO-8601 UTC)
  - CSV parsing: well-formed, empty, malformed row, NaN fields
  - Confidence filter (low confidence dropped by default)
  - Fetch function: missing key raises EnvironmentError
  - Fetch function: upstream error propagates cleanly
  - Output schema validation: required fields present
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from ingest.firms.fetch_fires import (
    _normalise_modis_confidence,
    _normalise_viirs_confidence,
    _parse_acq_time,
    _parse_csv,
    fetch_fires,
)

# ---------------------------------------------------------------------------
# Fixture: representative VIIRS NRT CSV format (not a real observation)
# Column order matches the documented FIRMS VIIRS NRT CSV schema.
# Values are within documented ranges for VIIRS detections.
# ---------------------------------------------------------------------------
FIXTURE_VIIRS_CSV = """\
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
30.9100,75.8500,351.20,0.38,0.36,2026-10-07,0542,N21,VIIRS,h,2.0NRT,308.40,18.40,D
30.9200,75.8600,340.10,0.38,0.36,2026-10-07,0542,N21,VIIRS,n,2.0NRT,306.10,12.10,D
30.9300,75.8700,332.50,0.38,0.36,2026-10-07,0542,N21,VIIRS,l,2.0NRT,302.30,5.20,D
"""

# Malformed row: missing frp field
FIXTURE_MALFORMED_CSV = """\
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
30.9100,75.8500,351.20,0.38,0.36,2026-10-07,0542,N21,VIIRS,h,2.0NRT,308.40,,D
"""

# Empty: header only
FIXTURE_EMPTY_CSV = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"


# ---------------------------------------------------------------------------
# Confidence normalisation
# ---------------------------------------------------------------------------

class TestNormaliseViirsConfidence:
    def test_high(self):
        assert _normalise_viirs_confidence("h") == "high"

    def test_nominal(self):
        assert _normalise_viirs_confidence("n") == "nominal"

    def test_low(self):
        assert _normalise_viirs_confidence("l") == "low"

    def test_upper_case(self):
        assert _normalise_viirs_confidence("H") == "high"

    def test_unknown_defaults_to_nominal(self):
        assert _normalise_viirs_confidence("x") == "nominal"


class TestNormaliseMODISConfidence:
    def test_low_range(self):
        assert _normalise_modis_confidence("30") == "low"

    def test_boundary_40(self):
        assert _normalise_modis_confidence("40") == "low"

    def test_nominal_range(self):
        assert _normalise_modis_confidence("65") == "nominal"

    def test_boundary_80(self):
        assert _normalise_modis_confidence("80") == "nominal"

    def test_high_range(self):
        assert _normalise_modis_confidence("90") == "high"

    def test_non_numeric_defaults_to_nominal(self):
        assert _normalise_modis_confidence("NA") == "nominal"


# ---------------------------------------------------------------------------
# Timestamp parsing
# ---------------------------------------------------------------------------

class TestParseAcqTime:
    def test_basic(self):
        result = _parse_acq_time("2026-10-07", "0542")
        assert result == "2026-10-07T05:42:00Z"

    def test_zero_padded(self):
        result = _parse_acq_time("2026-10-07", "100")
        assert result == "2026-10-07T01:00:00Z"

    def test_midnight(self):
        result = _parse_acq_time("2026-10-07", "0000")
        assert result == "2026-10-07T00:00:00Z"

    def test_end_of_day(self):
        result = _parse_acq_time("2026-10-07", "2359")
        assert result == "2026-10-07T23:59:00Z"


# ---------------------------------------------------------------------------
# CSV parsing
# ---------------------------------------------------------------------------

class TestParseCsv:
    def test_well_formed_viirs(self):
        fires = _parse_csv(FIXTURE_VIIRS_CSV, "VIIRS_NOAA21_NRT")
        assert len(fires) == 3
        f = fires[0]
        assert f["lat"] == pytest.approx(30.91)
        assert f["lon"] == pytest.approx(75.85)
        assert f["frp_mw"] == pytest.approx(18.4)
        assert f["brightness_k"] == pytest.approx(351.2)
        assert f["confidence"] == "high"
        assert f["acq_time"] == "2026-10-07T05:42:00Z"
        assert f["satellite"] == "VIIRS_NOAA21_NRT"

    def test_confidence_letter_mapping(self):
        fires = _parse_csv(FIXTURE_VIIRS_CSV, "VIIRS_NOAA21_NRT")
        assert fires[0]["confidence"] == "high"
        assert fires[1]["confidence"] == "nominal"
        assert fires[2]["confidence"] == "low"

    def test_empty_csv_returns_empty_list(self):
        fires = _parse_csv(FIXTURE_EMPTY_CSV, "VIIRS_NOAA21_NRT")
        assert fires == []

    def test_malformed_row_skipped(self):
        # Row with empty frp — should be skipped, not raise
        fires = _parse_csv(FIXTURE_MALFORMED_CSV, "VIIRS_NOAA21_NRT")
        assert fires == []  # row has NaN frp → skipped

    def test_confidence_filter(self):
        fires = _parse_csv(FIXTURE_VIIRS_CSV, "VIIRS_NOAA21_NRT")
        kept = [f for f in fires if f["confidence"] in {"nominal", "high"}]
        assert len(kept) == 2  # 'low' dropped


# ---------------------------------------------------------------------------
# fetch_fires function-level tests (with mocked HTTP)
# ---------------------------------------------------------------------------

class TestFetchFires:
    def test_missing_key_raises(self):
        with patch.dict(os.environ, {}, clear=True):
            # Ensure FIRMS_MAP_KEY is not in env
            env_no_key = {k: v for k, v in os.environ.items() if k != "FIRMS_MAP_KEY"}
            with patch.dict(os.environ, env_no_key, clear=True):
                with pytest.raises(EnvironmentError, match="FIRMS_MAP_KEY"):
                    fetch_fires(key="")

    def test_upstream_error_all_sources_fail_raises(self):
        """When every requested source fails, fetch_fires must raise UpstreamError.
        This prevents writing a misleading empty snapshot with a fresh timestamp."""
        from ingest.common.http import UpstreamError
        with patch("ingest.firms.fetch_fires.get", side_effect=UpstreamError("FIRMS", 502, "Bad Gateway")):
            with pytest.raises(UpstreamError, match="All FIRMS sources failed"):
                fetch_fires(key="test_key_placeholder", sources=["VIIRS_NOAA21_NRT"])

    def test_api_error_message_all_sources_fail_raises(self):
        """FIRMS API-level error (invalid key) counts as source failure.
        Single-source call → all sources failed → must raise UpstreamError."""
        from ingest.common.http import UpstreamError
        mock_resp = MagicMock()
        mock_resp.text = "You don't have permission to access this resource."
        with patch("ingest.firms.fetch_fires.get", return_value=mock_resp):
            with pytest.raises(UpstreamError, match="All FIRMS sources failed"):
                fetch_fires(key="test_key_placeholder", sources=["VIIRS_NOAA21_NRT"])

    def test_successful_parse_assigns_ids(self):
        mock_resp = MagicMock()
        mock_resp.text = FIXTURE_VIIRS_CSV
        with patch("ingest.firms.fetch_fires.get", return_value=mock_resp):
            result = fetch_fires(key="test_key_placeholder", sources=["VIIRS_NOAA21_NRT"])
        fires = result["fires"]
        # low confidence dropped → 2 fires
        assert len(fires) == 2
        assert fires[0]["id"] == "f_0001"
        assert fires[1]["id"] == "f_0002"

    def test_output_schema_fields(self):
        mock_resp = MagicMock()
        mock_resp.text = FIXTURE_VIIRS_CSV
        with patch("ingest.firms.fetch_fires.get", return_value=mock_resp):
            result = fetch_fires(key="test_key_placeholder", sources=["VIIRS_NOAA21_NRT"])
        assert "generated_at" in result
        assert "source" in result
        assert "bbox" in result
        assert "fires" in result
        if result["fires"]:
            f = result["fires"][0]
            for field in ("id", "lat", "lon", "acq_time", "frp_mw", "brightness_k", "confidence"):
                assert field in f, f"Missing field: {field}"

    def test_required_coord_fields_are_floats(self):
        mock_resp = MagicMock()
        mock_resp.text = FIXTURE_VIIRS_CSV
        with patch("ingest.firms.fetch_fires.get", return_value=mock_resp):
            result = fetch_fires(key="test_key_placeholder", sources=["VIIRS_NOAA21_NRT"])
        for f in result["fires"]:
            assert isinstance(f["lat"], float)
            assert isinstance(f["lon"], float)
            assert isinstance(f["frp_mw"], float)


# ---------------------------------------------------------------------------
# Regression tests: failure handling (added 2026-10-10)
# ---------------------------------------------------------------------------

class TestFetchFiresFailureHandling:
    """Regression tests verifying correct failure, partial-success, and
    data-integrity behaviour of fetch_fires."""

    def test_all_sources_fail_raises_upstream_error(self):
        """All sources fail → UpstreamError raised; no empty snapshot written."""
        from ingest.common.http import UpstreamError

        def always_fail(url, **kwargs):
            raise UpstreamError("FIRMS", 503, "Service Unavailable")

        with patch("ingest.firms.fetch_fires.get", side_effect=always_fail):
            with pytest.raises(UpstreamError, match="All FIRMS sources failed"):
                fetch_fires(
                    key="test_key_placeholder",
                    sources=["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT"],
                )

    def test_partial_success_one_fails_one_succeeds(self):
        """One source fails, one succeeds → result returned with sources_failed metadata."""
        good_resp = MagicMock()
        good_resp.text = FIXTURE_VIIRS_CSV
        from ingest.common.http import UpstreamError

        call_count = {"n": 0}

        def mixed_response(url, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise UpstreamError("FIRMS", 502, "Bad Gateway")
            return good_resp

        with patch("ingest.firms.fetch_fires.get", side_effect=mixed_response):
            result = fetch_fires(
                key="test_key_placeholder",
                sources=["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT"],
            )

        assert len(result["fires"]) == 2  # 2 nominal/high from fixture
        assert "sources_failed" in result
        assert "VIIRS_NOAA21_NRT" in result["sources_failed"]
        assert "NASA FIRMS" in result["source"]

    def test_genuine_empty_response_no_error(self):
        """Upstream returns valid CSV with header only → fires=[], no raise."""
        mock_resp = MagicMock()
        mock_resp.text = FIXTURE_EMPTY_CSV
        with patch("ingest.firms.fetch_fires.get", return_value=mock_resp):
            result = fetch_fires(key="test_key_placeholder", sources=["VIIRS_NOAA21_NRT"])
        assert result["fires"] == []
        assert "sources_failed" not in result, "Empty response is not a failure"

    def test_timeout_error_counts_as_failure(self):
        """Timeout → treated as source failure; all sources fail → raises."""
        from requests.exceptions import ReadTimeout
        from ingest.common.http import UpstreamError

        with patch(
            "ingest.firms.fetch_fires.get",
            side_effect=UpstreamError("FIRMS", None, "Connection error after 3 attempts"),
        ):
            with pytest.raises(UpstreamError, match="All FIRMS sources failed"):
                fetch_fires(key="test_key_placeholder", sources=["VIIRS_NOAA21_NRT"])

    def test_partial_result_does_not_include_failed_source_in_source_label(self):
        """source field must only name sources that actually returned data."""
        from ingest.common.http import UpstreamError
        good_resp = MagicMock()
        good_resp.text = FIXTURE_VIIRS_CSV
        call_count = {"n": 0}

        def mixed_response(url, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise UpstreamError("FIRMS", 502, "err")
            return good_resp

        with patch("ingest.firms.fetch_fires.get", side_effect=mixed_response):
            result = fetch_fires(
                key="test_key_placeholder",
                sources=["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT"],
            )
        # Only the source that succeeded should appear in "source"
        assert "VIIRS_NOAA21_NRT" not in result["source"]
        assert "VIIRS_NOAA20_NRT" in result["source"]

    def test_result_always_has_bbox(self):
        """bbox must always reflect the requested bbox, not a fabricated value."""
        mock_resp = MagicMock()
        mock_resp.text = FIXTURE_VIIRS_CSV
        custom_bbox = [74.0, 29.0, 76.0, 31.0]
        with patch("ingest.firms.fetch_fires.get", return_value=mock_resp):
            result = fetch_fires(
                key="test_key_placeholder",
                sources=["VIIRS_NOAA21_NRT"],
                bbox=custom_bbox,
            )
        assert result["bbox"] == custom_bbox

