import React, { useState } from "react";
import { CheckCircle2, Clock, ExternalLink, AlertTriangle, PauseCircle } from "lucide-react";
import type { ManifestData, PolicyCorporateData } from "../types/data";
import { fmtCompactUsd, fmtNum, fmtPct } from "../utils/format";

interface PolicyPipelineViewProps {
  policy: PolicyCorporateData;
  manifest: ManifestData;
  highlightTicker?: string | null;
}

export const PolicyPipelineView: React.FC<PolicyPipelineViewProps> = ({
  policy,
  manifest,
  highlightTicker,
}) => {
  const [topicFilter, setTopicFilter] = useState<string>("all");

  const filteredDocs = policy.federal_register.filter(
    (d) => topicFilter === "all" || d.topic === topicFilter
  );

  const badge = (status: string) => {
    if (status === "ok") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[11px] font-medium">
          <CheckCircle2 className="w-3 h-3" /> 정상 (OK)
        </span>
      );
    }
    if (status === "deferred") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 text-slate-400 px-2 py-0.5 text-[11px] font-medium">
          <PauseCircle className="w-3 h-3" /> 보류 (Deferred)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[11px] font-medium">
        <AlertTriangle className="w-3 h-3" /> {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* SEC EDGAR Corporate Bellwethers */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4 overflow-x-auto">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            미국 실물경제 대표 상장사 펀더멘털 & 공시 (SEC EDGAR XBRL)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            농기계·건설장비(DE, CAT, CNH, AGCO)·농촌유통(TSCO)·주택(HD)·은행(JPM)·소비(WMT)·에너지(XOM)·철도물류(UNP)
          </p>
        </div>
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
            <tr>
              <th className="py-2 text-left">기업 (Ticker)</th>
              <th className="py-2 text-left">섹터</th>
              <th className="py-2 text-right">FY</th>
              <th className="py-2 text-right">매출 ($B)</th>
              <th className="py-2 text-right">매출 YoY</th>
              <th className="py-2 text-right">영업이익률</th>
              <th className="py-2 text-right">순이익 ($B)</th>
              <th className="py-2 text-right">재고 ($B)</th>
              <th className="py-2 text-left pl-3">최근 공시 (10-K/10-Q/8-K)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {policy.sec_companies.map((c) => (
              <tr
                key={c.ticker}
                className={`hover:bg-sky-500/5 ${highlightTicker === c.ticker ? "bg-sky-500/15" : ""}`}
              >
                <td className="py-2.5 font-semibold text-slate-900 dark:text-white">
                  <span className="font-mono text-sky-400 mr-1.5">{c.ticker}</span>
                  {c.name}
                </td>
                <td className="py-2.5 text-slate-500 dark:text-slate-400">{c.sector}</td>
                <td className="py-2.5 text-right font-mono">{c.latest_fy ?? "—"}</td>
                <td className="py-2.5 text-right font-mono font-semibold">{fmtCompactUsd(c.revenue_b ?? null, "B")}</td>
                <td className={`py-2.5 text-right font-mono ${(c.revenue_yoy_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {fmtPct(c.revenue_yoy_pct ?? null, 1, true)}
                </td>
                <td className="py-2.5 text-right font-mono">{fmtPct(c.op_margin_pct ?? null, 1)}</td>
                <td className="py-2.5 text-right font-mono">{fmtCompactUsd(c.net_income_b ?? null, "B")}</td>
                <td className="py-2.5 text-right font-mono">{fmtCompactUsd(c.inventory_b ?? null, "B")}</td>
                <td className="py-2.5 pl-3">
                  <div className="flex flex-wrap gap-1">
                    {c.recent_filings.slice(0, 3).map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-sky-400 hover:underline"
                      >
                        {f.form} ({f.date.slice(2)}) <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Federal Register & Congress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">연방 관보 · 관세 · 규제 피드 (Federal Register)</h3>
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs"
            >
              <option value="all">전체 분야</option>
              <option value="tariff_trade">관세 · 무역</option>
              <option value="agriculture_energy">농업 · 에너지</option>
              <option value="banking_housing">금융 · 주택</option>
            </select>
          </div>
          <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {filteredDocs.map((d) => (
              <div key={d.document_number} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">{d.type}</span>
                  <span className="font-mono text-[11px] text-slate-400">{d.publication_date}</span>
                </div>
                <a
                  href={d.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block mt-1 font-medium text-slate-800 dark:text-slate-100 hover:text-sky-400"
                >
                  {d.title}
                </a>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">{d.agencies.join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">미국 의회 주요 경제·관세·농업 법안 (Congress.gov)</h3>
          <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
            {policy.congress_bills.length === 0 ? (
              <div className="py-10 text-center text-slate-400">의회 법안 데이터 갱신 대기 중</div>
            ) : (
              policy.congress_bills.map((b, i) => (
                <div key={`${b.type}-${b.number}-${i}`} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
                      {b.congress}th · {b.type} {b.number} ({b.origin_chamber})
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{b.latest_action_date || b.update_date}</span>
                  </div>
                  <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">{b.title}</div>
                  {b.latest_action && <div className="text-[11px] text-slate-400 mt-0.5">{b.latest_action}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Data Pipeline & Auto-Refresh Cadence Console */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/75 p-4 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" /> 23개 데이터 소스 자동 갱신 파이프라인 관제판
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              최종 빌드: {manifest.generated_at} · 정상 {manifest.ok_sources} / 보류 {manifest.deferred_sources} / 지연 {manifest.stale_sources} · 커버리지: {manifest.states_count}개 주, {fmtNum(manifest.counties_count)}개 카운티
            </p>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
            <tr>
              <th className="py-2 text-left">데이터 소스</th>
              <th className="py-2 text-left">기관</th>
              <th className="py-2 text-left">자동 갱신 주기</th>
              <th className="py-2 text-left">지역 단위</th>
              <th className="py-2 text-left">데이터 기준 (Vintage)</th>
              <th className="py-2 text-right">레코드 수</th>
              <th className="py-2 text-left pl-3">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {manifest.sources.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="py-2 font-medium text-slate-900 dark:text-white">{s.name}</td>
                <td className="py-2 text-slate-500 dark:text-slate-400">{s.agency}</td>
                <td className="py-2 font-mono text-[11px]">{s.cadence}</td>
                <td className="py-2 text-slate-500 dark:text-slate-400">{s.geo}</td>
                <td className="py-2 font-mono text-[11px]">{s.vintage || "—"}</td>
                <td className="py-2 text-right font-mono">{fmtNum(s.record_count)}</td>
                <td className="py-2 pl-3">{badge(s.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
