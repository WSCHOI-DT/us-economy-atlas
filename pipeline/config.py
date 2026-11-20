"""Configuration & source metadata for US Economy Atlas pipeline."""

from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PIPELINE_DIR = ROOT_DIR / "pipeline"
CACHE_DIR = PIPELINE_DIR / ".cache"
RAW_DIR = PIPELINE_DIR / "raw"
PUBLIC_DATA_DIR = ROOT_DIR / "frontend" / "public" / "data"
USER_ENV_FILE = Path.home() / ".gemini" / "config" / "us-economy.env"

STATES = [
    ("01", "AL", "Alabama"), ("02", "AK", "Alaska"), ("04", "AZ", "Arizona"),
    ("05", "AR", "Arkansas"), ("06", "CA", "California"), ("08", "CO", "Colorado"),
    ("09", "CT", "Connecticut"), ("10", "DE", "Delaware"), ("11", "DC", "District of Columbia"),
    ("12", "FL", "Florida"), ("13", "GA", "Georgia"), ("15", "HI", "Hawaii"),
    ("16", "ID", "Idaho"), ("17", "IL", "Illinois"), ("18", "IN", "Indiana"),
    ("19", "IA", "Iowa"), ("20", "KS", "Kansas"), ("21", "KY", "Kentucky"),
    ("22", "LA", "Louisiana"), ("23", "ME", "Maine"), ("24", "MD", "Maryland"),
    ("25", "MA", "Massachusetts"), ("26", "MI", "Michigan"), ("27", "MN", "Minnesota"),
    ("28", "MS", "Mississippi"), ("29", "MO", "Missouri"), ("30", "MT", "Montana"),
    ("31", "NE", "Nebraska"), ("32", "NV", "Nevada"), ("33", "NH", "New Hampshire"),
    ("34", "NJ", "New Jersey"), ("35", "NM", "New Mexico"), ("36", "NY", "New York"),
    ("37", "NC", "North Carolina"), ("38", "ND", "North Dakota"), ("39", "OH", "Ohio"),
    ("40", "OK", "Oklahoma"), ("41", "OR", "Oregon"), ("42", "PA", "Pennsylvania"),
    ("44", "RI", "Rhode Island"), ("45", "SC", "South Carolina"), ("46", "SD", "South Dakota"),
    ("47", "TN", "Tennessee"), ("48", "TX", "Texas"), ("49", "UT", "Utah"),
    ("50", "VT", "Vermont"), ("51", "VA", "Virginia"), ("53", "WA", "Washington"),
    ("54", "WV", "West Virginia"), ("55", "WI", "Wisconsin"), ("56", "WY", "Wyoming"),
]

FIPS_TO_ABBR = {f: a for f, a, _ in STATES}
ABBR_TO_FIPS = {a: f for f, a, _ in STATES}
FIPS_TO_NAME = {f: n for f, _, n in STATES}
NAME_TO_FIPS = {n.lower(): f for f, _, n in STATES}

# SEC EDGAR Bellwether Watchlist (CIK + Ticker + Sector)
SEC_WATCHLIST = [
    {"ticker": "DE", "name": "Deere & Company", "sector": "Ag & Construction Machinery", "cik": "0000315189"},
    {"ticker": "CAT", "name": "Caterpillar Inc.", "sector": "Construction & Mining Machinery", "cik": "0000018230"},
    {"ticker": "CNH", "name": "CNH Industrial N.V.", "sector": "Ag & Construction Machinery", "cik": "0001567094"},
    {"ticker": "AGCO", "name": "AGCO Corporation", "sector": "Agricultural Machinery", "cik": "0000880266"},
    {"ticker": "TSCO", "name": "Tractor Supply Company", "sector": "Rural Lifestyle Retail", "cik": "0000916365"},
    {"ticker": "HD", "name": "The Home Depot, Inc.", "sector": "Housing & Home Improvement", "cik": "0000354950"},
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "sector": "Banking & Credit", "cik": "0000019617"},
    {"ticker": "WMT", "name": "Walmart Inc.", "sector": "Consumer & Retail", "cik": "0000104169"},
    {"ticker": "XOM", "name": "Exxon Mobil Corporation", "sector": "Energy & Commodities", "cik": "0000034088"},
    {"ticker": "UNP", "name": "Union Pacific Corporation", "sector": "Freight Rail & Logistics", "cik": "0000100885"},
]

# Census International Trade HS Codes Watchlist
TRADE_HS_WATCHLIST = [
    {"hs": "8701", "label": "Tractors (트랙터)"},
    {"hs": "8429", "label": "Construction Machinery (건설·토목장비)"},
    {"hs": "8432", "label": "Soil/Ag Machinery (경운·농업기계)"},
    {"hs": "8433", "label": "Harvesting Machinery (수확·예초기계)"},
    {"hs": "8542", "label": "Semiconductors (반도체)"},
    {"hs": "8703", "label": "Passenger Vehicles (승용차)"},
    {"hs": "2709", "label": "Crude Petroleum (원유)"},
    {"hs": "1005", "label": "Corn (옥수수)"},
    {"hs": "1201", "label": "Soybeans (대두)"},
]

