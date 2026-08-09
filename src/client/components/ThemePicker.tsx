// The theme picker: everyone's taste differs, so the reader gets the same knobs
// the site author has — preset, accent, light/dark, typeface, roundness, density.
// Choices are stored locally; "Reset" hands the look back to the site default.
import { useEffect, useRef, useState } from "preact/hooks";
import {
  ACCENT_NAMES,
  ACCENTS,
  normalizeAccent,
  type ColorMode,
  type Density,
  type FontChoice,
  type ThemePreset,
} from "../../runtime/theme";
import { useTheme } from "../lib/theme";
import { useLocale } from "../i18n";

const SECTION = "grimoire-category text-neutral-400";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div class="flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          class={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
            value === option.value
              ? "accent-bg"
              : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PresetSwatch({
  preset,
  active,
  onPick,
}: {
  preset: ThemePreset;
  active: boolean;
  onPick: () => void;
}) {
  const accent = normalizeAccent(preset.accent) ?? "#7c3aed";
  return (
    <button
      type="button"
      onClick={onPick}
      title={preset.hint ?? preset.label}
      aria-pressed={active}
      data-preset={preset.id}
      class={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
          : "border-neutral-200 text-neutral-600 hover:border-[var(--accent)] dark:border-neutral-700 dark:text-neutral-300"
      }`}
    >
      <span class="flex h-5 w-5 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10">
        <span class="w-1/3" style={{ background: preset.neutral["100"] }} />
        <span class="w-1/3" style={{ background: preset.neutral["500"] }} />
        <span class="w-1/3" style={{ background: accent }} />
      </span>
      <span class="truncate">{preset.label}</span>
    </button>
  );
}

const PANEL_WIDTH = 288; // w-72

export function ThemePicker() {
  const { theme, settings, presets, enabled, update, reset } = useTheme();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The button lives in a 288px sidebar, so a panel anchored to it would hang off
  // the left edge. Position it against the viewport instead and clamp.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const max = Math.max(margin, window.innerWidth - PANEL_WIDTH - margin);
      setAnchor({
        top: rect.bottom + margin,
        left: Math.min(max, Math.max(margin, rect.right - PANEL_WIDTH)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;

  const customized = Object.keys(settings).length > 0;

  return (
    <div class="relative" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("theme.title")}
        title={t("theme.title")}
        data-testid="theme-picker-button"
        class="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-[var(--accent)] dark:hover:bg-neutral-800"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2 2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 10 10 0 0 0-10-10z" />
        </svg>
      </button>

      {open && (
        <div
          data-testid="theme-picker-panel"
          role="dialog"
          aria-label={t("theme.title")}
          style={{ top: `${anchor.top}px`, left: `${anchor.left}px`, width: `${PANEL_WIDTH}px` }}
          class="fixed z-50 max-h-[calc(100vh-5rem)] space-y-4 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">{t("theme.title")}</span>
            {customized && (
              <button
                type="button"
                onClick={reset}
                data-testid="theme-reset"
                class="text-xs text-neutral-400 underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {t("theme.reset")}
              </button>
            )}
          </div>

          <div class="space-y-1.5">
            <div class={SECTION}>{t("theme.preset")}</div>
            <div class="grid grid-cols-2 gap-1.5">
              {presets.map((preset) => (
                <PresetSwatch
                  key={preset.id}
                  preset={preset}
                  active={theme.presetId === preset.id}
                  onPick={() => update({ preset: preset.id })}
                />
              ))}
            </div>
          </div>

          <div class="space-y-1.5">
            <div class={SECTION}>{t("theme.accent")}</div>
            <div class="flex flex-wrap items-center gap-1.5">
              {ACCENT_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  data-accent={name}
                  onClick={() => update({ accent: name })}
                  class={`h-5 w-5 rounded-full ring-offset-2 ring-offset-white transition dark:ring-offset-neutral-900 ${
                    theme.accent === ACCENTS[name] ? "ring-2 ring-neutral-400" : "hover:scale-110"
                  }`}
                  style={{ background: ACCENTS[name] }}
                />
              ))}
              <label
                class="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-dashed border-neutral-300 text-[9px] text-neutral-400 dark:border-neutral-600"
                title={t("theme.custom")}
              >
                +
                <input
                  type="color"
                  value={theme.accent}
                  onInput={(e) => update({ accent: (e.target as HTMLInputElement).value })}
                  class="sr-only h-0 w-0"
                />
              </label>
            </div>
          </div>

          <div class="space-y-1.5">
            <div class={SECTION}>{t("theme.mode")}</div>
            <Segmented<ColorMode>
              value={theme.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: "light", label: t("theme.mode.light") },
                { value: "dark", label: t("theme.mode.dark") },
                { value: "system", label: t("theme.mode.system") },
              ]}
            />
          </div>

          <div class="space-y-1.5">
            <div class={SECTION}>{t("theme.font")}</div>
            <Segmented<FontChoice>
              value={theme.font}
              onChange={(font) => update({ font })}
              options={[
                { value: "sans", label: t("theme.font.sans") },
                { value: "serif", label: t("theme.font.serif") },
                { value: "mono", label: t("theme.font.mono") },
              ]}
            />
          </div>

          <div class="space-y-1.5">
            <div class={SECTION}>{t("theme.density")}</div>
            <Segmented<Density>
              value={theme.density}
              onChange={(density) => update({ density })}
              options={[
                { value: "compact", label: t("theme.density.compact") },
                { value: "comfortable", label: t("theme.density.comfortable") },
                { value: "spacious", label: t("theme.density.spacious") },
              ]}
            />
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class={SECTION}>{t("theme.fontSize")}</span>
              <span class="text-xs tabular-nums text-neutral-400">{theme.fontSize.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.6"
              step="0.05"
              value={theme.fontSize}
              data-testid="theme-font-size"
              onInput={(e) => update({ fontSize: Number((e.target as HTMLInputElement).value) })}
              class="w-full accent-[var(--accent)]"
            />
          </div>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class={SECTION}>{t("theme.radius")}</span>
              <span class="text-xs tabular-nums text-neutral-400">{theme.radius.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.25"
              value={theme.radius}
              data-testid="theme-radius"
              onInput={(e) => update({ radius: Number((e.target as HTMLInputElement).value) })}
              class="w-full accent-[var(--accent)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
