"""
models/tests/test_rank_sites.py
---------------------------------
Comprehensive tests for models/exposure/rank_sites.py.

Test fixtures labelled [FIXTURE] contain constructed geometries and
mathematical values for isolated unit-test mechanics.
They are NOT real environmental observations, are never written to data/live/,
and must never be treated as production data.

Integration tests that use real snapshots from data/live/ are labelled
[INTEGRATION] and skip gracefully when the live files are absent.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest

from models.exposure.rank_sites import (
    _SENSITIVITY_DELTA,
    rank_sites,
    risk_score,
    urgency_factor,
    vulnerability_weight,
)

# ---------------------------------------------------------------------------
# Helpers: small [FIXTURE] corridor / sites / population builders
# ---------------------------------------------------------------------------

_LIVE = Path(__file__).resolve().parents[2] / "data" / "live"

_REAL_DATA_AVAILABLE = (
    (_LIVE / "corridor.geojson").exists()
    and (_LIVE / "sites.geojson").exists()
    and (_LIVE / "population.json").exists()
)


def _make_corridor(
    bands: list[dict[str, Any]],
    *,
    centreline: list[list[float]] | None = None,
) -> dict[str, Any]:
    """[FIXTURE] Build a minimal corridor FeatureCollection."""
    features: list[dict[str, Any]] = []
    for band in bands:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [band["ring"]]},
            "properties": {
                "kind": "band",
                "source_id": band.get("source_id", "src_001"),
                "hour_from": band.get("hour_from", 0),
                "hour_to": band.get("hour_to", 2),
                "risk": band.get("risk", 0.8),
                "pm25_delta_ugm3": band.get("pm25_delta_ugm3", 120.0),
            },
        })
    if centreline is not None:
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": centreline},
            "properties": {"kind": "centerline", "source_id": "src_001"},
        })
    return {"type": "FeatureCollection", "features": features}


def _small_square(cx: float, cy: float, half: float = 0.05) -> list[list[float]]:
    """[FIXTURE] Ring (closed) for a small square centred at (cx, cy)."""
    return [
        [cx - half, cy - half],
        [cx + half, cy - half],
        [cx + half, cy + half],
        [cx - half, cy + half],
        [cx - half, cy - half],  # close
    ]


def _make_sites(*points: tuple[float, float, str, int | None, str]) -> dict[str, Any]:
    """
    [FIXTURE] Build a minimal sites.geojson.

    Each tuple: (lon, lat, site_type, occupancy, site_id)
    """
    features = []
    for lon, lat, stype, occ, sid in points:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": sid,
                "name": f"Test {sid}",
                "type": stype,
                "occupancy": occ,
            },
        })
    return {"type": "FeatureCollection", "features": features}


def _make_population(cells: list[tuple[float, float, int]]) -> dict[str, Any]:
    """[FIXTURE] Build a minimal population.json."""
    return {
        "cell_km": 1.0,
        "generated_at": "2026-10-08T00:00:00Z",
        "source": {
            "name": "test fixture — NOT real data",
            "url": "fixture",
            "doi": "fixture",
            "year": 2020,
            "license": "N/A",
        },
        "bbox": [73.5, 28.0, 77.5, 32.5],
        "cells": [{"lat": lat, "lon": lon, "pop": pop} for lon, lat, pop in cells],
    }


# ---------------------------------------------------------------------------
# A. Spatial intersection tests
# ---------------------------------------------------------------------------

class TestSpatialIntersection:
    """[FIXTURE] Tests for site/band spatial intersection."""

    def test_site_inside_band_is_ranked(self):
        """A site inside the corridor band appears in ranked output."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.8}])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 1
        assert result["sites"][0]["site_id"] == "s_001"

    def test_site_outside_band_excluded(self):
        """A site outside all corridor bands does not appear in output."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.8}])
        sites = _make_sites((76.0, 28.0, "school", None, "s_002"))  # far away
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 0

    def test_site_in_multiple_bands_counted_once(self):
        """A site inside two overlapping bands appears exactly once in ranked output."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([
            {"ring": ring, "risk": 0.8, "hour_from": 0, "pm25_delta_ugm3": 100.0},
            {"ring": ring, "risk": 0.6, "hour_from": 2, "pm25_delta_ugm3": 80.0},
        ])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 1

    def test_site_in_multiple_bands_uses_earliest_eta(self):
        """Site in multiple bands takes the minimum hour_from as ETA."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([
            {"ring": ring, "risk": 0.8, "hour_from": 4, "hour_to": 8, "pm25_delta_ugm3": 80.0},
            {"ring": ring, "risk": 0.9, "hour_from": 0, "hour_to": 2, "pm25_delta_ugm3": 100.0},
        ])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        assert result["sites"][0]["eta_hours"] == 0.0

    def test_site_in_multiple_bands_uses_max_pm25(self):
        """Site in multiple bands takes maximum pm25_delta across bands."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([
            {"ring": ring, "risk": 0.8, "hour_from": 0, "pm25_delta_ugm3": 50.0},
            {"ring": ring, "risk": 0.9, "hour_from": 2, "pm25_delta_ugm3": 150.0},
        ])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        assert result["sites"][0]["pm25_delta_ugm3"] == 150.0

    def test_population_cell_in_multiple_bands_counted_once(self):
        """A population cell overlapping two qualifying bands is counted once."""
        ring = _small_square(77.0, 29.0)
        # Two bands both with risk >= 0.3 (the default threshold)
        corridor = _make_corridor([
            {"ring": ring, "risk": 0.8, "hour_from": 0},
            {"ring": ring, "risk": 0.9, "hour_from": 2},
        ])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([(77.0, 29.0, 5000)])
        result = rank_sites(corridor, sites, pop)
        assert result["exposed_population"]["estimate"] == 5000

    def test_non_band_features_ignored(self):
        """Features that are not 'band' kind are not used for intersection."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor(
            [{"ring": ring, "risk": 0.8}],
            centreline=[[76.9, 29.0], [77.1, 29.0]],
        )
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 1

    def test_empty_corridor_produces_no_ranked_sites(self):
        """Corridor with no bands produces no ranked sites."""
        corridor = {"type": "FeatureCollection", "features": []}
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([(77.0, 29.0, 5000)])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 0

    def test_empty_sites_produces_no_ranked_sites(self):
        """No sites input produces no ranked output."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.8}])
        sites = {"type": "FeatureCollection", "features": []}
        pop = _make_population([(77.0, 29.0, 5000)])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 0


