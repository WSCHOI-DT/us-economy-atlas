import React, { useMemo, useState } from "react";
import type { SectorsData, StateRecord } from "../types/data";
import { EChartBox } from "../components/EChartBox";
import { fmtCompactUsd } from "../utils/format";

interface RealEconomyViewProps {
  sectors: SectorsData;
  states: StateRecord[];
  dark: boolean;
}

export const RealEconomyView: React.FC<RealEconomyViewProps> = ({ sectors, states, dark }) => {
  const [selectedHs, setSelectedHs] = useState<string>(sectors.trade.commodities[0]?.hs || "8701");
  const [selectedCrop, setSelectedCrop] = useState<string>("CORN");

  const axisColor = dark ? "#94a3b8" : "#475569";
  const splitColor = dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)";

  const activeHs = sectors.trade.commodities.find((c) => c.hs === selectedHs) || sectors.trade.commodities[0];
  const activeCrop = sectors.agriculture.commodities[selectedCrop];

  const tradeChartOption = useMemo(() => {
    if (!activeHs) return {};
    const exp = activeHs.top_export_states.slice(0, 8);
    const imp = activeHs.top_import_states.slice(0, 8);
    const allSts = Array.from(new Set([...exp.map((x) => x.state_abbr), ...imp.map((x) => x.state_abbr)])).slice(0, 10);
    const expMap = new Map(exp.map((x) => [x.state_abbr, x.ytd_m]));
    const impMap = new Map(imp.map((x) => [x.state_abbr, x.ytd_m]));
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { color: axisColor, fontSize: 11 } },
      grid: { left: 52, right: 16, top: 32, bottom: 28 },
      xAxis: { type: "category", data: allSts, axisLabel: { color: axisColor, fontSize: 11 } },
      yAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 10, formatter: "${value}M" },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        { name: "수출 YTD ($M)", type: "bar", itemStyle: { color: "#38bdf8", borderRadius: [3, 3, 0, 0] }, data: allSts.map((s) => expMap.get(s) ?? 0) },
        { name: "수입 YTD ($M)", type: "bar", itemStyle: { color: "#f59e0b", borderRadius: [3, 3, 0, 0] }, data: allSts.map((s) => impMap.get(s) ?? 0) },
      ],
    };
  }, [activeHs, axisColor, splitColor]);

  const cropOption = useMemo(() => {
    const top = activeCrop?.top_states || [];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 48, right: 18, top: 18, bottom: 26 },
      xAxis: { type: "category", data: top.map((t) => t.state_abbr), axisLabel: { color: axisColor, fontSize: 11 } },
      yAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `$${(v / 1000).toFixed(1)}B` },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        {
          name: `${selectedCrop} 생산액 ($M)`,
          type: "bar",
          itemStyle: { color: "#10b981", borderRadius: [4, 4, 0, 0] },
          data: top.map((t) => t.value_m),
        },
      ],
    };
  }, [activeCrop, selectedCrop, axisColor, splitColor]);

  const energyOption = useMemo(() => {
    const withElec = states
      .filter((s) => s.elec_industrial_cents !== null)
      .sort((a, b) => (b.elec_industrial_cents ?? 0) - (a.elec_industrial_cents ?? 0));
    const sample = [...withElec.slice(0, 8), ...withElec.slice(-8)];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 46, right: 16, top: 18, bottom: 28 },
      xAxis: { type: "category", data: sample.map((s) => s.abbr), axisLabel: { color: axisColor, fontSize: 10 } },
      yAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 10, formatter: "{value}¢" },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        {
          name: "산업용 전기요금 (¢/kWh)",
          type: "bar",
          data: sample.map((s) => ({
            value: s.elec_industrial_cents,
            itemStyle: { color: (s.elec_industrial_cents ?? 0) > 12 ? "#f43f5e" : "#38bdf8", borderRadius: [3, 3, 0, 0] },
          })),
        },
      ],
    };
  }, [states, axisColor, splitColor]);

  const agencyOption = useMemo(() => {
    const ag = sectors.federal_spending.top_agencies.slice(0, 10);
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 190, right: 24, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 10, formatter: "${value}B" },
        splitLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        type: "category",
        data: ag.map((a) => a.name.replace("Department of ", "Dept. of ").slice(0, 28)).reverse(),
        axisLabel: { color: axisColor, fontSize: 10 },
      },
      series: [
        {
          name: "연방 집행액 ($B)",
          type: "bar",
          itemStyle: { color: "#8b5cf6", borderRadius: [0, 4, 4, 0] },
          data: ag.map((a) => a.amount_b).reverse(),
        },
      ],
    };
  }, [sectors.federal_spending.top_agencies, axisColor, splitColor]);

  return (
    <div className="space-y-4">
      {/* Census International Trade */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              미국 주별 HS 품목 수출입 트래커 (Census International Trade)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              기준월: {sectors.trade.vintage ?? "—"} · 누적(YTD) 수출 {fmtCompactUsd(activeHs?.total_exports_ytd_m, "M")} / 수입 {fmtCompactUsd(activeHs?.total_imports_ytd_m, "M")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sectors.trade.commodities.map((c) => (
              <button
                key={c.hs}
                onClick={() => setSelectedHs(c.hs)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedHs === c.hs
                    ? "bg-sky-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                HS {c.hs} · {c.label.split(" (")[0]}
              </button>
            ))}
          </div>
        </div>
        <EChartBox option={tradeChartOption} height={280} dark={dark} />
      </div>

      {/* Agriculture + Energy + USAspending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">미국 주별 주요 작물 생산액 (USDA NASS)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                기준연도: {sectors.agriculture.nass_vintage ?? "—"} · 전국 합계 {fmtCompactUsd(activeCrop?.total_b, "B")}
              </p>
            </div>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs"
            >
              {Object.keys(sectors.agriculture.commodities).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <EChartBox option={cropOption} height={260} dark={dark} />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">주별 산업용 전기요금 고가 vs 저가 (EIA)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              기준월: {sectors.energy.vintage || "수집 대기"} · 상위 8개(고가) vs 하위 8개(저가) 주 비교 (¢/kWh)
            </p>
          </div>
          {states.some((s) => s.elec_industrial_cents !== null) ? (
            <EChartBox option={energyOption} height={260} dark={dark} />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-xs text-slate-400">EIA 데이터 갱신 후 표시됩니다.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
          연방 정부 기관별 계약·보조금 집행 상위 10개 (USAspending.gov)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">최근 12개월 ({sectors.federal_spending.vintage ?? "—"})</p>
        <EChartBox option={agencyOption} height={300} dark={dark} />
      </div>
    </div>
  );
};
