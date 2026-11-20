import React, { useMemo, useState } from "react";
import { Download, Plus, X } from "lucide-react";
import type { StateRecord } from "../types/data";
import { EChartBox } from "../components/EChartBox";
import { downloadCsv, fmtCompactNum, fmtCompactUsd, fmtNum, fmtPct, fmtUsd } from "../utils/format";

interface ComparatorViewProps {
  states: StateRecord[];
  dark: boolean;
}

const COLORS = ["#38bdf8", "#10b981", "#f59e0b", "#f43f5e"];

function norm(val: number | null | undefined, min: number, max: number, invert = false): number {
  if (val === null || val === undefined || Number.isNaN(val)) return 50;
  const clamped = Math.max(min, Math.min(max, val));
  const pct = ((clamped - min) / (max - min || 1)) * 100;
  return Math.round(invert ? 100 - pct : pct);
}

export const ComparatorView: React.FC<ComparatorViewProps> = ({ states, dark }) => {
  const [selectedFips, setSelectedFips] = useState<string[]>(["48", "06", "12", "19"]); // TX, CA, FL, IA
  const [addValue, setAddValue] = useState<string>("37"); // NC

  const chosen = useMemo(
    () => selectedFips.map((f) => states.find((s) => s.fips === f)).filter((x): x is StateRecord => Boolean(x)),
    [selectedFips, states]
  );

  const radarOption = useMemo(() => {
    const indicators = [
      { name: "실질 GDP 성장", max: 100 },
      { name: "실질소득 (RPP조정)", max: 100 },
      { name: "고용 안정 (저실업)", max: 100 },
      { name: "주택 접근성 (저ZHVI)", max: 100 },
      { name: "부(AGI) 순유입", max: 100 },
      { name: "저전력원가 (EIA)", max: 100 },
    ];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: dark ? "#cbd5e1" : "#334155", fontSize: 12 } },
      radar: {
        indicator: indicators,
        radius: "64%",
        axisName: { color: dark ? "#94a3b8" : "#475569", fontSize: 11 },
        splitArea: { areaStyle: { color: dark ? ["rgba(30,41,59,0.4)", "rgba(15,23,42,0.4)"] : ["#f8fafc", "#ffffff"] } },
        splitLine: { lineStyle: { color: dark ? "#334155" : "#cbd5e1" } },
      },
      series: [
        {
          type: "radar",
          data: chosen.map((s, idx) => ({
            name: `${s.name} (${s.abbr})`,
            value: [
              norm(s.real_gdp_yoy_pct, -1, 6),
              norm(s.real_pcpi_rpp_adj ?? s.pcpi, 48000, 88000),
              norm(s.unemp_rate, 2.0, 6.5, true),
              norm(s.zhvi, 180000, 780000, true),
              norm(s.net_migration_agi_m, -15000, 15000),
              norm(s.elec_industrial_cents, 5.5, 22, true),
            ],
            lineStyle: { width: 2.2, color: COLORS[idx % COLORS.length] },
            itemStyle: { color: COLORS[idx % COLORS.length] },
            areaStyle: { color: COLORS[idx % COLORS.length], opacity: 0.12 },
          })),
        },
      ],
    };
  }, [chosen, dark]);

  const zhviCompareOption = useMemo(() => {
    const allDates = Array.from(
      new Set(chosen.flatMap((s) => (s.zhvi_history || []).map(([d]) => d)))
    ).sort();
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: { top: 4, textStyle: { color: dark ? "#cbd5e1" : "#334155", fontSize: 11 } },
      grid: { left: 56, right: 16, top: 34, bottom: 28 },
      xAxis: { type: "category", data: allDates, axisLabel: { color: dark ? "#94a3b8" : "#475569", fontSize: 10 } },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: dark ? "#94a3b8" : "#475569", fontSize: 10, formatter: (v: number) => `$${(v / 1000).toFixed(0)}K` },
        splitLine: { lineStyle: { color: dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)" } },
      },
      series: chosen.map((s, idx) => {
        const map = new Map(s.zhvi_history || []);
        return {
          name: `${s.abbr} ZHVI`,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.2, color: COLORS[idx % COLORS.length] },
          itemStyle: { color: COLORS[idx % COLORS.length] },
          data: allDates.map((d) => map.get(d) ?? null),
        };
      }),
    };
  }, [chosen, dark]);

  const rows: { label: string; get: (s: StateRecord) => string }[] = [
    { label: "인구 (Census ACS)", get: (s) => fmtCompactNum(s.population) },
    { label: "실질 GDP / 성장률 (BEA)", get: (s) => `${fmtCompactUsd(s.real_gdp_b, "B")} (${fmtPct(s.real_gdp_yoy_pct, 1, true)})` },
    { label: "1인당 소득 / RPP 조정", get: (s) => `${fmtUsd(s.pcpi)} / ${fmtUsd(s.real_pcpi_rpp_adj)}` },
    { label: "지역 물가수준 (BEA RPP, US=100)", get: (s) => fmtNum(s.rpp, 1) },
    { label: "가구 중위소득 (Census)", get: (s) => fmtUsd(s.median_hh_income) },
    { label: "실업률 (BLS LAUS)", get: (s) => fmtPct(s.unemp_rate, 1) },
    { label: "주택가격 ZHVI / YoY (Zillow)", get: (s) => `${fmtUsd(s.zhvi)} (${fmtPct(s.zhvi_yoy_pct, 1, true)})` },
    { label: "평균 매물 체류기간 DOM (Realtor)", get: (s) => (s.avg_dom !== null ? `${s.avg_dom.toFixed(0)}일` : "—") },
    { label: "FHFA 5년 주택상승률", get: (s) => fmtPct(s.fhfa_5yr_pct, 1, true) },
    { label: "IRS 순인구 / 순AGI 이동", get: (s) => `${fmtCompactNum(s.net_migration_people)} / ${fmtCompactUsd(s.net_migration_agi_m, "M")}` },
    { label: "주요 작물 생산액 (USDA NASS)", get: (s) => fmtCompactUsd(s.ag_crop_value_m, "M") },
    { label: "관심 HS 수출 / 수입 YTD (Census)", get: (s) => `${fmtCompactUsd(s.watchlist_exports_ytd_m, "M")} / ${fmtCompactUsd(s.watchlist_imports_ytd_m, "M")}` },
    { label: "산업용 전기요금 (EIA ¢/kWh)", get: (s) => (s.elec_industrial_cents ? `${s.elec_industrial_cents}¢` : "—") },
    { label: "연방자금 12M (USAspending)", get: (s) => `${fmtCompactUsd(s.fed_awards_12m_b, "B")} (${fmtUsd(s.fed_awards_per_capita)}/인)` },
    { label: "SBA 대출 (건 / 금액)", get: (s) => `${fmtNum(s.sba_loans)}건 / ${fmtCompactUsd(s.sba_amount_m, "M")}` },
    { label: "FDIC 본점은행 / 예금", get: (s) => `${fmtNum(s.fdic_banks)}개 / ${fmtCompactUsd(s.fdic_deposits_b, "B")}` },
    { label: "CFPB 민원 (인구 10만명당)", get: (s) => fmtNum(s.cfpb_per_100k, 1) },
    { label: "FEMA 재난 선포 (최근 3년)", get: (s) => `${s.fema_disasters_3yr}건` },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {chosen.map((s, idx) => (
            <span
              key={s.fips}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            >
              {s.name} ({s.abbr})
              {chosen.length > 1 && (
                <button onClick={() => setSelectedFips((prev) => prev.filter((x) => x !== s.fips))}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
          {selectedFips.length < 4 && (
            <div className="inline-flex items-center gap-1.5">
              <select
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs"
              >
                {states
                  .filter((s) => !selectedFips.includes(s.fips))
                  .map((s) => (
                    <option key={s.fips} value={s.fips}>
                      {s.name} ({s.abbr})
                    </option>
                  ))}
              </select>
              <button
                onClick={() => {
                  if (addValue && !selectedFips.includes(addValue) && selectedFips.length < 4) {
                    setSelectedFips([...selectedFips, addValue]);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-500 text-white px-2.5 py-1 text-xs font-semibold hover:bg-sky-600"
              >
                <Plus className="w-3.5 h-3.5" /> 추가
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => downloadCsv("us_region_comparison.csv", chosen as any)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Download className="w-3.5 h-3.5" /> 비교표 CSV 다운로드
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold mb-1">6대 경제 펀더멘털 레이더 비교</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">각 축 0~100 표준화 점수 (높을수록 양호/경쟁력 우위)</p>
          <EChartBox option={radarOption} height={320} dark={dark} />
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold mb-1">주택가격 (Zillow ZHVI) 최근 12개월 추이 비교</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">선택 주별 월간 주택가치 비교 ($)</p>
          <EChartBox option={zhviCompareOption} height={320} dark={dark} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold mb-3">18개 핵심 지표 정량 비교표</h3>
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
            <tr>
              <th className="py-2 text-left">지표 항목</th>
              {chosen.map((s, idx) => (
                <th key={s.fips} className="py-2 text-right font-semibold" style={{ color: COLORS[idx % COLORS.length] }}>
                  {s.name} ({s.abbr})
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {rows.map((r) => (
              <tr key={r.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="py-2.5 text-slate-600 dark:text-slate-300 font-medium">{r.label}</td>
                {chosen.map((s) => (
                  <td key={s.fips} className="py-2.5 text-right font-mono text-slate-900 dark:text-slate-100">
                    {r.get(s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
