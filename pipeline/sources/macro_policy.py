"""Macro, Fiscal, Policy, Corporate (SEC EDGAR), and USAFacts fetchers."""

from __future__ import annotations

import datetime as dt
import json
import time
import urllib.parse
from typing import Any

from ..common import get_key, http_get_bytes, mcp_call, safe_float, utc_now_iso
from ..config import FRED_SERIES, SEC_WATCHLIST


def fetch_fred(tiers: set[str] | None = None) -> dict[str, Any]:
    api_key = get_key("FRED_API_KEY")
    if not api_key:
        raise RuntimeError("Missing FRED_API_KEY")

    series_out: dict[str, Any] = {}
    latest_obs_date = ""
    start_date = (dt.date.today() - dt.timedelta(days=365 * 12)).isoformat()

    for meta in FRED_SERIES:
        if tiers and meta["tier"] not in tiers:
            continue
        sid = meta["id"]
        params = urllib.parse.urlencode({
            "series_id": sid,
            "api_key": api_key,
            "file_type": "json",
            "observation_start": start_date,
        })
        url = f"https://api.stlouisfed.org/fred/series/observations?{params}"
        raw = json.loads(http_get_bytes(url, timeout=30).decode("utf-8"))
        pts = []
        for obs in raw.get("observations", []):
            v = safe_float(obs.get("value"))
            if v is not None:
                pts.append([obs["date"], round(v, 4)])
        if not pts:
            continue
        # Downsample very dense daily series beyond 3 years to weekly-ish to keep payload crisp, keep full last 2 years
        if len(pts) > 650:
            older = pts[:-400:5]
            recent = pts[-400:]
            pts = older + recent
        latest_d, latest_v = pts[-1]
        if latest_d > latest_obs_date:
            latest_obs_date = latest_d
        prev_v = pts[-2][1] if len(pts) >= 2 else None
        # Compute approx YoY (find observation ~365 days ago)
        yoy_val = None
        yoy_pct = None
        try:
            d_latest = dt.date.fromisoformat(latest_d)
            target_d = d_latest - dt.timedelta(days=365)
            closest = min(pts[:-1], key=lambda p: abs((dt.date.fromisoformat(p[0]) - target_d).days))
            if abs((dt.date.fromisoformat(closest[0]) - target_d).days) <= 45 and closest[1] != 0:
                yoy_val = round(latest_v - closest[1], 4)
                yoy_pct = round((latest_v - closest[1]) / abs(closest[1]) * 100.0, 2)
        except Exception:
            pass

        series_out[sid] = {
            **meta,
            "latest_date": latest_d,
            "latest": latest_v,
            "prev": prev_v,
            "delta": round(latest_v - prev_v, 4) if prev_v is not None else None,
            "yoy_delta": yoy_val,
            "yoy_pct": yoy_pct,
            "points": pts,
        }
        time.sleep(0.08)

    return {
        "source": "FRED (Federal Reserve Bank of St. Louis)",
        "fetched_at": utc_now_iso(),
        "vintage": latest_obs_date,
        "count": len(series_out),
        "series": series_out,
    }


