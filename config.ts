// Site configuration. A plain default export so the engine can load it at
// runtime from any project directory. Edit freely — the server hot-reloads it.
export default {
  title: "My Grimoire",
  description: "An AI-authored notebook of charts, tables and ideas.",
  author: "Claude",
  theme: {
    // Palette: a built-in (grimoire | slate | paper | nord | carbon | sakura),
    // one of `presets` below, or a whole palette written inline here.
    preset: "grimoire",
    // An accent name (violet, indigo, sky, emerald, amber, rose, cyan …) or a hex value.
    accent: "violet",
    mode: "system", // light | dark | system
    font: "sans", // reading text: sans | serif | mono
    uiFont: "sans", // navigation chrome (sidebar + top bar); defaults to `font`
    categoryFont: "mono", // category labels + breadcrumbs; defaults to `uiFont`
    density: "comfortable", // compact | comfortable | spacious — scales the whole UI
    fontSize: 1, // 0.75 … 1.6 — reading text size only
    uiFontSize: 1, // 0.75 … 1.6 — navigation only
    categoryFontSize: 1, // 0.75 … 1.6 — category labels only
    radius: 1, // 0 (sharp) … 2 (very round)
    picker: true, // let readers pick their own theme

    // Your own palettes, offered alongside the built-ins. `neutral` is the
    // eleven greys every surface, border and piece of text is drawn from
    // (50 → 950); anything you omit comes from the preset you `extends`.
    presets: [
      {
        id: "moss",
        label: "Moss",
        hint: "Cool green-grey, low saturation.",
        extends: "paper",
        accent: "#4d7c0f",
        white: "oklch(99% 0.008 150)",
        neutral: [
          "oklch(97.6% 0.009 150)",
          "oklch(95.6% 0.012 150)",
          "oklch(91.4% 0.016 148)",
          "oklch(86% 0.019 146)",
          "oklch(70.4% 0.025 144)",
          "oklch(55.2% 0.027 142)",
          "oklch(44.4% 0.025 140)",
          "oklch(37.2% 0.023 138)",
          "oklch(27% 0.019 136)",
          "oklch(21.4% 0.016 134)",
          "oklch(15% 0.013 132)",
        ],
      },
    ],
  },
  // Order the top-level folders in the sidebar; unlisted ones follow A→Z.
  categoryOrder: ["guides", "data", "reference"],
  footer: "Built with Grimoire · MDX + Bun",
  // Multi-language: notes named `name.zh.mdx` are the Chinese variant of `name.mdx`.
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English" },
      { code: "zh", label: "中文" },
    ],
  },
};
