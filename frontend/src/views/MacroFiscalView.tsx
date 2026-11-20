import React, { useMemo, useState } from "react";
import type { MacroData } from "../types/data";
import { EChartBox } from "../components/EChartBox";
import { MetricCard } from "../components/MetricCard";
import { fmtCompactUsd, fmtNum, fmtPct } from "../utils/format";

interface MacroFiscalViewProps {
  macro: MacroData;
  dark: boolean;
}

type Horizon = "1Y" | "3Y" | "5Y" | "MAX";

const HORIZON_DAYS: Record<Horizon, number> = {
  "1Y": 365,
  "3Y": 365 * 3,
  "5Y": 365 * 5,
  MAX: 365 * 20,
};

function sliceByHorizon(points: [string, number][], h: Horizon): [string, number][] {
  if (!points.length || h === "MAX") return points;
  const lastDate = new Date(points[points.length - 1][0]).getTime();
  const cutoff = lastDate - HORIZON_DAYS[h] * 86400 * 1000;
  return points.filter(([d]) => new Date(d).getTime() >= cutoff);
}

export const MacroFiscalView: React.FC<MacroFiscalViewProps> = ({ macro, dark }) => {
  const [selectedId, setSelectedId] = useState<string>("DGS10");
  const [horizon, setHorizon] = useState<Horizon>("5Y");

  const f = macro.fred;
  const t = macro.treasury;

  const axisColor = dark ? "#94a3b8" : "#475569";
  const splitColor = dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)";

  const kpis = [
    {
      id: "A191RL1Q225SBEA",
      title: "실질 GDP 성장률 (SAAR)",
      sub: "FRED · A191RL1Q225SBEA",
      val: f.A191RL1Q225SBEA ? `${f.A191RL1Q225SBEA.latest.toFixed(1)}%` : "—",
      delta: f.A191RL1Q225SBEA?.delta !== null && f.A191RL1Q225SBEA?.delta !== undefined ? `${f.A191RL1Q225SBEA.delta >= 0 ? "+" : ""}${f.A191RL1Q225SBEA.delta.toFixed(1)}%p` : null,
      pos: (f.A191RL1Q225SBEA?.latest ?? 0) >= 0,
      meta: `기준일: ${f.A191RL1Q225SBEA?.latest_date ?? "—"}`,
      accent: "sky" as const,
    },
    {
      id: "CPIAUCSL",
      title: "소비자물가 (CPI YoY)",
      sub: "FRED · CPIAUCSL",
      val: f.CPIAUCSL?.yoy_pct !== null && f.CPIAUCSL?.yoy_pct !== undefined ? fmtPct(f.CPIAUCSL.yoy_pct, 2) : "—",
      delta: f.PCEPILFE?.yoy_pct !== null && f.PCEPILFE?.yoy_pct !== undefined ? `Core PCE ${f.PCEPILFE.yoy_pct.toFixed(2)}%` : null,
      pos: (f.CPIAUCSL?.yoy_pct ?? 3) <= 2.5,
      meta: `기준일: ${f.CPIAUCSL?.latest_date ?? "—"}`,
      accent: "amber" as const,
    },
    {
      id: "UNRATE",
      title: "미국 실업률 (U-3)",
      sub: "FRED · UNRATE",
      val: f.UNRATE ? `${f.UNRATE.latest.toFixed(1)}%` : "—",
      delta: f.UNRATE?.yoy_delta !== null && f.UNRATE?.yoy_delta !== undefined ? `YoY ${f.UNRATE.yoy_delta >= 0 ? "+" : ""}${f.UNRATE.yoy_delta.toFixed(1)}%p` : null,
      pos: (f.UNRATE?.yoy_delta ?? 0) <= 0,
      meta: `신규실업수당: ${f.ICSA ? fmtNum(f.ICSA.latest) : "—"}명`,
      accent: "emerald" as const,
    },
    {
      id: "DFF",
      title: "실효 기준금리 (Fed Funds)",
      sub: "FRED · DFF",
      val: f.DFF ? `${f.DFF.latest.toFixed(2)}%` : "—",
      delta: f.DFF?.yoy_delta !== null && f.DFF?.yoy_delta !== undefined ? `YoY ${f.DFF.yoy_delta >= 0 ? "+" : ""}${f.DFF.yoy_delta.toFixed(2)}%p` : null,
      pos: null,
      meta: `기준일: ${f.DFF?.latest_date ?? "—"}`,
      accent: "violet" as const,
    },
    {
      id: "DGS10",
      title: "미국채 10년물 금리",
      sub: "FRED · DGS10",
      val: f.DGS10 ? `${f.DGS10.latest.toFixed(2)}%` : "—",
      delta: f.T10Y2Y ? `10Y-2Y ${f.T10Y2Y.latest >= 0 ? "+" : ""}${f.T10Y2Y.latest.toFixed(2)}%p` : null,
      pos: (f.T10Y2Y?.latest ?? 0) >= 0,
      meta: `2년물: ${f.DGS2 ? f.DGS2.latest.toFixed(2) + "%" : "—"} · ${f.DGS10?.latest_date ?? ""}`,
      accent: "sky" as const,
    },
    {
      id: "MORTGAGE30US",
      title: "30년 고정 모기지 금리",
      sub: "FRED · MORTGAGE30US",
      val: f.MORTGAGE30US ? `${f.MORTGAGE30US.latest.toFixed(2)}%` : "—",
      delta: f.MORTGAGE30US?.yoy_delta !== null && f.MORTGAGE30US?.yoy_delta !== undefined ? `YoY ${f.MORTGAGE30US.yoy_delta >= 0 ? "+" : ""}${f.MORTGAGE30US.yoy_delta.toFixed(2)}%p` : null,
      pos: (f.MORTGAGE30US?.yoy_delta ?? 0) <= 0,
      meta: `주택착공: ${f.HOUST ? fmtNum(f.HOUST.latest) + "K" : "—"}`,
      accent: "rose" as const,
    },
    {
      id: "BAMLH0A0HYM2",
      title: "하이일드 신용스프레드",
      sub: "FRED · BAMLH0A0HYM2",
      val: f.BAMLH0A0HYM2 ? `${f.BAMLH0A0HYM2.latest.toFixed(2)}%p` : "—",
      delta: f.STLFSI4 ? `FSI ${f.STLFSI4.latest.toFixed(2)}` : null,
      pos: (f.BAMLH0A0HYM2?.latest ?? 4) < 4.5,
      meta: `WTI: ${f.DCOILWTICO ? "$" + f.DCOILWTICO.latest.toFixed(1) : "—"} · USD: ${f.DTWEXBGS ? f.DTWEXBGS.latest.toFixed(1) : "—"}`,
      accent: "amber" as const,
    },
    {
      id: "DEBT",
      title: "미국 연방 총부채",
      sub: "US Treasury Fiscal Data",
      val: t.latest_debt_trillions ? fmtCompactUsd(t.latest_debt_trillions, "T") : "—",
      delta: t.latest_tga_billions ? `TGA $${t.latest_tga_billions.toFixed(0)}B` : null,
      pos: null,
      meta: `기준일: ${t.latest_debt_date ?? "—"}`,
      accent: "rose" as const,
    },
  ];

  const activeSeries = f[selectedId] || f.DGS10 || Object.values(f)[0];

  const mainSeriesOption = useMemo(() => {
    if (!activeSeries) return {};
    const pts = sliceByHorizon(activeSeries.points, horizon);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: dark ? "#0f172a" : "#ffffff",
        borderColor: dark ? "#334155" : "#cbd5e1",
        textStyle: { color: dark ? "#f8fafc" : "#0f172a", fontSize: 12 },
      },
      grid: { left: 56, right: 20, top: 24, bottom: 32 },
      xAxis: {
        type: "category",
        data: pts.map((p) => p[0]),
        axisLabel: { color: axisColor, fontSize: 11 },
        axisLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        {
          name: `${activeSeries.kr} (${activeSeries.unit})`,
          type: "line",
          showSymbol: false,
          smooth: 0.15,
          lineStyle: { width: 2.2, color: "#38bdf8" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(56, 189, 248, 0.28)" },
                { offset: 1, color: "rgba(56, 189, 248, 0.01)" },
              ],
            },
          },
          data: pts.map((p) => p[1]),
        },
      ],
    };
  }, [activeSeries, horizon, dark, axisColor, splitColor]);

  const yieldCurveOption = useMemo(() => {
    const tenors = [
      { label: "Fed Funds", s: f.DFF },
      { label: "3M", s: f.DGS3MO },
      { label: "2Y", s: f.DGS2 },
      { label: "10Y", s: f.DGS10 },
      { label: "30Y", s: f.DGS30 },
    ];
    const nowVals = tenors.map((x) => x.s?.latest ?? null);
    const agoVals = tenors.map((x) => {
      const pts = x.s?.points || [];
      if (pts.length < 2) return null;
      const idx = Math.max(0, pts.length - Math.min(pts.length, 250));
      return pts[idx]?.[1] ?? null;
    });
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: dark ? "#0f172a" : "#ffffff",
        borderColor: dark ? "#334155" : "#cbd5e1",
        textStyle: { color: dark ? "#f8fafc" : "#0f172a", fontSize: 12 },
      },
      legend: { top: 4, right: 8, textStyle: { color: axisColor, fontSize: 11 } },
      grid: { left: 42, right: 16, top: 32, bottom: 28 },
      xAxis: { type: "category", data: tenors.map((x) => x.label), axisLabel: { color: axisColor, fontSize: 11 } },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: axisColor, fontSize: 11, formatter: "{value}%" },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        { name: "현재 (Latest)", type: "line", smooth: true, symbolSize: 7, lineStyle: { width: 2.5, color: "#38bdf8" }, itemStyle: { color: "#38bdf8" }, data: nowVals },
        { name: "약 1년 전", type: "line", smooth: true, symbolSize: 5, lineStyle: { width: 1.8, type: "dashed", color: "#94a3b8" }, itemStyle: { color: "#94a3b8" }, data: agoVals },
      ],
    };
  }, [f, dark, axisColor, splitColor]);

  const mtsOption = useMemo(() => {
    const rows = t.mts_monthly || [];
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: dark ? "#0f172a" : "#ffffff",
        borderColor: dark ? "#334155" : "#cbd5e1",
        textStyle: { color: dark ? "#f8fafc" : "#0f172a", fontSize: 12 },
      },
      legend: { top: 4, right: 8, textStyle: { color: axisColor, fontSize: 11 } },
      grid: { left: 50, right: 16, top: 32, bottom: 32 },
      xAxis: { type: "category", data: rows.map((r) => r.date.slice(0, 7)), axisLabel: { color: axisColor, fontSize: 10 } },
      yAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 11, formatter: "${value}B" },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        { name: "세입 (Receipts)", type: "bar", itemStyle: { color: "#10b981", borderRadius: [3, 3, 0, 0] }, data: rows.map((r) => r.receipts_b) },
        { name: "세출 (Outlays)", type: "bar", itemStyle: { color: "#f43f5e", borderRadius: [3, 3, 0, 0] }, data: rows.map((r) => r.outlays_b) },
      ],
    };
  }, [t.mts_monthly, dark, axisColor, splitColor]);

  const debtOption = useMemo(() => {
    const pts = t.debt_series || [];
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: dark ? "#0f172a" : "#ffffff",
        borderColor: dark ? "#334155" : "#cbd5e1",
        textStyle: { color: dark ? "#f8fafc" : "#0f172a", fontSize: 12 },
      },
      grid: { left: 54, right: 16, top: 20, bottom: 28 },
      xAxis: { type: "category", data: pts.map((p) => p[0]), axisLabel: { color: axisColor, fontSize: 10 } },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: axisColor, fontSize: 11, formatter: "${value}T" },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        {
          name: "연방 총부채 ($T)",
          type: "line",
          showSymbol: false,
          lineStyle: { width: 2.2, color: "#f43f5e" },
          areaStyle: { color: "rgba(244,63,94,0.14)" },
          data: pts.map((p) => p[1]),
        },
      ],
    };
  }, [t.debt_series, dark, axisColor, splitColor]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpis.map((k) => (
          <MetricCard
            key={k.id}
            title={k.title}
            subtitle={k.sub}
            value={k.val}
            delta={k.delta}
            deltaPositive={k.pos}
            meta={k.meta}
            accent={k.accent}
            onClick={k.id !== "DEBT" ? () => setSelectedId(k.id) : undefined}
          />
        ))}
      </div>

      {/* Main Interactive FRED Explorer */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {activeSeries?.kr} <span className="font-mono text-xs text-sky-400 ml-1">{activeSeries?.id}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeSeries?.label} · 단위: {activeSeries?.unit} · 최신: {activeSeries?.latest_date}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100"
              >
                {Object.values(f).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.kr} ({s.id})
                  </option>
                ))}
              </select>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
                {(["1Y", "3Y", "5Y", "MAX"] as Horizon[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    className={`px-2 py-1 text-[11px] font-mono rounded-md transition ${
                      horizon === h
                        ? "bg-sky-500 text-white font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <EChartBox option={mainSeriesOption} height={310} dark={dark} />
        </div>

        {/* Yield Curve */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">미국 국채 수익률 곡선 (Yield Curve)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Fed Funds ~ 30Y 만기별 금리 구조 비교</p>
          </div>
          <EChartBox option={yieldCurveOption} height={310} dark={dark} />
        </div>
      </div>

      {/* Treasury Fiscal Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">연방 월간 재정 세입 vs 세출 (MTS)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">US Treasury Fiscal Data · 단위: 십억 달러 ($B)</p>
            </div>
          </div>
          <EChartBox option={mtsOption} height={260} dark={dark} />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">연방 총부채 일간 추이 (Debt to the Penny)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">최근 90영업일 · 최신 {t.latest_debt_date ?? "—"}</p>
            </div>
            {t.avg_interest_rates?.[0] && (
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-rose-500/10 text-rose-400">
                국채 평균금리 {t.avg_interest_rates.find((r) => r.security?.includes("Total"))?.rate_pct?.toFixed(2) ?? t.avg_interest_rates[0].rate_pct.toFixed(2)}%
              </span>
            )}
          </div>
          <EChartBox option={debtOption} height={260} dark={dark} />
        </div>
      </div>
    </div>
  );
};