def fetch_treasury() -> dict[str, Any]:
    base = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"

    # 1. Debt to the Penny (last 90 observations)
    debt_raw = json.loads(
        http_get_bytes(f"{base}/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=90").decode("utf-8")
    ).get("data", [])
    debt_pts = []
    for r in reversed(debt_raw):
        tot = safe_float(r.get("tot_pub_debt_out_amt"))
        if tot is not None:
            debt_pts.append([r["record_date"], round(tot / 1e12, 4)])  # Trillions USD

    # 2. Average Interest Rates on Treasury Securities (latest month)
    rates_raw = json.loads(
        http_get_bytes(f"{base}/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=40").decode("utf-8")
    ).get("data", [])
    latest_rate_date = rates_raw[0]["record_date"] if rates_raw else ""
    avg_rates = [
        {"security": r.get("security_desc"), "rate_pct": safe_float(r.get("avg_interest_rate_amt"))}
        for r in rates_raw
        if r.get("record_date") == latest_rate_date and safe_float(r.get("avg_interest_rate_amt")) is not None
    ]

    # 3. Treasury General Account (TGA) Cash Balance
    tga_pts = []
    try:
        tga_raw = json.loads(
            http_get_bytes(
                f"{base}/v1/accounting/dts/operating_cash_balance?filter=account_type:eq:Treasury%20General%20Account%20(TGA)%20Closing%20Balance&sort=-record_date&page[size]=90"
            ).decode("utf-8")
        ).get("data", [])
        for r in reversed(tga_raw):
            bal = safe_float(r.get("close_today_bal"))
            if bal is not None:
                tga_pts.append([r["record_date"], round(bal / 1000.0, 2)])  # Billions USD
    except Exception:
        pass

    # 4. Monthly Treasury Statement (Receipts vs Outlays summary - recent 18 months)
    mts_raw = json.loads(
        http_get_bytes(
            f"{base}/v1/accounting/mts/mts_table_1?sort=-record_date&page[size]=100"
        ).decode("utf-8")
    ).get("data", [])
    mts_monthly = []
    seen_m = set()
    for r in mts_raw:
        desc = (r.get("classification_desc") or "").strip()
        d = r.get("record_date", "")
        if "FY" in desc or "Total" in desc or not d or d in seen_m:
            continue
        rec = safe_float(r.get("current_month_gross_rcpt_amt"))
        out = safe_float(r.get("current_month_gross_outly_amt"))
        sur = safe_float(r.get("current_month_dfct_sur_amt"))
        if rec is not None and out is not None:
            seen_m.add(d)
            mts_monthly.append({
                "date": d,
                "label": desc,
                "receipts_b": round(rec / 1e9, 2),
                "outlays_b": round(out / 1e9, 2),
                "surplus_deficit_b": round((sur if sur is not None else rec - out) / 1e9, 2),
            })
        if len(mts_monthly) >= 18:
            break
    mts_monthly.reverse()

    latest_debt = debt_pts[-1] if debt_pts else ["", None]
    latest_tga = tga_pts[-1] if tga_pts else ["", None]

    return {
        "source": "U.S. Treasury Fiscal Data",
        "fetched_at": utc_now_iso(),
        "vintage": latest_debt[0] or latest_rate_date,
        "count": len(debt_pts) + len(avg_rates) + len(tga_pts),
        "latest_debt_trillions": latest_debt[1],
        "latest_debt_date": latest_debt[0],
        "latest_tga_billions": latest_tga[1],
        "latest_tga_date": latest_tga[0],
        "debt_series": debt_pts,
        "tga_series": tga_pts,
        "avg_interest_rates_date": latest_rate_date,
        "avg_interest_rates": avg_rates,
        "mts_monthly": mts_monthly,
    }


def fetch_fedreg() -> dict[str, Any]:
    # Query Federal Register official REST API for recent economically impactful rules/notices
    topics = [
        ("tariff_trade", "tariff OR trade OR customs OR import"),
        ("agriculture_energy", "agriculture OR farm OR energy OR diesel OR electricity"),
        ("banking_housing", "banking OR mortgage OR credit OR housing"),
    ]
    docs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for tag, term in topics:
        params = urllib.parse.urlencode({
            "conditions[term]": term,
            "per_page": 10,
            "order": "newest",
        })
        url = f"https://www.federalregister.gov/api/v1/documents.json?{params}"
        raw = json.loads(http_get_bytes(url, timeout=30).decode("utf-8"))
        for d in raw.get("results", []):
            num = d.get("document_number")
            if not num or num in seen:
                continue
            seen.add(num)
            agencies = [a.get("name", "") for a in d.get("agencies", []) if a.get("name")]
            docs.append({
                "document_number": num,
                "title": d.get("title", ""),
                "type": d.get("type", ""),
                "publication_date": d.get("publication_date", ""),
                "agencies": agencies[:2],
                "topic": tag,
                "abstract": (d.get("abstract") or "")[:240],
                "html_url": d.get("html_url", ""),
            })
    docs.sort(key=lambda x: x.get("publication_date", ""), reverse=True)
    vintage = docs[0]["publication_date"] if docs else ""
    return {
        "source": "Federal Register (OFR)",
        "fetched_at": utc_now_iso(),
        "vintage": vintage,
        "count": len(docs),
        "documents": docs[:24],
    }


