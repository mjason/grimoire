import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import type { I18nConfig } from "../types";

type Dict = Record<string, string>;

/** Built-in UI strings. Unknown locales fall back to English. */
const STRINGS: Record<string, Dict> = {
  en: {
    "search.placeholder": "Search notes…",
    "nav.tags": "Tags",
    "tags.all": "All tags",
    "home.welcome": "Welcome",
    "home.subtitle":
      "{count} notes in this grimoire. Browse the sidebar, search, or open a recent one below.",
    "home.recent": "Recent",
    "search.none": "No notes found.",
    "note.notFound.title": "Note not found",
    "note.notFound.body": "Nothing lives at {id}.",
    "note.back": "← Back home",
    "tag.count": "{count} notes tagged “{tag}”.",
    "ui.toggleTheme": "Toggle dark mode",
    "ui.language": "Language",
  },
  zh: {
    "search.placeholder": "搜索笔记…",
    "nav.tags": "标签",
    "tags.all": "全部标签",
    "home.welcome": "欢迎",
    "home.subtitle": "本魔典共有 {count} 篇笔记。浏览侧边栏、搜索，或打开下方最近的笔记。",
    "home.recent": "最近",
    "search.none": "未找到笔记。",
    "note.notFound.title": "未找到笔记",
    "note.notFound.body": "{id} 处没有任何内容。",
    "note.back": "← 返回首页",
    "tag.count": "共有 {count} 篇笔记带有标签“{tag}”。",
    "ui.toggleTheme": "切换深色模式",
    "ui.language": "语言",
  },
};

export function translate(
  locale: string,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = STRINGS[locale] ?? STRINGS.en!;
  let s = dict[key] ?? STRINGS.en![key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

interface LocaleContextValue {
  locale: string;
  defaultLocale: string;
  setLocale: (locale: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  i18n?: I18nConfig;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  defaultLocale: "en",
  setLocale: () => {},
  t: (k) => translate("en", k),
});

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

function detectInitialLocale(i18n: I18nConfig | undefined, def: string): string {
  if (!i18n) return def;
  try {
    // `?lang=xx` overrides — handy for shareable links and headless checks.
    const q = new URLSearchParams(location.search).get("lang");
    if (q && i18n.locales.some((l) => l.code === q)) return q;
  } catch {
    /* ignore */
  }
  try {
    const saved = localStorage.getItem("grimoire-locale");
    if (saved && i18n.locales.some((l) => l.code === saved)) return saved;
  } catch {
    /* ignore */
  }
  try {
    const nav = (navigator.language || "").toLowerCase();
    const match = i18n.locales.find((l) => nav.startsWith(l.code.toLowerCase()));
    if (match) return match.code;
  } catch {
    /* ignore */
  }
  return def;
}

export function LocaleProvider({
  i18n,
  children,
}: {
  i18n?: I18nConfig;
  children: ComponentChildren;
}) {
  const defaultLocale = i18n?.defaultLocale ?? "en";
  const [locale, setLocaleState] = useState(() => detectInitialLocale(i18n, defaultLocale));

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
    try {
      localStorage.setItem("grimoire-locale", next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, defaultLocale, setLocale, t, i18n }}>
      {children}
    </LocaleContext.Provider>
  );
}
