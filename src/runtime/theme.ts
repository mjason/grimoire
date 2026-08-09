// The theme system. Everyone's taste differs, so a Grimoire's look is data:
// a preset (the neutral ramp + typeface personality), an accent, a colour mode,
// a corner radius scale and a reading density. All of it resolves to plain CSS
// custom properties.
//
// The trick that keeps this small: Tailwind v4 utilities read their values from
// theme variables (`.bg-neutral-50 { background-color: var(--color-neutral-50) }`),
// so re-declaring `--color-neutral-*`, `--color-white`, `--radius-*` on :root
// re-tints the entire UI — every existing component included — without touching
// a single class name.
//
// This module is pure (no node/browser APIs) because both sides use it: the
// server inlines the CSS into the HTML shell, and the client regenerates it when
// a reader picks their own theme.
//
// Everything here is reachable from a project's `config.ts` at runtime — including
// whole palettes (`theme.presets`) — so a custom look never needs the engine
// recompiled.

export type Shade = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950";

export type NeutralRamp = Record<Shade, string>;

export type FontChoice = "sans" | "serif" | "mono";
export type Density = "compact" | "comfortable" | "spacious";
export type ColorMode = "light" | "dark" | "system";

export interface ThemePreset {
  id: string;
  label: string;
  /** One-line description shown in the theme picker. */
  hint?: string;
  /** The neutral ramp every surface/text utility reads. */
  neutral: NeutralRamp;
  /** Optional replacement for `bg-white`/`text-white` — used by paper-like themes. */
  white?: string;
  black?: string;
  /** Default accent (a name from ACCENTS or a hex value). */
  accent: string;
  /** Default body typeface + corner rounding for this preset. */
  font?: FontChoice;
  radius?: number;
}

/**
 * A palette as an author writes it in `config.ts`. Everything is optional except
 * the part you want to change: unspecified fields come from `extends` (or the
 * preset with the same `id`, or the default preset).
 *
 * ```ts
 * { id: "moss", label: "Moss", extends: "paper", accent: "#4d7c0f",
 *   neutral: ["oklch(97.8% …)", … 11 values, 50 → 950 …] }
 * ```
 */
export interface ThemePresetInput {
  id?: string;
  label?: string;
  hint?: string;
  /** Preset to inherit from. Defaults to the one named by `id`, else "grimoire". */
  extends?: string;
  /** 11 colours, 50 → 950 — an array, or an object keyed by shade. */
  neutral?: string[] | Partial<Record<Shade, string>>;
  white?: string;
  black?: string;
  accent?: string;
  font?: FontChoice;
  radius?: number;
}

/** User-authored theme settings: from `config.theme`, or a reader's own choice. */
export interface ThemeSettings {
  /** A preset id, or a whole palette defined inline. */
  preset?: string | ThemePresetInput;
  accent?: string;
  mode?: ColorMode;
  /** Corner radius multiplier, 0 (sharp) … 2 (very round). */
  radius?: number;
  /** Body/reading typeface. */
  font?: FontChoice;
  density?: Density;
  /** Reading text size multiplier for `.prose`, 0.75 … 1.6. Independent of density. */
  fontSize?: number;
  /** Typeface for the navigation chrome (sidebar + top bar). Defaults to `font`. */
  uiFont?: FontChoice;
  /** Size multiplier for the navigation chrome, 0.75 … 1.6. */
  uiFontSize?: number;
  /** Typeface for category labels and breadcrumbs. Defaults to `uiFont`. */
  categoryFont?: FontChoice;
  /** Size multiplier for category labels, 0.75 … 1.6. */
  categoryFontSize?: number;
}

export interface ResolvedTheme {
  presetId: string;
  preset: ThemePreset;
  accent: string;
  accentFg: string;
  mode: ColorMode;
  radius: number;
  font: FontChoice;
  density: Density;
  fontSize: number;
  uiFont: FontChoice;
  uiFontSize: number;
  categoryFont: FontChoice;
  categoryFontSize: number;
}

