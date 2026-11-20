import React, { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import * as topojson from "topojson-client";
import statesTopo from "us-atlas/states-10m.json";
import countiesTopo from "us-atlas/counties-10m.json";

export interface MapDatum {
  id: string;
  name: string;
  value: number | null;
  extra?: string;
}

interface USChoroplethMapProps {
  mode: "states" | "counties";
  stateFips?: string;
  data: MapDatum[];
  metricLabel: string;
  unit?: string;
  invertColor?: boolean;
  dark: boolean;
  height?: number;
  selectedId?: string | null;
  onSelect: (id: string, name: string) => void;
}

const registeredMaps = new Set<string>();

function ensureStatesMap() {
  if (registeredMaps.has("USA_STATES")) return;
  const fc = topojson.feature(
    statesTopo as any,
    (statesTopo as any).objects.states
  ) as any;
  // Filter out territories outside 50 states + DC and normalize feature.properties.name = 2-digit FIPS
  const filtered = {
    ...fc,
    features: fc.features
      .filter((f: any) => {
        const id = String(f.id).padStart(2, "0");
        return Number(id) <= 56;
      })
      .map((f: any) => {
        const id = String(f.id).padStart(2, "0");
        return {
          ...f,
          properties: { ...f.properties, name: id, displayName: f.properties?.name || id },
        };
      }),
  };
  echarts.registerMap("USA_STATES", filtered, {
    "02": { left: -127, top: 24, width: 15 },
    "15": { left: -110, top: 24, width: 6 },
  });
  registeredMaps.add("USA_STATES");
}

function ensureCountyMapForState(stateFips: string): string {
  const fips2 = stateFips.padStart(2, "0");
  const mapName = `USA_COUNTIES_${fips2}`;
  if (registeredMaps.has(mapName)) return mapName;
  const fc = topojson.feature(
    countiesTopo as any,
    (countiesTopo as any).objects.counties
  ) as any;
  const filtered = {
    ...fc,
    features: fc.features
      .filter((f: any) => String(f.id).padStart(5, "0").startsWith(fips2))
      .map((f: any) => {
        const id5 = String(f.id).padStart(5, "0");
        return {
          ...f,
          properties: { ...f.properties, name: id5, displayName: f.properties?.name || id5 },
        };
      }),
  };
  echarts.registerMap(mapName, filtered);
  registeredMaps.add(mapName);
  return mapName;
}

export const USChoroplethMap: React.FC<USChoroplethMapProps> = ({
  mode,
  stateFips,
  data,
  metricLabel,
  unit = "",
  invertColor = false,
  dark,
  height = 460,
  selectedId,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const mapName = useMemo(() => {
    if (mode === "states" || !stateFips) {
      ensureStatesMap();
      return "USA_STATES";
    }
    return ensureCountyMapForState(stateFips);
  }, [mode, stateFips]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    chart.on("click", (params: any) => {
      if (params?.name) {
        selectRef.current(params.name, params.data?.displayName || params.name);
      }
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const vals = data.map((d) => d.value).filter((v): v is number => v !== null && !Number.isNaN(v));
    const sorted = [...vals].sort((a, b) => a - b);
    // Robust 5th–95th percentile clipping so outliers don't wash out map contrast
    const minVal = sorted.length ? sorted[Math.floor(sorted.length * 0.05)] : 0;
    const maxVal = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95))] : 100;
    const safeMax = maxVal === minVal ? minVal + 1 : maxVal;

    const palette = invertColor
      ? ["#10b981", "#34d399", "#fbbf24", "#f97316", "#ef4444"]
      : dark
      ? ["#0f172a", "#1e3a5f", "#0284c7", "#38bdf8", "#a5f3fc"]
      : ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];

    const seriesData = data.map((d) => ({
      name: d.id,
      displayName: d.name,
      value: d.value,
      extra: d.extra || "",
      itemStyle:
        selectedId && d.id === selectedId
          ? { borderColor: "#f59e0b", borderWidth: 2.2, shadowBlur: 8, shadowColor: "rgba(245,158,11,0.5)" }
          : undefined,
    }));

    chartRef.current.setOption(
      {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "item",
          backgroundColor: dark ? "#0f172a" : "#ffffff",
          borderColor: dark ? "#334155" : "#cbd5e1",
          textStyle: { color: dark ? "#f8fafc" : "#0f172a", fontSize: 12 },
          formatter: (p: any) => {
            const title = p.data?.displayName || p.name;
            const raw = p.data?.value;
            const valStr =
              raw === null || raw === undefined || Number.isNaN(raw)
                ? "N/A"
                : `${Number(raw).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit}`;
            const extra = p.data?.extra ? `<div style="margin-top:3px;opacity:0.8;font-size:11px">${p.data.extra}</div>` : "";
            return `<div style="font-weight:600;margin-bottom:2px">${title}</div><div>${metricLabel}: <b>${valStr}</b></div>${extra}`;
          },
        },
        visualMap: {
          left: 12,
          bottom: 12,
          min: minVal,
          max: safeMax,
          calculable: true,
          orient: "horizontal",
          itemWidth: 12,
          itemHeight: 110,
          textStyle: { color: dark ? "#94a3b8" : "#475569", fontSize: 11 },
          inRange: { color: palette },
          outOfRange: { color: dark ? "#1e293b" : "#e2e8f0" },
        },
        series: [
          {
            name: metricLabel,
            type: "map",
            map: mapName,
            roam: true,
            scaleLimit: { min: 0.9, max: 6 },
            selectedMode: false,
            emphasis: {
              label: { show: false },
              itemStyle: { areaColor: "#f59e0b", borderColor: "#ffffff", borderWidth: 1.2 },
            },
            itemStyle: {
              borderColor: dark ? "#334155" : "#94a3b8",
              borderWidth: mode === "states" ? 0.9 : 0.45,
              areaColor: dark ? "#1e293b" : "#e2e8f0",
            },
            data: seriesData,
          },
        ],
      },
      { notMerge: true }
    );
  }, [mapName, data, metricLabel, unit, invertColor, dark, selectedId, mode]);

  return <div ref={containerRef} style={{ height: `${height}px`, width: "100%" }} />;
};
