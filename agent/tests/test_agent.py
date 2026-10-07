"""
agent/tests/test_agent.py
-------------------------
Unit tests for the AERIS Action Agent, tools, and schema validation.
Standard unittest + pytest compatible.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from agent.agent import ActionsOutput, generate_action_plan, run
from agent.tools import (
    get_exposed_population,
    get_ranked_sites,
    get_site,
    get_sources,
    query_corridor,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DATA_LIVE = _REPO_ROOT / "data" / "live"


class TestAgentSuite(unittest.TestCase):
    def test_get_sources_returns_valid_data(self):
        sources = get_sources()
        self.assertIsInstance(sources, list)
        if sources:
            first = sources[0]
            self.assertIn("id", first)
            self.assertIn("lat", first)
            self.assertIn("lon", first)
            self.assertIn("emission_strength", first)
            self.assertTrue(0.0 <= first["emission_strength"] <= 1.0)

    def test_query_corridor_returns_bands(self):
        bands = query_corridor()
        self.assertIsInstance(bands, list)
        if bands:
            first = bands[0]
            self.assertEqual(first.get("kind"), "band")
            self.assertIn("hour_from", first)
            self.assertIn("hour_to", first)
            self.assertIn("pm25_delta_ugm3", first)

    def test_get_ranked_sites_filtering(self):
        top_5 = get_ranked_sites(top_n=5)
        self.assertLessEqual(len(top_5), 5)
        schools = get_ranked_sites(top_n=5, site_type="school")
        for s in schools:
            self.assertEqual(s["type"], "school")

    def test_get_exposed_population(self):
        pop = get_exposed_population()
        self.assertIn("estimate", pop)
        self.assertIn("low", pop)
        self.assertIn("high", pop)
        self.assertTrue(pop["low"] <= pop["estimate"] <= pop["high"])

    def test_generate_action_plan_schema(self):
        plan = generate_action_plan()
        self.assertIsInstance(plan, ActionsOutput)
        self.assertTrue(bool(plan.summary))
        self.assertGreater(len(plan.actions), 0)
        self.assertGreater(len(plan.authority_actions), 0)

        for a in plan.actions:
            self.assertGreater(a.priority, 0)
            self.assertTrue(bool(a.site_id))
            self.assertTrue(bool(a.who))
            self.assertTrue(bool(a.action))
            self.assertTrue(bool(a.reason))
            self.assertGreaterEqual(a.deadline_hours, 0)

        for auth in plan.authority_actions:
            self.assertTrue(bool(auth.who))
            self.assertTrue(bool(auth.action))
            self.assertTrue(bool(auth.reason))

    def test_actions_output_serialization(self):
        data = run(_DATA_LIVE)
        self.assertIsInstance(data, dict)
        self.assertIn("generated_at", data)
        self.assertIn("summary", data)
        self.assertIn("actions", data)
        self.assertIn("authority_actions", data)


if __name__ == "__main__":
    unittest.main()