// --- Accents -----------------------------------------------------------------

/** Named accents (Tailwind-ish 600 weights). Any hex value works too. */
export const ACCENTS: Record<string, string> = {
  violet: "#7c3aed",
  indigo: "#4f46e5",
  blue: "#2563eb",
  sky: "#0284c7",
  cyan: "#0891b2",
  teal: "#0d9488",
  emerald: "#059669",
  green: "#16a34a",
  lime: "#65a30d",
  amber: "#d97706",
  orange: "#ea580c",
  red: "#dc2626",
  rose: "#e11d48",
  pink: "#db2777",
  fuchsia: "#c026d3",
  purple: "#9333ea",
  slate: "#475569",
};

export const ACCENT_NAMES: string[] = Object.keys(ACCENTS);

/** Resolve an accent name or hex string to a canonical `#rrggbb`, else null. */
export function normalizeAccent(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const named = ACCENTS[raw.toLowerCase()];
  if (named) return named;
  const hex = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw);
  if (!hex) return null;
  const body = hex[1]!.toLowerCase();
  return `#${body.length === 3 ? body.replace(/./g, (c) => c + c) : body}`;
}

/** Pick black-ish or white text for a background, by relative luminance. */
export function readableForeground(hex: string): string {
  const normalized = normalizeAccent(hex) ?? "#000000";
  const channel = (i: number) => {
    const v = parseInt(normalized.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.45 ? "#111111" : "#ffffff";
}

// --- Presets -----------------------------------------------------------------

function ramp(...shades: string[]): NeutralRamp {
  const keys: Shade[] = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
  return Object.fromEntries(keys.map((k, i) => [k, shades[i]!])) as NeutralRamp;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "grimoire",
    label: "Grimoire",
    hint: "Pure neutral greys — the original look.",
    accent: "violet",
    font: "sans",
    radius: 1,
    neutral: ramp(
      "oklch(98.5% 0 0)", "oklch(97% 0 0)", "oklch(92.2% 0 0)", "oklch(87% 0 0)",
      "oklch(70.8% 0 0)", "oklch(55.6% 0 0)", "oklch(43.9% 0 0)", "oklch(37.1% 0 0)",
      "oklch(26.9% 0 0)", "oklch(20.5% 0 0)", "oklch(14.5% 0 0)",
    ),
  },
  {
    id: "slate",
    label: "Slate",
    hint: "Cool blue-grey, a touch more corporate.",
    accent: "indigo",
    font: "sans",
    radius: 1,
    neutral: ramp(
      "oklch(98.4% 0.003 247.858)", "oklch(96.8% 0.007 247.896)", "oklch(92.9% 0.013 255.508)",
      "oklch(86.9% 0.022 252.894)", "oklch(70.4% 0.04 256.788)", "oklch(55.4% 0.046 257.417)",
      "oklch(44.6% 0.043 257.281)", "oklch(37.2% 0.044 257.287)", "oklch(27.9% 0.041 260.031)",
      "oklch(20.8% 0.042 265.755)", "oklch(12.9% 0.042 264.695)",
    ),
  },
  {
    id: "paper",
    label: "Paper",
    hint: "Warm sepia with a serif body — long-form reading.",
    accent: "#b45309",
    font: "serif",
    radius: 0.6,
    white: "oklch(98.8% 0.012 88)",
    neutral: ramp(
      "oklch(97.4% 0.011 86)", "oklch(95.6% 0.014 85)", "oklch(91.5% 0.017 82)",
      "oklch(86% 0.019 80)", "oklch(70.5% 0.021 76)", "oklch(55.5% 0.021 70)",
      "oklch(44.5% 0.019 66)", "oklch(37.5% 0.017 62)", "oklch(27% 0.015 58)",
      "oklch(21.5% 0.013 55)", "oklch(15% 0.011 52)",
    ),
  },
  {
    id: "nord",
    label: "Nord",
    hint: "Frosty blue surfaces, cyan accent.",
    accent: "#0e7490",
    font: "sans",
    radius: 1,
    white: "oklch(99% 0.005 250)",
    neutral: ramp(
      "oklch(97.8% 0.008 250)", "oklch(95.5% 0.011 250)", "oklch(91% 0.016 252)",
      "oklch(85% 0.022 253)", "oklch(69% 0.035 255)", "oklch(55% 0.04 256)",
      "oklch(45% 0.045 258)", "oklch(38.5% 0.05 259)", "oklch(30% 0.045 260)",
      "oklch(24% 0.04 262)", "oklch(18% 0.035 264)",
    ),
  },
  {
    id: "carbon",
    label: "Carbon",
    hint: "High contrast, near-square corners.",
    accent: "emerald",
    font: "sans",
    radius: 0.25,
    neutral: ramp(
      "oklch(99% 0 0)", "oklch(97.5% 0 0)", "oklch(90% 0 0)", "oklch(82% 0 0)",
      "oklch(64% 0 0)", "oklch(50% 0 0)", "oklch(39% 0 0)", "oklch(30% 0 0)",
      "oklch(20% 0 0)", "oklch(13% 0 0)", "oklch(7% 0 0)",
    ),
  },
  {
    id: "sakura",
    label: "Sakura",
    hint: "Soft warm blush, generously rounded.",
    accent: "rose",
    font: "sans",
    radius: 1.5,
    white: "oklch(99.2% 0.006 20)",
    neutral: ramp(
      "oklch(98.4% 0.008 20)", "oklch(96.4% 0.012 18)", "oklch(92.4% 0.016 16)",
      "oklch(87% 0.02 14)", "oklch(71% 0.028 12)", "oklch(56% 0.03 10)",
      "oklch(45% 0.03 8)", "oklch(38% 0.028 6)", "oklch(28% 0.024 4)",
      "oklch(22% 0.02 2)", "oklch(15.5% 0.016 0)",
    ),
  },
];

export const DEFAULT_PRESET_ID = "grimoire";

export function findPreset(
  id?: string | null,
  presets: ThemePreset[] = THEME_PRESETS,
): ThemePreset | undefined {
  if (!id) return undefined;
  const wanted = String(id).toLowerCase();
  return presets.find((p) => p.id === wanted);
}

const SHADES: Shade[] = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

const isColour = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Accept a ramp as an ordered array or an object keyed by shade; all 11 required. */
function readRamp(value: unknown): NeutralRamp | null {
  if (Array.isArray(value)) {
    if (value.length !== SHADES.length || !value.every(isColour)) return null;
    return Object.fromEntries(SHADES.map((s, i) => [s, String(value[i]).trim()])) as NeutralRamp;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (!SHADES.every((s) => isColour(record[s]))) return null;
    return Object.fromEntries(SHADES.map((s) => [s, String(record[s]).trim()])) as NeutralRamp;
  }
  return null;
}

function slugId(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function humanizeId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Validate an author-written palette into a real preset, inheriting anything it
 * doesn't specify. Returns null (rather than a half-built theme) when the palette
 * is malformed — a bad `neutral` ramp should be visible, not silently patched.
 */
export function normalizePreset(
  input: unknown,
  presets: ThemePreset[] = THEME_PRESETS,
): ThemePreset | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as ThemePresetInput;

  const id = slugId(String(raw.id ?? raw.label ?? "custom")) || "custom";
  const base =
    findPreset(raw.extends, presets) ??
    findPreset(raw.id, presets) ??
    findPreset(DEFAULT_PRESET_ID, presets) ??
    THEME_PRESETS[0]!;

  let neutral = base.neutral;
  if (raw.neutral !== undefined) {
    const ramp = readRamp(raw.neutral);
    if (!ramp) return null; // 11 shades or nothing
    neutral = ramp;
  }

  const accent = normalizeAccent(raw.accent) ?? base.accent;
  return {
    id,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : humanizeId(id),
    hint: typeof raw.hint === "string" ? raw.hint : base.hint,
    neutral,
    white: isColour(raw.white) ? raw.white.trim() : base.white,
    black: isColour(raw.black) ? raw.black.trim() : base.black,
    accent,
    font: FONTS.includes(raw.font as FontChoice) ? raw.font : base.font,
    radius: typeof raw.radius === "number" && Number.isFinite(raw.radius) ? raw.radius : base.radius,
  };
}

function collectPresets(sources: unknown[]): { catalog: ThemePreset[]; custom: ThemePreset[] } {
  const catalog = [...THEME_PRESETS];
  const custom: ThemePreset[] = [];
  const add = (candidate: unknown) => {
    const preset = normalizePreset(candidate, catalog);
    if (!preset) return;
    const inCatalog = catalog.findIndex((p) => p.id === preset.id);
    if (inCatalog === -1) catalog.push(preset);
    else catalog[inCatalog] = preset;
    const inCustom = custom.findIndex((p) => p.id === preset.id);
    if (inCustom === -1) custom.push(preset);
    else custom[inCustom] = preset;
  };
  for (const source of sources) {
    if (Array.isArray(source)) source.forEach(add);
    else if (source && typeof source === "object") add(source);
  }
  return { catalog, custom };
}

/**
 * The presets a site offers: the built-ins, plus any the author defined in
 * `config.theme.presets` (or inline as `config.theme.preset`). A custom palette
 * whose id matches a built-in replaces it, so `{ id: "paper", accent: "#333" }`
 * re-tunes the shipped Paper rather than adding a second one.
 */
export function themeCatalog(...sources: unknown[]): ThemePreset[] {
  return collectPresets(sources).catalog;
}

/** Just the author-defined palettes — what the server ships to the client. */
export function customPresets(...sources: unknown[]): ThemePreset[] {
  return collectPresets(sources).custom;
}

// --- Typography + spacing ----------------------------------------------------

export const FONT_STACKS: Record<FontChoice, string> = {
  sans:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, ' +
    '"Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif, "Apple Color Emoji"',
  serif:
    'ui-serif, "Iowan Old Style", Georgia, Cambria, "Times New Roman", "Songti SC", ' +
    '"Noto Serif CJK SC", "Source Han Serif SC", serif',
  mono:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, ' +
    '"Liberation Mono", "Noto Sans Mono CJK SC", monospace',
};

/**
 * Density as a ratio of the *browser's* default text size, not a pixel value.
 * Emitting `html { font-size: 93.75% }` keeps a reader who raised their browser's
 * default font size — usually because they need to — while still applying the
 * site's density. A hard `15px` would quietly override that.
 */
const DENSITY_SCALE: Record<Density, number> = {
  compact: 0.9375,
  comfortable: 1,
  spacious: 1.0625,
};

/** Tailwind's default radius ramp, in rem — scaled by the theme's `radius`. */
const RADIUS_BASE: Record<string, number> = {
  xs: 0.125,
  sm: 0.25,
  md: 0.375,
  lg: 0.5,
  xl: 0.75,
  "2xl": 1,
  "3xl": 1.5,
  "4xl": 2,
};

// --- Resolution --------------------------------------------------------------

const SETTING_KEYS = [
  "preset",
  "accent",
  "mode",
  "radius",
  "font",
  "density",
  "fontSize",
  "uiFont",
  "uiFontSize",
  "categoryFont",
  "categoryFontSize",
] as const;
const MODES: ColorMode[] = ["light", "dark", "system"];
const FONTS: FontChoice[] = ["sans", "serif", "mono"];
const DENSITIES: Density[] = ["compact", "comfortable", "spacious"];

/** Per-key validity, so a corrupted layer is ignored instead of winning. */
const VALID: Record<(typeof SETTING_KEYS)[number], (value: unknown) => boolean> = {
  // Either a preset id or an inline palette; whether the id exists is settled
  // later, against the site's catalog.
  preset: (v) =>
    (typeof v === "string" && v.trim() !== "") ||
    (typeof v === "object" && v !== null && !Array.isArray(v)),
  accent: (v) => typeof v === "string" && normalizeAccent(v) !== null,
  mode: (v) => MODES.includes(v as ColorMode),
  radius: (v) => typeof v === "number" && Number.isFinite(v),
  font: (v) => FONTS.includes(v as FontChoice),
  density: (v) => DENSITIES.includes(v as Density),
  fontSize: (v) => typeof v === "number" && Number.isFinite(v),
  uiFont: (v) => FONTS.includes(v as FontChoice),
  uiFontSize: (v) => typeof v === "number" && Number.isFinite(v),
  categoryFont: (v) => FONTS.includes(v as FontChoice),
  categoryFontSize: (v) => typeof v === "number" && Number.isFinite(v),
};

/** The id a `preset` setting refers to, whether it's a name or an inline palette. */
export function presetIdOf(preset: ThemeSettings["preset"]): string | undefined {
  if (typeof preset === "string") return preset.trim().toLowerCase() || undefined;
  if (preset && typeof preset === "object") {
    return slugId(String(preset.id ?? preset.label ?? "custom")) || "custom";
  }
  return undefined;
}

/**
 * Merge theme settings left-to-right, keeping only known keys with usable
 * values. A garbled value doesn't override a good one from an earlier layer —
 * stale local storage can't take the site's theme down with it.
 */
export function mergeThemeSettings(...layers: (ThemeSettings | null | undefined)[]): ThemeSettings {
  const out: ThemeSettings = {};
  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    for (const key of SETTING_KEYS) {
      const value = (layer as Record<string, unknown>)[key];
      if (value === undefined || !VALID[key](value)) continue;
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/**
 * Layer a reader's preferences over the site's theme.
 *
 * Choosing a palette adopts its personality: when the reader switches presets,
 * the site's accent/typeface/roundness step aside so the new preset's defaults
 * come through. Anything the reader picked themselves still wins.
 */
export function layerTheme(
  site: ThemeSettings | null | undefined,
  reader: ThemeSettings | null | undefined,
  presets: ThemePreset[] = THEME_PRESETS,
): ThemeSettings {
  // A stored preset the site no longer offers (renamed, removed) is dropped, so
  // the reader lands on the site's current theme instead of the global default.
  const readerId = presetIdOf(reader?.preset);
  const known =
    typeof reader?.preset === "object"
      ? normalizePreset(reader.preset, presets) !== null
      : readerId === undefined || findPreset(readerId, presets) !== undefined;
  const cleaned = known ? reader : { ...reader, preset: undefined };

  const switched = known && readerId !== undefined && readerId !== presetIdOf(site?.preset);
  const base = switched ? { ...site, accent: undefined, font: undefined, radius: undefined } : site;
  return mergeThemeSettings(base, cleaned);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A type-size multiplier: 1 unless a finite number was given, then clamped. */
const scale = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? clamp(value, 0.75, 1.6) : 1;

/** Turn (possibly untrusted) settings into a complete, valid theme. */
export function resolveTheme(
  settings?: ThemeSettings | null,
  presets: ThemePreset[] = THEME_PRESETS,
): ResolvedTheme {
  const s = settings ?? {};
  const preset =
    (typeof s.preset === "object" ? normalizePreset(s.preset, presets) : null) ??
    findPreset(typeof s.preset === "string" ? s.preset : undefined, presets) ??
    findPreset(DEFAULT_PRESET_ID, presets) ??
    THEME_PRESETS[0]!;
  const accent = normalizeAccent(s.accent) ?? normalizeAccent(preset.accent) ?? ACCENTS.violet!;
  const radius =
    typeof s.radius === "number" && Number.isFinite(s.radius)
      ? clamp(s.radius, 0, 2)
      : clamp(preset.radius ?? 1, 0, 2);
  const font = FONTS.includes(s.font as FontChoice) ? (s.font as FontChoice) : preset.font ?? "sans";
  const uiFont = FONTS.includes(s.uiFont as FontChoice) ? (s.uiFont as FontChoice) : font;
  return {
    presetId: preset.id,
    preset,
    accent,
    accentFg: readableForeground(accent),
    mode: MODES.includes(s.mode as ColorMode) ? (s.mode as ColorMode) : "system",
    radius,
    font,
    density: DENSITIES.includes(s.density as Density) ? (s.density as Density) : "comfortable",
    fontSize: scale(s.fontSize),
    // The chrome follows the body typeface unless it's given one of its own, and
    // category labels follow the chrome — so setting one thing stays consistent.
    uiFont,
    uiFontSize: scale(s.uiFontSize),
    categoryFont: FONTS.includes(s.categoryFont as FontChoice) ? (s.categoryFont as FontChoice) : uiFont,
    categoryFontSize: scale(s.categoryFontSize),
  };
}

// --- CSS emission ------------------------------------------------------------

/** Trim trailing zeros so `1 * 1` prints as `1`, not `1.000`. */
const round = (value: number): number => Math.round(value * 1000) / 1000;

const rem = (value: number): string => `${round(value)}rem`;

/**
 * The theme as CSS custom properties. Emitted after Tailwind's own `:root` block
 * (same specificity, later wins), so every utility picks the new values up.
 */
export function themeCss(theme: ResolvedTheme): string {
  const { preset } = theme;
  const lines: string[] = [];
  for (const [shade, value] of Object.entries(preset.neutral)) {
    lines.push(`  --color-neutral-${shade}: ${value};`);
  }
  lines.push(`  --color-white: ${preset.white ?? "#ffffff"};`);
  lines.push(`  --color-black: ${preset.black ?? "#000000"};`);
  for (const [name, base] of Object.entries(RADIUS_BASE)) {
    lines.push(`  --radius-${name}: ${rem(base * theme.radius)};`);
  }
  lines.push(`  --font-body: ${FONT_STACKS[theme.font]};`);
  lines.push(`  --font-ui: ${FONT_STACKS[theme.uiFont]};`);
  lines.push(`  --font-category: ${FONT_STACKS[theme.categoryFont]};`);
  lines.push(`  --font-mono: ${FONT_STACKS.mono};`);
  lines.push(`  --ui-scale: ${round(theme.uiFontSize)};`);
  lines.push(`  --category-scale: ${round(theme.categoryFontSize)};`);
  lines.push(`  --accent: ${theme.accent};`);
  lines.push(`  --accent-fg: ${theme.accentFg};`);
  lines.push(`  --accent-soft: color-mix(in srgb, ${theme.accent} 14%, transparent);`);
  lines.push(`  --accent-ring: color-mix(in srgb, ${theme.accent} 35%, transparent);`);
  // Reading size rides on top of density: `.prose` is sized in rem, and rem is
  // already scaled by the root font size below.
  lines.push(`  --prose-size: ${round(theme.fontSize)}rem;`);
  const density = round(DENSITY_SCALE[theme.density] * 100);
  return `:root {\n${lines.join("\n")}\n}\nhtml { font-size: ${density}%; }\n`;
}

/** The `<html class="dark">` decision, made before first paint. */
export function prefersDark(mode: ColorMode, systemDark: boolean): boolean {
  return mode === "dark" || (mode === "system" && systemDark);
}

export const THEME_STORAGE_KEY = "grimoire-theme";
export const THEME_CSS_STORAGE_KEY = "grimoire-theme-css";
/** Legacy key written by the old sun/moon toggle; still honoured on read. */
export const MODE_STORAGE_KEY = "grimoire-mode";
