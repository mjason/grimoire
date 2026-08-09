# 📓 Grimoire

An **AI-oriented, MDX-based note system**. Grimoire compiles to a **single binary
engine** — you bring a folder of notes, cards and components, point the binary at
it, and it serves a live, interactive site with wiki links, a knowledge graph and a
theme each reader can make their own. No Node, no `node_modules`, no internet.

```bash
# Build the engine binary (once)
bun install
bun run compile                 # → ./grimoire

# Run it against any project directory
./grimoire                      # serves ./notes + ./components in the cwd
./grimoire --root ~/my-notes --open
```

It's a **runtime engine**: it reads your `config` + `notes/` + `components/` +
`cards/` from disk when it starts, compiles MDX → components and `.tsx` → modules **on the fly**,
generates Tailwind CSS **server-side**, and hot-reloads as you edit. Update a note
and refresh — no rebuild of the binary.

---

## Why Grimoire

- **Bring your own content** — the binary is the engine; your notes/components live
  in a directory you choose. Edit and refresh; no recompile.
- **MDX notes** — Markdown when you want prose, components when you want richness.
- **Interactive by default** — [Chart.js](https://www.chartjs.org) charts, a
  sortable / searchable / paginated `DataTable`, and [Mermaid](https://mermaid.js.org)
  diagrams (` ```mermaid ` fenced blocks), usable straight from MDX.
- **AI-friendly** — author a note by writing one `.mdx` file; add a brand-new
  component by dropping one `.tsx` file. No registration, no wiring.
- **Shareable single-file export** — the **Download HTML** button on any note bakes
  it into one self-contained `.html` file (styles, components, charts, and any
  Mermaid diagrams inlined) that renders offline, no server needed.
- **Bidirectional links & a knowledge graph** — write `[[wiki links]]`; backlinks,
  the Connections panel and the `#/graph` view are derived for you.
- **Card notes** — a plain-text Zettelkasten in `cards/`: one file per deck, one
  YAML block per card, browsable at `#/cards` and wired into the same graph.
- **A theme system, per site *and* per reader** — six palette presets plus accent,
  light/dark, typeface, roundness, density and reading size. Define your own
  palettes in `config.ts` (no rebuild); readers pick theirs, applied before first paint.
- **Folders are categories**, **tags & search**, **dark mode**.
- **One binary** — `bun build --compile` packs the whole engine (incl. the MDX
  compiler and Tailwind) into a ~100 MB standalone executable.

## Project layout

A Grimoire project is just a directory the engine reads at runtime:

```
my-notes/
├── config.ts          # (or config.json) site title, theme, category order
├── components/        # your custom components — usable in any note
│   └── StatCard.tsx
├── cards/             # card decks — one file per deck, many cards per file
│   └── engine.md
└── notes/             # your notes; folders become categories
    ├── guides/getting-started.mdx
    └── data/quarterly-sales.mdx
```

Paths are configurable: `--root`, `--notes`, `--components`, `--cards`, `--config`.

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

## Links, backlinks & the knowledge graph

Write a double-bracket link anywhere in a note or card:

```mdx
See [[guides/authoring]] for frontmatter rules.
Start with [[guides/getting-started|the quick start]].
Jump straight to [[guides/authoring#frontmatter|the frontmatter section]].
```

Targets resolve in this order: an explicit `note:`/`card:` prefix, the exact id,
then a **unique** basename, title or alias. Ambiguity is never guessed — if two
notes share a name the link is reported broken, and `verify` tells you where.
Links inside fenced code blocks and `` `inline code` `` are ignored.

From that, you get for free:

- a **Connections** panel under every note and card — what it links to, what
  links back, and a local graph;
- **`#/graph`** — the whole map. Drag to pan, scroll to zoom, click to open.
  The layout is deterministic, so it looks the same every visit;
- **`<Graph note="…" depth={2} />`**, **`<Backlinks />`** and **`<Links />`** to
  drop any of those pieces into a note yourself.

A note can also join the graph from its frontmatter — handy for index pages:

```yaml
links: [guides/authoring, engine-boot]
aliases: [Bibliography]
```

## Card notes

Cards are the small end of the scale: one idea, one name, plain text. One file in
`cards/` is one **deck**; each card is separated by its own YAML block.

```md
---
title: Boot sequence
id: engine-boot          # optional — defaults to a slug of the title
tags: [engine, runtime]
links: [guides/getting-started]
---

The engine reads config, scans notes, then serves — see [[link-resolution]].

---
title: CSS pipeline
---

The next card.
```

A `---` only starts a card when it sits on its own line after a blank one, closes
within a few lines, parses as YAML, and declares a `title` or `id` — so thematic
breaks, tables and frontmatter-looking examples stay body text.

Browse them at **`#/cards`** (searchable, filterable by deck and tag), or pull a
filtered set into any note:

```mdx
<Cards tag="engine" columns={2} />
<Cards ids="engine-boot,card-format" expand />
```

Cards are first-class graph nodes, translate like notes (`engine.zh.md`), and
need no database, index file or hand-maintained ids.

## Theming

The site's look is data, not code — and so is the reader's. `config.theme` sets
the default; the palette button in the sidebar lets each reader layer their own
choices on top (stored locally, applied before first paint, `Reset` to go back).

| Preset | Feel |
| --- | --- |
| `grimoire` | Pure neutral greys — the original look |
| `slate` | Cool blue-grey |
| `paper` | Warm sepia with a serif body, for long reading |
| `nord` | Frosty blue surfaces, cyan accent |
| `carbon` | High contrast, near-square corners |
| `sakura` | Soft warm blush, generously rounded |

On top of the preset: **accent** (a name or any hex), **mode**, **typeface**
(sans/serif/mono), **density**, **reading size** and **corner radius**.

### Defining your own palette

A palette is the eleven greys every surface, border and piece of text is drawn
from. Declare one in `config.ts` and it appears in the picker beside the
built-ins — **no rebuild, the server hot-reloads it**:

```ts title="config.ts"
theme: {
  preset: "moss",
  presets: [
    {
      id: "moss",
      label: "Moss",
      extends: "paper",              // inherit anything you don't set
      accent: "#4d7c0f",
      white: "oklch(99% 0.008 150)", // optional: what `bg-white` becomes
      neutral: [                     // required: 11 colours, 50 → 950
        "oklch(97.6% 0.009 150)", "oklch(95.6% 0.012 150)", "oklch(91.4% 0.016 148)",
        "oklch(86% 0.019 146)",   "oklch(70.4% 0.025 144)", "oklch(55.2% 0.027 142)",
        "oklch(44.4% 0.025 140)", "oklch(37.2% 0.023 138)", "oklch(27% 0.019 136)",
        "oklch(21.4% 0.016 134)", "oklch(15% 0.013 132)",
      ],
    },
  ],
}
```

| | |
|---|---|
| All 11 shades or nothing | A short or malformed ramp is refused and logged — it never half-applies |
| `neutral` shape | An ordered array, or an object keyed by shade |
| Re-tune a built-in | Reuse its id: `{ id: "paper", accent: "#111" }` keeps Paper's ramp |
| One-off | Skip `presets` and write the palette straight into `preset: { … }` |
| Both modes | One ramp serves both: light reads 50–200, dark reads 800–950 |

### Typography

Three scopes, each with its own typeface and size multiplier — all from
`config.ts`:

| Setting | Applies to | Falls back to |
|---|---|---|
| `font` / `fontSize` | Reading text (`.prose`) | — / `1` |
| `uiFont` / `uiFontSize` | Navigation chrome: sidebar, top bar | `font` / `1` |
| `categoryFont` / `categoryFontSize` | Category labels, section headings, breadcrumbs | `uiFont` / `1` |

```ts title="config.ts"
theme: {
  font: "serif",        // long-form reading
  uiFont: "sans",       // but keep the navigation crisp
  categoryFont: "mono", // and set labels in a display face
  fontSize: 1.1,
}
```

Because each falls back to the one above, setting `font` alone keeps the whole
site consistent; override only what you want to differ.

In markup they're two classes you can reuse in your own components:
`grimoire-nav` (navigation typeface, `--ui-scale`) and `grimoire-category`
(category typeface, uppercase, `--category-scale`).

### Size vs density

`density` is a different axis: it scales the **root font size**, and with it the
whole rem-based layout — text, padding, the sidebar, everything. The `*FontSize`
knobs scale one scope each.

All of them are emitted as ratios (`html { font-size: 93.75% }`), never pixels, so
a reader who raised their browser's default text size keeps it.

### Why it's this small

Tailwind v4 utilities read their values from theme variables, so a preset is just
a block of custom properties — `--color-neutral-*`, `--color-white`, `--radius-*`,
`--font-body`, `--accent` — re-declared on `:root`. Every component re-tints at
once. **Style your own components with `neutral` utilities and `var(--accent)`
rather than hard-coded colours** and they inherit every palette, including ones
added later, for free.

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
    // grimoire | slate | paper | nord | carbon | sakura
    "preset": "grimoire",
    // violet indigo blue sky cyan teal emerald green lime amber orange red
    // rose pink fuchsia purple slate — or any hex value, e.g. "#0ea5e9"
    "accent": "violet",
    "mode": "system",                  // light | dark | system
    "font": "sans",                    // reading text: sans | serif | mono
    "uiFont": "sans",                  // navigation chrome (defaults to `font`)
    "categoryFont": "mono",            // category labels (defaults to `uiFont`)
    "density": "comfortable",          // compact | comfortable | spacious (whole UI)
    "fontSize": 1,                     // 0.75 … 1.6 (reading text only)
    "uiFontSize": 1,                   // 0.75 … 1.6 (navigation only)
    "categoryFontSize": 1,             // 0.75 … 1.6 (category labels only)
    "radius": 1,                       // 0 (sharp) … 2 (very round)
    "picker": true,                    // let readers choose their own theme
    // Your own palettes, offered next to the built-ins. See "Theming".
    "presets": [{ "id": "moss", "extends": "paper", "neutral": ["…11 colours…"] }]
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
  "components": "components", // components dir.       override: --components
  "cards": "cards"       // card decks dir.            override: --cards
}
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `title` | string | "Grimoire" | Tab + sidebar title |
| `description` | string | — | Meta description |
| `author` | string | — | — |
| `footer` | string | — | Sidebar footer text |
| `theme.preset` | string | "grimoire" | Palette preset (see above) |
| `theme.accent` | string | preset's | An accent name or any hex value |
| `theme.mode` | string | "system" | `light` / `dark` / `system` (`defaultMode` still works) |
| `theme.font` | string | preset's | Reading text: `sans` / `serif` / `mono` |
| `theme.uiFont` | string | `font` | Navigation chrome typeface |
| `theme.categoryFont` | string | `uiFont` | Category label typeface |
| `theme.density` | string | "comfortable" | `compact` / `comfortable` / `spacious`; scales the whole UI |
| `theme.fontSize` | number | 1 | Reading text size, 0.75–1.6; `.prose` only |
| `theme.uiFontSize` | number | 1 | Navigation size, 0.75–1.6 |
| `theme.categoryFontSize` | number | 1 | Category label size, 0.75–1.6 |
| `theme.presets` | object[] | — | Your own palettes (id, label, extends, accent, white, neutral[11]) |
| `theme.radius` | number | preset's | Corner radius multiplier, 0–2 |
| `theme.picker` | boolean | `true` | Show the reader's theme picker |
| `categoryOrder` | string[] | — | Sidebar folder order |
| `i18n.defaultLocale` | string | "en" | Fallback language |
| `i18n.locales` | `{code,label}[]` | — | Language switcher entries |
| `host` | string | "localhost" | Bind address; `--host`/`HOST` win |
| `port` | number | 4321 | `--port`/`PORT` win; auto-increments if busy |
| `notes` | string | "notes" | Notes dir; `--notes` wins |
| `components` | string | "components" | Components dir; `--components` wins |
| `cards` | string | "cards" | Card decks dir; `--cards` wins |

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

### Checking notes (for CI / agents)

```bash
./grimoire verify               # browser-free: notes + cards compile, Mermaid parses,
                                # and every unresolved [[wiki link]] is listed
./grimoire check                # thorough: render every page headless, report any error
```

Both exit non-zero and print the offending note + message, so an AI/CI can
self-check instead of eyeballing the browser. `verify` needs nothing extra.
`check` renders each note with Bun's built-in headless browser (`Bun.WebView`)
and catches component exceptions, Mermaid failures, and console errors — no
Playwright, no separate download, so it works straight from the binary. Zero
extra deps on macOS (WKWebView); on Linux/Windows it drives Chromium
(auto-detected, or set `GRIMOIRE_CHROMIUM`).

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--root <dir>` | cwd | Project root |
| `--notes <dir>` | `<root>/notes` | Notes directory |
| `--components <dir>` | `<root>/components` | Components directory |
| `--cards <dir>` | `<root>/cards` | Card decks directory |
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
| `bun run verify` | Compile every note + card, list broken links |
| `bun run test` | Unit + Given/When/Then specs (`bun test`) |
| `bun run test:e2e` | Browser end-to-end suite (needs Chromium) |
| `bun run new <path>` | Scaffold a new note |
| `bun run new --card <deck> --title "…"` | Append a card to a deck |

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
