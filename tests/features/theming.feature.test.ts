// Behaviour of the theme system, from the outside: what an author configures,
// what a reader overrides, and what actually reaches the page.
import { expect } from "bun:test";
import { feature, scenario } from "../bdd";
import {
  THEME_PRESETS,
  layerTheme,
  resolveTheme,
  themeCatalog,
  themeCss,
  type ResolvedTheme,
  type ThemePreset,
  type ThemeSettings,
} from "../../src/runtime/theme";

/** What the client does: site defaults, then the reader's own preferences. */
const applied = (
  site: ThemeSettings,
  reader: ThemeSettings,
  presets: ThemePreset[] = THEME_PRESETS,
): ResolvedTheme => resolveTheme(layerTheme(site, reader, presets), presets);

/** A believable author-written ramp. */
const ramp = Array.from({ length: 11 }, (_, i) => `oklch(${96 - i * 8}% 0.03 150)`);

const varOf = (css: string, name: string): string =>
  new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? "";

feature("Theming", () => {
  scenario("a site ships its own look", async (s) => {
    let theme!: ResolvedTheme;

    await s.given("an author who configured the paper preset", () => {
      theme = applied({ preset: "paper" }, {});
    });
    await s.then("the palette, typeface and roundness all follow it", () => {
      expect(theme.presetId).toBe("paper");
      expect(theme.font).toBe("serif");
      expect(theme.radius).toBeLessThan(1);
    });
    await s.and("the page CSS carries a warm off-white for `bg-white`", () => {
      expect(varOf(themeCss(theme), "color-white")).not.toBe("#ffffff");
    });
  });

  scenario("a reader prefers something else", async (s) => {
    const site: ThemeSettings = { preset: "paper", accent: "amber", mode: "light" };
    let theme!: ResolvedTheme;

    await s.given("a site themed as paper/amber/light", () => {
      expect(applied(site, {}).mode).toBe("light");
    });
    await s.when("the reader picks the carbon palette in dark mode", () => {
      theme = applied(site, { preset: "carbon", mode: "dark" });
    });
    await s.then("their choices win", () => {
      expect(theme.presetId).toBe("carbon");
      expect(theme.mode).toBe("dark");
    });
    await s.and("the accent they never touched still comes from the preset", () => {
      expect(theme.accent).toBe(resolveTheme({ preset: "carbon" }).accent);
    });
  });

  scenario("a reader tunes one knob and keeps the rest", async (s) => {
    const site: ThemeSettings = { preset: "nord", accent: "#0e7490", density: "compact" };
    let theme!: ResolvedTheme;

    await s.given("a compact nord site", () => {
      expect(applied(site, {}).density).toBe("compact");
    });
    await s.when("the reader only changes the corner radius", () => {
      theme = applied(site, { radius: 0 });
    });
    await s.then("corners go square", () => {
      expect(varOf(themeCss(theme), "radius-2xl")).toBe("0rem");
    });
    await s.and("everything else is untouched", () => {
      expect(theme.presetId).toBe("nord");
      expect(theme.density).toBe("compact");
      expect(theme.accent).toBe("#0e7490");
    });
  });

  scenario("resetting hands the look back to the author", async (s) => {
    const site: ThemeSettings = { preset: "sakura", accent: "rose" };
    let before!: ResolvedTheme;
    let after!: ResolvedTheme;

    await s.given("a reader who customised everything", () => {
      before = applied(site, { preset: "carbon", accent: "#123456", font: "mono", radius: 0 });
      expect(before.presetId).toBe("carbon");
    });
    await s.when("they reset their preferences", () => {
      after = applied(site, {});
    });
    await s.then("the site's own theme is back", () => {
      expect(after.presetId).toBe("sakura");
      expect(themeCss(after)).toBe(themeCss(resolveTheme(site)));
    });
  });

  scenario("junk in local storage can't break the page", async (s) => {
    let theme!: ResolvedTheme;

    await s.given("a corrupted set of stored preferences", () => {
      const stored = { preset: 42, accent: "not-a-colour", mode: "neon", radius: 99, evil: "<script>" };
      theme = applied({ preset: "slate" }, stored as unknown as ThemeSettings);
    });
    await s.then("every value falls back to something valid", () => {
      expect(theme.presetId).toBe("slate");
      expect(theme.mode).toBe("system");
      expect(theme.radius).toBe(2);
      expect(theme.accent).toMatch(/^#[0-9a-f]{6}$/);
    });
    await s.and("nothing injectable survives into the CSS", () => {
      expect(themeCss(theme)).not.toContain("<script>");
    });
  });

  scenario("an author ships a palette of their own, from config.ts alone", async (s) => {
    const site: ThemeSettings = { preset: "moss", accent: "#4d7c0f" };
    let presets: ThemePreset[] = [];
    let theme!: ResolvedTheme;

    await s.given("a palette declared in config.theme.presets", () => {
      presets = themeCatalog([{ id: "moss", label: "Moss", extends: "paper", neutral: ramp }]);
    });
    await s.then("it joins the built-ins instead of replacing them", () => {
      expect(presets).toHaveLength(THEME_PRESETS.length + 1);
      expect(presets.map((p) => p.label)).toContain("Moss");
    });
    await s.and("the site can use it as its default", () => {
      theme = applied(site, {}, presets);
      expect(theme.presetId).toBe("moss");
      expect(themeCss(theme)).toContain(`--color-neutral-50: ${ramp[0]!}`);
    });
    await s.and("what it didn't specify comes from the preset it extends", () => {
      expect(theme.font).toBe("serif"); // paper's typeface
    });
    await s.and("a reader can pick it, or leave it for a built-in", () => {
      expect(applied(site, { preset: "carbon" }, presets).presetId).toBe("carbon");
      expect(applied({ preset: "slate" }, { preset: "moss" }, presets).presetId).toBe("moss");
    });
  });

  scenario("a palette with a broken ramp is refused, not half-applied", async (s) => {
    let presets: ThemePreset[] = [];

    await s.given("an author who mistyped one colour out of eleven", () => {
      presets = themeCatalog([{ id: "oops", neutral: ramp.slice(0, 10) }]);
    });
    await s.then("the palette never reaches the picker", () => {
      expect(presets.map((p) => p.id)).not.toContain("oops");
      expect(presets).toEqual(THEME_PRESETS);
    });
    await s.and("the site still renders on its default theme", () => {
      expect(applied({ preset: "oops" }, {}, presets).presetId).toBe("grimoire");
    });
  });

  scenario("reading size and interface density are separate knobs", async (s) => {
    let css = "";

    await s.given("a site that wants a tight interface", () => {
      css = themeCss(applied({ density: "compact" }, {}));
      expect(css).toMatch(/font-size:\s*93.75%/);
    });
    await s.when("a reader enlarges the body text but not the interface", () => {
      css = themeCss(applied({ density: "compact" }, { fontSize: 1.3 }));
    });
    await s.then("only the prose grows", () => {
      expect(css).toContain("--prose-size: 1.3rem");
      expect(css).toMatch(/font-size:\s*93.75%/);
    });
    await s.and("the browser's own default text size is still respected", () => {
      expect(css).not.toMatch(/font-size:\s*\d+px/);
    });
  });

  scenario("navigation and reading text can use different typefaces", async (s) => {
    let theme!: ResolvedTheme;
    let css = "";

    await s.given("an author who wants a serif body", () => {
      theme = applied({ font: "serif" }, {});
    });
    await s.then("the navigation follows, so nothing looks accidental", () => {
      expect(theme.uiFont).toBe("serif");
      expect(theme.categoryFont).toBe("serif");
    });
    await s.when("they set the chrome in sans and category labels in mono", () => {
      theme = applied({ font: "serif", uiFont: "sans", categoryFont: "mono" }, {});
      css = themeCss(theme);
    });
    await s.then("each part gets its own family, from config alone", () => {
      expect(css).toMatch(/--font-body:[^;]*serif/);
      expect(css).toMatch(/--font-ui:[^;]*sans-serif/);
      expect(css).toMatch(/--font-category:[^;]*monospace/);
    });
    await s.and("their sizes are independent too", () => {
      const sized = themeCss(applied({ uiFontSize: 1.2, categoryFontSize: 0.9, fontSize: 1.1 }, {}));
      expect(sized).toContain("--ui-scale: 1.2");
      expect(sized).toContain("--category-scale: 0.9");
      expect(sized).toContain("--prose-size: 1.1rem");
    });
  });

  scenario("every preset produces a complete, usable stylesheet", async (s) => {
    const required = ["color-neutral-50", "color-neutral-950", "color-white", "accent", "accent-fg"];

    await s.given("each shipped preset in turn", () => {
      expect(required.length).toBeGreaterThan(0);
    });
    await s.then("all of them emit the variables the UI reads", () => {
      for (const preset of ["grimoire", "slate", "paper", "nord", "carbon", "sakura"]) {
        const css = themeCss(resolveTheme({ preset }));
        for (const name of required) {
          expect(varOf(css, name)).not.toBe("");
        }
      }
    });
  });
});
