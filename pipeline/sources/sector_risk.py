"""Sector, Trade, Energy, Federal Flows, Banking, Credit, Disasters & Complaints fetchers."""

from __future__ import annotations

import csv
import datetime as dt
import json
import time
import urllib.parse
from collections import defaultdict
from typing import Any

from ..common import (
    download_cached,
    get_key,
    http_get_bytes,
    http_post_json,
    mcp_call,
    safe_float,
    safe_int,
    utc_now_iso,
)
from ..config import ABBR_TO_FIPS, FIPS_TO_ABBR, FIPS_TO_NAME, TRADE_HS_WATCHLIST


def fetch_usda_nass() -> dict[str, Any]:
    key = get_key("USDA_NASS_API_KEY")
    if not key:
        raise RuntimeError("Missing USDA_NASS_API_KEY")

    # Fetch state-level production in $ for major US crops & livestock
    commodities = ["CORN", "SOYBEANS", "WHEAT", "COTTON", "HAY", "CATTLE"]
    state_ag: dict[str, dict[str, Any]] = defaultdict(lambda: {"crops": {}, "total_crop_value_m": 0.0})
    commodity_totals: dict[str, dict[str, Any]] = {}
    latest_year = 0

    for comm in commodities:
        params = urllib.parse.urlencode({
            "key": key,
            "format": "JSON",
            "commodity_desc": comm,
            "statisticcat_desc": "PRODUCTION",
            "unit_desc": "$",
            "agg_level_desc": "STATE",
            "source_desc": "SURVEY",
            "year__GE": "2023",
        })
        try:
            raw = json.loads(http_get_bytes(f"https://quickstats.nass.usda.gov/api/api_GET/?{params}", timeout=30).decode("utf-8"))
        except Exception:
            continue
        by_st_latest: dict[str, tuple[int, float]] = {}
        for r in raw.get("data", []):
            abbr = (r.get("state_alpha") or "").upper()
            st = ABBR_TO_FIPS.get(abbr)
            yr = safe_int(r.get("year")) or 0
            val = safe_float(r.get("Value"))
            if not st or val is None:
                continue
            if yr > latest_year:
                latest_year = yr
            prev = by_st_latest.get(st)
            if not prev or yr > prev[0] or (yr == prev[0] and val > prev[1]):
                by_st_latest[st] = (yr, val)
        tot_b = 0.0
        top_states = []
        for st, (yr, val) in by_st_latest.items():
            val_m = round(val / 1e6, 2)
            state_ag[st]["crops"][comm] = {"year": yr, "value_m": val_m}
            state_ag[st]["total_crop_value_m"] = round(state_ag[st]["total_crop_value_m"] + val_m, 2)
            tot_b += val / 1e9
            top_states.append({"state_fips": st, "state_abbr": FIPS_TO_ABBR[st], "value_m": val_m, "year": yr})
        top_states.sort(key=lambda x: x["value_m"], reverse=True)
        commodity_totals[comm] = {"total_b": round(tot_b, 2), "top_states": top_states[:10]}
        time.sleep(0.15)

    # Also pull county-level Corn production (BU) for top agricultural counties
    county_corn: dict[str, dict[str, Any]] = {}
    try:
        params_c = urllib.parse.urlencode({
            "key": key,
            "format": "JSON",
            "commodity_desc": "CORN",
            "statisticcat_desc": "PRODUCTION",
            "unit_desc": "BU",
            "agg_level_desc": "COUNTY",
            "source_desc": "SURVEY",
            "year__GE": "2023",
        })
        raw_c = json.loads(http_get_bytes(f"https://quickstats.nass.usda.gov/api/api_GET/?{params_c}", timeout=45).decode("utf-8"))
        for r in raw_c.get("data", []):
            st_f = (r.get("state_fips_code") or "").zfill(2)
            ct_f = (r.get("county_code") or "").zfill(3)
            if st_f not in FIPS_TO_ABBR or not ct_f.isdigit() or ct_f == "998" or ct_f == "000":
                continue
            yr = safe_int(r.get("year")) or 0
            val = safe_float(r.get("Value"))
            if val is None:
                continue
            fips = st_f + ct_f
            prev = county_corn.get(fips)
            if not prev or yr > prev["year"]:
                county_corn[fips] = {"year": yr, "corn_bu": int(val)}
    except Exception:
        pass

    return {
        "source": "USDA NASS Quick Stats API",
        "fetched_at": utc_now_iso(),
        "vintage": str(latest_year) if latest_year else "N/A",
        "count": len(state_ag) + len(county_corn),
        "states": dict(state_ag),
        "commodities": commodity_totals,
        "county_corn": county_corn,
    }


