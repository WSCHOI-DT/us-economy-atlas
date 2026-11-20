import React, { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface EChartBoxProps {
  option: Record<string, any>;
  height?: number | string;
  className?: string;
  dark?: boolean;
  onChartClick?: (params: any) => void;
}

export const EChartBox: React.FC<EChartBoxProps> = ({
  option,
  height = 320,
  className = "",
  onChartClick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onChartClick);
  clickRef.current = onChartClick;

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    chart.on("click", (params) => {
      if (clickRef.current) clickRef.current(params);
    });

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      style={{ height: typeof height === "number" ? `${height}px` : height, width: "100%" }}
      className={className}
    />
  );
};