# FRED Series Catalog by Cadence
FRED_SERIES = [
    # Daily
    {"id": "DGS10", "label": "10Y Treasury Yield", "kr": "미국채 10년물 금리", "unit": "%", "tier": "daily", "category": "rates"},
    {"id": "DGS2", "label": "2Y Treasury Yield", "kr": "미국채 2년물 금리", "unit": "%", "tier": "daily", "category": "rates"},
    {"id": "DGS30", "label": "30Y Treasury Yield", "kr": "미국채 30년물 금리", "unit": "%", "tier": "daily", "category": "rates"},
    {"id": "DGS3MO", "label": "3M Treasury Yield", "kr": "미국채 3개월물 금리", "unit": "%", "tier": "daily", "category": "rates"},
    {"id": "T10Y2Y", "label": "10Y-2Y Yield Spread", "kr": "장단기 금리차 (10Y-2Y)", "unit": "%p", "tier": "daily", "category": "rates"},
    {"id": "BAMLH0A0HYM2", "label": "US High Yield OAS", "kr": "하이일드 신용스프레드", "unit": "%p", "tier": "daily", "category": "credit"},
    {"id": "DTWEXBGS", "label": "Broad US Dollar Index", "kr": "달러 인덱스 (광의)", "unit": "Index", "tier": "daily", "category": "fx"},
    {"id": "DCOILWTICO", "label": "WTI Crude Oil", "kr": "WTI 원유 가격", "unit": "$/bbl", "tier": "daily", "category": "energy"},
    {"id": "DFF", "label": "Effective Fed Funds Rate", "kr": "실효 연방기금금리", "unit": "%", "tier": "daily", "category": "rates"},
    # Weekly
    {"id": "ICSA", "label": "Initial Jobless Claims", "kr": "신규 실업수당 청구", "unit": "Persons", "tier": "weekly", "category": "labor"},
    {"id": "MORTGAGE30US", "label": "30Y Fixed Mortgage Rate", "kr": "30년 고정 모기지 금리", "unit": "%", "tier": "weekly", "category": "housing"},
    {"id": "WALCL", "label": "Fed Total Assets", "kr": "연준 총자산", "unit": "$M", "tier": "weekly", "category": "monetary"},
    {"id": "STLFSI4", "label": "Financial Stress Index", "kr": "세인트루이스 금융스트레스지수", "unit": "Index", "tier": "weekly", "category": "credit"},
    # Monthly
    {"id": "UNRATE", "label": "Unemployment Rate", "kr": "미국 실업률", "unit": "%", "tier": "monthly", "category": "labor"},
    {"id": "PAYEMS", "label": "Total Nonfarm Payrolls", "kr": "비농업 고용자수", "unit": "Thousands", "tier": "monthly", "category": "labor"},
    {"id": "CPIAUCSL", "label": "CPI All Urban (Index)", "kr": "소비자물가지수 (CPI)", "unit": "Index", "tier": "monthly", "category": "inflation"},
    {"id": "PCEPILFE", "label": "Core PCE Price Index", "kr": "근원 PCE 물가지수", "unit": "Index", "tier": "monthly", "category": "inflation"},
    {"id": "INDPRO", "label": "Industrial Production", "kr": "산업생산지수", "unit": "Index", "tier": "monthly", "category": "activity"},
    {"id": "HOUST", "label": "Housing Starts", "kr": "주택착공건수 (SAAR)", "unit": "Thousands", "tier": "monthly", "category": "housing"},
    {"id": "RSAFS", "label": "Retail & Food Sales", "kr": "소매판매액", "unit": "$M", "tier": "monthly", "category": "activity"},
    {"id": "UMCSENT", "label": "Consumer Sentiment", "kr": "미시간대 소비자심리", "unit": "Index", "tier": "monthly", "category": "activity"},
    {"id": "JTSJOL", "label": "Job Openings (JOLTS)", "kr": "구인건수 (JOLTS)", "unit": "Thousands", "tier": "monthly", "category": "labor"},
    # Quarterly
    {"id": "GDPC1", "label": "Real GDP", "kr": "실질 GDP (2017년 연쇄달러)", "unit": "$B", "tier": "quarterly", "category": "gdp"},
    {"id": "A191RL1Q225SBEA", "label": "Real GDP Growth (SAAR)", "kr": "실질 GDP 성장률 (전기비 연율)", "unit": "%", "tier": "quarterly", "category": "gdp"},
]

