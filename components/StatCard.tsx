import type { ComponentChildren } from "preact";

/**
 * Example custom component. Any component exported from a file in this folder
 * is auto-registered and usable in notes WITHOUT importing it:
 *
 * ```mdx
 * <StatCard label="Revenue" value="$1.2M" delta="+12%" trend="up" />
 * ```
 */
export function StatCard({
  label,
  value,
  delta,
  trend = "up",
  children,
}: {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "flat";
  children?: ComponentChildren;
}) {
  const color =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
        ? "text-rose-500"
        : "text-neutral-400";
  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "→";
  return (
    <div class="not-prose rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="truncate text-sm font-medium text-neutral-500 dark:text-neutral-400">{label}</div>
      <div class="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
        {value}
      </div>
      {delta && (
        <div class={`mt-1 flex items-center gap-1 whitespace-nowrap text-sm font-semibold ${color}`}>
          <span aria-hidden>{arrow}</span>
          {delta}
        </div>
      )}
      {children && <div class="mt-2 text-sm text-neutral-500">{children}</div>}
    </div>
  );
}
