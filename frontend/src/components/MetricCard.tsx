import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  subtitle?: string;
  value: string;
  delta?: string | null;
  deltaPositive?: boolean | null;
  meta?: string;
  accent?: "sky" | "emerald" | "amber" | "rose" | "violet";
  onClick?: () => void;
}

const ACCENT_RING: Record<string, string> = {
  sky: "border-t-sky-500/70",
  emerald: "border-t-emerald-500/70",
  amber: "border-t-amber-500/70",
  rose: "border-t-rose-500/70",
  violet: "border-t-violet-500/70",
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  subtitle,
  value,
  delta,
  deltaPositive,
  meta,
  accent = "sky",
  onClick,
}) => {
  const deltaClass =
    deltaPositive === true
      ? "text-emerald-400 bg-emerald-500/10"
      : deltaPositive === false
      ? "text-rose-400 bg-rose-500/10"
      : "text-slate-400 bg-slate-500/10";

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-slate-200 dark:border-slate-800/90 border-t-2 ${ACCENT_RING[accent]} bg-white dark:bg-slate-900/75 p-4 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-700 ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{title}</div>
          {subtitle && (
            <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">{subtitle}</div>
          )}
        </div>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-mono font-medium shrink-0 ${deltaClass}`}>
            {deltaPositive === true ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : deltaPositive === false ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {delta}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">
        {value}
      </div>
      {meta && (
        <div className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">{meta}</div>
      )}
    </div>
  );
};
