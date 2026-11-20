import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreditRiskData,
  HousingMigrationData,
  MacroData,
  ManifestData,
  PolicyCorporateData,
  SearchItem,
  SectorsData,
  StateCountyShard,
  StateRecord,
} from "../types/data";

const BASE = "./data";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface EconomicStore {
  loading: boolean;
  error: string | null;
  manifest: ManifestData | null;
  macro: MacroData | null;
  states: StateRecord[];
  housingMigration: HousingMigrationData | null;
  sectors: SectorsData | null;
  creditRisk: CreditRiskData | null;
  policyCorporate: PolicyCorporateData | null;
  searchIndex: SearchItem[];
  loadStateShard: (stateFips: string) => Promise<StateCountyShard>;
  shardCache: Record<string, StateCountyShard>;
}

export function useEconomicData(): EconomicStore {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [macro, setMacro] = useState<MacroData | null>(null);
  const [states, setStates] = useState<StateRecord[]>([]);
  const [housingMigration, setHousingMigration] = useState<HousingMigrationData | null>(null);
  const [sectors, setSectors] = useState<SectorsData | null>(null);
  const [creditRisk, setCreditRisk] = useState<CreditRiskData | null>(null);
  const [policyCorporate, setPolicyCorporate] = useState<PolicyCorporateData | null>(null);
  const [searchIndex, setSearchIndex] = useState<SearchItem[]>([]);
  const [shardCache, setShardCache] = useState<Record<string, StateCountyShard>>({});
  const shardRef = useRef<Record<string, StateCountyShard>>({});

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchJson<ManifestData>("manifest.json"),
      fetchJson<MacroData>("macro.json"),
      fetchJson<{ states: StateRecord[] }>("states.json"),
      fetchJson<HousingMigrationData>("housing_migration.json"),
      fetchJson<SectorsData>("sectors.json"),
      fetchJson<CreditRiskData>("credit_risk.json"),
      fetchJson<PolicyCorporateData>("policy_corporate.json"),
      fetchJson<{ items: SearchItem[] }>("search_index.json"),
    ])
      .then(([man, mac, st, hm, sec, cr, pc, si]) => {
        if (!active) return;
        setManifest(man);
        setMacro(mac);
        setStates(st.states || []);
        setHousingMigration(hm);
        setSectors(sec);
        setCreditRisk(cr);
        setPolicyCorporate(pc);
        setSearchIndex(si.items || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(String(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadStateShard = useCallback(async (stateFips: string): Promise<StateCountyShard> => {
    const fips = stateFips.padStart(2, "0");
    if (shardRef.current[fips]) return shardRef.current[fips];
    const data = await fetchJson<StateCountyShard>(`counties/${fips}.json`);
    shardRef.current[fips] = data;
    setShardCache((prev) => ({ ...prev, [fips]: data }));
    return data;
  }, []);

  return {
    loading,
    error,
    manifest,
    macro,
    states,
    housingMigration,
    sectors,
    creditRisk,
    policyCorporate,
    searchIndex,
    loadStateShard,
    shardCache,
  };
}
