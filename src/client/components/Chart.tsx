import { useEffect, useRef } from "preact/hooks";
import ChartJS from "chart.js/auto";
import type { ChartType, ChartData, ChartOptions } from "chart.js";

export interface ChartProps {
  type?: ChartType;
  data: ChartData;
  options?: ChartOptions;
  /** Pixel height of the chart area. */
  height?: number;
  title?: string;
  caption?: string;
}

/**
 * An interactive Chart.js chart, usable directly from MDX:
 *
 * ```mdx
 * <Chart type="bar" title="Revenue"
 *   data={{ labels: ["Q1","Q2"], datasets: [{ label: "2026", data: [12, 19] }] }} />
 * ```
 */
export function Chart({ type = "line", data, options, height = 320, title, caption }: ChartProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const isDark = document.documentElement.classList.contains("dark");
    const grid = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    const tick = isDark ? "rgba(229,229,229,0.75)" : "rgba(64,64,64,0.85)";

    instance.current = new ChartJS(canvas.current, {
      type,
      data: withAccentColors(data),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: tick, usePointStyle: true, boxWidth: 8 } },
          tooltip: { padding: 10, cornerRadius: 8, usePointStyle: true },
        },
        scales:
          type === "pie" || type === "doughnut" || type === "radar" || type === "polarArea"
            ? undefined
            : {
                x: { grid: { color: grid }, ticks: { color: tick } },
                y: { grid: { color: grid }, ticks: { color: tick } },
              },
        ...options,
      },
    });
    return () => instance.current?.destroy();
    // Re-create when the data or type changes.
  }, [JSON.stringify(data), type, JSON.stringify(options)]);

  return (
    <figure class="my-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {title && (
        <figcaption class="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {title}
        </figcaption>
      )}
      <div style={{ height: `${height}px` }}>
        <canvas ref={canvas} />
      </div>
      {caption && (
        <figcaption class="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const PALETTE = [
  "#7c3aed", "#2563eb", "#059669", "#d97706", "#e11d48",
  "#0891b2", "#c026d3", "#65a30d", "#dc2626", "#0d9488",
];

/** If datasets don't specify colors, apply a pleasant default palette. */
function withAccentColors(data: ChartData): ChartData {
  const accent = readAccent();
  const colors = [accent, ...PALETTE];
  const datasets = data.datasets?.map((ds: any, i: number) => {
    if (ds.backgroundColor || ds.borderColor) return ds;
    const c = colors[i % colors.length]!;
    const multi = ["pie", "doughnut", "polarArea"].includes((ds.type as string) ?? "");
    return {
      ...ds,
      borderColor: c,
      backgroundColor: multi ? colors : `${c}33`,
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
    };
  });
  return { ...data, datasets: datasets ?? [] };
}

function readAccent(): string {
  if (typeof getComputedStyle === "undefined") return "#7c3aed";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return v || "#7c3aed";
}