def fetch_usda_ers() -> dict[str, Any]:
    key = get_key("DATA_GOV_API_KEY", "DEMO_KEY")
    # Fetch Farm Business Income Statement national trend via ARMS API
    years = "2019,2020,2021,2022,2023,2024"
    params = urllib.parse.urlencode({
        "api_key": key,
        "year": years,
        "state": "all",
        "report": "income statement",
        "category": "all farms",
    })
    raw = json.loads(http_get_bytes(f"https://api.ers.usda.gov/data/arms/surveydata?{params}", timeout=30).decode("utf-8"))
    rows = raw.get("data", [])
    by_year: dict[int, dict[str, Any]] = defaultdict(dict)
    for r in rows:
        yr = safe_int(r.get("year"))
        vname = (r.get("variable_name") or "").strip()
        est = safe_float(r.get("estimate"))
        if yr and vname and est is not None:
            by_year[yr][vname] = round(est, 2)

    trend = [{"year": y, **by_year[y]} for y in sorted(by_year.keys())]
    vintage = str(max(by_year.keys())) if by_year else "N/A"
    return {
        "source": "USDA ERS ARMS Farm Financial Survey",
        "fetched_at": utc_now_iso(),
        "vintage": vintage,
        "count": len(rows),
        "income_statement_trend": trend,
    }


def fetch_intltrade() -> dict[str, Any]:
    key = get_key("CENSUS_API_KEY")
    if not key:
        raise RuntimeError("Missing CENSUS_API_KEY")

    # Auto-detect latest available monthly period (walk backwards from 2 months ago)
    today = dt.date.today()
    candidate_months = []
    y, m = today.year, today.month
    for _ in range(18):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
        candidate_months.append(f"{y:04d}-{m:02d}")

    active_time = None
    for tm in candidate_months:
        u = f"https://api.census.gov/data/timeseries/intltrade/exports/statehs?get=STATE,ALL_VAL_MO,ALL_VAL_YR&E_COMMODITY=8701&time={tm}&key={key}"
        try:
            body = http_get_bytes(u, timeout=20).decode("utf-8").strip()
            if body.startswith("[") and len(json.loads(body)) > 1:
                active_time = tm
                break
        except Exception:
            continue
    if not active_time:
        raise RuntimeError("Could not detect latest Census International Trade month")

    by_hs: list[dict[str, Any]] = []
    state_totals: dict[str, dict[str, float]] = defaultdict(lambda: {"exports_ytd_m": 0.0, "imports_ytd_m": 0.0})

    for item in TRADE_HS_WATCHLIST:
        hs = item["hs"]
        exp_rows, imp_rows = [], []
        try:
            u_e = f"https://api.census.gov/data/timeseries/intltrade/exports/statehs?get=STATE,ALL_VAL_MO,ALL_VAL_YR&E_COMMODITY={hs}&time={active_time}&key={key}"
            raw_e = json.loads(http_get_bytes(u_e, timeout=25).decode("utf-8"))
            hdr_e = raw_e[0]
            for row in raw_e[1:]:
                d = dict(zip(hdr_e, row))
                st = ABBR_TO_FIPS.get(d.get("STATE", "").upper())
                if not st:
                    continue
                mo = (safe_float(d.get("ALL_VAL_MO")) or 0.0) / 1e6
                ytd = (safe_float(d.get("ALL_VAL_YR")) or 0.0) / 1e6
                exp_rows.append({"state_fips": st, "state_abbr": d["STATE"], "mo_m": round(mo, 2), "ytd_m": round(ytd, 2)})
                state_totals[st]["exports_ytd_m"] += ytd
        except Exception:
            pass

        try:
            u_i = f"https://api.census.gov/data/timeseries/intltrade/imports/statehs?get=STATE,GEN_VAL_MO,GEN_VAL_YR&I_COMMODITY={hs}&time={active_time}&key={key}"
            raw_i = json.loads(http_get_bytes(u_i, timeout=25).decode("utf-8"))
            hdr_i = raw_i[0]
            for row in raw_i[1:]:
                d = dict(zip(hdr_i, row))
                st = ABBR_TO_FIPS.get(d.get("STATE", "").upper())
                if not st:
                    continue
                mo = (safe_float(d.get("GEN_VAL_MO")) or 0.0) / 1e6
                ytd = (safe_float(d.get("GEN_VAL_YR")) or 0.0) / 1e6
                imp_rows.append({"state_fips": st, "state_abbr": d["STATE"], "mo_m": round(mo, 2), "ytd_m": round(ytd, 2)})
                state_totals[st]["imports_ytd_m"] += ytd
        except Exception:
            pass

        exp_rows.sort(key=lambda x: x["ytd_m"], reverse=True)
        imp_rows.sort(key=lambda x: x["ytd_m"], reverse=True)
        by_hs.append({
            "hs": hs,
            "label": item["label"],
            "time": active_time,
            "total_exports_ytd_m": round(sum(x["ytd_m"] for x in exp_rows), 2),
            "total_imports_ytd_m": round(sum(x["ytd_m"] for x in imp_rows), 2),
            "top_export_states": exp_rows[:10],
            "top_import_states": imp_rows[:10],
        })
        time.sleep(0.1)

    states_clean = {
        st: {"watchlist_exports_ytd_m": round(v["exports_ytd_m"], 2), "watchlist_imports_ytd_m": round(v["imports_ytd_m"], 2)}
        for st, v in state_totals.items()
    }

    return {
        "source": "U.S. Census International Trade API (State x HS)",
        "fetched_at": utc_now_iso(),
        "vintage": active_time,
        "count": len(by_hs),
        "commodities": by_hs,
        "states": states_clean,
    }


