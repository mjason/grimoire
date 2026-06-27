# Grimoire — guide for AI authors

This repo is an MDX note system that compiles to a single binary. As an AI, you
mostly do two things: **write notes** (`.mdx` in `notes/`) and **add components**
(`.tsx` in `components/`). This file is the contract — follow it and the build
stays green.

## Golden rules

- **Notes are MDX.** Markdown + JSX. Components are **globally in scope** — NEVER
  write `import` statements inside a `.mdx` note.
- **Folders are categories.** `notes/data/sales.mdx` → category "data", slug
  `data/sales`. An `index.mdx` represents its folder.
- **Frontmatter is YAML** between `---` fences. Always quote dates: `date: "2026-06-27"`.
- After editing, run `bun run build` then `bun run verify` to confirm everything
  renders. `bun run compile` produces the binary `./grimoire`.

## Frontmatter fields

```yaml
---
title: string            # required-ish (falls back to humanized filename)
description: string       # one line, shown under the title
tags: [lowercase, list]   # filterable in the UI
date: "YYYY-MM-DD"        # quoted string
icon: 📊                  # one emoji
order: 0                  # lower sorts first within its category
draft: true               # optional — hides the note
---
```

## Built-in components (exact props)

```mdx
<Callout type="note|info|tip|success|warning|danger" title="optional">…</Callout>

<Chart type="line|bar|pie|doughnut|radar|polarArea" title="…" caption="…" height={320}
  data={{ labels: ["Q1","Q2"], datasets: [{ label: "2026", data: [12, 19] }] }} />

<DataTable searchable pageSize={10} caption="…"
  data={[{ name: "Ada", score: 99 }]}
  columns={["name","score"]} />   {/* columns optional; inferred if omitted */}

<Tabs><Tab label="bun">…</Tab><Tab label="npm">…</Tab></Tabs>

<Steps><Step title="Install">…</Step><Step title="Run">…</Step></Steps>

<CardGrid columns={3}>
  <Card title="Guide" icon="📘" note="guides/authoring">Open the guide</Card>
</CardGrid>

<Badge color="#7c3aed">new</Badge>   <Kbd>Ctrl</Kbd>
```

## Custom components shipped in `components/`

```mdx
<StatCard label="Revenue" value="$1.2M" delta="+12%" trend="up|down|flat" />

<Timeline>
  <TimelineItem title="Founded" date="2024" icon="✨">First commit.</TimelineItem>
</Timeline>

<ProgressBar label="Coverage" value={72} max={100} color="#7c3aed" />

<Quiz question="2 + 2 = ?" options={["3","4","5"]} answer={1}
  explanation="Basic arithmetic." />
```

## Markdown

GitHub-flavoured: tables, task lists (`- [x]`), blockquotes, `**bold**`, links.
**Always put a language on fenced code blocks** (` ```ts `, ` ```python `, ` ```bash `)
so they get syntax-highlighted at build time.

Do **not** start a note with an `# H1` — the title from frontmatter is rendered for
you. Begin with a short intro paragraph, then use `##`/`###`.

### Code viewer metadata

Add metadata after the language to enrich a code block:

````md
```ts title="src/server.ts" showLineNumbers {2,4-6}
…code…
```
````

- `title="file.ts"` → filename header + language badge
- `showLineNumbers` → line-number gutter
- `{2,4-6}` → highlight lines 2 and 4–6

## Translations

To add a Chinese (or other-locale) version of a note, create a sibling file with a
language suffix matching a `config.ts` locale code:

```
notes/guides/getting-started.mdx       # English (default)
notes/guides/getting-started.zh.mdx    # 中文 — same base slug
```

Both share the slug `guides/getting-started`, so the language switcher swaps between
them in place. When translating: translate prose, headings, frontmatter
`title`/`description`/`tags`, and human-readable prop values (chart labels, callout
titles…), but **keep component/prop names, data shapes, numbers and code-fence meta
unchanged**. Don't add a `lang` field — the filename suffix is authoritative.

## Adding a component

Create `components/MyThing.tsx`. It's a **Preact** component (not React):

```tsx
import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

export function MyThing({ children }: { children?: ComponentChildren }) {
  return <div class="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">{children}</div>;
}
```

- Every **named export** is auto-registered (the file's PascalCase name maps to a
  default export, if any).
- Be **SSR-safe**: don't touch `window`/`document`/`localStorage` at module top level
  or during render — only inside `useEffect` or event handlers (`bun run verify`
  string-renders every note and will catch this).
- Style with Tailwind; use `var(--accent)` (e.g. `text-[var(--accent)]`) for the
  theme color; support light **and** dark mode (`dark:` variants).

## Where things are

- `config.ts` — site title, accent, category order.
- `notes/` — your notes (this is where most work happens).
- `components/` — your components.
- `src/` — the engine. `build.ts`, `server.ts`, `client/`. Touch only to extend the
  framework itself.
