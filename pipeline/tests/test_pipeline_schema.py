"""Automated schema, FIPS integrity, and secret-leak verification tests."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "frontend" / "public" / "data"
ENV_FILE = Path.home() / ".gemini" / "config" / "us-economy.env"


class TestPipelineArtifacts(unittest.TestCase):
    def test_required_files_exist(self) -> None:
        required = [
            "manifest.json",
            "macro.json",
            "states.json",
            "housing_migration.json",
            "sectors.json",
            "credit_risk.json",
            "policy_corporate.json",
            "search_index.json",
        ]
        for fname in required:
            p = DATA_DIR / fname
            self.assertTrue(p.exists(), f"Missing artifact: {fname}")
            self.assertGreater(p.stat().st_size, 50, f"Artifact too small: {fname}")

    def test_manifest_health(self) -> None:
        m = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(m["states_count"], 51)
        self.assertGreater(m["counties_count"], 3000)
        self.assertGreaterEqual(m["ok_sources"], 18, f"Too few healthy sources: {m}")

    def test_states_and_county_shards(self) -> None:
        st_data = json.loads((DATA_DIR / "states.json").read_text(encoding="utf-8"))
        states = st_data["states"]
        self.assertEqual(len(states), 51)
        for st in states:
            self.assertRegex(st["fips"], r"^\d{2}$")
            shard = DATA_DIR / "counties" / f"{st['fips']}.json"
            self.assertTrue(shard.exists(), f"Missing county shard for {st['fips']}")
            c_data = json.loads(shard.read_text(encoding="utf-8"))
            for c in c_data["counties"]:
                self.assertRegex(c["fips"], r"^\d{5}$")
                self.assertEqual(c["fips"][:2], st["fips"])

    def test_no_nan_or_secret_leaks(self) -> None:
        secrets: list[str] = []
        if ENV_FILE.exists():
            for line in ENV_FILE.read_text(encoding="utf-8", errors="ignore").splitlines():
                s = line.strip()
                if s and not s.startswith("#") and "=" in s:
                    _, v = s.split("=", 1)
                    v = v.strip().strip('"').strip("'")
                    if len(v) >= 12:
                        secrets.append(v)

        for p in DATA_DIR.rglob("*.json"):
            text = p.read_text(encoding="utf-8")
            self.assertNotIn("NaN", text, f"NaN found in {p}")
            self.assertNotIn("Infinity", text, f"Infinity found in {p}")
            for sec in secrets:
                self.assertNotIn(sec, text, f"SECRET LEAK detected in {p}!")


if __name__ == "__main__":
    unittest.main()
