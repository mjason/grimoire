// Site configuration. A plain default export so the engine can load it at
// runtime from any project directory. Edit freely — the server hot-reloads it.
export default {
  title: "My Grimoire",
  description: "An AI-authored notebook of charts, tables and ideas.",
  author: "Claude",
  theme: {
    accent: "violet", // violet | indigo | sky | emerald | amber | rose | cyan …
    defaultMode: "system", // light | dark | system
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