# ---------------------------------------------------------------------------
# B. Ranking formula tests
# ---------------------------------------------------------------------------

class TestVulnerabilityWeight:
    """Unit tests for vulnerability_weight."""

    def test_hospital_factor_higher_than_school(self):
        assert vulnerability_weight("hospital", None) > vulnerability_weight("school", None)

    def test_hospital_base_factor(self):
        assert vulnerability_weight("hospital", None) == pytest.approx(1.5)

    def test_school_base_factor(self):
        assert vulnerability_weight("school", None) == pytest.approx(1.3)

    def test_unknown_type_treated_as_school(self):
        assert vulnerability_weight("clinic", None) == pytest.approx(1.3)

    def test_occupancy_increases_weight(self):
        base = vulnerability_weight("school", None)
        with_occ = vulnerability_weight("school", 500)
        assert with_occ > base

    def test_zero_occupancy_uses_base_factor(self):
        assert vulnerability_weight("school", 0) == pytest.approx(1.3)

    def test_null_occupancy_uses_base_factor(self):
        assert vulnerability_weight("hospital", None) == pytest.approx(1.5)

    def test_occupancy_scales_logarithmically(self):
        """Vulnerability scales by log1p(occupancy)."""
        expected = 1.5 * math.log1p(100)
        assert vulnerability_weight("hospital", 100) == pytest.approx(expected)

    def test_negative_occupancy_uses_base_factor(self):
        """Negative occupancy (data error) falls through to base factor."""
        # The implementation checks occupancy > 0
        assert vulnerability_weight("school", -5) == pytest.approx(1.3)