def fetch_eia() -> dict[str, Any]:
    # Query keyless hosted EIA MCP server for state retail electricity prices (industrial & residential)
    url = "https://eia-energy.caseyjhand.com/mcp"
    states: dict[str, dict[str, Any]] = {}
    latest_period = ""
    for sec_id, field_name in [("IND", "industrial_cents_kwh"), ("RES", "residential_cents_kwh")]:
        res = mcp_call(
            url,
            "eia_query_route",
            {
                "route": "electricity/retail-sales",
                "frequency": "monthly",
                "columns": ["price"],
                "filters": {"sectorid": [sec_id]},
                "length": 150,
            },
            timeout=35,
        )
        rows = res.get("data", []) if isinstance(res, dict) else []
        for r in rows:
            if not isinstance(r, dict):
                continue
            abbr = (r.get("stateid") or "").upper()
            st = ABBR_TO_FIPS.get(abbr)
            period = str(r.get("period") or "")
            price = safe_float(r.get("price"))
            if not st or price is None:
                continue
            if period > latest_period:
                latest_period = period
            st_rec = states.setdefault(st, {"period": period})
            if field_name not in st_rec:
                st_rec[field_name] = round(price, 2)
                st_rec["period"] = max(st_rec["period"], period)

    return {
        "source": "U.S. EIA Retail Electricity Prices (via MCP)",
        "fetched_at": utc_now_iso(),
        "vintage": latest_period,
        "count": len(states),
        "states": states,
    }


