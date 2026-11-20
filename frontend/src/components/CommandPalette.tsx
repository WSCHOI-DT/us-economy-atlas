import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, MapPin, Search, X } from "lucide-react";
import type { SearchItem } from "../types/data";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: SearchItem[];
  onSelect: (item: SearchItem) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, items, onSelect }) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter((i) => i.type === "state" || i.type === "company").slice(0, 14);
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)).slice(0, 24);
  }, [items, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 backdrop-blur-sm pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="주(Texas), 카운티(Harris, 48201), 기업(DE, CAT) 검색..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none"
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {matches.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">일치하는 지역 또는 기업이 없습니다.</div>
          ) : (
            matches.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-sky-500/10 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.type === "company" ? (
                    <Building2 className="w-4 h-4 text-violet-400 shrink-0" />
                  ) : (
                    <MapPin className={`w-4 h-4 shrink-0 ${item.type === "state" ? "text-sky-400" : "text-emerald-400"}`} />
                  )}
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.label}</span>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                  {item.type === "state" ? `STATE ${item.id}` : item.type === "county" ? `FIPS ${item.id}` : "SEC"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
