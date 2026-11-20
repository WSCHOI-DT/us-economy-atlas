import React, { useMemo } from "react";
import type { HousingMigrationData, StateRecord } from "../types/data";
import { EChartBox } from "../components/EChartBox";
import { fmtCompactNum, fmtCompactUsd, fmtPct, fmtUsd } from "../utils/format";

interface HousingMigrationViewProps {
  data: HousingMigrationData;
  states: StateRecord[];
  dark: boolean;
  onJumpCounty: (stateFips: string, countyFips: string) => void;
}

export const HousingMigrationView: React.FC<HousingMigrationViewProps> = ({
  data,
  states,
  dark,
  onJumpCounty,
}) => {
  const axisColor = dark ? "#94a3b8" : "#475569";
  const splitColor = dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)";

  const quadrantOption = useMemo(() => {
    const pts = data.quadrant_counties.map((c) => ({
      value: [c.median_dom, c.zhvi_yoy_pct, Math.sqrt((c.population || 150000) / 10000) * 3.5],
      name: c.name,
      fips: c.fips,
      stateFips: c.state_fips,
      zhvi: c.zhvi,
      pr: c.price_reduced_share_pct,
      agi: c.net_agi_m,
      itemStyle: {
        color: c.zhvi_yoy_pct >= 0 ? "rgba(16, 185, 129, 0.72)" : "rgba(244, 63, 94, 0.72)",
      },
    }));
    return {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: dark ? "#0f172a" : "#ffffff",
        borderColor: dark ? "#334155" : "#cbd5e1",
        textStyle: { color: dark ? "#f8fafc" : "#0f172a", fontSize: 12 },
        formatter: (p: any) => {
          const d = p.data;
          return `<b>${d.name}</b><br/>매물 체류기간(DOM): <b>${d.value[0]}일</b><br/>ZHVI YoY: <b>${d.value[1]}%</b><br/>ZHVI: ${fmtUsd(d.zhvi)} · 가격인하율: ${fmtPct(d.pr, 1)}<br/>IRS 순 AGI: ${fmtCompactUsd(d.agi, "M")}`;
        },
      },
      grid: { left: 54, right: 20, top: 24, bottom: 42 },
      xAxis: {
        name: "매물 체류기간 DOM (일, 짧을수록 매수세 강함)",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: axisColor, fontSize: 11 },
        type: "value",
        scale: true,
        axisLabel: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        name: "주택가격 YoY (%)",
        nameTextStyle: { color: axisColor, fontSize: 11 },
        type: "value",
        scale: true,
        axisLabel: { color: axisColor, fontSize: 11, formatter: "{value}%" },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        {
          type: "scatter",
          symbolSize: (val: number[]) => Math.max(8, Math.min(32, val[2])),
          data: pts,
        },
      ],
    };
  }, [data.quadrant_counties, dark, axisColor, splitColor]);

  const stateMigOption = useMemo(() => {
    const sorted = [...states]
      .filter((s) => s.net_migration_agi_m !== null)
      .sort((a, b) => (b.net_migration_agi_m ?? 0) - (a.net_migration_agi_m ?? 0));
    const topBottom = [...sorted.slice(0, 10), ...sorted.slice(-10)];
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 48, right: 20, top: 18, bottom: 28 },
      xAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `$${(v / 1000).toFixed(0)}B` },
        splitLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        type: "category",
        data: topBottom.map((s) => s.abbr).reverse(),
        axisLabel: { color: axisColor, fontSize: 11 },
      },
      series: [
        {
          name: "순 AGI 이동 ($M)",
          type: "bar",
          data: topBottom
            .map((s) => ({
              value: s.net_migration_agi_m,
              itemStyle: { color: (s.net_migration_agi_m ?? 0) >= 0 ? "#10b981" : "#f43f5e", borderRadius: 3 },
            }))
            .reverse(),
        },
      ],
    };
  }, [states, axisColor, splitColor]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">미국 상위 200개 카운티 주택시장 사분면 (Zillow × Realtor.com)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            버블 크기 = 인구 · 좌상단(빠른 거래 + 가격 상승) vs 우하단(매물 적체 + 가격 조정) · 버블 클릭 시 카운티 드릴다운
          </p>
          <EChartBox
            option={quadrantOption}
            height={390}
            dark={dark}
            onChartClick={(p) => {
              if (p?.data?.stateFips && p?.data?.fips) {
                onJumpCounty(p.data.stateFips, p.data.fips);
              }
            }}
          />
        </div>

        <div className="xl:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">주별 부(AGI) 순유입 vs 순유출 Top 10 (IRS SOI)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">세금신고 기반 주 간 조정총소득(AGI) 순이동 규모 ($M)</p>
          <EChartBox option={stateMigOption} height={390} dark={dark} />
        </div>
      </div>

      {/* Top Inflow vs Outflow Counties Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold text-emerald-400 mb-2">▲ 부(AGI) 순유입 전국 상위 15개 카운티 (IRS SOI)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 text-left">카운티</th>
                  <th className="py-2 text-right">순 AGI 유입</th>
                  <th className="py-2 text-right">순 인구유입</th>
                  <th className="py-2 text-right">ZHVI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {data.top_agi_inflow_counties.slice(0, 15).map((c) => (
                  <tr
                    key={c.fips}
                    onClick={() => onJumpCounty(c.state_fips, c.fips)}
                    className="cursor-pointer hover:bg-emerald-500/10"
                  >
                    <td className="py-2 font-medium">{c.name} <span className="font-mono text-[10px] text-slate-400">{c.fips}</span></td>
                    <td className="py-2 text-right font-mono font-semibold text-emerald-400">+{fmtCompactUsd(c.net_agi_m, "M")}</td>
                    <td className="py-2 text-right font-mono">+{fmtCompactNum(c.net_people)}</td>
                    <td className="py-2 text-right font-mono">{fmtUsd(c.zhvi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold text-rose-400 mb-2">▼ 부(AGI) 순유출 전국 상위 15개 카운티 (IRS SOI)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 text-left">카운티</th>
                  <th className="py-2 text-right">순 AGI 유출</th>
                  <th className="py-2 text-right">순 인구유출</th>
                  <th className="py-2 text-right">ZHVI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {data.top_agi_outflow_counties.slice(0, 15).map((c) => (
                  <tr
                    key={c.fips}
                    onClick={() => onJumpCounty(c.state_fips, c.fips)}
                    className="cursor-pointer hover:bg-rose-500/10"
                  >
                    <td className="py-2 font-medium">{c.name} <span className="font-mono text-[10px] text-slate-400">{c.fips}</span></td>
                    <td className="py-2 text-right font-mono font-semibold text-rose-400">{fmtCompactUsd(c.net_agi_m, "M")}</td>
                    <td className="py-2 text-right font-mono">{fmtCompactNum(c.net_people)}</td>
                    <td className="py-2 text-right font-mono">{fmtUsd(c.zhvi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
