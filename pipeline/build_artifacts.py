"""Compile raw source snapshots into sharded frontend JSON data lake."""

from __future__ import annotations

import re
from typing import Any

from .common import load_raw, utc_now_iso, write_json_clean
from .config import FIPS_TO_ABBR, FIPS_TO_NAME, PUBLIC_DATA_DIR, SOURCES_META, STATES


def _clean_county_name(raw_name: str, state_name: str) -> str:
    if not raw_name:
        return ""
    s = raw_name.split(",")[0].strip()
    if state_name and s.lower().endswith(state_name.lower()):
        s = s[: -len(state_name)].strip(", ")
    return s


def _sba_county_lookup(sba_counties: dict[str, Any], st_fips: str, county_name: str) -> dict[str, Any] | None:
    if not sba_counties or not county_name:
        return None
    base = re.sub(r"\s+(county|parish|borough|census area|municipality|city)$", "", county_name, flags=re.I).strip().upper()
    return sba_counties.get(f"{st_fips}:{base}") or sba_counties.get(f"{st_fips}:{county_name.upper()}")


def build_all(source_statuses: dict[str, dict[str, Any]]) -> dict[str, Any]:
    fred = load_raw("fred") or {}
    treasury = load_raw("treasury") or {}
    fedreg = load_raw("fedreg") or {}
    congress = load_raw("congress") or {}
    secedgar = load_raw("secedgar") or {}
    usafacts = load_raw("usafacts") or {}
    bea = load_raw("bea") or {}
    census = load_raw("census") or {}
    bls = load_raw("bls") or {}
    zillow = load_raw("zillow") or {}
    realtor = load_raw("realtor") or {}
    fhfa = load_raw("fhfa") or {}
    irs = load_raw("irs_migration") or {}
    nass = load_raw("usda_nass") or {}
    ers = load_raw("usda_ers") or {}
    trade = load_raw("intltrade") or {}
    eia = load_raw("eia") or {}
    usa = load_raw("usaspending") or {}
    fdic = load_raw("fdic") or {}
    sba = load_raw("sba") or {}
    fema = load_raw("fema") or {}
    cfpb = load_raw("cfpb") or {}

    # 1. MACRO.JSON
    macro_payload = {
        "generated_at": utc_now_iso(),
        "fred": fred.get("series", {}),
        "treasury": {
            "latest_debt_trillions": treasury.get("latest_debt_trillions"),
            "latest_debt_date": treasury.get("latest_debt_date"),
            "latest_tga_billions": treasury.get("latest_tga_billions"),
            "latest_tga_date": treasury.get("latest_tga_date"),
            "debt_series": treasury.get("debt_series", []),
            "tga_series": treasury.get("tga_series", []),
            "avg_interest_rates_date": treasury.get("avg_interest_rates_date"),
            "avg_interest_rates": treasury.get("avg_interest_rates", []),
            "mts_monthly": treasury.get("mts_monthly", []),
        },
        "usafacts_sources_count": usafacts.get("count", 0),
    }
    write_json_clean(PUBLIC_DATA_DIR / "macro.json", macro_payload, compact=True)

    # 2. STATES.JSON (51 states full unified KPI matrix)
    states_list: list[dict[str, Any]] = []
    search_items: list[dict[str, Any]] = []

    for st_fips, abbr, name in STATES:
        b_st = bea.get("states", {}).get(st_fips, {})
        c_st = census.get("states", {}).get(st_fips, {})
        bl_st = bls.get("states", {}).get(st_fips, {})
        z_zhvi = zillow.get("state_zhvi", {}).get(st_fips, {})
        z_zori = zillow.get("state_zori", {}).get(st_fips, {})
        r_st = realtor.get("states", {}).get(st_fips, {})
        fh_st = fhfa.get("states", {}).get(st_fips, {})
        ir_st = irs.get("states", {}).get(st_fips, {})
        ag_st = nass.get("states", {}).get(st_fips, {})
        tr_st = trade.get("states", {}).get(st_fips, {})
        ei_st = eia.get("states", {}).get(st_fips, {})
        us_st = usa.get("states", {}).get(st_fips, {})
        fd_st = fdic.get("states", {}).get(st_fips, {})
        sb_st = sba.get("states", {}).get(st_fips, {})
        fm_st = fema.get("states", {}).get(st_fips, {})
        cf_st = cfpb.get("states", {}).get(st_fips, {})

        pop = c_st.get("population")
        cf_count = cf_st.get("complaints_12m")
        cf_per_100k = round(cf_count / pop * 100000.0, 1) if (cf_count is not None and pop and pop > 0) else None

        rec = {
            "fips": st_fips,
            "abbr": abbr,
            "name": name,
            # Demographics & Business (Census)
            "population": pop,
            "median_hh_income": c_st.get("median_hh_income"),
            "median_age": c_st.get("median_age"),
            "poverty_pct": c_st.get("poverty_pct"),
            "bachelors_plus_pct": c_st.get("bachelors_plus_pct"),
            "cbp_establishments": c_st.get("cbp_establishments"),
            "cbp_employment": c_st.get("cbp_employment"),
            # GDP & Income (BEA)
            "real_gdp_b": b_st.get("real_gdp_b"),
            "real_gdp_yoy_pct": b_st.get("real_gdp_yoy_pct"),
            "real_gdp_year": b_st.get("real_gdp_year"),
            "pcpi": b_st.get("pcpi"),
            "pcpi_yoy_pct": b_st.get("pcpi_yoy_pct"),
            "rpp": b_st.get("rpp"),
            "real_pcpi_rpp_adj": b_st.get("real_pcpi_rpp_adj"),
            "real_gdp_series": b_st.get("real_gdp_series", {}),
            # Labor (BLS)
            "unemp_rate": bl_st.get("unemp_rate"),
            "unemp_period": bl_st.get("period"),
            "unemp_mom_delta": bl_st.get("mom_delta"),
            "labor_force": bl_st.get("labor_force"),
            "unemp_history": bl_st.get("history", []),
            # Housing (Zillow + Realtor + FHFA)
            "zhvi": z_zhvi.get("latest"),
            "zhvi_yoy_pct": z_zhvi.get("yoy_pct"),
            "zhvi_history": z_zhvi.get("history", []),
            "zori": z_zori.get("latest"),
            "active_listings": r_st.get("active_listings"),
            "avg_dom": r_st.get("avg_dom"),
            "price_reduced_share_pct": r_st.get("price_reduced_share_pct"),
            "fhfa_hpi": fh_st.get("hpi"),
            "fhfa_yoy_pct": fh_st.get("yoy_pct"),
            "fhfa_5yr_pct": fh_st.get("five_yr_pct"),
            # Migration (IRS SOI)
            "net_migration_people": ir_st.get("net_people"),
            "net_migration_agi_m": ir_st.get("net_agi_m"),
            # Real Economy (Ag, Trade, Energy, Federal)
            "ag_crop_value_m": ag_st.get("total_crop_value_m"),
            "ag_crops": ag_st.get("crops", {}),
            "watchlist_exports_ytd_m": tr_st.get("watchlist_exports_ytd_m"),
            "watchlist_imports_ytd_m": tr_st.get("watchlist_imports_ytd_m"),
            "elec_industrial_cents": ei_st.get("industrial_cents_kwh"),
            "elec_residential_cents": ei_st.get("residential_cents_kwh"),
            "elec_period": ei_st.get("period"),
            "fed_awards_12m_b": us_st.get("awards_12m_b"),
            "fed_awards_per_capita": us_st.get("per_capita"),
            # Credit, Banking & Risk
            "fdic_banks": fd_st.get("bank_count"),
            "fdic_assets_b": fd_st.get("assets_b"),
            "fdic_deposits_b": fd_st.get("deposits_b"),
            "sba_loans": sb_st.get("loans"),
            "sba_amount_m": sb_st.get("amount_m"),
            "sba_jobs": sb_st.get("jobs"),
            "fema_disasters_3yr": fm_st.get("disasters_3yr", 0),
            "cfpb_complaints_12m": cf_count,
            "cfpb_per_100k": cf_per_100k,
        }
        states_list.append(rec)
        search_items.append({"type": "state", "id": st_fips, "label": f"{name} ({abbr})", "state_fips": st_fips, "abbr": abbr})

    write_json_clean(PUBLIC_DATA_DIR / "states.json", {"generated_at": utc_now_iso(), "states": states_list}, compact=True)

    # 3. COUNTIES/{state_fips}.JSON (51 Shards covering ~3,143 US counties!)
    all_county_fips = sorted(
        set(census.get("counties", {}).keys())
        | set(bea.get("counties", {}).keys())
        | set(bls.get("counties", {}).keys())
    )
    counties_by_state: dict[str, list[dict[str, Any]]] = {f: [] for f, _, _ in STATES}
    top_migration_counties: list[dict[str, Any]] = []
    housing_quadrant_counties: list[dict[str, Any]] = []

    sba_cty_map = sba.get("counties_by_name", {})

    for fips in all_county_fips:
        st_fips = fips[:2]
        if st_fips not in counties_by_state:
            continue
        abbr = FIPS_TO_ABBR[st_fips]
        st_name = FIPS_TO_NAME[st_fips]

        c_c = census.get("counties", {}).get(fips, {})
        b_c = bea.get("counties", {}).get(fips, {})
        bl_c = bls.get("counties", {}).get(fips, {})
        zh_c = zillow.get("county_zhvi", {}).get(fips, {})
        zo_c = zillow.get("county_zori", {}).get(fips, {})
        rl_c = realtor.get("counties", {}).get(fips, {})
        fh_c = fhfa.get("counties", {}).get(fips, {})
        ir_c = irs.get("counties", {}).get(fips, {})
        us_c = usa.get("counties", {}).get(fips, {})
        fd_c = fdic.get("counties", {}).get(fips, {})
        fm_c = fema.get("counties", {}).get(fips, {})
        ag_c = nass.get("county_corn", {}).get(fips, {})

        cname = _clean_county_name(c_c.get("name") or b_c.get("name") or fips, st_name)
        sb_c = _sba_county_lookup(sba_cty_map, st_fips, cname) or {}

        item = {
            "fips": fips,
            "state_fips": st_fips,
            "state_abbr": abbr,
            "name": cname,
            "population": c_c.get("population"),
            "median_hh_income": c_c.get("median_hh_income"),
            "median_home_value": c_c.get("median_home_value"),
            "median_gross_rent": c_c.get("median_gross_rent"),
            "median_age": c_c.get("median_age"),
            "poverty_pct": c_c.get("poverty_pct"),
            "bachelors_plus_pct": c_c.get("bachelors_plus_pct"),
            "cbp_establishments": c_c.get("cbp_establishments"),
            "cbp_employment": c_c.get("cbp_employment"),
            "real_gdp_m": b_c.get("real_gdp_m"),
            "real_gdp_yoy_pct": b_c.get("real_gdp_yoy_pct"),
            "real_gdp_series": b_c.get("real_gdp_k", {}),
            "pcpi": b_c.get("pcpi_latest"),
            "pcpi_yoy_pct": b_c.get("pcpi_yoy_pct"),
            "unemp_rate": bl_c.get("unemp_rate"),
            "unemp_mom_delta": bl_c.get("mom_delta"),
            "unemp_yoy_delta": bl_c.get("yoy_delta"),
            "labor_force": bl_c.get("labor_force"),
            "unemp_history": bl_c.get("history", []),
            "zhvi": zh_c.get("latest"),
            "zhvi_yoy_pct": zh_c.get("yoy_pct"),
            "zori": zo_c.get("latest"),
            "metro": zh_c.get("metro") or "",
            "listing_price": rl_c.get("median_listing_price"),
            "active_listings": rl_c.get("active_listings"),
            "median_dom": rl_c.get("median_dom"),
            "price_reduced_share_pct": rl_c.get("price_reduced_share_pct"),
            "fhfa_hpi": fh_c.get("hpi"),
            "fhfa_yoy_pct": fh_c.get("yoy_pct"),
            "net_people": ir_c.get("net_people"),
            "net_agi_m": ir_c.get("net_agi_m"),
            "top_origins": ir_c.get("top_origins", []),
            "top_dests": ir_c.get("top_dests", []),
            "fed_awards_12m_m": us_c.get("awards_12m_m"),
            "fdic_banks": fd_c.get("bank_count"),
            "fdic_deposits_m": fd_c.get("deposits_m"),
            "sba_loans": sb_c.get("loans"),
            "sba_amount_m": sb_c.get("amount_m"),
            "fema_disasters_3yr": fm_c.get("declarations_3yr", 0),
            "corn_bu": ag_c.get("corn_bu"),
        }
        counties_by_state[st_fips].append(item)
        search_items.append({"type": "county", "id": fips, "label": f"{cname}, {abbr}", "state_fips": st_fips, "abbr": abbr})

        if ir_c.get("net_agi_m") is not None and (c_c.get("population") or 0) >= 25000:
            top_migration_counties.append({
                "fips": fips,
                "name": f"{cname}, {abbr}",
                "state_fips": st_fips,
                "population": c_c.get("population"),
                "net_people": ir_c.get("net_people"),
                "net_agi_m": ir_c.get("net_agi_m"),
                "zhvi": zh_c.get("latest"),
                "unemp_rate": bl_c.get("unemp_rate"),
            })
        if (c_c.get("population") or 0) >= 150000 and zh_c.get("yoy_pct") is not None and rl_c.get("median_dom") is not None:
            housing_quadrant_counties.append({
                "fips": fips,
                "name": f"{cname}, {abbr}",
                "state_fips": st_fips,
                "population": c_c.get("population"),
                "zhvi": zh_c.get("latest"),
                "zhvi_yoy_pct": zh_c.get("yoy_pct"),
                "zori": zo_c.get("latest"),
                "median_dom": rl_c.get("median_dom"),
                "price_reduced_share_pct": rl_c.get("price_reduced_share_pct"),
                "net_agi_m": ir_c.get("net_agi_m"),
            })

    total_counties_written = 0
    for st_fips, clist in counties_by_state.items():
        clist.sort(key=lambda x: x.get("population") or 0, reverse=True)
        total_counties_written += len(clist)
        # Cities for this state enriched with Zillow City ZHVI & ZORI
        cities = []
        for city in census.get("cities_by_state", {}).get(st_fips, []):
            ck = f"{st_fips}:{city['name'].lower()}"
            cz = zillow.get("city_zhvi", {}).get(ck, {})
            cr = zillow.get("city_zori", {}).get(ck, {})
            cities.append({
                **city,
                "zhvi": cz.get("latest"),
                "zhvi_yoy_pct": cz.get("yoy_pct"),
                "zori": cr.get("latest"),
                "zori_yoy_pct": cr.get("yoy_pct"),
            })
        write_json_clean(
            PUBLIC_DATA_DIR / "counties" / f"{st_fips}.json",
            {
                "state_fips": st_fips,
                "state_abbr": FIPS_TO_ABBR[st_fips],
                "state_name": FIPS_TO_NAME[st_fips],
                "counties": clist,
                "cities": cities,
            },
            compact=True,
        )

    # 4. HOUSING_MIGRATION.JSON
    top_migration_counties.sort(key=lambda x: x["net_agi_m"], reverse=True)
    housing_quadrant_counties.sort(key=lambda x: x["population"] or 0, reverse=True)
    write_json_clean(
        PUBLIC_DATA_DIR / "housing_migration.json",
        {
            "generated_at": utc_now_iso(),
            "top_agi_inflow_counties": top_migration_counties[:25],
            "top_agi_outflow_counties": list(reversed(top_migration_counties[-25:])),
            "quadrant_counties": housing_quadrant_counties[:200],
        },
        compact=True,
    )

    # 5. SECTORS.JSON (Agriculture, International Trade, Energy, USAspending)
    write_json_clean(
        PUBLIC_DATA_DIR / "sectors.json",
        {
            "generated_at": utc_now_iso(),
            "agriculture": {
                "nass_vintage": nass.get("vintage"),
                "commodities": nass.get("commodities", {}),
                "ers_vintage": ers.get("vintage"),
                "ers_income_trend": ers.get("income_statement_trend", []),
            },
            "trade": {
                "vintage": trade.get("vintage"),
                "commodities": trade.get("commodities", []),
            },
            "energy": {
                "vintage": eia.get("vintage"),
            },
            "federal_spending": {
                "vintage": usa.get("vintage"),
                "top_agencies": usa.get("top_agencies", []),
            },
        },
        compact=True,
    )

    # 6. CREDIT_RISK.JSON (FDIC, SBA, CFPB, FEMA)
    write_json_clean(
        PUBLIC_DATA_DIR / "credit_risk.json",
        {
            "generated_at": utc_now_iso(),
            "fdic": {
                "vintage": fdic.get("vintage"),
                "recent_failures": fdic.get("recent_failures", []),
            },
            "sba": {
                "vintage": sba.get("vintage"),
                "total_loans": sba.get("count", 0),
                "top_naics": sba.get("top_naics", []),
            },
            "cfpb": {
                "vintage": cfpb.get("vintage"),
                "total_12m": cfpb.get("total_12m", 0),
                "top_products": cfpb.get("top_products", []),
                "top_issues": cfpb.get("top_issues", []),
                "top_companies": cfpb.get("top_companies", []),
            },
            "fema": {
                "vintage": fema.get("vintage"),
                "by_incident_type": fema.get("by_incident_type", []),
                "recent_declarations": fema.get("recent_declarations", []),
            },
        },
        compact=True,
    )

    # 7. POLICY_CORPORATE.JSON (Federal Register, Congress, SEC EDGAR)
    for comp in secedgar.get("companies", []):
        if comp.get("ticker"):
            search_items.append({"type": "company", "id": comp["ticker"], "label": f"{comp['ticker']} — {comp['name']}"})
    write_json_clean(
        PUBLIC_DATA_DIR / "policy_corporate.json",
        {
            "generated_at": utc_now_iso(),
            "federal_register": fedreg.get("documents", []),
            "congress_bills": congress.get("bills", []),
            "sec_companies": secedgar.get("companies", []),
        },
        compact=True,
    )

    # 8. SEARCH_INDEX.JSON
    write_json_clean(PUBLIC_DATA_DIR / "search_index.json", {"items": search_items}, compact=True)

    # 9. MANIFEST.JSON (Full Pipeline Health & Freshness Registry)
    sources_report = []
    ok_count = 0
    stale_count = 0
    deferred_count = 0
    for meta in SOURCES_META:
        sid = meta["id"]
        st = source_statuses.get(sid)
        raw_snap = load_raw(sid)
        if sid == "hud" and not raw_snap:
            status = "deferred"
            deferred_count += 1
        elif st:
            status = st["status"]
            if status == "ok":
                ok_count += 1
            else:
                stale_count += 1
        elif raw_snap:
            status = "ok"
            ok_count += 1
        else:
            status = "missing"
            stale_count += 1

        sources_report.append({
            **meta,
            "status": status,
            "fetched_at": (st or {}).get("fetched_at") or (raw_snap or {}).get("fetched_at"),
            "vintage": (st or {}).get("vintage") or (raw_snap or {}).get("vintage"),
            "record_count": (st or {}).get("count") if st else (raw_snap or {}).get("count", 0),
            "error": (st or {}).get("error"),
        })

    manifest = {
        "generated_at": utc_now_iso(),
        "total_sources": len(SOURCES_META),
        "ok_sources": ok_count,
        "stale_sources": stale_count,
        "deferred_sources": deferred_count,
        "states_count": len(states_list),
        "counties_count": total_counties_written,
        "sources": sources_report,
    }
    write_json_clean(PUBLIC_DATA_DIR / "manifest.json", manifest, compact=False)
    return manifest