def fetch_usaspending() -> dict[str, Any]:
    # Official keyless USAspending API v2 (last 12 months federal awards by State & Top Agencies)
    today = dt.date.today()
    start = (today - dt.timedelta(days=365)).isoformat()
    end = today.isoformat()

    payload_geo = {
        "scope": "place_of_performance",
        "geo_layer": "state",
        "filters": {"time_period": [{"start_date": start, "end_date": end}]},
    }
    raw_geo, _ = http_post_json("https://api.usaspending.gov/api/v2/search/spending_by_geography/", payload_geo, timeout=40)
    geo_data = json.loads(raw_geo.decode("utf-8"))
    states: dict[str, dict[str, Any]] = {}
    for r in geo_data.get("results", []):
        abbr = (r.get("shape_code") or "").upper()
        st = ABBR_TO_FIPS.get(abbr)
        amt = safe_float(r.get("aggregated_amount"))
        if st and amt is not None:
            states[st] = {
                "awards_12m_b": round(amt / 1e9, 3),
                "per_capita": round(safe_float(r.get("per_capita")) or 0.0, 1),
            }

    # County-level spending (all counties in 1 call!)
    payload_cty = {
        "scope": "place_of_performance",
        "geo_layer": "county",
        "filters": {"time_period": [{"start_date": start, "end_date": end}]},
    }
    counties: dict[str, dict[str, Any]] = {}
    try:
        raw_cty, _ = http_post_json("https://api.usaspending.gov/api/v2/search/spending_by_geography/", payload_cty, timeout=45)
        for r in json.loads(raw_cty.decode("utf-8")).get("results", []):
            fips = str(r.get("shape_code") or "").zfill(5)
            amt = safe_float(r.get("aggregated_amount"))
            if len(fips) == 5 and fips[:2] in FIPS_TO_ABBR and amt is not None:
                counties[fips] = {"awards_12m_m": round(amt / 1e6, 2)}
    except Exception:
        pass

    # Top awarding agencies
    agencies = []
    try:
        payload_ag = {
            "category": "awarding_agency",
            "limit": 12,
            "filters": {"time_period": [{"start_date": start, "end_date": end}]},
        }
        raw_ag, _ = http_post_json("https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/", payload_ag, timeout=30)
        for r in json.loads(raw_ag.decode("utf-8")).get("results", []):
            amt = safe_float(r.get("amount"))
            if amt is not None:
                agencies.append({"name": r.get("name", ""), "amount_b": round(amt / 1e9, 2)})
    except Exception:
        pass

    return {
        "source": "USAspending.gov Federal Awards (Rolling 12M)",
        "fetched_at": utc_now_iso(),
        "vintage": f"{start}..{end}",
        "count": len(states) + len(counties),
        "states": states,
        "counties": counties,
        "top_agencies": agencies,
    }


def fetch_fdic() -> dict[str, Any]:
    # Official keyless FDIC BankFind API — active institutions + recent failures
    fields = "NAME,STALP,STCNTY,ASSET,DEP,NETINC,ROA,ACTIVE,REPDTE"
    url = f"https://banks.data.fdic.gov/api/institutions?filters=ACTIVE:1&fields={fields}&limit=10000&format=json"
    raw = json.loads(http_get_bytes(url, timeout=45).decode("utf-8"))
    states: dict[str, dict[str, Any]] = defaultdict(lambda: {"bank_count": 0, "assets_b": 0.0, "deposits_b": 0.0, "netinc_m": 0.0})
    counties: dict[str, dict[str, Any]] = defaultdict(lambda: {"bank_count": 0, "deposits_m": 0.0, "assets_m": 0.0})
    latest_repdte = ""

    for row in raw.get("data", []):
        d = row.get("data", {})
        abbr = (d.get("STALP") or "").upper()
        st = ABBR_TO_FIPS.get(abbr)
        if not st:
            continue
        rep = str(d.get("REPDTE") or "")
        if rep > latest_repdte:
            latest_repdte = rep
        # FDIC reports ASSET, DEP, NETINC in thousands of USD
        asset_k = safe_float(d.get("ASSET")) or 0.0
        dep_k = safe_float(d.get("DEP")) or 0.0
        ni_k = safe_float(d.get("NETINC")) or 0.0
        s = states[st]
        s["bank_count"] += 1
        s["assets_b"] += asset_k / 1e6
        s["deposits_b"] += dep_k / 1e6
        s["netinc_m"] += ni_k / 1e3

        stcnty = str(d.get("STCNTY") or "").zfill(5)
        if len(stcnty) == 5 and stcnty[:2] == st:
            c = counties[stcnty]
            c["bank_count"] += 1
            c["deposits_m"] += dep_k / 1e3
            c["assets_m"] += asset_k / 1e3

    states_clean = {
        st: {
            "bank_count": v["bank_count"],
            "assets_b": round(v["assets_b"], 2),
            "deposits_b": round(v["deposits_b"], 2),
            "netinc_m": round(v["netinc_m"], 1),
        }
        for st, v in states.items()
    }
    counties_clean = {
        fips: {
            "bank_count": v["bank_count"],
            "deposits_m": round(v["deposits_m"], 1),
            "assets_m": round(v["assets_m"], 1),
        }
        for fips, v in counties.items()
    }

    # Recent bank failures
    failures = []
    try:
        f_url = "https://banks.data.fdic.gov/api/failures?fields=NAME,CITYST,FAILDATE,QBFASSET,QBFDEP,COST&sort_by=FAILDATE&sort_order=DESC&limit=15&format=json"
        f_raw = json.loads(http_get_bytes(f_url, timeout=25).decode("utf-8"))
        for row in f_raw.get("data", []):
            d = row.get("data", {})
            failures.append({
                "name": d.get("NAME", ""),
                "location": d.get("CITYST", ""),
                "fail_date": d.get("FAILDATE", ""),
                "assets_m": round((safe_float(d.get("QBFASSET")) or 0.0) / 1e3, 1),
                "deposits_m": round((safe_float(d.get("QBFDEP")) or 0.0) / 1e3, 1),
            })
    except Exception:
        pass

    return {
        "source": "FDIC BankFind API (Active Institutions & Failures)",
        "fetched_at": utc_now_iso(),
        "vintage": latest_repdte,
        "count": sum(v["bank_count"] for v in states_clean.values()),
        "states": states_clean,
        "counties": counties_clean,
        "recent_failures": failures,
    }


