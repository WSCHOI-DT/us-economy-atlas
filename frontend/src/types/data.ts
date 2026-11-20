export interface SourceStatus {
  id: string;
  name: string;
  agency: string;
  tier: string;
  cadence: string;
  geo: string;
  key: string | null;
  status: "ok" | "stale" | "error" | "deferred" | "missing";
  fetched_at: string | null;
  vintage: string | null;
  record_count: number;
  error: string | null;
}

export interface ManifestData {
  generated_at: string;
  total_sources: number;
  ok_sources: number;
  stale_sources: number;
  deferred_sources: number;
  states_count: number;
  counties_count: number;
  sources: SourceStatus[];
}

export interface FredSeries {
  id: string;
  label: string;
  kr: string;
  unit: string;
  tier: string;
  category: string;
  latest_date: string;
  latest: number;
  prev: number | null;
  delta: number | null;
  yoy_delta: number | null;
  yoy_pct: number | null;
  points: [string, number][];
}

export interface MacroData {
  generated_at: string;
  fred: Record<string, FredSeries>;
  treasury: {
    latest_debt_trillions: number | null;
    latest_debt_date: string | null;
    latest_tga_billions: number | null;
    latest_tga_date: string | null;
    debt_series: [string, number][];
    tga_series: [string, number][];
    avg_interest_rates_date: string | null;
    avg_interest_rates: { security: string; rate_pct: number }[];
    mts_monthly: {
      date: string;
      label: string;
      receipts_b: number;
      outlays_b: number;
      surplus_deficit_b: number;
    }[];
  };
  usafacts_sources_count: number;
}

export interface StateRecord {
  fips: string;
  abbr: string;
  name: string;
  population: number | null;
  median_hh_income: number | null;
  median_age: number | null;
  poverty_pct: number | null;
  bachelors_plus_pct: number | null;
  cbp_establishments: number | null;
  cbp_employment: number | null;
  real_gdp_b: number | null;
  real_gdp_yoy_pct: number | null;
  real_gdp_year: string | null;
  pcpi: number | null;
  pcpi_yoy_pct: number | null;
  rpp: number | null;
  real_pcpi_rpp_adj: number | null;
  real_gdp_series: Record<string, number>;
  unemp_rate: number | null;
  unemp_period: string | null;
  unemp_mom_delta: number | null;
  labor_force: number | null;
  unemp_history: [string, number][];
  zhvi: number | null;
  zhvi_yoy_pct: number | null;
  zhvi_history: [string, number][];
  zori: number | null;
  active_listings: number | null;
  avg_dom: number | null;
  price_reduced_share_pct: number | null;
  fhfa_hpi: number | null;
  fhfa_yoy_pct: number | null;
  fhfa_5yr_pct: number | null;
  net_migration_people: number | null;
  net_migration_agi_m: number | null;
  ag_crop_value_m: number | null;
  ag_crops: Record<string, { year: number; value_m: number }>;
  watchlist_exports_ytd_m: number | null;
  watchlist_imports_ytd_m: number | null;
  elec_industrial_cents: number | null;
  elec_residential_cents: number | null;
  elec_period: string | null;
  fed_awards_12m_b: number | null;
  fed_awards_per_capita: number | null;
  fdic_banks: number | null;
  fdic_assets_b: number | null;
  fdic_deposits_b: number | null;
  sba_loans: number | null;
  sba_amount_m: number | null;
  sba_jobs: number | null;
  fema_disasters_3yr: number;
  cfpb_complaints_12m: number | null;
  cfpb_per_100k: number | null;
}

export interface MigrationPartner {
  fips: string;
  name: string;
  people: number;
  agi_k: number;
}

export interface CountyRecord {
  fips: string;
  state_fips: string;
  state_abbr: string;
  name: string;
  population: number | null;
  median_hh_income: number | null;
  median_home_value: number | null;
  median_gross_rent: number | null;
  median_age: number | null;
  poverty_pct: number | null;
  bachelors_plus_pct: number | null;
  cbp_establishments: number | null;
  cbp_employment: number | null;
  real_gdp_m: number | null;
  real_gdp_yoy_pct: number | null;
  real_gdp_series: Record<string, number>;
  pcpi: number | null;
  pcpi_yoy_pct: number | null;
  unemp_rate: number | null;
  unemp_mom_delta: number | null;
  unemp_yoy_delta: number | null;
  labor_force: number | null;
  unemp_history: [string, number][];
  zhvi: number | null;
  zhvi_yoy_pct: number | null;
  zori: number | null;
  metro: string;
  listing_price: number | null;
  active_listings: number | null;
  median_dom: number | null;
  price_reduced_share_pct: number | null;
  fhfa_hpi: number | null;
  fhfa_yoy_pct: number | null;
  net_people: number | null;
  net_agi_m: number | null;
  top_origins: MigrationPartner[];
  top_dests: MigrationPartner[];
  fed_awards_12m_m: number | null;
  fdic_banks: number | null;
  fdic_deposits_m: number | null;
  sba_loans: number | null;
  sba_amount_m: number | null;
  fema_disasters_3yr: number;
  corn_bu: number | null;
}

