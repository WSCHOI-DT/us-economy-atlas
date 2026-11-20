#!/usr/bin/env python3
"""Cadence-aligned fault-tolerant ETL runner for US Economy Atlas.

Usage:
  python pipeline/fetch.py --tier all
  python pipeline/fetch.py --tier daily
  python pipeline/fetch.py --tier weekly
  python pipeline/fetch.py --tier monthly
  python pipeline/fetch.py --tier quarterly
  python pipeline/fetch.py --tier annual
  python pipeline/fetch.py --source fred,bea
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any, Callable

# Ensure repo root is importable when invoked as `python pipeline/fetch.py`
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.build_artifacts import build_all
from pipeline.common import load_raw, pack_raw_bundle, save_raw, unpack_raw_bundle, utc_now_iso
from pipeline.config import PUBLIC_DATA_DIR
from pipeline.sources.housing_migration import fetch_fhfa, fetch_irs_migration, fetch_realtor, fetch_zillow
from pipeline.sources.macro_policy import (
    fetch_congress,
    fetch_fedreg,
    fetch_fred,
    fetch_secedgar,
    fetch_treasury,
    fetch_usafacts,
)
from pipeline.sources.regional_core import fetch_bea, fetch_bls, fetch_census
from pipeline.sources.sector_risk import (
    fetch_cfpb,
    fetch_eia,
    fetch_fdic,
    fetch_fema,
    fetch_intltrade,
    fetch_sba,
    fetch_usaspending,
    fetch_usda_ers,
    fetch_usda_nass,
)

TIER_MAP: dict[str, list[str]] = {
    "daily": ["fred", "treasury", "fedreg", "congress", "secedgar", "cfpb", "fema"],
    "weekly": ["fred", "eia"],
    "monthly": ["fred", "bls", "zillow", "realtor", "intltrade", "eia", "usaspending", "usafacts"],
    "quarterly": ["fred", "fhfa", "fdic", "sba"],
    "annual": ["bea", "census", "fhfa", "irs_migration", "usda_nass", "usda_ers"],
}

FETCHERS: dict[str, Callable[[], dict[str, Any]]] = {
    "fred": lambda: fetch_fred(None),
    "treasury": fetch_treasury,
    "fedreg": fetch_fedreg,
    "congress": fetch_congress,
    "secedgar": fetch_secedgar,
    "usafacts": fetch_usafacts,
    "bea": fetch_bea,
    "census": fetch_census,
    "bls": fetch_bls,
    "zillow": fetch_zillow,
    "realtor": fetch_realtor,
    "fhfa": fetch_fhfa,
    "irs_migration": fetch_irs_migration,
    "usda_nass": fetch_usda_nass,
    "usda_ers": fetch_usda_ers,
    "intltrade": fetch_intltrade,
    "eia": fetch_eia,
    "usaspending": fetch_usaspending,
    "fdic": fetch_fdic,
    "sba": fetch_sba,
    "fema": fetch_fema,
    "cfpb": fetch_cfpb,
}


def load_previous_statuses() -> dict[str, dict[str, Any]]:
    manifest_path = PUBLIC_DATA_DIR / "manifest.json"
    if not manifest_path.exists():
        return {}
    try:
        import json
        m = json.loads(manifest_path.read_text(encoding="utf-8"))
        return {
            s["id"]: {
                "status": s.get("status", "ok"),
                "fetched_at": s.get("fetched_at"),
                "vintage": s.get("vintage"),
                "count": s.get("record_count", 0),
                "error": s.get("error"),
            }
            for s in m.get("sources", [])
        }
    except Exception:
        return {}


def main() -> None:
    parser = argparse.ArgumentParser(description="US Economy Atlas ETL Pipeline")
    parser.add_argument("--tier", choices=["all", "daily", "weekly", "monthly", "quarterly", "annual"], default="all")
    parser.add_argument("--source", default="", help="Comma-separated specific source IDs to fetch")
    parser.add_argument("--build-only", action="store_true", help="Skip network fetches and rebuild JSON artifacts from raw/")
    args = parser.parse_args()

    if args.build_only:
        targets: list[str] = []
    elif args.source:
        targets = [s.strip() for s in args.source.split(",") if s.strip()]
    elif args.tier == "all":
        targets = list(FETCHERS.keys())
    else:
        targets = TIER_MAP[args.tier]

    unpack_raw_bundle()
    statuses = load_previous_statuses()

    for sid in targets:
        if sid not in FETCHERS:
            print(f"[SKIP] Unknown source: {sid}")
            continue
        t0 = time.time()
        print(f"[FETCH] {sid} ...", flush=True)
        try:
            if sid == "fred" and args.tier in ("daily", "weekly", "monthly", "quarterly") and load_raw("fred"):
                # Incremental FRED tier merge so daily run only queries daily series!
                prev = load_raw("fred") or {"series": {}}
                partial = fetch_fred({args.tier})
                merged = dict(prev.get("series", {}))
                merged.update(partial.get("series", {}))
                payload = {
                    **partial,
                    "count": len(merged),
                    "series": merged,
                }
            else:
                payload = FETCHERS[sid]()
            save_raw(sid, payload)
            elapsed = round(time.time() - t0, 1)
            statuses[sid] = {
                "status": "ok",
                "fetched_at": payload.get("fetched_at") or utc_now_iso(),
                "vintage": payload.get("vintage"),
                "count": payload.get("count", 0),
                "error": None,
            }
            print(f"  [OK] {sid} ({elapsed}s) | vintage={payload.get('vintage')} | count={payload.get('count')}", flush=True)
        except Exception as exc:
            elapsed = round(time.time() - t0, 1)
            has_fallback = load_raw(sid) is not None
            err_msg = str(exc)[:240]
            prev_st = statuses.get(sid, {})
            statuses[sid] = {
                "status": "stale" if has_fallback else "error",
                "fetched_at": prev_st.get("fetched_at"),
                "vintage": prev_st.get("vintage"),
                "count": prev_st.get("count", 0),
                "error": err_msg,
            }
            print(f"  [WARN] {sid} failed ({elapsed}s, fallback={has_fallback}): {err_msg}", flush=True)

    print("[BUILD] Compiling sharded frontend JSON data lake ...", flush=True)
    manifest = build_all(statuses)
    pack_raw_bundle()
    print(
        f"[DONE] ok={manifest['ok_sources']} stale={manifest['stale_sources']} "
        f"deferred={manifest['deferred_sources']} states={manifest['states_count']} counties={manifest['counties_count']}",
        flush=True,
    )


if __name__ == "__main__":
    main()
