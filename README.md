# 📓 Grimoire

An **AI-oriented, MDX-based note system** that builds to a **single self-contained binary**.

Write notes in [MDX](https://mdxjs.com) (Markdown + components), drop interactive
charts and tables inline, organize by folders, and ship the whole thing as one
executable you can run anywhere — no Node, no `node_modules`, no internet.

```bash
bun install
bun run dev        # live-reloading authoring server  → http://localhost:4321
bun run compile    # build the single binary           → ./grimoire
./grimoire         # run it anywhere                    → http://localhost:4321
```

---

## Why Grimoire

- **MDX notes** — Markdown when you want prose, components when you want richness.
- **Interactive by default** — [Chart.js](https://www.chartjs.org) charts and a
  sortable / searchable / paginated `DataTable`, usable straight from MDX.
- **AI-friendly** — an AI can author a note by writing one `.mdx` file, and add a
  brand-new component by dropping one `.tsx` file. No registration, no wiring.
- **Folders are categories** — the sidebar mirrors your `notes/` directory tree.
- **Tags & search** — frontmatter tags become filterable; search is instant and
  client-side.
- **One binary** — `bun build --compile` embeds the entire app (HTML, JS, CSS, every
  note) into a ~100 MB standalone executable.
- **Dark mode, theming** — first-class dark mode and a configurable accent color.

## Project layout

Everything you author lives in three places. The engine lives in `src/` and you
rarely need to touch it.

```
.
├── config.ts          # site title, accent color, category order, footer
├── components/        # your custom components — auto-registered, usable in any note
│   └── StatCard.tsx
├── notes/             # your notes; folders become categories
│   ├── guides/
│   │   └── getting-started.mdx
│   └── data/
│       └── quarterly-sales.mdx
└── src/               # the engine (build pipeline, server, client, built-ins)
```

## Writing a note

Create `notes/<category>/<slug>.mdx`. The folder path becomes the category; the
file name becomes the URL slug. Add frontmatter, then write:

```mdx
---
title: Quarterly Sales
description: How we did this quarter.
tags: [finance, dashboard]
date: "2026-04-15"
icon: 📊
---

Revenue is up. Here's the breakdown.

<Chart type="bar" title="Revenue by region"
  data={{ labels: ["NA", "EU", "APAC"], datasets: [{ label: "Q2", data: [42, 31, 19] }] }} />

<Callout type="tip">No imports needed — components are always in scope.</Callout>
```

Scaffold one quickly:

```bash
bun run new data/quarterly-sales --title "Quarterly Sales" --tags finance,dashboard
```

### Built-in components

| Component | What it does |
|-----------|--------------|
| `<Chart>` | Interactive Chart.js chart (`line`, `bar`, `pie`, `doughnut`, `radar`, `polarArea`) |
| `<DataTable>` | Sortable, searchable, paginated table |
| `<Callout>` | Admonition box (`note`/`info`/`tip`/`success`/`warning`/`danger`) |
| `<Tabs>` / `<Tab>` | Tabbed content |
| `<Steps>` / `<Step>` | Numbered steps |
| `<CardGrid>` / `<Card>` | Linkable card grid |
| `<Badge>`, `<Kbd>` | Inline pills and keyboard keys |

See the **Component Gallery** note in the running app for live examples of every one.

## Adding a custom component

Drop a `.tsx` file in `components/`. Every named export is auto-registered and
becomes usable in any note — no import, no config:

```tsx
// components/StatCard.tsx
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div class="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div class="text-sm text-neutral-500">{label}</div>
      <div class="text-3xl font-bold">{value}</div>
    </div>
  );
}
```

```mdx
<StatCard label="Revenue" value="$1.2M" />
```

Components are [Preact](https://preactjs.com) components styled with Tailwind. Use
`preact/hooks` for interactivity, and the `var(--accent)` CSS variable for the theme
color.

## Configuration — `config.ts`

```ts
import { defineConfig } from "./src/config";

export default defineConfig({
  title: "My Grimoire",
  description: "An AI-authored notebook.",
  theme: { accent: "violet", defaultMode: "system" },
  categoryOrder: ["guides", "data", "reference"],
  footer: "Built with Grimoire",
});
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Authoring server with live reload |
| `bun run build` | Build `dist/` (JS + CSS + HTML) |
| `bun run compile` | Build, then compile the single binary `./grimoire` |
| `bun run start` | Serve `dist/` without compiling |
| `bun run verify` | SSR-render every note to catch errors |
| `bun run new <path>` | Scaffold a new note |

### The binary

```bash
bun run compile          # → ./grimoire  (self-contained)
./grimoire --port 8080   # choose a port
./grimoire --open        # open the browser automatically
```

The binary embeds everything. Copy it to any Linux box (or `--target=...` to
cross-compile for macOS/Windows) and run it — that's the whole deployment.

## How it works

1. `src/build.ts` scans `notes/` + `components/` + `config.ts` and generates a
   manifest that statically imports every note and component.
2. Bun bundles the Preact client, compiling `.mdx` → components via a bundler plugin
   (`src/mdx-plugin.ts`), with GFM, slugged headings and build-time syntax
   highlighting.
3. Tailwind generates the stylesheet.
4. `src/compile.ts` runs `bun build --compile` on `src/server.ts`, which imports the
   three built assets as embedded text — producing one executable.

Built with **Bun · MDX · Preact · Tailwind CSS · Chart.js**.
