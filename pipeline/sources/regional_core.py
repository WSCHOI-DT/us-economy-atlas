"""Regional Core fetchers: BEA Regional, U.S. Census ACS/CBP, and BLS LAUS."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
from typing import Any

from ..common import download_cached, get_key, http_get_bytes, mcp_call, safe_float, safe_int, utc_now_iso
from ..config import ABBR_TO_FIPS, FIPS_TO_ABBR, FIPS_TO_NAME


def _bea_query(api_key: str, table: str, line_code: str, geo_fips: str, year: str = "LAST5") -> list[dict[str, Any]]:
    params = urllib.parse.urlencode({
        "UserID": api_key,
        "method": "GetData",
        "datasetname": "Regional",
        "TableName": table,
        "LineCode": line_code,
        "GeoFips": geo_fips,
        "Year": year,
        "ResultFormat": "JSON",
    })
    url = f"https://apps.bea.gov/api/data?{params}"
    raw = json.loads(http_get_bytes(url, timeout=60).decode("utf-8"))
    res = raw.get("BEAAPI", {}).get("Results", {})
    if "Error" in res:
        raise RuntimeError(f"BEA {table}/{geo_fips}: {res['Error']}")
    return res.get("Data", [])


def fetch_bea() -> dict[str, Any]:
    api_key = get_key("BEA_API_KEY")
    if not api_key:
        raise RuntimeError("Missing BEA_API_KEY")

    states: dict[str, dict[str, Any]] = {}
    counties: dict[str, dict[str, Any]] = {}
    latest_year = ""

    # 1. State Real GDP (CAGDP9, Line 1, Thousands of chained 2017$)
    for r in _bea_query(api_key, "CAGDP9", "1", "STATE", "LAST5"):
        gf = str(r.get("GeoFips", "")).zfill(5)
        st = gf[:2]
        if st not in FIPS_TO_ABBR or gf[2:] != "000":
            continue
        yr = str(r.get("TimePeriod", ""))
        val = safe_float(r.get("DataValue"))
        if val is None:
            continue
        if yr > latest_year:
            latest_year = yr
        states.setdefault(st, {"real_gdp_series": {}, "pcpi_series": {}, "rpp_series": {}})["real_gdp_series"][yr] = round(val / 1e6, 3)  # $B

    time.sleep(0.2)
    # 2. State Per Capita Personal Income (CAINC1, Line 3, $)
    for r in _bea_query(api_key, "CAINC1", "3", "STATE", "LAST5"):
        gf = str(r.get("GeoFips", "")).zfill(5)
        st = gf[:2]
        if st not in FIPS_TO_ABBR or gf[2:] != "000":
            continue
        yr = str(r.get("TimePeriod", ""))
        val = safe_float(r.get("DataValue"))
        if val is not None:
            states.setdefault(st, {"real_gdp_series": {}, "pcpi_series": {}, "rpp_series": {}})["pcpi_series"][yr] = round(val, 0)

    time.sleep(0.2)
    # 3. State Regional Price Parities (SARPP, Line 1, US=100)
    for r in _bea_query(api_key, "SARPP", "1", "STATE", "LAST5"):
        gf = str(r.get("GeoFips", "")).zfill(5)
        st = gf[:2]
        if st not in FIPS_TO_ABBR or gf[2:] != "000":
            continue
        yr = str(r.get("TimePeriod", ""))
        val = safe_float(r.get("DataValue"))
        if val is not None:
            states.setdefault(st, {"real_gdp_series": {}, "pcpi_series": {}, "rpp_series": {}})["rpp_series"][yr] = round(val, 2)

    time.sleep(0.2)
    # 4. County Real GDP (CAGDP9, Line 1, LAST5) -> all ~3,143 counties in 1 call!
    for r in _bea_query(api_key, "CAGDP9", "1", "COUNTY", "LAST5"):
        gf = str(r.get("GeoFips", "")).zfill(5)
        if gf[:2] not in FIPS_TO_ABBR or gf[2:] == "000":
            continue
        yr = str(r.get("TimePeriod", ""))
        val = safe_float(r.get("DataValue"))
        if val is not None:
            c = counties.setdefault(gf, {"name": r.get("GeoName", ""), "real_gdp_k": {}, "pcpi": {}})
            c["real_gdp_k"][yr] = round(val, 1)

    time.sleep(0.2)
    # 5. County Per Capita Personal Income (CAINC1, Line 3, LAST5) -> all ~3,143 counties in 1 call!
    for r in _bea_query(api_key, "CAINC1", "3", "COUNTY", "LAST5"):
        gf = str(r.get("GeoFips", "")).zfill(5)
        if gf[:2] not in FIPS_TO_ABBR or gf[2:] == "000":
            continue
        yr = str(r.get("TimePeriod", ""))
        val = safe_float(r.get("DataValue"))
        if val is not None:
            c = counties.setdefault(gf, {"name": r.get("GeoName", ""), "real_gdp_k": {}, "pcpi": {}})
            c["pcpi"][yr] = round(val, 0)

    # Summarize latest & YoY for states and counties
    for st, d in states.items():
        gdp_yrs = sorted(d["real_gdp_series"].keys())
        if gdp_yrs:
            d["real_gdp_b"] = d["real_gdp_series"][gdp_yrs[-1]]
            d["real_gdp_year"] = gdp_yrs[-1]
            if len(gdp_yrs) >= 2 and d["real_gdp_series"][gdp_yrs[-2]]:
                d["real_gdp_yoy_pct"] = round(
                    (d["real_gdp_b"] - d["real_gdp_series"][gdp_yrs[-2]]) / d["real_gdp_series"][gdp_yrs[-2]] * 100.0, 2
                )
        pc_yrs = sorted(d["pcpi_series"].keys())
        if pc_yrs:
            d["pcpi"] = d["pcpi_series"][pc_yrs[-1]]
            d["pcpi_year"] = pc_yrs[-1]
            if len(pc_yrs) >= 2 and d["pcpi_series"][pc_yrs[-2]]:
                d["pcpi_yoy_pct"] = round(
                    (d["pcpi"] - d["pcpi_series"][pc_yrs[-2]]) / d["pcpi_series"][pc_yrs[-2]] * 100.0, 2
                )
        rpp_yrs = sorted(d["rpp_series"].keys())
        if rpp_yrs:
            d["rpp"] = d["rpp_series"][rpp_yrs[-1]]
            d["rpp_year"] = rpp_yrs[-1]
            if d.get("pcpi") and d["rpp"]:
                d["real_pcpi_rpp_adj"] = round(d["pcpi"] / (d["rpp"] / 100.0), 0)

    for gf, c in counties.items():
        gy = sorted(c["real_gdp_k"].keys())
        if gy:
            c["real_gdp_m"] = round(c["real_gdp_k"][gy[-1]] / 1000.0, 2)
            c["real_gdp_year"] = gy[-1]
            if len(gy) >= 2 and c["real_gdp_k"][gy[-2]]:
                c["real_gdp_yoy_pct"] = round(
                    (c["real_gdp_k"][gy[-1]] - c["real_gdp_k"][gy[-2]]) / c["real_gdp_k"][gy[-2]] * 100.0, 2
                )
        py = sorted(c["pcpi"].keys())
        if py:
            c["pcpi_latest"] = c["pcpi"][py[-1]]
            c["pcpi_year"] = py[-1]
            if len(py) >= 2 and c["pcpi"][py[-2]]:
                c["pcpi_yoy_pct"] = round((c["pcpi"][py[-1]] - c["pcpi"][py[-2]]) / c["pcpi"][py[-2]] * 100.0, 2)

    return {
        "source": "BEA Regional Data API (CAGDP9, CAINC1, SARPP)",
        "fetched_at": utc_now_iso(),
        "vintage": latest_year,
        "count": len(states) + len(counties),
        "states": states,
        "counties": counties,
    }


def _census_get(path: str, params: dict[str, str]) -> list[dict[str, str]]:
    key = get_key("CENSUS_API_KEY")
    if key:
        params = {**params, "key": key}
    url = f"https://api.census.gov/data/{path}?{urllib.parse.urlencode(params)}"
    raw = json.loads(http_get_bytes(url, timeout=45).decode("utf-8"))
    hdr = raw[0]
    return [dict(zip(hdr, row)) for row in raw[1:]]


def fetch_census() -> dict[str, Any]:
    # Try latest ACS 5-year vintage (2024 -> 2023 fallback)
    acs_vars = "NAME,B01003_001E,B19013_001E,B25077_001E,B25064_001E,B01002_001E,B17001_002E,B17001_001E,B15003_022E,B15003_023E,B15003_024E,B15003_025E,B15003_001E"
    acs_year = None
    state_rows: list[dict[str, str]] = []
    for yr in ("2024", "2023"):
        try:
            state_rows = _census_get(f"{yr}/acs/acs5", {"get": acs_vars, "for": "state:*"})
            acs_year = yr
            break
        except Exception:
            continue
    if not acs_year:
        raise RuntimeError("Could not fetch Census ACS 5-Year data")

    def parse_acs(r: dict[str, str]) -> dict[str, Any]:
        pop = safe_int(r.get("B01003_001E"))
        inc = safe_int(r.get("B19013_001E"))
        if inc is not None and inc < 0:
            inc = None
        hv = safe_int(r.get("B25077_001E"))
        if hv is not None and hv < 0:
            hv = None
        rent = safe_int(r.get("B25064_001E"))
        if rent is not None and rent < 0:
            rent = None
        age = safe_float(r.get("B01002_001E"))
        if age is not None and age < 0:
            age = None
        pov_num = safe_float(r.get("B17001_002E"))
        pov_den = safe_float(r.get("B17001_001E"))
        pov_pct = round(pov_num / pov_den * 100.0, 2) if (pov_num is not None and pov_den and pov_den > 0) else None
        edu_den = safe_float(r.get("B15003_001E"))
        edu_num = sum(safe_float(r.get(k)) or 0.0 for k in ("B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"))
        ba_pct = round(edu_num / edu_den * 100.0, 2) if (edu_den and edu_den > 0) else None
        return {
            "name": r.get("NAME", ""),
            "population": pop,
            "median_hh_income": inc,
            "median_home_value": hv,
            "median_gross_rent": rent,
            "median_age": round(age, 1) if age is not None else None,
            "poverty_pct": pov_pct,
            "bachelors_plus_pct": ba_pct,
        }

    states: dict[str, dict[str, Any]] = {}
    for r in state_rows:
        st = r.get("state", "").zfill(2)
        if st in FIPS_TO_ABBR:
            states[st] = parse_acs(r)

    # All ~3,143 Counties in 1 call!
    county_rows = _census_get(f"{acs_year}/acs/acs5", {"get": acs_vars, "for": "county:*"})
    counties: dict[str, dict[str, Any]] = {}
    for r in county_rows:
        st = r.get("state", "").zfill(2)
        ct = r.get("county", "").zfill(3)
        if st in FIPS_TO_ABBR:
            counties[st + ct] = parse_acs(r)

    # Top Cities (Places) nationwide (keep top 15 per state by population)
    cities_by_state: dict[str, list[dict[str, Any]]] = {}
    try:
        place_rows = _census_get(
            f"{acs_year}/acs/acs5",
            {"get": "NAME,B01003_001E,B19013_001E,B25077_001E,B25064_001E,B01002_001E", "for": "place:*"},
        )
        for r in place_rows:
            st = r.get("state", "").zfill(2)
            if st not in FIPS_TO_ABBR:
                continue
            pop = safe_int(r.get("B01003_001E")) or 0
            if pop < 15000:
                continue
            clean_name = re.sub(r"\s+(city|town|village|CDP|borough|municipality),.*$", "", r.get("NAME", ""), flags=re.I)
            inc = safe_int(r.get("B19013_001E"))
            hv = safe_int(r.get("B25077_001E"))
            rent = safe_int(r.get("B25064_001E"))
            cities_by_state.setdefault(st, []).append({
                "place_fips": st + r.get("place", "").zfill(5),
                "name": clean_name,
                "full_name": r.get("NAME", ""),
                "state_abbr": FIPS_TO_ABBR[st],
                "population": pop,
                "median_hh_income": inc if (inc and inc > 0) else None,
                "median_home_value": hv if (hv and hv > 0) else None,
                "median_gross_rent": rent if (rent and rent > 0) else None,
                "median_age": safe_float(r.get("B01002_001E")),
            })
        for st in cities_by_state:
            cities_by_state[st].sort(key=lambda x: x["population"], reverse=True)
            cities_by_state[st] = cities_by_state[st][:15]
    except Exception:
        pass

    # County Business Patterns (CBP) — total establishments, employment, annual payroll ($1,000s)
    cbp_year = None
    for yr in ("2023", "2022"):
        try:
            cbp_st = _census_get(f"{yr}/cbp", {"get": "ESTAB,EMP,PAYANN", "for": "state:*", "NAICS2017": "00"})
            for r in cbp_st:
                st = r.get("state", "").zfill(2)
                if st in states:
                    states[st]["cbp_establishments"] = safe_int(r.get("ESTAB"))
                    states[st]["cbp_employment"] = safe_int(r.get("EMP"))
                    states[st]["cbp_payroll_k"] = safe_int(r.get("PAYANN"))
            cbp_cty = _census_get(f"{yr}/cbp", {"get": "ESTAB,EMP,PAYANN", "for": "county:*", "NAICS2017": "00"})
            for r in cbp_cty:
                fips = r.get("state", "").zfill(2) + r.get("county", "").zfill(3)
                if fips in counties:
                    counties[fips]["cbp_establishments"] = safe_int(r.get("ESTAB"))
                    counties[fips]["cbp_employment"] = safe_int(r.get("EMP"))
                    counties[fips]["cbp_payroll_k"] = safe_int(r.get("PAYANN"))
            cbp_year = yr
            break
        except Exception:
            continue

    return {
        "source": f"U.S. Census Bureau (ACS {acs_year} 5-Yr & CBP {cbp_year or 'N/A'})",
        "fetched_at": utc_now_iso(),
        "vintage": f"ACS-{acs_year} / CBP-{cbp_year or 'N/A'}",
        "count": len(states) + len(counties) + sum(len(v) for v in cities_by_state.values()),
        "states": states,
        "counties": counties,
        "cities_by_state": cities_by_state,
    }


def fetch_bls() -> dict[str, Any]:
    # 1. All 51 States monthly seasonally-adjusted LAUS Unemployment Rate via hosted keyless BLS MCP!
    import datetime as dt
    this_year = dt.date.today().year
    all_st_fips = sorted(FIPS_TO_ABBR.keys())
    states_out: dict[str, dict[str, Any]] = {}
    latest_period = ""

    # Batch in chunks of 25 series per MCP call
    for i in range(0, len(all_st_fips), 25):
        chunk = all_st_fips[i : i + 25]
        sids = [f"LASST{st}0000000000003" for st in chunk]
        res = mcp_call(
            "https://bls-labor.caseyjhand.com/mcp",
            "bls_get_series",
            {"series_ids": sids, "start_year": this_year - 1, "end_year": this_year},
            timeout=40,
        )
        for s in (res.get("series", []) if isinstance(res, dict) else []):
            sid = s.get("seriesId", "")
            st = sid[5:7] if len(sid) >= 7 else ""
            if st not in FIPS_TO_ABBR:
                continue
            obs = [o for o in s.get("observations", []) if o.get("available") and safe_float(o.get("value")) is not None]
            if not obs:
                continue
            # Sort ascending by (year, period)
            obs.sort(key=lambda o: (str(o.get("year", "")), str(o.get("period", ""))))
            hist = [[f"{o['year']}-{o['period'].replace('M', '')}", round(safe_float(o["value"]) or 0.0, 1)] for o in obs[-12:]]
            last_p, last_v = hist[-1]
            prev_v = hist[-2][1] if len(hist) >= 2 else None
            if last_p > latest_period:
                latest_period = last_p
            states_out[st] = {
                "period": last_p,
                "unemp_rate": last_v,
                "mom_delta": round(last_v - prev_v, 1) if prev_v is not None else None,
                "history": hist,
            }
        time.sleep(0.15)

    # 2. All ~3,143 Counties Civilian Labor Force & Unemployment Rate via Census ACS 5-Year (B23025)
    counties_out: dict[str, dict[str, Any]] = {}
    for yr in ("2024", "2023"):
        try:
            c_rows = _census_get(f"{yr}/acs/acs5", {"get": "B23025_003E,B23025_004E,B23025_005E", "for": "county:*"})
            for r in c_rows:
                st = r.get("state", "").zfill(2)
                ct = r.get("county", "").zfill(3)
                if st not in FIPS_TO_ABBR:
                    continue
                lf = safe_int(r.get("B23025_003E"))
                emp = safe_int(r.get("B23025_004E"))
                unemp = safe_int(r.get("B23025_005E"))
                rate = round(unemp / lf * 100.0, 1) if (lf and lf > 0 and unemp is not None) else None
                counties_out[st + ct] = {
                    "period": f"ACS-{yr}",
                    "labor_force": lf,
                    "employed": emp,
                    "unemployed": unemp,
                    "unemp_rate": rate,
                    "mom_delta": None,
                    "yoy_delta": None,
                    "history": states_out.get(st, {}).get("history", []),
                }
            # Backfill state labor_force sum
            for st in states_out:
                st_lf = sum((c.get("labor_force") or 0) for f, c in counties_out.items() if f[:2] == st)
                if st_lf > 0:
                    states_out[st]["labor_force"] = st_lf
            break
        except Exception:
            continue

    return {
        "source": "BLS LAUS (State Monthly via MCP) & Census County Labor Force",
        "fetched_at": utc_now_iso(),
        "vintage": latest_period,
        "count": len(states_out) + len(counties_out),
        "states": states_out,
        "counties": counties_out,
    }