def fetch_congress() -> dict[str, Any]:
    # Use hosted keyless Congress.gov MCP server across key economic/tariff/agriculture topics
    bills: list[dict[str, Any]] = []
    seen: set[str] = set()
    for q in ("tariff OR trade", "agriculture OR farm", "budget OR tax OR infrastructure"):
        res = mcp_call(
            "https://congressgov.caseyjhand.com/mcp",
            "congressgov_search_bills",
            {"query": q, "congress": 119, "limit": 8},
            timeout=30,
        )
        rows = res.get("data", []) if isinstance(res, dict) else []
        for b in rows:
            if not isinstance(b, dict):
                continue
            bid = str(b.get("billId") or f"{b.get('billType','')}-{b.get('billNumber','')}")
            if bid in seen:
                continue
            seen.add(bid)
            bills.append({
                "congress": b.get("congress", 119),
                "type": str(b.get("billType", "")).upper(),
                "number": str(b.get("billNumber", "")),
                "title": b.get("title", ""),
                "origin_chamber": b.get("originChamber", ""),
                "update_date": b.get("latestActionDate", ""),
                "latest_action_date": b.get("latestActionDate", ""),
                "latest_action": (b.get("latestActionText") or "")[:180],
                "url": f"https://www.congress.gov/bill/{b.get('congress', 119)}th-congress/{'senate' if b.get('originChamber') == 'Senate' else 'house'}-bill/{b.get('billNumber', '')}",
            })
    bills.sort(key=lambda x: x.get("latest_action_date", ""), reverse=True)
    vintage = bills[0]["latest_action_date"] if bills else ""
    return {
        "source": "Congress.gov (via MCP)",
        "fetched_at": utc_now_iso(),
        "vintage": vintage,
        "count": len(bills),
        "bills": bills[:20],
    }


def _extract_sec_annual(facts: dict[str, Any], tags: list[str], unit: str = "USD") -> list[dict[str, Any]]:
    us_gaap = facts.get("facts", {}).get("us-gaap", {})
    ifrs = facts.get("facts", {}).get("ifrs-full", {})
    for tag in tags:
        node = us_gaap.get(tag) or ifrs.get(tag)
        if not node:
            continue
        entries = node.get("units", {}).get(unit, [])
        annual: dict[int, dict[str, Any]] = {}
        for e in entries:
            form = e.get("form", "")
            fy = e.get("fy")
            fp = e.get("fp", "")
            val = safe_float(e.get("val"))
            if val is None or not fy:
                continue
            if form in ("10-K", "20-F") and fp in ("FY", ""):
                prev = annual.get(int(fy))
                if not prev or (e.get("end", "") >= prev.get("end", "")):
                    annual[int(fy)] = {"fy": int(fy), "end": e.get("end", ""), "val": val, "form": form}
        if annual:
            ordered = [annual[y] for y in sorted(annual.keys())[-5:]]
            return ordered
    return []


