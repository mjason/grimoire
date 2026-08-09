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
    "note.download": "Download HTML",
    "note.download.hint": "Download this note as a self-contained HTML file you can share",
    "tag.count": "{count} notes tagged “{tag}”.",
    "ui.toggleTheme": "Toggle dark mode",
    "ui.language": "Language",
    // Theme picker
    "theme.title": "Appearance",
    "theme.preset": "Palette",
    "theme.accent": "Accent",
    "theme.custom": "Custom colour",
    "theme.mode": "Mode",
    "theme.mode.light": "Light",
    "theme.mode.dark": "Dark",
    "theme.mode.system": "Auto",
    "theme.font": "Typeface",
    "theme.font.sans": "Sans",
    "theme.font.serif": "Serif",
    "theme.font.mono": "Mono",
    "theme.density": "Density",
    "theme.density.compact": "Compact",
    "theme.density.comfortable": "Normal",
    "theme.density.spacious": "Roomy",
    "theme.fontSize": "Text size",
    "theme.radius": "Corners",
    "theme.reset": "Reset",
    // Links + graph
    "nav.graph": "Graph",
    "nav.cards": "Cards",
    "links.title": "Connections",
    "links.outgoing": "Links to",
    "links.backlinks": "Linked from",
    "links.none": "No outgoing links yet.",
    "links.noBacklinks": "Nothing links here yet.",
    "graph.title": "Knowledge graph",
    "graph.local": "Local graph",
    "graph.empty": "No links to draw yet.",
    "graph.reset": "Reset view",
    "graph.legend.note": "Note",
    "graph.legend.card": "Card",
    "graph.stats": "{nodes} entries · {edges} links",
    "graph.orphans": "{count} unlinked",
    "graph.broken": "{count} broken links",
    // Cards
    "cards.title": "Cards",
    "cards.count": "{count} knowledge cards.",
    "cards.search": "Search cards…",
    "cards.none": "No cards match.",
    "cards.allDecks": "All decks",
    "card.notFound.title": "Card not found",
    "card.back": "← All cards",
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
    "note.download": "下载 HTML",
    "note.download.hint": "将本篇笔记下载为可分享的单文件 HTML",
    "tag.count": "共有 {count} 篇笔记带有标签“{tag}”。",
    "ui.toggleTheme": "切换深色模式",
    "ui.language": "语言",
    // 主题
    "theme.title": "外观",
    "theme.preset": "配色",
    "theme.accent": "强调色",
    "theme.custom": "自定义颜色",
    "theme.mode": "模式",
    "theme.mode.light": "浅色",
    "theme.mode.dark": "深色",
    "theme.mode.system": "跟随系统",
    "theme.font": "字体",
    "theme.font.sans": "无衬线",
    "theme.font.serif": "衬线",
    "theme.font.mono": "等宽",
    "theme.density": "密度",
    "theme.density.compact": "紧凑",
    "theme.density.comfortable": "适中",
    "theme.density.spacious": "宽松",
    "theme.fontSize": "正文字号",
    "theme.radius": "圆角",
    "theme.reset": "恢复默认",
    // 双链与图谱
    "nav.graph": "图谱",
    "nav.cards": "卡片",
    "links.title": "关联",
    "links.outgoing": "链接到",
    "links.backlinks": "被链接",
    "links.none": "暂无出链。",
    "links.noBacklinks": "暂时没有笔记链接到这里。",
    "graph.title": "知识图谱",
    "graph.local": "局部图谱",
    "graph.empty": "暂时没有可绘制的链接。",
    "graph.reset": "重置视图",
    "graph.legend.note": "笔记",
    "graph.legend.card": "卡片",
    "graph.stats": "{nodes} 个条目 · {edges} 条链接",
    "graph.orphans": "{count} 个孤立条目",
    "graph.broken": "{count} 条失效链接",
    // 卡片
    "cards.title": "卡片盒",
    "cards.count": "共有 {count} 张知识卡片。",
    "cards.search": "搜索卡片…",
    "cards.none": "没有匹配的卡片。",
    "cards.allDecks": "全部卡组",
    "card.notFound.title": "未找到卡片",
    "card.back": "← 全部卡片",
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