# Master Source Registry (22 sources)
SOURCES_META = [
    {"id": "fred", "name": "FRED (St. Louis Fed)", "agency": "Federal Reserve Bank of St. Louis", "tier": "daily", "cadence": "Daily / Weekly / Monthly / Quarterly", "geo": "National", "key": "FRED_API_KEY"},
    {"id": "treasury", "name": "US Treasury Fiscal Data", "agency": "U.S. Dept. of the Treasury", "tier": "daily", "cadence": "Daily", "geo": "National", "key": None},
    {"id": "fedreg", "name": "Federal Register & eCFR", "agency": "National Archives / OFR", "tier": "daily", "cadence": "Daily", "geo": "National / Sector", "key": None},
    {"id": "congress", "name": "Congress.gov Legislation", "agency": "Library of Congress", "tier": "daily", "cadence": "Daily", "geo": "National / Policy", "key": None},
    {"id": "secedgar", "name": "SEC EDGAR Corporate Filings", "agency": "U.S. SEC", "tier": "daily", "cadence": "Daily / Quarterly", "geo": "Corporate (10 Bellwethers)", "key": None},
    {"id": "cfpb", "name": "CFPB Consumer Complaints", "agency": "CFPB", "tier": "daily", "cadence": "Daily", "geo": "State / ZIP", "key": None},
    {"id": "fema", "name": "FEMA Disasters & Assistance", "agency": "FEMA", "tier": "daily", "cadence": "Daily", "geo": "State / County", "key": None},
    {"id": "eia", "name": "EIA Energy Data", "agency": "U.S. EIA", "tier": "weekly", "cadence": "Weekly / Monthly", "geo": "National / State", "key": None},
    {"id": "bls", "name": "BLS Labor & Wages (LAUS/QCEW)", "agency": "Bureau of Labor Statistics", "tier": "monthly", "cadence": "Monthly / Quarterly", "geo": "National / State / County / City", "key": None},
    {"id": "zillow", "name": "Zillow Research (ZHVI / ZORI)", "agency": "Zillow Research", "tier": "monthly", "cadence": "Monthly", "geo": "State / County / City", "key": None},
    {"id": "realtor", "name": "Realtor.com Core Housing Supply", "agency": "Realtor.com Economic Research", "tier": "monthly", "cadence": "Monthly", "geo": "State / Metro / County", "key": None},
    {"id": "intltrade", "name": "Census International Trade", "agency": "U.S. Census Bureau", "tier": "monthly", "cadence": "Monthly", "geo": "State / Port x HS", "key": "CENSUS_API_KEY"},
    {"id": "usaspending", "name": "USAspending Federal Flows", "agency": "U.S. Treasury / USAspending", "tier": "monthly", "cadence": "Monthly", "geo": "State / County", "key": None},
    {"id": "usafacts", "name": "USAFacts Multi-Agency Benchmarks", "agency": "USAFacts", "tier": "monthly", "cadence": "Monthly", "geo": "National / State", "key": None},
    {"id": "fhfa", "name": "FHFA House Price Index", "agency": "FHFA", "tier": "quarterly", "cadence": "Quarterly / Annual", "geo": "State / Metro / County", "key": None},
    {"id": "fdic", "name": "FDIC Banking & Deposits", "agency": "FDIC", "tier": "quarterly", "cadence": "Quarterly / Annual", "geo": "State / County", "key": None},
    {"id": "sba", "name": "SBA 7(a) & 504 Small Business Loans", "agency": "SBA", "tier": "quarterly", "cadence": "Quarterly", "geo": "State / County / NAICS", "key": None},
    {"id": "bea", "name": "BEA Regional GDP, Income & RPP", "agency": "Bureau of Economic Analysis", "tier": "annual", "cadence": "Annual / Quarterly", "geo": "State / County / MSA", "key": "BEA_API_KEY"},
    {"id": "census", "name": "U.S. Census ACS & CBP", "agency": "U.S. Census Bureau", "tier": "annual", "cadence": "Annual", "geo": "State / County / City", "key": "CENSUS_API_KEY"},
    {"id": "irs_migration", "name": "IRS SOI County Migration (AGI)", "agency": "IRS Statistics of Income", "tier": "annual", "cadence": "Annual", "geo": "County-to-County", "key": None},
    {"id": "usda_nass", "name": "USDA NASS Quick Stats", "agency": "USDA NASS", "tier": "annual", "cadence": "Annual / Seasonal", "geo": "State / County", "key": "USDA_NASS_API_KEY"},
    {"id": "usda_ers", "name": "USDA ERS Farm Financials (ARMS)", "agency": "USDA ERS", "tier": "annual", "cadence": "Annual", "geo": "National / State", "key": "DATA_GOV_API_KEY"},
    {"id": "hud", "name": "HUD FMR & USPS Crosswalk", "agency": "HUD User", "tier": "annual", "cadence": "Annual (Deferred)", "geo": "County / ZIP", "key": "HUD_API_TOKEN"},
]