def fetch_secedgar() -> dict[str, Any]:
    sec_headers = {"User-Agent": "US-Economy-Atlas wschoi7@daedong.co.kr", "Accept": "application/json"}
    companies: list[dict[str, Any]] = []
    latest_filing_date = ""

    rev_tags = [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "Revenue",
        "InterestAndDividendIncomeOperating",
    ]
    opinc_tags = ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"]
    ni_tags = ["NetIncomeLoss", "ProfitLoss"]
    inv_tags = ["InventoryNet", "Inventories"]
    asset_tags = ["Assets"]

    for item in SEC_WATCHLIST:
        cik = item["cik"]
        try:
            sub_raw = json.loads(
                http_get_bytes(f"https://data.sec.gov/submissions/CIK{cik}.json", headers=sec_headers, timeout=30).decode("utf-8")
            )
            recent = sub_raw.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            dates = recent.get("filingDate", [])
            accs = recent.get("accessionNumber", [])
            prims = recent.get("primaryDocument", [])
            recent_filings = []
            for f, d, a, p in zip(forms, dates, accs, prims):
                if f in ("10-K", "10-Q", "8-K", "20-F", "6-K"):
                    acc_clean = a.replace("-", "")
                    recent_filings.append({
                        "form": f,
                        "date": d,
                        "url": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/{p}",
                    })
                    if d > latest_filing_date:
                        latest_filing_date = d
                    if len(recent_filings) >= 4:
                        break

            facts_raw = json.loads(
                http_get_bytes(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", headers=sec_headers, timeout=35).decode("utf-8")
            )
            revs = _extract_sec_annual(facts_raw, rev_tags)
            opincs = _extract_sec_annual(facts_raw, opinc_tags)
            nis = _extract_sec_annual(facts_raw, ni_tags)
            invs = _extract_sec_annual(facts_raw, inv_tags)
            assets = _extract_sec_annual(facts_raw, asset_tags)

            latest_rev = revs[-1]["val"] if revs else None
            prev_rev = revs[-2]["val"] if len(revs) >= 2 else None
            rev_yoy = round((latest_rev - prev_rev) / abs(prev_rev) * 100.0, 2) if (latest_rev and prev_rev) else None
            latest_op = opincs[-1]["val"] if opincs else None
            op_margin = round(latest_op / latest_rev * 100.0, 2) if (latest_op is not None and latest_rev) else None
            latest_ni = nis[-1]["val"] if nis else None
            latest_inv = invs[-1]["val"] if invs else None
            latest_assets = assets[-1]["val"] if assets else None

            companies.append({
                "ticker": item["ticker"],
                "name": item["name"],
                "sector": item["sector"],
                "cik": cik,
                "latest_fy": revs[-1]["fy"] if revs else (nis[-1]["fy"] if nis else None),
                "revenue_b": round(latest_rev / 1e9, 2) if latest_rev is not None else None,
                "revenue_yoy_pct": rev_yoy,
                "op_income_b": round(latest_op / 1e9, 2) if latest_op is not None else None,
                "op_margin_pct": op_margin,
                "net_income_b": round(latest_ni / 1e9, 2) if latest_ni is not None else None,
                "inventory_b": round(latest_inv / 1e9, 2) if latest_inv is not None else None,
                "assets_b": round(latest_assets / 1e9, 2) if latest_assets is not None else None,
                "revenue_history": [{"fy": x["fy"], "b": round(x["val"] / 1e9, 2)} for x in revs],
                "recent_filings": recent_filings,
            })
            time.sleep(0.15)
        except Exception as exc:
            companies.append({
                "ticker": item["ticker"],
                "name": item["name"],
                "sector": item["sector"],
                "cik": cik,
                "error": str(exc)[:140],
                "recent_filings": [],
            })

    return {
        "source": "SEC EDGAR (XBRL CompanyFacts & Submissions)",
        "fetched_at": utc_now_iso(),
        "vintage": latest_filing_date,
        "count": len(companies),
        "companies": companies,
    }


def fetch_usafacts() -> dict[str, Any]:
    # Query USAFacts hosted keyless MCP server for catalog of available sources
    res = mcp_call(
        "https://data.mcp.usafacts.org/mcp",
        "list_sources",
        {},
        timeout=25,
        stateful=True,
    )
    sources_list = []
    if isinstance(res, dict):
        sources_list = res.get("sources") or res.get("data") or []
    elif isinstance(res, list):
        sources_list = res
    elif isinstance(res, str):
        sources_list = [{"summary": res[:500]}]
    return {
        "source": "USAFacts Multi-Agency MCP",
        "fetched_at": utc_now_iso(),
        "vintage": utc_now_iso()[:10],
        "count": len(sources_list),
        "sources": sources_list[:25],
    }