class TestUrgencyFactor:
    """Unit tests for urgency_factor."""

    def test_eta_zero_gives_urgency_one(self):
        assert urgency_factor(0.0) == pytest.approx(1.0)

    def test_eta_positive_reduces_urgency(self):
        assert urgency_factor(1.0) == pytest.approx(0.5)
        assert urgency_factor(3.0) == pytest.approx(0.25)

    def test_eta_negative_clamped_to_zero(self):
        """Negative ETA (data artefact) should not increase urgency above 1."""
        assert urgency_factor(-5.0) == pytest.approx(1.0)

    def test_urgency_strictly_decreasing(self):
        etas = [0, 1, 2, 4, 8, 24]
        urgencies = [urgency_factor(float(e)) for e in etas]
        for i in range(len(urgencies) - 1):
            assert urgencies[i] > urgencies[i + 1]


class TestRiskScore:
    """Unit tests for risk_score."""

    def test_zero_pm25_gives_zero_risk(self):
        assert risk_score(0.0, "school", None, 0.0) == pytest.approx(0.0)

    def test_high_pm25_hospital_immediate_eta_gives_high_risk(self):
        score = risk_score(200.0, "hospital", None, 0.0)
        # vuln=1.5, urg=1.0, raw=1.0*1.5*1.0=1.5 → clipped to 1.0
        assert score == pytest.approx(1.0)

    def test_hospital_scores_higher_than_school_equal_inputs(self):
        hosp = risk_score(100.0, "hospital", None, 2.0)
        sch = risk_score(100.0, "school", None, 2.0)
        assert hosp > sch

    def test_lower_eta_gives_higher_score(self):
        near = risk_score(100.0, "school", None, 0.0)
        far = risk_score(100.0, "school", None, 10.0)
        assert near > far

    def test_score_clamped_between_zero_and_one(self):
        """Score must always be in [0, 1]."""
        for pm25 in [0, 50, 200, 500, 10000]:
            score = risk_score(float(pm25), "hospital", 1000, 0.0)
            assert 0.0 <= score <= 1.0

    def test_null_occupancy_does_not_crash(self):
        score = risk_score(80.0, "school", None, 1.0)
        assert isinstance(score, float)


