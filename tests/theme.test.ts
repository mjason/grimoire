import { describe, expect, test } from "bun:test";
import {
  ACCENTS,
  THEME_PRESETS,
  customPresets,
  findPreset,
  layerTheme,
  mergeThemeSettings,
  normalizePreset,
  themeCatalog,
  normalizeAccent,
  readableForeground,
  resolveTheme,
  themeCss,
} from "../src/runtime/theme";

describe("accent normalization", () => {
  test("maps a built-in accent name to its hex", () => {
    expect(normalizeAccent("emerald")).toBe(ACCENTS.emerald!);
    expect(normalizeAccent("VIOLET")).toBe(ACCENTS.violet!);
  });

  test("accepts hex values and expands the 3-digit form", () => {
    expect(normalizeAccent("#abc")).toBe("#aabbcc");
    expect(normalizeAccent("#1E90FF")).toBe("#1e90ff");
  });

  test("rejects anything else", () => {
    expect(normalizeAccent("chartreuse-ish")).toBeNull();
    expect(normalizeAccent("")).toBeNull();
    expect(normalizeAccent(undefined)).toBeNull();
  });

  test("picks a readable foreground for the accent", () => {
    expect(readableForeground("#ffffff")).toBe("#111111");
    expect(readableForeground("#000000")).toBe("#ffffff");
    expect(readableForeground("#7c3aed")).toBe("#ffffff");
    expect(readableForeground("#fbbf24")).toBe("#111111");
  });
});

describe("theme resolution", () => {
  test("defaults to the grimoire preset", () => {
    const t = resolveTheme();
    expect(t.presetId).toBe("grimoire");
    expect(t.accent).toBe(ACCENTS.violet!);
    expect(t.mode).toBe("system");
    expect(t.radius).toBe(1);
    expect(t.font).toBe("sans");
    expect(t.density).toBe("comfortable");
  });

  test("a preset supplies its own defaults", () => {
    const paper = findPreset("paper")!;
    const t = resolveTheme({ preset: "paper" });
    expect(t.presetId).toBe("paper");
    expect(t.accent).toBe(normalizeAccent(paper.accent));
    expect(t.font).toBe(paper.font ?? "sans");
  });

  test("explicit settings win over preset defaults", () => {
    const t = resolveTheme({ preset: "paper", accent: "#123456", font: "mono", radius: 0 });
    expect(t.accent).toBe("#123456");
    expect(t.font).toBe("mono");
    expect(t.radius).toBe(0);
  });

  test("an unknown preset falls back without discarding other settings", () => {
    const t = resolveTheme({ preset: "does-not-exist", accent: "rose", mode: "dark" });
    expect(t.presetId).toBe("grimoire");
    expect(t.accent).toBe(ACCENTS.rose!);
    expect(t.mode).toBe("dark");
  });

  test("out-of-range values are clamped, not trusted", () => {
    expect(resolveTheme({ radius: 99 }).radius).toBe(2);
    expect(resolveTheme({ radius: -3 }).radius).toBe(0);
    expect(resolveTheme({ density: "enormous" as never }).density).toBe("comfortable");
    expect(resolveTheme({ fontSize: 12 }).fontSize).toBe(1.6);
    expect(resolveTheme({ fontSize: 0 }).fontSize).toBe(0.75);
    expect(resolveTheme({ fontSize: "big" as never }).fontSize).toBe(1);
    expect(resolveTheme({ uiFontSize: 9 }).uiFontSize).toBe(1.6);
    expect(resolveTheme({ categoryFontSize: -1 }).categoryFontSize).toBe(0.75);
    expect(resolveTheme({ uiFont: "comic" as never }).uiFont).toBe("sans");
  });

  test("navigation and category typefaces cascade from the body typeface", () => {
    // Set one thing and the whole site stays consistent…
    const inherited = resolveTheme({ font: "serif" });
    expect(inherited.uiFont).toBe("serif");
    expect(inherited.categoryFont).toBe("serif");

    // …until the chrome is given its own, which categories then follow.
    const chrome = resolveTheme({ font: "serif", uiFont: "sans" });
    expect(chrome.font).toBe("serif");
    expect(chrome.uiFont).toBe("sans");
    expect(chrome.categoryFont).toBe("sans");

    // …and categories can still break away on their own.
    expect(resolveTheme({ font: "serif", uiFont: "sans", categoryFont: "mono" }).categoryFont).toBe("mono");
  });

  test("every preset resolves and ships a full neutral ramp", () => {
    for (const preset of THEME_PRESETS) {
      const t = resolveTheme({ preset: preset.id });
      expect(t.presetId).toBe(preset.id);
      expect(Object.keys(preset.neutral)).toHaveLength(11);
      expect(normalizeAccent(preset.accent)).not.toBeNull();
    }
  });
});