export interface CityRecord {
  place_fips: string;
  name: string;
  full_name: string;
  state_abbr: string;
  population: number;
  median_hh_income: number | null;
  median_home_value: number | null;
  median_gross_rent: number | null;
  median_age: number | null;
  zhvi: number | null;
  zhvi_yoy_pct: number | null;
  zori: number | null;
  zori_yoy_pct: number | null;
}

export interface StateCountyShard {
  state_fips: string;
  state_abbr: string;
  state_name: string;
  counties: CountyRecord[];
  cities: CityRecord[];
}

export interface HousingMigrationData {
  generated_at: string;
  top_agi_inflow_counties: {
    fips: string;
    name: string;
    state_fips: string;
    population: number | null;
    net_people: number | null;
    net_agi_m: number;
    zhvi: number | null;
    unemp_rate: number | null;
  }[];
  top_agi_outflow_counties: {
    fips: string;
    name: string;
    state_fips: string;
    population: number | null;
    net_people: number | null;
    net_agi_m: number;
    zhvi: number | null;
    unemp_rate: number | null;
  }[];
  quadrant_counties: {
    fips: string;
    name: string;
    state_fips: string;
    population: number | null;
    zhvi: number | null;
    zhvi_yoy_pct: number;
    zori: number | null;
    median_dom: number;
    price_reduced_share_pct: number | null;
    net_agi_m: number | null;
  }[];
}

export interface SectorsData {
  generated_at: string;
  agriculture: {
    nass_vintage: string | null;
    commodities: Record<
      string,
      {
        total_b: number;
        top_states: { state_fips: string; state_abbr: string; value_m: number; year: number }[];
      }
    >;
    ers_vintage: string | null;
    ers_income_trend: Record<string, number>[];
  };
  trade: {
    vintage: string | null;
    commodities: {
      hs: string;
      label: string;
      time: string;
      total_exports_ytd_m: number;
      total_imports_ytd_m: number;
      top_export_states: { state_fips: string; state_abbr: string; mo_m: number; ytd_m: number }[];
      top_import_states: { state_fips: string; state_abbr: string; mo_m: number; ytd_m: number }[];
    }[];
  };
  energy: { vintage: string | null };
  federal_spending: {
    vintage: string | null;
    top_agencies: { name: string; amount_b: number }[];
  };
}

export interface CreditRiskData {
  generated_at: string;
  fdic: {
    vintage: string | null;
    recent_failures: { name: string; location: string; fail_date: string; assets_m: number; deposits_m: number }[];
  };
  sba: {
    vintage: string | null;
    total_loans: number;
    top_naics: { naics2: string; desc: string; loans: number; amount_m: number }[];
  };
  cfpb: {
    vintage: string | null;
    total_12m: number;
    top_products: { key: string; count: number }[];
    top_issues: { key: string; count: number }[];
    top_companies: { key: string; count: number }[];
  };
  fema: {
    vintage: string | null;
    by_incident_type: { type: string; count: number }[];
    recent_declarations: {
      disaster_number: number;
      state_abbr: string;
      date: string;
      incident_type: string;
      title: string;
    }[];
  };
}

export interface PolicyCorporateData {
  generated_at: string;
  federal_register: {
    document_number: string;
    title: string;
    type: string;
    publication_date: string;
    agencies: string[];
    topic: string;
    abstract: string;
    html_url: string;
  }[];
  congress_bills: {
    congress: number;
    type: string;
    number: string;
    title: string;
    origin_chamber: string;
    update_date: string;
    latest_action_date: string;
    latest_action: string;
    url: string;
  }[];
  sec_companies: {
    ticker: string;
    name: string;
    sector: string;
    cik: string;
    latest_fy?: number | null;
    revenue_b?: number | null;
    revenue_yoy_pct?: number | null;
    op_income_b?: number | null;
    op_margin_pct?: number | null;
    net_income_b?: number | null;
    inventory_b?: number | null;
    assets_b?: number | null;
    revenue_history?: { fy: number; b: number }[];
    recent_filings: { form: string; date: string; url: string }[];
    error?: string;
  }[];
}

export interface SearchItem {
  type: "state" | "county" | "company";
  id: string;
  label: string;
  state_fips?: string;
  abbr?: string;
}

export type ViewId =
  | "macro"
  | "geo"
  | "compare"
  | "housing"
  | "sectors"
  | "credit"
  | "policy";
