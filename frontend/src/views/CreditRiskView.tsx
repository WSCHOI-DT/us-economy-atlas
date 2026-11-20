import React, { useMemo } from "react";
import type { CreditRiskData, StateRecord } from "../types/data";
import { EChartBox } from "../components/EChartBox";
import { MetricCard } from "../components/MetricCard";
import { fmtCompactNum, fmtCompactUsd, fmtNum } from "../utils/format";

interface CreditRiskViewProps {
  data: CreditRiskData;
  states: StateRecord[];
  dark: boolean;
}

export const CreditRiskView: React.FC<CreditRiskViewProps> = ({ data, states, dark }) => {
  const axisColor = dark ? "#94a3b8" : "#475569";
  const splitColor = dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.08)";

  const totalBanks = states.reduce((acc, s) => acc + (s.fdic_banks || 0), 0);
  const totalDeposits = states.reduce((acc, s) => acc + (s.fdic_deposits_b || 0), 0);
  const totalSbaM = states.reduce((acc, s) => acc + (s.sba_amount_m || 0), 0);
  const totalFema = states.reduce((acc, s) => acc + (s.fema_disasters_3yr || 0), 0);

  const sbaNaicsOption = useMemo(() => {
    const items = data.sba.top_naics.slice(0, 10);
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 175, right: 20, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `$${(v / 1000).toFixed(1)}B` },
        splitLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        type: "category",
        data: items.map((i) => `${i.naics2} · ${(i.desc || "Sector").slice(0, 22)}`).reverse(),
        axisLabel: { color: axisColor, fontSize: 10 },
      },
      series: [
        {
          name: "SBA 대출 승인액 ($M)",
          type: "bar",
          itemStyle: { color: "#10b981", borderRadius: [0, 4, 4, 0] },
          data: items.map((i) => i.amount_m).reverse(),
        },
      ],
    };
  }, [data.sba.top_naics, axisColor, splitColor]);

  const cfpbProdOption = useMemo(() => {
    const items = data.cfpb.top_products.slice(0, 8);
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 185, right: 20, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `${(v / 1000).toFixed(0)}K` },
        splitLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        type: "category",
        data: items.map((i) => i.key.slice(0, 28)).reverse(),
        axisLabel: { color: axisColor, fontSize: 10 },
      },
      series: [
        {
          name: "12개월 민원 건수",
          type: "bar",
          itemStyle: { color: "#f43f5e", borderRadius: [0, 4, 4, 0] },
          data: items.map((i) => i.count).reverse(),
        },
      ],
    };
  }, [data.cfpb.top_products, axisColor, splitColor]);

  const femaTypeOption = useMemo(() => {
    const items = data.fema.by_incident_type.slice(0, 8);
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          label: { color: axisColor, fontSize: 11 },
          data: items.map((i) => ({ name: i.type, value: i.count })),
        },
      ],
    };
  }, [data.fema.by_incident_type, axisColor]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          title="FDIC 활성 은행 / 총예금"
          subtitle={`기준일: ${data.fdic.vintage ?? "—"}`}
          value={`${fmtNum(totalBanks)}개`}
          delta={fmtCompactUsd(totalDeposits, "B")}
          meta="FDIC BankFind Call Reports"
          accent="sky"
        />
        <MetricCard
          title="SBA 7(a)·504 대출 (FY24+)"
          subtitle={data.sba.vintage ?? "—"}
          value={fmtCompactUsd(totalSbaM, "M")}
          delta={`${fmtCompactNum(data.sba.total_loans)}건`}
          meta="미국 소상공인 자금공급 지표"
          accent="emerald"
        />
        <MetricCard
          title="CFPB 소비자 금융 민원 (12M)"
          subtitle={data.cfpb.vintage ?? "—"}
          value={fmtCompactNum(data.cfpb.total_12m)}
          meta="가계 신용·추심·모기지 스트레스"
          accent="rose"
        />
        <MetricCard
          title="FEMA 연방 재난 선포 (3Y)"
          subtitle={`최신: ${data.fema.vintage ?? "—"}`}
          value={`${fmtNum(totalFema)}건`}
          meta="주 단위 누적 재난 선포 횟수"
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold mb-1">SBA 7(a)/504 업종(NAICS)별 대출 승인 상위 10개</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">소상공인 자금 수요 집중 업종 ({data.sba.vintage ?? "—"})</p>
          <EChartBox option={sbaNaicsOption} height={290} dark={dark} />
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold mb-1">CFPB 금융 상품별 소비자 민원 상위 8개 (최근 12개월)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">신용보고·부채추심·모기지·카드 등 가계 금융 마찰 현황</p>
          <EChartBox option={cfpbProdOption} height={290} dark={dark} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold mb-1">FEMA 재난 유형별 비중 (최근 3년)</h3>
          <EChartBox option={femaTypeOption} height={250} dark={dark} />
        </div>

        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold mb-2">최근 FEMA 연방 재난 선포 타임라인</h3>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {data.fema.recent_declarations.slice(0, 15).map((d) => (
              <div key={d.disaster_number} className="py-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 mr-1.5">{d.state_abbr}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{d.title}</span>
                  <div className="text-[11px] text-slate-400 mt-0.5">{d.incident_type} · #{d.disaster_number}</div>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{d.date}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold mb-2">FDIC 최근 파산 은행 모니터링</h3>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {data.fdic.recent_failures.slice(0, 12).map((f, idx) => (
              <div key={`${f.name}-${idx}`} className="py-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 dark:text-slate-100 truncate">{f.name}</div>
                  <div className="text-[11px] text-slate-400">{f.location} · 자산 {fmtCompactUsd(f.assets_m, "M")}</div>
                </div>
                <span className="font-mono text-[11px] text-rose-400 shrink-0">{f.fail_date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
