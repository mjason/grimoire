import { defineConfig } from "./src/config";

/**
 * Site-wide configuration. Edit freely — the build picks it up automatically.
 */
export default defineConfig({
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
});