def fetch_sba() -> dict[str, Any]:
    cat_path = download_cached("https://data.sba.gov/data.json", "sba_data_catalog.json", ttl_hours=168)
    cat = json.loads(cat_path.read_text(encoding="utf-8", errors="ignore"))
    url_504 = None
    url_7a = None
    for ds in cat.get("dataset", []):
        if "7(a) & 504 FOIA" in ds.get("title", ""):
            for dist in ds.get("distribution", []):
                u = dist.get("downloadURL", "")
                low = u.lower()
                if low.endswith(".csv") and "present" in low:
                    if "504" in low:
                        url_504 = u
                    elif "7a" in low:
                        url_7a = u

    states: dict[str, dict[str, Any]] = defaultdict(lambda: {"loans_recent": 0, "amount_m": 0.0, "jobs": 0})
    county_by_name: dict[str, dict[str, Any]] = defaultdict(lambda: {"loans": 0, "amount_m": 0.0})
    naics_agg: dict[str, dict[str, Any]] = defaultdict(lambda: {"loans": 0, "amount_m": 0.0, "desc": ""})
    max_fy = 0

    for prog, u in [("504", url_504), ("7a", url_7a)]:
        if not u:
            continue
        p = download_cached(u, f"sba_{prog}_{u.rsplit('/', 1)[-1]}", ttl_hours=336, timeout=240)
        with p.open("r", encoding="utf-8-sig", errors="ignore", newline="") as f:
            for r in csv.DictReader(f):
                fy = safe_int(r.get("ApprovalFY") or r.get("ApprovalFiscalYear")) or 0
                if fy < 2024:
                    continue
                if fy > max_fy:
                    max_fy = fy
                abbr = (r.get("BorrState") or r.get("ProjectState") or "").upper()
                st = ABBR_TO_FIPS.get(abbr)
                if not st:
                    continue
                amt = (safe_float(r.get("GrossApproval")) or 0.0) / 1e6
                jobs = safe_int(r.get("JobsSupported")) or 0
                s = states[st]
                s["loans_recent"] += 1
                s["amount_m"] += amt
                s["jobs"] += jobs

                cty = (r.get("ProjectCounty") or "").strip().upper()
                if cty:
                    ck = f"{st}:{cty}"
                    county_by_name[ck]["loans"] += 1
                    county_by_name[ck]["amount_m"] += amt

                naics2 = (r.get("NaicsCode") or "")[:2]
                if naics2.isdigit():
                    naics_agg[naics2]["loans"] += 1
                    naics_agg[naics2]["amount_m"] += amt
                    if not naics_agg[naics2]["desc"]:
                        naics_agg[naics2]["desc"] = (r.get("NaicsDescription") or "")[:50]

    states_clean = {
        st: {"loans": v["loans_recent"], "amount_m": round(v["amount_m"], 2), "jobs": v["jobs"]}
        for st, v in states.items()
    }
    counties_clean = {
        k: {"loans": v["loans"], "amount_m": round(v["amount_m"], 2)}
        for k, v in county_by_name.items()
    }
    top_naics = sorted(
        [{"naics2": k, "desc": v["desc"], "loans": v["loans"], "amount_m": round(v["amount_m"], 2)} for k, v in naics_agg.items()],
        key=lambda x: x["amount_m"],
        reverse=True,
    )[:12]

    return {
        "source": "SBA 7(a) & 504 FOIA Loans (FY2024+)",
        "fetched_at": utc_now_iso(),
        "vintage": f"FY2024-FY{max_fy}",
        "count": sum(v["loans"] for v in states_clean.values()),
        "states": states_clean,
        "counties_by_name": counties_clean,
        "top_naics": top_naics,
    }