describe("theme css", () => {
  const css = themeCss(resolveTheme({ preset: "paper", accent: "#123456" }));

  test("re-tints the neutral ramp every utility reads", () => {
    expect(css).toContain("--color-neutral-50:");
    expect(css).toContain("--color-neutral-950:");
    expect(css).toContain("--color-white:");
  });

  test("exposes the accent triplet", () => {
    expect(css).toContain("--accent: #123456");
    expect(css).toContain("--accent-fg:");
    expect(css).toContain("--accent-soft:");
  });

  test("scales the radius ramp", () => {
    expect(themeCss(resolveTheme({ radius: 0 }))).toContain("--radius-2xl: 0rem");
    expect(themeCss(resolveTheme({ radius: 1 }))).toContain("--radius-2xl: 1rem");
  });

  test("density scales the root font size as a percentage", () => {
    // Percent, not px: a reader who raised their browser's default text size
    // keeps it, and the site's density applies on top.
    expect(themeCss(resolveTheme({ density: "compact" }))).toMatch(/html\s*\{[^}]*font-size:\s*93.75%/);
    expect(themeCss(resolveTheme({ density: "comfortable" }))).toMatch(/html\s*\{[^}]*font-size:\s*100%/);
    expect(themeCss(resolveTheme({ density: "spacious" }))).toMatch(/html\s*\{[^}]*font-size:\s*106.25%/);
    expect(themeCss(resolveTheme())).not.toMatch(/font-size:\s*\d+px/);
  });

  test("reading size is its own variable, independent of density", () => {
    expect(themeCss(resolveTheme())).toContain("--prose-size: 1rem");
    expect(themeCss(resolveTheme({ fontSize: 1.25 }))).toContain("--prose-size: 1.25rem");
    // …and it doesn't disturb the UI scale.
    expect(themeCss(resolveTheme({ fontSize: 1.25 }))).toMatch(/html\s*\{[^}]*font-size:\s*100%/);
  });

  test("selects the body typeface", () => {
    expect(themeCss(resolveTheme({ font: "serif" }))).toMatch(/--font-body:[^;]*serif/);
    expect(themeCss(resolveTheme({ font: "mono" }))).toMatch(/--font-body:[^;]*monospace/);
  });

  test("emits a typeface and scale for the navigation and category labels", () => {
    const out = themeCss(resolveTheme({ uiFont: "mono", categoryFont: "serif", uiFontSize: 1.1 }));
    expect(out).toMatch(/--font-ui:[^;]*monospace/);
    expect(out).toMatch(/--font-category:[^;]*serif/);
    expect(out).toContain("--ui-scale: 1.1");
    expect(out).toContain("--category-scale: 1");
  });

  test("is a single :root rule plus the root font size (no selector leakage)", () => {
    expect(css.match(/:root\s*\{/g)).toHaveLength(1);
    expect(css).not.toContain("</style");
  });
});

describe("author-defined palettes", () => {
  const ramp = Array.from({ length: 11 }, (_, i) => `oklch(${95 - i * 8}% 0.02 140)`);

  test("a full palette becomes a real preset", () => {
    const preset = normalizePreset({ id: "moss", label: "Moss", accent: "#4d7c0f", neutral: ramp })!;
    expect(preset.id).toBe("moss");
    expect(preset.label).toBe("Moss");
    expect(preset.neutral["50"]).toBe(ramp[0]!);
    expect(preset.neutral["950"]).toBe(ramp[10]!);
    expect(preset.accent).toBe("#4d7c0f");
  });

  test("accepts a ramp keyed by shade as well as an ordered array", () => {
    const byShade = Object.fromEntries(
      ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"].map((s, i) => [s, ramp[i]!]),
    );
    expect(normalizePreset({ id: "a", neutral: byShade })!.neutral).toEqual(
      normalizePreset({ id: "a", neutral: ramp })!.neutral,
    );
  });

  test("inherits everything it doesn't specify", () => {
    const paper = findPreset("paper")!;
    const preset = normalizePreset({ id: "warm", extends: "paper", accent: "#123456" })!;
    expect(preset.neutral).toEqual(paper.neutral);
    expect(preset.white).toBe(paper.white!);
    expect(preset.font).toBe(paper.font!);
    expect(preset.accent).toBe("#123456");
  });

  test("derives an id and label when neither is given", () => {
    expect(normalizePreset({ label: "Deep Sea", neutral: ramp })!.id).toBe("deep-sea");
    expect(normalizePreset({ id: "deep-sea", neutral: ramp })!.label).toBe("Deep Sea");
  });

  test("rejects a malformed ramp instead of half-applying it", () => {
    expect(normalizePreset({ id: "short", neutral: ramp.slice(0, 5) })).toBeNull();
    expect(normalizePreset({ id: "holes", neutral: [...ramp.slice(0, 10), ""] })).toBeNull();
    expect(normalizePreset({ id: "wrong", neutral: "blue" })).toBeNull();
    expect(normalizePreset("paper")).toBeNull();
    expect(normalizePreset(null)).toBeNull();
  });

  test("the catalog appends custom palettes and keeps the built-ins", () => {
    const catalog = themeCatalog([{ id: "moss", neutral: ramp }]);
    expect(catalog).toHaveLength(THEME_PRESETS.length + 1);
    expect(catalog.at(-1)!.id).toBe("moss");
    expect(themeCatalog()).toEqual(THEME_PRESETS);
  });

  test("a custom palette can re-tune a built-in by reusing its id", () => {
    const catalog = themeCatalog([{ id: "paper", accent: "#111111" }]);
    expect(catalog).toHaveLength(THEME_PRESETS.length);
    expect(findPreset("paper", catalog)!.accent).toBe("#111111");
    expect(findPreset("paper", catalog)!.neutral).toEqual(findPreset("paper")!.neutral);
  });

  test("customPresets reports only what the author added", () => {
    expect(customPresets([{ id: "moss", neutral: ramp }, { id: "bad", neutral: [] }]).map((p) => p.id)).toEqual([
      "moss",
    ]);
  });

  test("a custom preset resolves like any other", () => {
    const catalog = themeCatalog([{ id: "moss", accent: "#4d7c0f", neutral: ramp }]);
    const theme = resolveTheme({ preset: "moss" }, catalog);
    expect(theme.presetId).toBe("moss");
    expect(theme.accent).toBe("#4d7c0f");
    expect(themeCss(theme)).toContain(`--color-neutral-50: ${ramp[0]!}`);
  });

  test("a palette written inline as `preset` works without registering it", () => {
    const theme = resolveTheme({ preset: { id: "ad-hoc", accent: "#0ea5e9", neutral: ramp } });
    expect(theme.presetId).toBe("ad-hoc");
    expect(themeCss(theme)).toContain("--accent: #0ea5e9");
  });

  test("a stored preset the site no longer offers falls back to the site's", () => {
    const catalog = themeCatalog([{ id: "moss", neutral: ramp }]);
    expect(resolveTheme(layerTheme({ preset: "paper" }, { preset: "gone" }, catalog), catalog).presetId).toBe(
      "paper",
    );
    expect(resolveTheme(layerTheme({ preset: "paper" }, { preset: "moss" }, catalog), catalog).presetId).toBe(
      "moss",
    );
  });
});

describe("settings merge", () => {
  test("later settings win and undefined never clobbers", () => {
    const merged = mergeThemeSettings({ preset: "paper", accent: "rose" }, { accent: undefined, mode: "dark" });
    expect(merged).toEqual({ preset: "paper", accent: "rose", mode: "dark" });
  });

  test("ignores unknown keys so persisted junk can't poison the theme", () => {
    const merged = mergeThemeSettings({}, { evil: "x", accent: "sky" } as never);
    expect(merged).toEqual({ accent: "sky" });
  });

  test("an invalid value never overrides a good one", () => {
    const merged = mergeThemeSettings(
      { preset: "paper", accent: "rose", mode: "dark" },
      { preset: 42, accent: "not-a-colour", mode: "neon" } as never,
    );
    expect(merged).toEqual({ preset: "paper", accent: "rose", mode: "dark" });
  });
});

describe("layering the reader over the site", () => {
  test("keeps the site's look when the reader changes nothing", () => {
    expect(layerTheme({ preset: "paper", accent: "amber" }, {})).toEqual({
      preset: "paper",
      accent: "amber",
    });
  });

  test("switching preset adopts that preset's personality", () => {
    const layered = layerTheme({ preset: "paper", accent: "amber", font: "serif" }, { preset: "carbon" });
    expect(layered).toEqual({ preset: "carbon" });
    expect(resolveTheme(layered).accent).toBe(ACCENTS.emerald!);
  });

  test("an accent the reader chose survives the preset switch", () => {
    const layered = layerTheme({ preset: "paper", accent: "amber" }, { preset: "carbon", accent: "sky" });
    expect(resolveTheme(layered).accent).toBe(ACCENTS.sky!);
  });

  test("re-picking the site's own preset changes nothing", () => {
    expect(layerTheme({ preset: "paper", accent: "amber" }, { preset: "paper" })).toEqual({
      preset: "paper",
      accent: "amber",
    });
  });

  test("mode and density are personal, not part of the palette", () => {
    const layered = layerTheme({ preset: "paper", density: "spacious", mode: "light" }, { preset: "nord" });
    expect(layered.density).toBe("spacious");
    expect(layered.mode).toBe("light");
  });
});