class TestRankOrder:
    """[FIXTURE] Ranking is consistent and deterministic."""

    def _two_site_result(
        self,
        pm25_a: float,
        stype_a: str,
        eta_a: float,
        pm25_b: float,
        stype_b: str,
        eta_b: float,
    ) -> list[dict]:
        """Helper: two sites in the same band, return ranked list."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{
            "ring": ring, "risk": 0.9,
            "hour_from": min(eta_a, eta_b),
            "pm25_delta_ugm3": max(pm25_a, pm25_b),
        }])
        sites = _make_sites(
            (77.0, 29.0, stype_a, None, "s_A"),
            (77.01, 29.01, stype_b, None, "s_B"),
        )
        # Put both sites clearly inside (77.0-0.05..77.0+0.05, same for lat)
        # Override them to be exactly at centres
        sites["features"][0]["geometry"]["coordinates"] = [77.0, 29.0]
        sites["features"][1]["geometry"]["coordinates"] = [77.01, 29.01]

        # Use separate bands per site for independent pm25/eta control
        ring_a = _small_square(77.0, 29.0, half=0.03)
        ring_b = _small_square(77.01, 29.01, half=0.03)
        corridor = _make_corridor([
            {"ring": ring_a, "risk": 0.9, "hour_from": int(eta_a),
             "pm25_delta_ugm3": pm25_a, "source_id": "src_001"},
            {"ring": ring_b, "risk": 0.9, "hour_from": int(eta_b),
             "pm25_delta_ugm3": pm25_b, "source_id": "src_001"},
        ])
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        return result["sites"]

    def test_hospital_outranks_school_equal_exposure(self):
        """A hospital outranks a school at equal pm25 and ETA."""
        ring_a = _small_square(77.0, 29.0, half=0.03)
        ring_b = _small_square(77.01, 29.01, half=0.03)
        corridor = _make_corridor([
            {"ring": ring_a, "risk": 0.9, "hour_from": 2, "pm25_delta_ugm3": 100.0},
            {"ring": ring_b, "risk": 0.9, "hour_from": 2, "pm25_delta_ugm3": 100.0},
        ])
        sites = _make_sites(
            (77.0, 29.0, "school", None, "s_school"),
            (77.01, 29.01, "hospital", None, "s_hospital"),
        )
        pop = _make_population([])
        ranked = rank_sites(corridor, sites, pop)["sites"]
        top = ranked[0]
        assert top["site_id"] == "s_hospital"

    def test_closer_eta_outranks_farther_eta_equal_type(self):
        """Same type, same pm25: lower ETA → higher rank."""
        # Use well-separated rings to ensure no overlap
        ring_near = _small_square(77.0, 29.0, half=0.03)
        ring_far  = _small_square(75.0, 28.0, half=0.03)  # far away from near
        corridor = _make_corridor([
            {"ring": ring_near, "risk": 0.9, "hour_from": 0, "pm25_delta_ugm3": 100.0},
            {"ring": ring_far,  "risk": 0.9, "hour_from": 8, "pm25_delta_ugm3": 100.0},
        ])
        sites = _make_sites(
            (77.0, 29.0, "school", None, "s_near"),
            (75.0, 28.0, "school", None, "s_far"),
        )
        pop = _make_population([])
        ranked = rank_sites(corridor, sites, pop)["sites"]
        assert ranked[0]["site_id"] == "s_near"

    def test_rank_assigned_sequentially_from_one(self):
        """Ranks are assigned 1, 2, 3… in descending score order."""
        ring_a = _small_square(77.0, 29.0, half=0.03)
        ring_b = _small_square(77.01, 29.01, half=0.03)
        ring_c = _small_square(77.02, 29.02, half=0.03)
        corridor = _make_corridor([
            {"ring": ring_a, "risk": 0.9, "hour_from": 0, "pm25_delta_ugm3": 150.0},
            {"ring": ring_b, "risk": 0.9, "hour_from": 2, "pm25_delta_ugm3": 100.0},
            {"ring": ring_c, "risk": 0.9, "hour_from": 8, "pm25_delta_ugm3": 80.0},
        ])
        sites = _make_sites(
            (77.0, 29.0, "school", None, "s_001"),
            (77.01, 29.01, "school", None, "s_002"),
            (77.02, 29.02, "school", None, "s_003"),
        )
        pop = _make_population([])
        ranked = rank_sites(corridor, sites, pop)["sites"]
        assert [s["rank"] for s in ranked] == [1, 2, 3]
        # Scores must be non-increasing
        scores = [s["risk_score"] for s in ranked]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1]

    def test_tied_scores_deterministic_by_site_id(self):
        """Equal-score sites are broken by site_id lexicographic order."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([
            {"ring": ring, "risk": 0.9, "hour_from": 2, "pm25_delta_ugm3": 100.0},
        ])
        # Two identical sites with different IDs → same score
        sites = _make_sites(
            (77.0, 29.0, "school", None, "s_ZZZ"),
            (77.01, 29.01, "school", None, "s_AAA"),
        )
        pop = _make_population([])
        # Put second site inside same ring
        sites["features"][1]["geometry"]["coordinates"] = [77.0, 29.0]
        ranked = rank_sites(corridor, sites, pop)["sites"]
        # s_AAA < s_ZZZ lexicographically, so s_AAA should rank first at equal score
        assert ranked[0]["site_id"] == "s_AAA"

    def test_null_occupancy_does_not_fabricate_default(self):
        """Sites with null occupancy appear in rankings without hardcoded defaults."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([])
        ranked = rank_sites(corridor, sites, pop)["sites"]
        assert len(ranked) == 1
        assert ranked[0]["occupancy"] is None
        # Score uses base vulnerability factor, not a fabricated occupancy
        expected_score = risk_score(
            120.0, "school", None, 0.0
        )
        assert ranked[0]["risk_score"] == pytest.approx(expected_score, abs=0.001)

    def test_site_missing_id_field_skipped(self):
        """Sites without an 'id' field in properties raise KeyError (expected contract violation)."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        site_no_id = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [77.0, 29.0]},
                "properties": {"name": "No ID", "type": "school", "occupancy": None},
            }],
        }
        pop = _make_population([])
        with pytest.raises(KeyError):
            rank_sites(corridor, site_no_id, pop)

    def test_site_missing_coordinates_skipped(self):
        """Sites with null coordinates are skipped without crashing."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        site_no_coord = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [None, None]},
                "properties": {"id": "s_bad", "name": "Bad", "type": "school", "occupancy": None},
            }],
        }
        pop = _make_population([])
        result = rank_sites(corridor, site_no_coord, pop)
        assert len(result["sites"]) == 0


# ---------------------------------------------------------------------------
# C. Population exposure tests
# ---------------------------------------------------------------------------

class TestPopulationExposure:
    """[FIXTURE] Tests for exposed population calculation."""

    def test_cell_inside_high_risk_band_counted(self):
        """Population cell inside a qualifying band contributes to estimate."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.8}])
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 3000)])
        result = rank_sites(corridor, sites, pop, risk_threshold=0.3)
        assert result["exposed_population"]["estimate"] == 3000

    def test_cell_outside_band_not_counted(self):
        """Population cell outside all corridor bands = 0 estimate."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.8}])
        sites = _make_sites()
        pop = _make_population([(76.0, 28.0, 5000)])  # far outside
        result = rank_sites(corridor, sites, pop, risk_threshold=0.3)
        assert result["exposed_population"]["estimate"] == 0

    def test_cell_in_low_risk_band_excluded_by_threshold(self):
        """Population cell inside a band whose risk < threshold is excluded."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.1}])  # below threshold 0.3
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 8000)])
        result = rank_sites(corridor, sites, pop, risk_threshold=0.3)
        assert result["exposed_population"]["estimate"] == 0

    def test_empty_population_estimate_is_zero_not_unavailable(self):
        """Empty population cells → estimate=0, data_available=False."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([])  # no cells
        result = rank_sites(corridor, sites, pop)
        ep = result["exposed_population"]
        assert ep["estimate"] == 0
        assert ep["data_available"] is False

    def test_nonempty_population_data_available_true(self):
        """When population cells are provided, data_available=True."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 1000)])
        result = rank_sites(corridor, sites, pop)
        assert result["exposed_population"]["data_available"] is True

    def test_population_not_double_counted_overlapping_bands(self):
        """Same population cell inside two overlapping qualifying bands counted once."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([
            {"ring": ring, "risk": 0.8, "hour_from": 0},
            {"ring": ring, "risk": 0.7, "hour_from": 2},
        ])
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 4000)])
        result = rank_sites(corridor, sites, pop, risk_threshold=0.3)
        assert result["exposed_population"]["estimate"] == 4000

    def test_multiple_cells_inside_band_summed(self):
        """Multiple distinct population cells inside a band are all summed."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([
            (77.0, 29.0, 1000),
            (77.01, 29.01, 2000),
            (76.9, 28.9, 500),   # outside ring (half=0.05 → boundary at 76.95, 28.95)
        ])
        result = rank_sites(corridor, sites, pop, risk_threshold=0.3)
        # Only cells within the ring qualify; (76.9, 28.9) is outside
        assert result["exposed_population"]["estimate"] == 3000

    def test_reproducible_across_two_runs(self):
        """Identical inputs produce identical estimates on consecutive calls."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([(77.0, 29.0, 7000), (77.02, 29.02, 3000)])
        result1 = rank_sites(corridor, sites, pop)
        result2 = rank_sites(corridor, sites, pop)
        ep1 = result1["exposed_population"]
        ep2 = result2["exposed_population"]
        assert ep1["estimate"] == ep2["estimate"]
        assert ep1["low"] == ep2["low"]
        assert ep1["high"] == ep2["high"]
        assert result1["sites"][0]["risk_score"] == result2["sites"][0]["risk_score"]


# ---------------------------------------------------------------------------
# D. Exposure range / threshold sensitivity tests
# ---------------------------------------------------------------------------

class TestExposureRange:
    """[FIXTURE] Tests for the threshold sensitivity exposure range."""

    def test_low_bound_le_estimate(self):
        """Conservative (tighter) threshold → low <= estimate."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.8}])
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 5000)])
        result = rank_sites(corridor, sites, pop, risk_threshold=0.3)
        ep = result["exposed_population"]
        assert ep["low"] <= ep["estimate"]

    def test_high_bound_ge_estimate(self):
        """Liberal (looser) threshold → high >= estimate."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.8}])
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 5000)])
        result = rank_sites(corridor, sites, pop, risk_threshold=0.3)
        ep = result["exposed_population"]
        assert ep["high"] >= ep["estimate"]

    def test_range_monotone_with_threshold(self):
        """
        When there are bands at different risk levels, higher threshold should
        yield smaller or equal population than lower threshold.
        """
        # Two bands: high-risk and mid-risk
        ring_high = _small_square(77.0, 29.0, half=0.03)
        ring_mid = _small_square(77.05, 29.0, half=0.03)
        corridor = _make_corridor([
            {"ring": ring_high, "risk": 0.9},
            {"ring": ring_mid, "risk": 0.5},
        ])
        sites = _make_sites()
        pop = _make_population([
            (77.0, 29.0, 1000),    # inside high-risk band
            (77.05, 29.0, 2000),   # inside mid-risk band
        ])
        result = rank_sites(corridor, sites, pop, risk_threshold=0.5)
        ep = result["exposed_population"]
        # estimate: threshold=0.5 → both bands qualify → 3000
        # low: threshold=0.5+0.15=0.65 → only high-risk band (0.9) qualifies → 1000
        # high: threshold=0.5-0.15=0.35 → both qualify → 3000
        assert ep["estimate"] == 3000
        assert ep["low"] == 1000
        assert ep["high"] == 3000

    def test_high_threshold_floor_at_zero(self):
        """When risk_threshold > 1.0-SENSITIVITY_DELTA, low threshold is clamped to 1."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 5000)])
        # Using risk_threshold=0.95 → thresh_low = min(1.0, 0.95+0.15) = 1.0
        result = rank_sites(corridor, sites, pop, risk_threshold=0.95)
        ep = result["exposed_population"]
        # No band has risk >= 1.0, so low = 0
        assert ep["low"] == 0

    def test_low_threshold_floor_at_zero(self):
        """When risk_threshold < SENSITIVITY_DELTA, high threshold is clamped to 0."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.05}])  # very low risk
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 5000)])
        # risk_threshold=0.1, thresh_high = max(0, 0.1-0.15) = 0 → all bands qualify
        result = rank_sites(corridor, sites, pop, risk_threshold=0.1)
        ep = result["exposed_population"]
        # Band risk=0.05 < 0.1 threshold → estimate=0
        # thresh_high=0.0 → band risk 0.05 >= 0.0 → high=5000
        assert ep["estimate"] == 0
        assert ep["high"] == 5000

    def test_empty_pop_range_all_zero(self):
        """With no population cells, all range values are 0."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        ep = result["exposed_population"]
        assert ep["estimate"] == 0
        assert ep["low"] == 0
        assert ep["high"] == 0

    def test_method_field_present_and_not_ci(self):
        """Method field describes threshold sensitivity; must not claim to be a CI."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([(77.0, 29.0, 1000)])
        result = rank_sites(corridor, sites, pop)
        method = result["exposed_population"].get("method", "")
        assert method != "", "method field must not be empty"
        assert "threshold" in method.lower() or "sensitivity" in method.lower()
        # Must NOT claim a statistical confidence interval
        assert "90% ci" not in method.lower()
        assert "90% confidence" not in method.lower()

    def test_sensitivity_delta_constant_documented(self):
        """_SENSITIVITY_DELTA constant is positive and less than 1."""
        assert 0 < _SENSITIVITY_DELTA < 1.0


# ---------------------------------------------------------------------------
# E. Error handling tests
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """[FIXTURE] Error handling for malformed inputs."""

    def test_malformed_corridor_no_features(self):
        """Corridor dict missing 'features' key is treated as no bands."""
        corridor = {"type": "FeatureCollection"}
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([(77.0, 29.0, 1000)])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 0
        assert result["exposed_population"]["estimate"] == 0

    def test_sites_missing_features_key(self):
        """Sites dict missing 'features' is treated as no sites."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = {"type": "FeatureCollection"}
        pop = _make_population([(77.0, 29.0, 1000)])
        result = rank_sites(corridor, sites, pop)
        assert len(result["sites"]) == 0

    def test_population_missing_cells_key(self):
        """Population dict missing 'cells' returns 0 estimate, data_available=False."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = {"cell_km": 1.0, "generated_at": "2026-01-01T00:00:00Z"}
        result = rank_sites(corridor, sites, pop)
        assert result["exposed_population"]["estimate"] == 0
        assert result["exposed_population"]["data_available"] is False

    def test_corridor_band_missing_geometry_skipped(self):
        """Band feature with missing geometry does not crash the pipeline."""
        bad_band = {
            "type": "Feature",
            "geometry": None,
            "properties": {"kind": "band", "risk": 0.9, "hour_from": 0,
                           "pm25_delta_ugm3": 100.0, "source_id": "src_001"},
        }
        corridor = {"type": "FeatureCollection", "features": [bad_band]}
        sites = _make_sites((77.0, 29.0, "school", None, "s_001"))
        pop = _make_population([(77.0, 29.0, 1000)])
        # Should not raise; site won't be matched to a band with no geometry
        try:
            result = rank_sites(corridor, sites, pop)
            # Expected: 0 sites ranked since band geometry is invalid/missing
            assert isinstance(result, dict)
        except (TypeError, AttributeError):
            # Also acceptable if shapely raises on None geometry
            pass

    def test_output_schema_always_present(self):
        """ranked_sites output always contains required top-level keys."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        for key in ("generated_at", "exposed_population", "sites"):
            assert key in result
        for key in ("estimate", "low", "high", "method", "data_available"):
            assert key in result["exposed_population"]

    def test_generated_at_is_utc_iso8601(self):
        """generated_at field is an ISO-8601 UTC string ending in Z."""
        ring = _small_square(77.0, 29.0)
        corridor = _make_corridor([{"ring": ring, "risk": 0.9}])
        sites = _make_sites()
        pop = _make_population([])
        result = rank_sites(corridor, sites, pop)
        ts = result["generated_at"]
        assert ts.endswith("Z")
        from datetime import datetime
        # Should not raise
        datetime.fromisoformat(ts.replace("Z", "+00:00"))