def fetch_fema() -> dict[str, Any]:
    # Official keyless OpenFEMA v2 Disaster Declarations (last 3 years)
    cutoff = (dt.date.today() - dt.timedelta(days=365 * 3)).isoformat()
    params = urllib.parse.urlencode({
        "$filter": f"declarationDate ge '{cutoff}T00:00:00.000z'",
        "$orderby": "declarationDate desc",
        "$top": "5000",
        "$select": "disasterNumber,state,declarationDate,incidentType,declarationTitle,fipsStateCode,fipsCountyCode,designatedArea",
    })
    url = f"https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?{params}"
    raw = json.loads(http_get_bytes(url, timeout=45).decode("utf-8"))
    rows = raw.get("DisasterDeclarationsSummaries", [])

    state_disasters: dict[str, set[int]] = defaultdict(set)
    county_counts: dict[str, int] = defaultdict(int)
    incident_counts: dict[str, int] = defaultdict(int)
    recent_unique: dict[int, dict[str, Any]] = {}
    latest_date = ""

    for r in rows:
        st = str(r.get("fipsStateCode") or "").zfill(2)
        ct = str(r.get("fipsCountyCode") or "").zfill(3)
        dnum = safe_int(r.get("disasterNumber"))
        ddate = str(r.get("declarationDate") or "")[:10]
        itype = r.get("incidentType") or "Other"
        if ddate > latest_date:
            latest_date = ddate
        if st in FIPS_TO_ABBR and dnum:
            state_disasters[st].add(dnum)
            if ct != "000":
                county_counts[st + ct] += 1
            if dnum not in recent_unique:
                incident_counts[itype] += 1
                recent_unique[dnum] = {
                    "disaster_number": dnum,
                    "state_abbr": r.get("state", ""),
                    "date": ddate,
                    "incident_type": itype,
                    "title": r.get("declarationTitle", ""),
                }

    recent_list = sorted(recent_unique.values(), key=lambda x: x["date"], reverse=True)[:25]
    return {
        "source": "OpenFEMA Disaster Declarations (3-Yr Rolling)",
        "fetched_at": utc_now_iso(),
        "vintage": latest_date,
        "count": len(recent_unique),
        "states": {st: {"disasters_3yr": len(ds)} for st, ds in state_disasters.items()},
        "counties": {fips: {"declarations_3yr": cnt} for fips, cnt in county_counts.items()},
        "by_incident_type": sorted(
            [{"type": k, "count": v} for k, v in incident_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        ),
        "recent_declarations": recent_list,
    }


def fetch_cfpb() -> dict[str, Any]:
    # Official keyless CFPB Consumer Complaint Database API (single fast aggregate query, no heavy sort!)
    cutoff = (dt.date.today() - dt.timedelta(days=365)).isoformat()
    url = f"https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?size=0&date_received_min={cutoff}"
    raw = json.loads(http_get_bytes(url, timeout=60, use_curl=True, use_browser_ua=False).decode("utf-8"))
    total = raw.get("hits", {}).get("total", {}).get("value", 0)
    aggs = raw.get("aggregations", {})

    def buckets(key: str) -> list[dict[str, Any]]:
        return [{"key": b.get("key"), "count": b.get("doc_count")} for b in aggs.get(key, {}).get(key, {}).get("buckets", [])]

    states: dict[str, dict[str, int]] = {}
    for b in buckets("state"):
        st = ABBR_TO_FIPS.get(str(b["key"]).upper())
        if st:
            states[st] = {"complaints_12m": int(b["count"])}

    return {
        "source": "CFPB Consumer Complaint Database (Rolling 12M)",
        "fetched_at": utc_now_iso(),
        "vintage": f"{cutoff}..{dt.date.today().isoformat()}",
        "count": total,
        "total_12m": total,
        "states": states,
        "top_products": buckets("product")[:12],
        "top_issues": buckets("issue")[:12],
        "top_companies": buckets("company")[:12],
    }
