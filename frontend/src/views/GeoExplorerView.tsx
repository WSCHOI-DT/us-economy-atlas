import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, MapPin, Search, X } from "lucide-react";
import type { CountyRecord, StateCountyShard, StateRecord } from "../types/data";
import { USChoroplethMap } from "../components/USChoroplethMap";
import { EChartBox } from "../components/EChartBox";
import { downloadCsv, fmtCompactNum, fmtCompactUsd, fmtNum, fmtPct, fmtUsd } from "../utils/format";

interface GeoExplorerViewProps {
  states: StateRecord[];
  selectedStateFips: string | null;
  selectedCountyFips: string | null;
  onSelectState: (fips: string | null) => void;
  onSelectCounty: (fips: string | null) => void;
  loadStateShard: (fips: string) => Promise<StateCountyShard>;
  shardCache: Record<string, StateCountyShard>;
  dark: boolean;
}

interface GeoMetricDef {
  id: string;
  label: string;
  unit: string;
  invert?: boolean;
  getState: (s: StateRecord) => number | null;
  getCounty: (c: CountyRecord) => number | null;
  fmt: (v: number | null) => string;
}

const METRICS: GeoMetricDef[] = [
  { id: "real_gdp_yoy", label: "실질 GDP 성장률 (BEA)", unit: "%", getState: (s) => s.real_gdp_yoy_pct, getCounty: (c) => c.real_gdp_yoy_pct, fmt: (v) => fmtPct(v, 2, true) },
  { id: "pcpi", label: "1인당 개인소득 (BEA)", unit: "", getState: (s) => s.pcpi, getCounty: (c) => c.pcpi, fmt: (v) => fmtUsd(v) },
  { id: "median_hh_income", label: "가구 중위소득 (Census)", unit: "", getState: (s) => s.median_hh_income, getCounty: (c) => c.median_hh_income, fmt: (v) => fmtUsd(v) },
  { id: "unemp_rate", label: "실업률 (BLS LAUS)", unit: "%", invert: true, getState: (s) => s.unemp_rate, getCounty: (c) => c.unemp_rate, fmt: (v) => fmtPct(v, 1) },
  { id: "zhvi", label: "주택가격 지수 (Zillow ZHVI)", unit: "", getState: (s) => s.zhvi, getCounty: (c) => c.zhvi, fmt: (v) => fmtUsd(v) },
  { id: "zhvi_yoy", label: "주택가격 상승률 YoY (Zillow)", unit: "%", getState: (s) => s.zhvi_yoy_pct, getCounty: (c) => c.zhvi_yoy_pct, fmt: (v) => fmtPct(v, 2, true) },
  { id: "net_agi_m", label: "순 소득(AGI) 유입 (IRS SOI, $M)", unit: "M", getState: (s) => s.net_migration_agi_m, getCounty: (c) => c.net_agi_m, fmt: (v) => fmtCompactUsd(v, "M") },
  { id: "median_dom", label: "매물 체류기간 DOM (Realtor, 일)", unit: "일", invert: true, getState: (s) => s.avg_dom, getCounty: (c) => c.median_dom, fmt: (v) => (v !== null ? `${v.toFixed(0)}일` : "—") },
  { id: "rpp", label: "지역 물가수준 RPP (US=100, 주별)", unit: "", invert: true, getState: (s) => s.rpp, getCounty: (c) => c.median_hh_income, fmt: (v) => fmtNum(v, 1) },
  { id: "elec_ind", label: "산업용 전기요금 (EIA ¢/kWh, 주별)", unit: "¢", invert: true, getState: (s) => s.elec_industrial_cents, getCounty: () => null, fmt: (v) => (v !== null ? `${v.toFixed(2)}¢` : "—") },
  { id: "fed_awards", label: "연방 자금 유입 (USAspending)", unit: "", getState: (s) => s.fed_awards_12m_b, getCounty: (c) => c.fed_awards_12m_m, fmt: (v) => fmtCompactUsd(v, "M") },
  { id: "sba_amount", label: "SBA 소상공인 대출 ($M)", unit: "M", getState: (s) => s.sba_amount_m, getCounty: (c) => c.sba_amount_m, fmt: (v) => fmtCompactUsd(v, "M") },
  { id: "fema", label: "최근 3년 재난 선포 (FEMA, 건)", unit: "건", invert: true, getState: (s) => s.fema_disasters_3yr, getCounty: (c) => c.fema_disasters_3yr, fmt: (v) => fmtNum(v) },
];

