// A labelled horizontal progress bar matching the house visual style.

export function ProgressBar({
  label,
  value,
  max = 100,
  color,
  showValue = true,
}: {
  label?: string;
  value: number;
  max?: number;
  color?: string;
  showValue?: boolean;
}) {
  // Clamp the percentage into the 0..100 range, guarding against a zero/negative max.
  const safeMax = max > 0 ? max : 0;
  const ratio = safeMax > 0 ? (value / safeMax) * 100 : 0;
  const pct = Math.min(100, Math.max(0, ratio));
  const rounded = Math.round(pct);

  const fill = color ?? "var(--accent)";
  const showHeader = label != null || showValue;

  return (
    <div class="not-prose my-4">
      {showHeader && (
        <div class="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          <span class="font-medium text-neutral-700 dark:text-neutral-300">
            {label}
          </span>
          {showValue && (
            <span class="tabular-nums text-neutral-500 dark:text-neutral-400">
              {safeMax > 0 ? `${value}/${safeMax}` : `${rounded}%`}
            </span>
          )}
        </div>
      )}

      <div
        class="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
      >
        <div
          class="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: fill }}
        />
      </div>
    </div>
  );
}
