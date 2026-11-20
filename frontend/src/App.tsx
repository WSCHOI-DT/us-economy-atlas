import React, { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  Compass,
  Factory,
  GitCompare,
  Home,
  Landmark,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useEconomicData } from "./hooks/useEconomicData";
import type { SearchItem, ViewId } from "./types/data";
import { CommandPalette } from "./components/CommandPalette";
import { MacroFiscalView } from "./views/MacroFiscalView";
import { GeoExplorerView } from "./views/GeoExplorerView";
import { ComparatorView } from "./views/ComparatorView";
import { HousingMigrationView } from "./views/HousingMigrationView";
import { RealEconomyView } from "./views/RealEconomyView";
import { CreditRiskView } from "./views/CreditRiskView";
import { PolicyPipelineView } from "./views/PolicyPipelineView";

const NAV_ITEMS: { id: ViewId; label: string; short: string; icon: React.ComponentType<any> }[] = [
  { id: "macro", label: "거시 · 재정 펄스", short: "거시·재정", icon: Activity },
  { id: "geo", label: "미국 지도 · 카운티 드릴다운", short: "지도·카운티", icon: Compass },
  { id: "compare", label: "주(State) 다중 비교", short: "지역비교", icon: GitCompare },
  { id: "housing", label: "부동산 · 부(AGI) 이동", short: "부동산·이동", icon: Home },
  { id: "sectors", label: "농업 · 무역 · 에너지 · 연방자금", short: "실물·무역", icon: Factory },
  { id: "credit", label: "은행 · SBA · 민원 · 재해", short: "금융·리스크", icon: Landmark },
  { id: "policy", label: "정책 · 상장사 · 갱신관제", short: "정책·기업", icon: Building2 },
];

export default function App() {
  const store = useEconomicData();
  const [view, setView] = useState<ViewId>("macro");
  const [dark, setDark] = useState<boolean>(true);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [selectedStateFips, setSelectedStateFips] = useState<string | null>(null);
  const [selectedCountyFips, setSelectedCountyFips] = useState<string | null>(null);
  const [highlightTicker, setHighlightTicker] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSearchSelect = (item: SearchItem) => {
    if (item.type === "state") {
      setSelectedStateFips(item.id);
      setSelectedCountyFips(null);
      setView("geo");
    } else if (item.type === "county" && item.state_fips) {
      setSelectedStateFips(item.state_fips);
      setSelectedCountyFips(item.id);
      setView("geo");
    } else if (item.type === "company") {
      setHighlightTicker(item.id);
      setView("policy");
    }
  };

  const handleJumpCounty = (stateFips: string, countyFips: string) => {
    setSelectedStateFips(stateFips);
    setSelectedCountyFips(countyFips);
    setView("geo");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Executive Command Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/90 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow">
              US
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight truncate">US Economy Atlas</div>
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                National · 51 States · {store.manifest?.counties_count?.toLocaleString() ?? "3,143"} Counties · Auto-Refreshed
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:border-sky-500/50 transition"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">주 · 카운티 · 기업 검색...</span>
              <kbd className="hidden md:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                Ctrl K
              </kbd>
            </button>

            {store.manifest && (
              <button
                onClick={() => setView("policy")}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                title="데이터 파이프라인 갱신 상태 보기"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {store.manifest.ok_sources}/{store.manifest.total_sources - store.manifest.deferred_sources} Live · {store.manifest.generated_at.slice(0, 10)}
              </button>
            )}

            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Navigation Strip */}
        <div className="max-w-[1600px] mx-auto px-4 flex items-center gap-1 overflow-x-auto pb-2 pt-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{item.label}</span>
                <span className="md:hidden">{item.short}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-5">
        {store.loading ? (
          <div className="py-32 text-center space-y-2">
            <div className="inline-block w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-slate-400">미국 경제 통합 데이터 레이크 로딩 중...</div>
          </div>
        ) : store.error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-400">
            데이터를 불러오지 못했습니다: {store.error}
          </div>
        ) : (
          <>
            {view === "macro" && store.macro && <MacroFiscalView macro={store.macro} dark={dark} />}
            {view === "geo" && (
              <GeoExplorerView
                states={store.states}
                selectedStateFips={selectedStateFips}
                selectedCountyFips={selectedCountyFips}
                onSelectState={setSelectedStateFips}
                onSelectCounty={setSelectedCountyFips}
                loadStateShard={store.loadStateShard}
                shardCache={store.shardCache}
                dark={dark}
              />
            )}
            {view === "compare" && <ComparatorView states={store.states} dark={dark} />}
            {view === "housing" && store.housingMigration && (
              <HousingMigrationView
                data={store.housingMigration}
                states={store.states}
                dark={dark}
                onJumpCounty={handleJumpCounty}
              />
            )}
            {view === "sectors" && store.sectors && (
              <RealEconomyView sectors={store.sectors} states={store.states} dark={dark} />
            )}
            {view === "credit" && store.creditRisk && (
              <CreditRiskView data={store.creditRisk} states={store.states} dark={dark} />
            )}
            {view === "policy" && store.policyCorporate && store.manifest && (
              <PolicyPipelineView
                policy={store.policyCorporate}
                manifest={store.manifest}
                highlightTicker={highlightTicker}
              />
            )}
          </>
        )}
      </main>

      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        items={store.searchIndex}
        onSelect={handleSearchSelect}
      />
    </div>
  );
}