export const GeoExplorerView: React.FC<GeoExplorerViewProps> = ({
  states,
  selectedStateFips,
  selectedCountyFips,
  onSelectState,
  onSelectCounty,
  loadStateShard,
  shardCache,
  dark,
}) => {
  const [metricId, setMetricId] = useState<string>("real_gdp_yoy");
  const [subTab, setSubTab] = useState<"counties" | "cities">("counties");
  const [filterText, setFilterText] = useState("");
  const [loadingShard, setLoadingShard] = useState(false);

  const metric = METRICS.find((m) => m.id === metricId) || METRICS[0];
  const activeState = states.find((s) => s.fips === selectedStateFips) || null;
  const activeShard = selectedStateFips ? shardCache[selectedStateFips] || null : null;

  useEffect(() => {
    if (!selectedStateFips) return;
    if (shardCache[selectedStateFips]) return;
    setLoadingShard(true);
    loadStateShard(selectedStateFips).finally(() => setLoadingShard(false));
  }, [selectedStateFips, shardCache, loadStateShard]);

  const activeCounty: CountyRecord | null = useMemo(() => {
    if (!activeShard || !selectedCountyFips) return null;
    return activeShard.counties.find((c) => c.fips === selectedCountyFips) || null;
  }, [activeShard, selectedCountyFips]);

  const mapData = useMemo(() => {
    if (!selectedStateFips) {
      return states.map((s) => ({
        id: s.fips,
        name: `${s.name} (${s.abbr})`,
        value: metric.getState(s),
        extra: `인구 ${fmtCompactNum(s.population)} · 실업률 ${fmtPct(s.unemp_rate, 1)} · ZHVI ${fmtUsd(s.zhvi)}`,
      }));
    }
    if (!activeShard) return [];
    return activeShard.counties.map((c) => ({
      id: c.fips,
      name: `${c.name}, ${c.state_abbr} (${c.fips})`,
      value: metric.getCounty(c),
      extra: `인구 ${fmtCompactNum(c.population)} · 실업률 ${fmtPct(c.unemp_rate, 1)} · ZHVI ${fmtUsd(c.zhvi)}`,
    }));
  }, [selectedStateFips, states, activeShard, metric]);

  const tableRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!selectedStateFips) {
      return [...states]
        .filter((s) => !q || s.name.toLowerCase().includes(q) || s.abbr.toLowerCase().includes(q))
        .sort((a, b) => (metric.getState(b) ?? -1e18) - (metric.getState(a) ?? -1e18));
    }
    if (!activeShard) return [];
    return [...activeShard.counties]
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.fips.includes(q))
      .sort((a, b) => (metric.getCounty(b) ?? -1e18) - (metric.getCounty(a) ?? -1e18));
  }, [selectedStateFips, states, activeShard, filterText, metric]);

  const countyGdpOption = useMemo(() => {
    if (!activeCounty) return {};
    const entries = Object.entries(activeCounty.real_gdp_series || {}).sort((a, b) => a[0].localeCompare(b[0]));
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 12, top: 18, bottom: 24 },
      xAxis: { type: "category", data: entries.map(([y]) => y), axisLabel: { color: dark ? "#94a3b8" : "#475569", fontSize: 10 } },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: dark ? "#94a3b8" : "#475569", fontSize: 10, formatter: (v: number) => `$${(v / 1e6).toFixed(1)}B` },
        splitLine: { lineStyle: { color: dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)" } },
      },
      series: [{ type: "bar", data: entries.map(([, v]) => v), itemStyle: { color: "#38bdf8", borderRadius: [4, 4, 0, 0] } }],
    };
  }, [activeCounty, dark]);

  const countyUnempOption = useMemo(() => {
    if (!activeCounty) return {};
    const hist = activeCounty.unemp_history || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      grid: { left: 38, right: 12, top: 18, bottom: 24 },
      xAxis: { type: "category", data: hist.map(([p]) => p), axisLabel: { color: dark ? "#94a3b8" : "#475569", fontSize: 9 } },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: dark ? "#94a3b8" : "#475569", fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)" } },
      },
      series: [{ type: "line", smooth: true, data: hist.map(([, v]) => v), lineStyle: { color: "#10b981", width: 2 }, itemStyle: { color: "#10b981" } }],
    };
  }, [activeCounty, dark]);

  return (
    <div className="space-y-4">
      {/* Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          {selectedStateFips ? (
            <button
              onClick={() => {
                onSelectCounty(null);
                onSelectState(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 text-sky-400 px-3 py-1.5 text-xs font-semibold hover:bg-sky-500/25 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> 미국 전체 지도로 돌아가기
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 px-2">
              <MapPin className="w-4 h-4" /> 주(State)를 클릭하면 카운티(County) 지도로 줌인됩니다
            </span>
          )}
          {activeState && (
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {activeState.name} ({activeState.abbr}) · {activeShard ? `${activeShard.counties.length}개 카운티` : "로딩 중..."}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={metricId}
            onChange={(e) => setMetricId(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100"
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!selectedStateFips) {
                downloadCsv("us_states_economy.csv", states as any);
              } else if (activeShard) {
                downloadCsv(`us_counties_${activeShard.state_abbr}.csv`, activeShard.counties as any);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Main Split: Map + Leaderboard */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {selectedStateFips ? `${activeState?.name} 카운티별 분포` : "미국 50개 주(State) 경제 지도"} — {metric.label}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                마우스 휠 줌/드래그 가능 · 지역 클릭 시 심층 드릴다운
              </p>
            </div>
            {loadingShard && <span className="text-xs text-sky-400 animate-pulse">카운티 샤드 로딩 중...</span>}
          </div>
          <USChoroplethMap
            mode={selectedStateFips ? "counties" : "states"}
            stateFips={selectedStateFips || undefined}
            data={mapData}
            metricLabel={metric.label}
            unit={metric.unit}
            invertColor={metric.invert}
            dark={dark}
            height={470}
            selectedId={selectedCountyFips || selectedStateFips}
            onSelect={(id) => {
              if (!selectedStateFips) {
                onSelectState(id);
                onSelectCounty(null);
              } else {
                onSelectCounty(id);
              }
            }}
          />

          {/* State Executive Summary Bar when zoomed in */}
          {activeState && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
              <div><span className="text-slate-400 block">실질 GDP</span><b className="font-mono">{fmtCompactUsd(activeState.real_gdp_b, "B")} ({fmtPct(activeState.real_gdp_yoy_pct, 1, true)})</b></div>
              <div><span className="text-slate-400 block">1인당 소득 / RPP</span><b className="font-mono">{fmtUsd(activeState.pcpi)} / {fmtNum(activeState.rpp, 1)}</b></div>
              <div><span className="text-slate-400 block">실업률 (BLS)</span><b className="font-mono">{fmtPct(activeState.unemp_rate, 1)}</b></div>
              <div><span className="text-slate-400 block">주택가격 (ZHVI)</span><b className="font-mono">{fmtUsd(activeState.zhvi)} ({fmtPct(activeState.zhvi_yoy_pct, 1, true)})</b></div>
              <div><span className="text-slate-400 block">IRS 순 AGI 이동</span><b className="font-mono">{fmtCompactUsd(activeState.net_migration_agi_m, "M")}</b></div>
              <div><span className="text-slate-400 block">산업용 전기요금</span><b className="font-mono">{activeState.elec_industrial_cents ? `${activeState.elec_industrial_cents}¢/kWh` : "—"}</b></div>
            </div>
          )}
        </div>

        {/* Right Table Panel (States or Counties / Cities) */}
        <div className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            {selectedStateFips ? (
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
                <button
                  onClick={() => setSubTab("counties")}
                  className={`px-3 py-1 rounded-md font-medium ${subTab === "counties" ? "bg-sky-500 text-white" : "text-slate-500 dark:text-slate-300"}`}
                >
                  카운티 ({activeShard?.counties.length ?? 0})
                </button>
                <button
                  onClick={() => setSubTab("cities")}
                  className={`px-3 py-1 rounded-md font-medium ${subTab === "cities" ? "bg-sky-500 text-white" : "text-slate-500 dark:text-slate-300"}`}
                >
                  주요 도시 ({activeShard?.cities.length ?? 0})
                </button>
              </div>
            ) : (
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">51개 주(State) 랭킹</h3>
            )}
            <div className="relative flex-1 max-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="지역 필터..."
                className="w-full pl-8 pr-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none"
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[480px] -mx-1 px-1">
            {selectedStateFips && subTab === "cities" ? (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 text-left">도시 (City)</th>
                    <th className="py-2 text-right">인구</th>
                    <th className="py-2 text-right">중위소득</th>
                    <th className="py-2 text-right">ZHVI</th>
                    <th className="py-2 text-right">임대료(ZORI)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {(activeShard?.cities || [])
                    .filter((c) => !filterText || c.name.toLowerCase().includes(filterText.toLowerCase()))
                    .map((city) => (
                      <tr key={city.place_fips} className="hover:bg-sky-500/5">
                        <td className="py-2 font-medium text-slate-800 dark:text-slate-100">{city.name}</td>
                        <td className="py-2 text-right font-mono">{fmtCompactNum(city.population)}</td>
                        <td className="py-2 text-right font-mono">{fmtUsd(city.median_hh_income)}</td>
                        <td className="py-2 text-right font-mono">
                          {fmtUsd(city.zhvi)}
                          {city.zhvi_yoy_pct !== null && (
                            <span className={`ml-1 text-[10px] ${city.zhvi_yoy_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {fmtPct(city.zhvi_yoy_pct, 1, true)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono">{fmtUsd(city.zori ?? city.median_gross_rent)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 text-left">지역명</th>
                    <th className="py-2 text-right">{metric.label.split(" ")[0]}</th>
                    <th className="py-2 text-right">인구</th>
                    <th className="py-2 text-right">실업률</th>
                    <th className="py-2 text-right">ZHVI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {tableRows.slice(0, 120).map((row: any) => {
                    const isSt = !selectedStateFips;
                    const id = row.fips;
                    const primary = isSt ? metric.getState(row) : metric.getCounty(row);
                    return (
                      <tr
                        key={id}
                        onClick={() => (isSt ? onSelectState(id) : onSelectCounty(id))}
                        className={`cursor-pointer transition hover:bg-sky-500/10 ${
                          selectedCountyFips === id ? "bg-amber-500/15" : ""
                        }`}
                      >
                        <td className="py-2 font-medium text-slate-800 dark:text-slate-100">
                          {isSt ? `${row.name} (${row.abbr})` : row.name}
                          {!isSt && <span className="ml-1 text-[10px] font-mono text-slate-400">{row.fips}</span>}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold text-sky-500 dark:text-sky-400">
                          {metric.fmt(primary)}
                        </td>
                        <td className="py-2 text-right font-mono text-slate-600 dark:text-slate-300">{fmtCompactNum(row.population)}</td>
                        <td className="py-2 text-right font-mono">{fmtPct(row.unemp_rate, 1)}</td>
                        <td className="py-2 text-right font-mono">{fmtUsd(row.zhvi)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 360° County Dossier Panel */}
      {activeCounty && (
        <div className="rounded-2xl border-2 border-amber-500/40 bg-white dark:bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-400">
                  COUNTY 360° DOSSIER · FIPS {activeCounty.fips}
                </span>
                {activeCounty.metro && (
                  <span className="text-xs text-slate-400">MSA: {activeCounty.metro}</span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {activeCounty.name}, {activeCounty.state_abbr}
              </h2>
            </div>
            <button
              onClick={() => onSelectCounty(null)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 12-KPI Comprehensive County Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">인구 / 중위연령</span><b className="text-sm font-mono">{fmtNum(activeCounty.population)} / {activeCounty.median_age ?? "—"}세</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">실질 GDP (BEA)</span><b className="text-sm font-mono">{fmtCompactUsd(activeCounty.real_gdp_m, "M")} ({fmtPct(activeCounty.real_gdp_yoy_pct, 1, true)})</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">1인당소득 / 가구중위</span><b className="text-sm font-mono">{fmtUsd(activeCounty.pcpi)} / {fmtUsd(activeCounty.median_hh_income)}</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">실업률 (BLS) / 경제인구</span><b className="text-sm font-mono">{fmtPct(activeCounty.unemp_rate, 1)} / {fmtCompactNum(activeCounty.labor_force)}</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">주택가격 (ZHVI / YoY)</span><b className="text-sm font-mono">{fmtUsd(activeCounty.zhvi)} ({fmtPct(activeCounty.zhvi_yoy_pct, 1, true)})</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">임대료(ZORI) / DOM</span><b className="text-sm font-mono">{fmtUsd(activeCounty.zori ?? activeCounty.median_gross_rent)} / {activeCounty.median_dom ?? "—"}일</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">IRS 순인구 / 순AGI</span><b className={`text-sm font-mono ${(activeCounty.net_agi_m ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtNum(activeCounty.net_people)}명 / {fmtCompactUsd(activeCounty.net_agi_m, "M")}</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">사업체(CBP) / 고용</span><b className="text-sm font-mono">{fmtNum(activeCounty.cbp_establishments)} / {fmtCompactNum(activeCounty.cbp_employment)}</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">연방자금 12M (USAspend)</span><b className="text-sm font-mono">{fmtCompactUsd(activeCounty.fed_awards_12m_m, "M")}</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">SBA 대출 (건 / 금액)</span><b className="text-sm font-mono">{fmtNum(activeCounty.sba_loans)}건 / {fmtCompactUsd(activeCounty.sba_amount_m, "M")}</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">FDIC 본점은행 / 예금</span><b className="text-sm font-mono">{fmtNum(activeCounty.fdic_banks)}개 / {fmtCompactUsd(activeCounty.fdic_deposits_m, "M")}</b></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3"><span className="text-slate-400 block">FEMA 재해(3Y) / 옥수수</span><b className="text-sm font-mono">{activeCounty.fema_disasters_3yr}건 / {activeCounty.corn_bu ? fmtCompactNum(activeCounty.corn_bu) + " BU" : "—"}</b></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">BEA 카운티 실질 GDP 추이 (2017년 연쇄달러)</h4>
              <EChartBox option={countyGdpOption} height={180} dark={dark} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">BLS 월간 실업률 추이 (최근 12개월)</h4>
              <EChartBox option={countyUnempOption} height={180} dark={dark} />
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-2.5">
              <h4 className="font-semibold text-slate-600 dark:text-slate-300">IRS SOI 주요 인구·소득(AGI) 이동 파트너</h4>
              <div>
                <div className="text-[11px] font-medium text-emerald-400 mb-1">▲ 상위 유입 출처 (Top Origins)</div>
                {(activeCounty.top_origins || []).length === 0 ? (
                  <div className="text-slate-400">집계 데이터 없음</div>
                ) : (
                  activeCounty.top_origins.slice(0, 4).map((o) => (
                    <div key={o.fips} className="flex justify-between py-0.5">
                      <span className="truncate pr-2">{o.name}</span>
                      <span className="font-mono text-emerald-400 shrink-0">+{fmtNum(o.people)}명 (${(o.agi_k / 1000).toFixed(0)}M)</span>
                    </div>
                  ))
                )}
              </div>
              <div>
                <div className="text-[11px] font-medium text-rose-400 mb-1">▼ 상위 유출 목적지 (Top Destinations)</div>
                {(activeCounty.top_dests || []).length === 0 ? (
                  <div className="text-slate-400">집계 데이터 없음</div>
                ) : (
                  activeCounty.top_dests.slice(0, 4).map((d) => (
                    <div key={d.fips} className="flex justify-between py-0.5">
                      <span className="truncate pr-2">{d.name}</span>
                      <span className="font-mono text-rose-400 shrink-0">-{fmtNum(d.people)}명 (${(d.agi_k / 1000).toFixed(0)}M)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
