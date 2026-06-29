# 📓 Grimoire

An **AI-oriented, MDX-based note system**. Grimoire compiles to a **single binary
engine** — you bring a folder of notes + components, point the binary at it, and it
serves a live, interactive site. No Node, no `node_modules`, no internet.

```bash
# Build the engine binary (once)
bun install
bun run compile                 # → ./grimoire

# Run it against any project directory
./grimoire                      # serves ./notes + ./components in the cwd
./grimoire --root ~/my-notes --open
```

It's a **runtime engine**: it reads your `config` + `notes/` + `components/` from
disk when it starts, compiles MDX → components and `.tsx` → modules **on the fly**,
generates Tailwind CSS **server-side**, and hot-reloads as you edit. Update a note
and refresh — no rebuild of the binary.

---

## Why Grimoire

- **Bring your own content** — the binary is the engine; your notes/components live
  in a directory you choose. Edit and refresh; no recompile.
- **MDX notes** — Markdown when you want prose, components when you want richness.
- **Interactive by default** — [Chart.js](https://www.chartjs.org) charts and a
  sortable / searchable / paginated `DataTable`, usable straight from MDX.
- **AI-friendly** — author a note by writing one `.mdx` file; add a brand-new
  component by dropping one `.tsx` file. No registration, no wiring.
- **Folders are categories**, **tags & search**, **dark mode**, configurable accent.
- **One binary** — `bun build --compile` packs the whole engine (incl. the MDX
  compiler and Tailwind) into a ~100 MB standalone executable.

## Project layout

A Grimoire project is just a directory the engine reads at runtime:

```
my-notes/
├── config.ts          # (or config.json) site title, accent, category order
├── components/        # your custom components — usable in any note
│   └── StatCard.tsx
└── notes/             # your notes; folders become categories
    ├── guides/getting-started.mdx
    └── data/quarterly-sales.mdx
```

Paths are configurable: `--root`, `--notes`, `--components`, `--config`.

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

### Code blocks → code viewer

Every fenced code block is a code viewer: syntax-highlighted at build time, with a
copy button on hover. Add metadata after the language for more:

````mdx
```ts title="src/server.ts" showLineNumbers {2,4-6}
// filename header, language badge, line numbers, and lines 2 + 4-6 highlighted
```
````

| Meta | Effect |
|------|--------|
| ` ```ts ` | Syntax highlight + copy button |
| `title="file.ts"` | Filename header + language badge |
| `showLineNumbers` | Line-number gutter |
| `{2,4-6}` | Highlight lines 2 and 4–6 |

Very tall blocks collapse with a **Show more** control.

## Internationalization

Grimoire is multi-language out of the box. Enable it in `config.ts`:

```ts
i18n: {
  defaultLocale: "en",
  locales: [
    { code: "en", label: "English" },
    { code: "zh", label: "中文" },
  ],
},
```

Then a **language switcher** appears in the sidebar. The UI (search, headings…) is
translated, and notes are filtered to the active language.

Name a translated note with a language suffix — it shares the base slug, so
switching language keeps you on the same note:

```
notes/guides/getting-started.mdx       → English  (default)
notes/guides/getting-started.zh.mdx    → 中文
```

Untranslated notes stay visible in the default language, so you can translate
incrementally.

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

## Configuration

Loaded at runtime from the project root: `config.ts` / `config.js` (a default
export) or `config.json` / `config.jsonc`. **JSONC** — comments and trailing
commas — is supported. Every field is optional except a sensible `title`.

Full reference (`config.jsonc`):

```jsonc
{
  // ── Site ───────────────────────────────────────────────
  "title": "My Grimoire",              // browser tab + sidebar heading
  "description": "An AI-authored notebook.",
  "author": "Claude",
  "footer": "Built with Grimoire",     // small print in the sidebar footer

  // ── Theme ──────────────────────────────────────────────
  "theme": {
    // violet indigo blue sky cyan emerald green amber orange rose pink fuchsia
    "accent": "violet",
    "defaultMode": "system"            // light | dark | system
  },

  // ── Navigation ─────────────────────────────────────────
  // Top-level folder order in the sidebar; unlisted folders follow A→Z.
  "categoryOrder": ["guides", "data", "reference"],

  // ── Languages (omit for single-language) ───────────────
  "i18n": {
    "defaultLocale": "en",
    "locales": [
      { "code": "en", "label": "English" },
      { "code": "zh", "label": "中文" }   // note files: name.zh.mdx
    ]
  },

  // ── Server & paths (CLI flag / env var override these) ─
  "host": "localhost",   // 0.0.0.0 for LAN.  override: --host, HOST
  "port": 4321,          // auto-bumps if taken. override: --port, PORT
  "notes": "notes",      // notes dir (rel. to root).  override: --notes
  "components": "components" // components dir.        override: --components
}
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `title` | string | "Grimoire" | Tab + sidebar title |
| `description` | string | — | Meta description |
| `author` | string | — | — |
| `footer` | string | — | Sidebar footer text |
| `theme.accent` | string | "violet" | One of the 12 names above |
| `theme.defaultMode` | string | "system" | `light` / `dark` / `system` |
| `categoryOrder` | string[] | — | Sidebar folder order |
| `i18n.defaultLocale` | string | "en" | Fallback language |
| `i18n.locales` | `{code,label}[]` | — | Language switcher entries |
| `host` | string | "localhost" | Bind address; `--host`/`HOST` win |
| `port` | number | 4321 | `--port`/`PORT` win; auto-increments if busy |
| `notes` | string | "notes" | Notes dir; `--notes` wins |
| `components` | string | "components" | Components dir; `--components` wins |

Precedence for `host`/`port`/`notes`/`components`: **CLI flag → env var → config →
default**. Run several projects at once — each on its own port (it auto-bumps when
the chosen port is taken; the actual port shows in `grimoire status`).

## The binary / CLI

```bash
./grimoire [flags]              # run in the foreground (Ctrl+C to stop)
```

### Daemon mode (handy for agents / background use)

```bash
./grimoire start [flags]        # start in the background, returns immediately
./grimoire status               # is it running? show pid + URL
./grimoire restart [flags]      # restart in place
./grimoire stop                 # stop it
```

`start` writes state + logs to `<root>/.grimoire/`. Hot reload runs in the
background, so edits to notes/components are picked up live without a restart.
Pass the same `--root`/`--port`/etc. to address a specific project. Works on
Linux, macOS, and Windows.

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--root <dir>` | cwd | Project root |
| `--notes <dir>` | `<root>/notes` | Notes directory |
| `--components <dir>` | `<root>/components` | Components directory |
| `--config <file>` | `<root>/config.*` | Config file |
| `--host <ip>` | `localhost` | Interface to bind (`0.0.0.0` for LAN access) |
| `--port <n>` | `4321` | Port |
| `--open` | — | Open the browser |
| `--no-watch` | — | Disable hot reload |

The directory names and bind address can also be set in `config` — `notes`,
`components`, `host`, `port` — and the matching flag (or `HOST`/`PORT` env var)
overrides it. So `config.json: { "notes": "content" }` serves `./content`, and
`--notes other` still wins. Binding `0.0.0.0` prints the LAN URL.

Copy the binary to any machine and run it against your content — that's the whole
deployment. Cross-compile with `--target=` (see `bun run release:binaries`).

## Commands (for developing the engine)

| Command | Description |
|---------|-------------|
| `bun run engine` | Build the engine client bundle (`dist/engine/`) |
| `bun run dev` | Build engine + serve the cwd with hot reload |
| `bun run compile` | Build engine, then compile the binary `./grimoire` |
| `bun run verify` | Compile every note to catch errors |
| `bun run new <path>` | Scaffold a new note |

## How it works

Grimoire is a **runtime engine**, not a static bundler:

1. The engine client (Preact app + built-in components + Chart.js) is built **once**
   and embedded in the binary.
2. On start, the server scans your `notes/` + `components/` + `config`, and on each
   request **compiles MDX → a portable function-body** (the browser evaluates it with
   the preact runtime) and **bundles `.tsx` components** to ES modules (preact deps
   resolved via an import map).
3. **Tailwind runs server-side** (`tailwindcss`'s JS API) — it scans your content for
   class names and generates the CSS in-process; no CLI, no browser runtime.
4. A file watcher rebuilds and live-reloads on change.

Everything — the MDX compiler, Tailwind, the engine — is packed into the executable
by `bun build --compile`.

Built with **Bun · MDX · Preact · Tailwind CSS · Chart.js**.