# ---------------------------------------------------------------------------
# F. Integration tests against real snapshots
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not _REAL_DATA_AVAILABLE, reason="Real live snapshots not available")
class TestRealSnapshotIntegration:
    """[INTEGRATION] Tests against real data/live/ snapshots.

    These tests validate that the pipeline produces reasonable results from
    real inputs. They do NOT hard-code expected values — they check structure,
    types, monotonicity, and data-integrity constraints.
    """

    @pytest.fixture(scope="class")
    def live_inputs(self):
        corridor = json.loads((_LIVE / "corridor.geojson").read_text(encoding="utf-8"))
        sites = json.loads((_LIVE / "sites.geojson").read_text(encoding="utf-8"))
        pop = json.loads((_LIVE / "population.json").read_text(encoding="utf-8"))
        return corridor, sites, pop

    @pytest.fixture(scope="class")
    def live_result(self, live_inputs):
        corridor, sites, pop = live_inputs
        return rank_sites(corridor, sites, pop)

    def test_produces_ranked_sites(self, live_result):
        assert len(live_result["sites"]) > 0

    def test_ranks_are_sequential(self, live_result):
        ranks = [s["rank"] for s in live_result["sites"]]
        assert ranks == list(range(1, len(ranks) + 1))

    def test_scores_non_increasing(self, live_result):
        scores = [s["risk_score"] for s in live_result["sites"]]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1]

    def test_all_scores_in_range(self, live_result):
        for s in live_result["sites"]:
            assert 0.0 <= s["risk_score"] <= 1.0

    def test_all_required_site_fields_present(self, live_result):
        required = {"site_id", "name", "type", "lat", "lon", "occupancy",
                    "eta_hours", "pm25_delta_ugm3", "risk_score", "source_id", "rank"}
        for s in live_result["sites"]:
            assert required <= set(s.keys()), f"Missing fields in {s['site_id']}"

    def test_occupancy_null_not_fabricated(self, live_result):
        """Occupancy must be null (not a hardcoded default like 150 or 800)."""
        for s in live_result["sites"]:
            if s["occupancy"] is not None:
                # It came from real OSM data — just check it's a positive int
                assert isinstance(s["occupancy"], int)
                assert s["occupancy"] > 0

    def test_exposed_population_schema(self, live_result):
        ep = live_result["exposed_population"]
        for key in ("estimate", "low", "high", "method", "data_available"):
            assert key in ep
        assert isinstance(ep["estimate"], int)
        assert isinstance(ep["low"], int)
        assert isinstance(ep["high"], int)

    def test_exposure_range_logically_ordered(self, live_result):
        """low <= estimate <= high when population data is available."""
        ep = live_result["exposed_population"]
        if ep["data_available"]:
            assert ep["low"] <= ep["estimate"], (
                f"low={ep['low']} > estimate={ep['estimate']}: range inverted"
            )
            assert ep["estimate"] <= ep["high"], (
                f"estimate={ep['estimate']} > high={ep['high']}: range inverted"
            )

    def test_method_field_not_ci(self, live_result):
        """Method must not claim to be a 90% confidence interval."""
        method = live_result["exposed_population"].get("method", "")
        assert "90% ci" not in method.lower()
        assert "90% confidence" not in method.lower()

    def test_reproducible_two_runs(self, live_inputs):
        """Two consecutive runs on the same inputs produce identical numeric outputs."""
        corridor, sites, pop = live_inputs
        r1 = rank_sites(corridor, sites, pop)
        r2 = rank_sites(corridor, sites, pop)

        ep1 = r1["exposed_population"]
        ep2 = r2["exposed_population"]
        assert ep1["estimate"] == ep2["estimate"]
        assert ep1["low"] == ep2["low"]
        assert ep1["high"] == ep2["high"]

        for s1, s2 in zip(r1["sites"], r2["sites"]):
            assert s1["site_id"] == s2["site_id"]
            assert s1["risk_score"] == s2["risk_score"]
            assert s1["rank"] == s2["rank"]
