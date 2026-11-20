# US Economy Atlas

Full-spectrum dynamic US economic intelligence dashboard spanning **National Macro, Federal Fiscal/Policy, Corporate Bellwethers, 50 States, 3,143 Counties, and Major Cities**, powered by 22 official US data sources with cadence-aligned automated refresh via GitHub Actions.

## Architecture
- **`pipeline/`**: Zero-dependency Python 3.10+ fault-tolerant ETL (`fetch.py`) supporting `daily`, `weekly`, `monthly`, `quarterly`, and `annual` tiers with last-known-good fallback and 51-state sharded JSON output.
- **`frontend/`**: React + TypeScript + Vite + Tailwind CSS + Apache ECharts + US States/Counties TopoJSON interactive dashboard with 7 analytical views, `Cmd/Ctrl+K` global search, multi-region comparator, and live data freshness console.
- **`.github/workflows/`**: Automated cadence refresh workflows (`refresh-daily.yml`, `refresh-weekly.yml`, `refresh-monthly.yml`, `refresh-quarterly-annual.yml`) and GitHub Pages continuous deployment (`deploy.yml`).

## Local Usage
```powershell
# 1. Run full data pipeline (reads API keys from ~/.gemini/config/us-economy.env or env vars)
python pipeline/fetch.py --tier all

# 2. Validate schema & secret hygiene
python -m unittest pipeline/tests/test_pipeline_schema.py

# 3. Start dashboard locally
cd frontend
npm ci
npm run dev
```
