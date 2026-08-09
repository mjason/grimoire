// Client-side theme state. The site ships a default theme (from config); a
// reader may layer their own taste on top, stored locally. The resolved theme is
// re-emitted as CSS custom properties into a <style> kept last in <head>, and
// cached so the pre-paint boot script can restore it without a flash.
import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import {
  MODE_STORAGE_KEY,
  THEME_CSS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  layerTheme,
  mergeThemeSettings,
  prefersDark,
  resolveTheme,
  themeCatalog,
  themeCss,
  type ColorMode,
  type ResolvedTheme,
  type ThemePreset,
  type ThemeSettings,
} from "../../runtime/theme";

const STYLE_ID = "grimoire-theme-vars";

/** The reader's own overrides, including the legacy sun/moon toggle's value. */
export function readStoredTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as ThemeSettings) : null;
    const legacy = localStorage.getItem(MODE_STORAGE_KEY);
    return mergeThemeSettings(legacy ? { mode: legacy as ColorMode } : null, stored);
  } catch {
    return {};
  }
}

function writeStoredTheme(settings: ThemeSettings, css: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(THEME_CSS_STORAGE_KEY, css);
    if (settings.mode) localStorage.setItem(MODE_STORAGE_KEY, settings.mode);
  } catch {
    /* private mode / storage disabled — the theme just won't persist */
  }
}

function clearStoredTheme(): void {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem(THEME_CSS_STORAGE_KEY);
    localStorage.removeItem(MODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Install (or update) the theme's custom properties, keeping them last in <head>. */
export function applyThemeCss(css: string): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
  }
  if (el.textContent !== css) el.textContent = css;
  // Re-append so it always wins over the server-inlined defaults.
  if (el.parentNode !== document.head || el.nextSibling) document.head.appendChild(el);
}

export function applyColorMode(mode: ColorMode): void {
  if (typeof document === "undefined") return;
  const systemDark =
    typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : false;
  document.documentElement.classList.toggle("dark", prefersDark(mode, systemDark));
}

interface ThemeContextValue {
  /** The reader's overrides only — empty when they haven't chosen anything. */
  settings: ThemeSettings;
  /** Site defaults + reader overrides, fully resolved. */
  theme: ResolvedTheme;
  /** Every palette this site offers: built-ins plus the author's own. */
  presets: ThemePreset[];
  /** Whether the site lets readers pick a theme. */
  enabled: boolean;
  update: (patch: ThemeSettings) => void;
  reset: () => void;
}

const fallback: ThemeContextValue = {
  settings: {},
  theme: resolveTheme(),
  presets: themeCatalog(),
  enabled: true,
  update: () => {},
  reset: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(fallback);

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({
  siteTheme,
  children,
}: {
  siteTheme?: ThemeSettings & { picker?: boolean; presets?: unknown };
  children: ComponentChildren;
}) {
  const [settings, setSettings] = useState<ThemeSettings>(() => readStoredTheme());
  // The site's own palettes join the built-ins, so a reader can pick one of the
  // author's — and an inline `theme.preset` shows up in the picker too.
  const presets = useMemo(
    () => themeCatalog(siteTheme?.presets, siteTheme?.preset),
    [siteTheme?.presets, siteTheme?.preset],
  );
  const theme = useMemo(
    () => resolveTheme(layerTheme(siteTheme, settings, presets), presets),
    [siteTheme, settings, presets],
  );

  useEffect(() => {
    const css = themeCss(theme);
    applyThemeCss(css);
    applyColorMode(theme.mode);
    if (Object.keys(settings).length > 0) writeStoredTheme(settings, css);
  }, [theme, settings]);

  // Follow the OS while the reader is on "system".
  useEffect(() => {
    if (theme.mode !== "system" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyColorMode("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme.mode]);

  const update = useCallback((patch: ThemeSettings) => {
    setSettings((prev) => mergeThemeSettings(prev, patch));
  }, []);

  const reset = useCallback(() => {
    clearStoredTheme();
    setSettings({});
  }, []);

  const value = useMemo(
    () => ({ settings, theme, presets, enabled: siteTheme?.picker !== false, update, reset }),
    [settings, theme, presets, siteTheme?.picker, update, reset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
