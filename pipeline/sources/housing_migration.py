"""Housing & Wealth Migration fetchers: Zillow, Realtor.com, FHFA HPI, IRS SOI Migration."""

from __future__ import annotations

import csv
from collections import defaultdict
from typing import Any

from ..common import download_cached, iter_xlsx_rows, safe_float, safe_int, utc_now_iso
from ..config import ABBR_TO_FIPS, FIPS_TO_ABBR, NAME_TO_FIPS


def _parse_zillow_csv(url: str, cache_name: str, key_mode: str) -> tuple[str, dict[str, dict[str, Any]]]:
    path = download_cached(url, cache_name, ttl_hours=168)
    out: dict[str, dict[str, Any]] = {}
    latest_date = ""
    with path.open("r", encoding="utf-8-sig", errors="ignore", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        date_cols = [c for c in fields if len(c) == 10 and c[4] == "-" and c[7] == "-"]
        if not date_cols:
            return "", out
        latest_date = date_cols[-1]
        yoy_col = date_cols[-13] if len(date_cols) >= 13 else None
        hist_cols = date_cols[-13:]
        for r in reader:
            val = safe_float(r.get(latest_date))
            if val is None:
                continue
            prev_yr = safe_float(r.get(yoy_col)) if yoy_col else None
            yoy_pct = round((val - prev_yr) / prev_yr * 100.0, 2) if (prev_yr and prev_yr > 0) else None
            hist = [[d[:7], round(v, 0)] for d in hist_cols if (v := safe_float(r.get(d))) is not None]

            if key_mode == "state":
                nm = (r.get("RegionName") or "").strip().lower()
                st = NAME_TO_FIPS.get(nm)
                if not st:
                    continue
                out[st] = {"latest": round(val, 0), "yoy_pct": yoy_pct, "date": latest_date, "history": hist}
            elif key_mode == "county":
                st_f = (r.get("StateCodeFIPS") or "").strip().zfill(2)
                ct_f = (r.get("MunicipalCodeFIPS") or "").strip().zfill(3)
                if st_f not in FIPS_TO_ABBR or not ct_f.isdigit():
                    continue
                out[st_f + ct_f] = {
                    "latest": round(val, 0),
                    "yoy_pct": yoy_pct,
                    "date": latest_date,
                    "metro": r.get("Metro", ""),
                    "history": hist[-6:],
                }
            elif key_mode == "city":
                st_abbr = (r.get("StateName") or r.get("State") or "").strip().upper()
                st_f = ABBR_TO_FIPS.get(st_abbr)
                city_nm = (r.get("RegionName") or "").strip()
                if not st_f or not city_nm:
                    continue
                out[f"{st_f}:{city_nm.lower()}"] = {
                    "name": city_nm,
                    "state_fips": st_f,
                    "state_abbr": st_abbr,
                    "latest": round(val, 0),
                    "yoy_pct": yoy_pct,
                    "date": latest_date,
                }
    return latest_date, out


def fetch_zillow() -> dict[str, Any]:
    base_zhvi = "https://files.zillowstatic.com/research/public_csvs/zhvi"
    base_zori = "https://files.zillowstatic.com/research/public_csvs/zori"

    d1, st_zhvi = _parse_zillow_csv(f"{base_zhvi}/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv", "zillow_state_zhvi.csv", "state")
    _, ct_zhvi = _parse_zillow_csv(f"{base_zhvi}/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv", "zillow_county_zhvi.csv", "county")
    _, ci_zhvi = _parse_zillow_csv(f"{base_zhvi}/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv", "zillow_city_zhvi.csv", "city")
    _, ct_zori = _parse_zillow_csv(f"{base_zori}/County_zori_uc_sfrcondomfr_sm_month.csv", "zillow_county_zori.csv", "county")
    _, ci_zori = _parse_zillow_csv(f"{base_zori}/City_zori_uc_sfrcondomfr_sm_month.csv", "zillow_city_zori.csv", "city")

    # Compute state-level average ZORI from counties (since Zillow publishes Metro/County/City ZORI)
    st_zori_vals: dict[str, list[float]] = defaultdict(list)
    for fips, item in ct_zori.items():
        st_zori_vals[fips[:2]].append(item["latest"])
    st_zori = {
        st: {"latest": round(sum(vs) / len(vs), 0), "counties_covered": len(vs)}
        for st, vs in st_zori_vals.items() if vs
    }

    return {
        "source": "Zillow Research (ZHVI & ZORI)",
        "fetched_at": utc_now_iso(),
        "vintage": d1,
        "count": len(st_zhvi) + len(ct_zhvi) + len(ct_zori),
        "state_zhvi": st_zhvi,
        "state_zori": st_zori,
        "county_zhvi": ct_zhvi,
        "county_zori": ct_zori,
        "city_zhvi": ci_zhvi,
        "city_zori": ci_zori,
    }


def fetch_realtor() -> dict[str, Any]:
    url = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_County.csv"
    path = download_cached(url, "realtor_county_latest.csv", ttl_hours=168)
    counties: dict[str, dict[str, Any]] = {}
    st_agg: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    latest_month = ""

    with path.open("r", encoding="utf-8-sig", errors="ignore", newline="") as f:
        for r in csv.DictReader(f):
            fips = (r.get("county_fips") or "").strip().zfill(5)
            if len(fips) != 5 or fips[:2] not in FIPS_TO_ABBR:
                continue
            mo = (r.get("month_date_yyyymm") or "").strip()
            if mo > latest_month:
                latest_month = mo
            mlp = safe_float(r.get("median_listing_price"))
            mlp_yy = safe_float(r.get("median_listing_price_yy"))
            act = safe_int(r.get("active_listing_count"))
            act_yy = safe_float(r.get("active_listing_count_yy"))
            dom = safe_float(r.get("median_days_on_market"))
            pr = safe_int(r.get("price_reduced_count"))
            pend = safe_float(r.get("pending_ratio"))

            counties[fips] = {
                "month": mo,
                "median_listing_price": round(mlp, 0) if mlp is not None else None,
                "median_listing_price_yoy_pct": round(mlp_yy * 100.0, 2) if mlp_yy is not None else None,
                "active_listings": act,
                "active_listings_yoy_pct": round(act_yy * 100.0, 2) if act_yy is not None else None,
                "median_dom": round(dom, 1) if dom is not None else None,
                "price_reduced_count": pr,
                "price_reduced_share_pct": round(pr / act * 100.0, 1) if (pr is not None and act and act > 0) else None,
                "pending_ratio": round(pend, 3) if pend is not None else None,
            }
            st = fips[:2]
            if mlp is not None:
                st_agg[st]["mlp"].append(mlp)
            if dom is not None:
                st_agg[st]["dom"].append(dom)
            if act is not None:
                st_agg[st]["act"].append(act)
            if pr is not None:
                st_agg[st]["pr"].append(pr)

    states: dict[str, dict[str, Any]] = {}
    for st, vals in st_agg.items():
        tot_act = int(sum(vals["act"])) if vals["act"] else None
        tot_pr = int(sum(vals["pr"])) if vals["pr"] else None
        states[st] = {
            "month": latest_month,
            "avg_county_listing_price": round(sum(vals["mlp"]) / len(vals["mlp"]), 0) if vals["mlp"] else None,
            "avg_dom": round(sum(vals["dom"]) / len(vals["dom"]), 1) if vals["dom"] else None,
            "active_listings": tot_act,
            "price_reduced_count": tot_pr,
            "price_reduced_share_pct": round(tot_pr / tot_act * 100.0, 1) if (tot_pr is not None and tot_act and tot_act > 0) else None,
        }

    return {
        "source": "Realtor.com Core Housing Inventory",
        "fetched_at": utc_now_iso(),
        "vintage": latest_month,
        "count": len(counties),
        "states": states,
        "counties": counties,
    }


def fetch_fhfa() -> dict[str, Any]:
    # 1. State Quarterly CSV
    st_path = download_cached("https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_at_state.csv", "fhfa_state.csv", ttl_hours=336)
    st_hist: dict[str, list[tuple[str, float]]] = defaultdict(list)
    latest_q = ""
    with st_path.open("r", encoding="utf-8-sig", errors="ignore", newline="") as f:
        for row in csv.reader(f):
            if len(row) < 4:
                continue
            abbr = row[0].strip().upper()
            st = ABBR_TO_FIPS.get(abbr)
            yr = row[1].strip()
            q = row[2].strip()
            hpi = safe_float(row[3])
            if not st or not yr.isdigit() or hpi is None:
                continue
            period = f"{yr}-Q{q}"
            st_hist[st].append((period, hpi))
            if period > latest_q:
                latest_q = period

    states_out: dict[str, dict[str, Any]] = {}
    for st, pts in st_hist.items():
        pts.sort(key=lambda x: x[0])
        cur_p, cur_v = pts[-1]
        yoy = round((cur_v - pts[-5][1]) / pts[-5][1] * 100.0, 2) if len(pts) >= 5 and pts[-5][1] else None
        five_yr = round((cur_v - pts[-21][1]) / pts[-21][1] * 100.0, 2) if len(pts) >= 21 and pts[-21][1] else None
        states_out[st] = {
            "period": cur_p,
            "hpi": round(cur_v, 2),
            "yoy_pct": yoy,
            "five_yr_pct": five_yr,
            "history": [[p, round(v, 2)] for p, v in pts[-20:]],
        }

    # 2. County Annual (FHFA serves .xlsx at .csv URL!)
    cty_path = download_cached("https://www.fhfa.gov/hpi/download/annual/hpi_at_county.csv", "fhfa_county.csv", ttl_hours=336)
    cty_rows: dict[str, list[tuple[int, float | None, float | None]]] = defaultdict(list)
    if cty_path.read_bytes()[:4] == b"PK\x03\x04":
        headers: list[str] | None = None
        for r in iter_xlsx_rows(cty_path):
            if headers is None:
                low = [c.strip().lower() for c in r]
                if "fips code" in low and "year" in low:
                    headers = [c.strip() for c in r]
                continue
            rec = {headers[i]: r[i].strip() for i in range(min(len(headers), len(r))) if headers[i]}
            fips = (rec.get("FIPS code") or "").zfill(5)
            yr_s = rec.get("Year") or ""
            if len(fips) != 5 or fips[:2] not in FIPS_TO_ABBR or not yr_s.isdigit():
                continue
            yr = int(yr_s)
            if yr < 2018:
                continue
            cty_rows[fips].append((yr, safe_float(rec.get("HPI")), safe_float(rec.get("Annual Change (%)"))))

    counties_out: dict[str, dict[str, Any]] = {}
    for fips, pts in cty_rows.items():
        pts.sort(key=lambda x: x[0])
        latest = pts[-1]
        counties_out[fips] = {
            "year": latest[0],
            "hpi": round(latest[1], 2) if latest[1] is not None else None,
            "yoy_pct": round(latest[2], 2) if latest[2] is not None else None,
        }

    return {
        "source": "FHFA House Price Index (State Qtr & County Annual)",
        "fetched_at": utc_now_iso(),
        "vintage": latest_q,
        "count": len(states_out) + len(counties_out),
        "states": states_out,
        "counties": counties_out,
    }


def fetch_irs_migration() -> dict[str, Any]:
    yr = "2223"
    in_path = download_cached(f"https://www.irs.gov/pub/irs-soi/countyinflow{yr}.csv", f"irs_in_{yr}.csv", ttl_hours=720)
    out_path = download_cached(f"https://www.irs.gov/pub/irs-soi/countyoutflow{yr}.csv", f"irs_out_{yr}.csv", ttl_hours=720)

    def p_int(v: Any) -> int:
        n = safe_int(v)
        return 0 if (n is None or n == -1) else n

    counties: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "in_returns": 0, "in_people": 0, "in_agi_k": 0,
        "out_returns": 0, "out_people": 0, "out_agi_k": 0,
        "top_origins": [], "top_dests": [],
    })
    states: dict[str, dict[str, int]] = defaultdict(lambda: {
        "in_people": 0, "out_people": 0, "in_agi_k": 0, "out_agi_k": 0
    })

    with in_path.open("r", encoding="latin-1", newline="") as f:
        for r in csv.DictReader(f):
            dst_st = r["y2_statefips"].zfill(2)
            dst_ct = r["y2_countyfips"].zfill(3)
            src_st = r["y1_statefips"].zfill(2)
            src_ct = r["y1_countyfips"].zfill(3)
            if dst_st not in FIPS_TO_ABBR or dst_ct == "000":
                continue
            dst_fips = dst_st + dst_ct
            agi = p_int(r.get("agi") or r.get("AGI"))
            n1 = p_int(r.get("n1"))
            n2 = p_int(r.get("n2"))
            if src_st == "96":
                c = counties[dst_fips]
                c["in_returns"] = n1
                c["in_people"] = n2
                c["in_agi_k"] = agi
                states[dst_st]["in_people"] += n2
                states[dst_st]["in_agi_k"] += agi
            elif src_st in FIPS_TO_ABBR and src_ct != "000" and (src_st + src_ct) != dst_fips:
                counties[dst_fips]["top_origins"].append({
                    "fips": src_st + src_ct,
                    "name": f"{r.get('y1_countyname', '')}, {r.get('y1_state', '')}".strip(", "),
                    "people": n2,
                    "agi_k": agi,
                })

    with out_path.open("r", encoding="latin-1", newline="") as f:
        for r in csv.DictReader(f):
            src_st = r["y1_statefips"].zfill(2)
            src_ct = r["y1_countyfips"].zfill(3)
            dst_st = r["y2_statefips"].zfill(2)
            dst_ct = r["y2_countyfips"].zfill(3)
            if src_st not in FIPS_TO_ABBR or src_ct == "000":
                continue
            src_fips = src_st + src_ct
            agi = p_int(r.get("agi") or r.get("AGI"))
            n1 = p_int(r.get("n1"))
            n2 = p_int(r.get("n2"))
            if dst_st == "96":
                c = counties[src_fips]
                c["out_returns"] = n1
                c["out_people"] = n2
                c["out_agi_k"] = agi
                states[src_st]["out_people"] += n2
                states[src_st]["out_agi_k"] += agi
            elif dst_st in FIPS_TO_ABBR and dst_ct != "000" and (dst_st + dst_ct) != src_fips:
                counties[src_fips]["top_dests"].append({
                    "fips": dst_st + dst_ct,
                    "name": f"{r.get('y2_countyname', '')}, {r.get('y2_state', '')}".strip(", "),
                    "people": n2,
                    "agi_k": agi,
                })

    counties_clean: dict[str, dict[str, Any]] = {}
    for fips, c in counties.items():
        c["top_origins"].sort(key=lambda x: x["agi_k"], reverse=True)
        c["top_dests"].sort(key=lambda x: x["agi_k"], reverse=True)
        counties_clean[fips] = {
            "net_people": c["in_people"] - c["out_people"],
            "net_agi_m": round((c["in_agi_k"] - c["out_agi_k"]) / 1000.0, 2),
            "in_people": c["in_people"],
            "out_people": c["out_people"],
            "in_agi_m": round(c["in_agi_k"] / 1000.0, 2),
            "out_agi_m": round(c["out_agi_k"] / 1000.0, 2),
            "top_origins": c["top_origins"][:5],
            "top_dests": c["top_dests"][:5],
        }

    states_clean = {
        st: {
            "net_people": s["in_people"] - s["out_people"],
            "net_agi_m": round((s["in_agi_k"] - s["out_agi_k"]) / 1000.0, 2),
            "in_people": s["in_people"],
            "out_people": s["out_people"],
        }
        for st, s in states.items()
    }

    return {
        "source": "IRS SOI County-to-County Migration (TY 2022-2023)",
        "fetched_at": utc_now_iso(),
        "vintage": "TY2022-2023",
        "count": len(counties_clean),
        "states": states_clean,
        "counties": counties_clean,
    }
