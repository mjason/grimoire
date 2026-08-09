---
title: The engine is the binary
id: engine-is-the-binary
tags: [engine, architecture]
icon: ⚙️
links: [guides/getting-started]
---

Grimoire compiles to **one executable**. It carries no content: at startup it
reads a project directory — `config` + `notes/` + `components/` + `cards/` — and
serves it, compiling MDX on demand.

Consequence: upgrading the engine never touches your notes, and copying your
notes to another machine never needs a build step.

---
title: Boot sequence
id: engine-boot
tags: [engine, runtime]
icon: 🚀
---

1. Load `config.ts` (or `.json`/`.jsonc`).
2. Scan `notes/`, `components/`, `cards/` from disk.
3. Extract every link, resolve it, build the graph — see [[link-resolution]].
4. Generate CSS server-side from the theme + scanned class names.
5. Serve; watch the three directories and rebuild on change.

Nothing is precompiled: a note becomes JavaScript the first time someone asks
for it, then stays cached until a file changes.

---
title: Link resolution
id: link-resolution
tags: [links, graph]
icon: 🔗
---

`[[a target]]` is resolved in this order:

1. An explicit kind prefix — `note:x`, `card:x`.
2. An exact id (`guides/getting-started`), case-insensitively.
3. A **unique** basename, title or alias.

Ambiguity resolves to nothing on purpose: if two notes are both called `intro`,
the link is reported broken rather than guessing. See [[engine-boot]] for where
this happens.

---
title: Why cards are plain text
id: cards-are-text
tags: [cards, design]
icon: 🃏
links: [card-format]
---

A card is a paragraph of knowledge with a name. Keeping decks as ordinary
Markdown files means they diff cleanly, merge in git, and stay readable when the
tool that made them is gone.

No database, no index file, no ids to maintain by hand — a card's id is its
title unless you write one.

---
title: Card file format
id: card-format
tags: [cards, reference]
icon: 📐
---

One file is one deck. Each card begins with its own YAML block:

```md
---
title: Boot sequence
id: engine-boot
tags: [engine, runtime]
links: [guides/getting-started]
---

Body markdown, with [[wiki links]] like anywhere else.
```

A `---` only starts a card when it sits on its own line after a blank one,
closes within a few lines, parses as YAML, and declares a `title` or `id`.
Everything else — thematic breaks, tables, front matter-looking prose — stays
body text. Use `***` for a horizontal rule inside a card body.

---
title: Themes are just custom properties
id: theme-tokens
tags: [theme, css]
icon: 🎨
---

Tailwind v4 utilities read their values from theme variables, so re-declaring
`--color-neutral-*`, `--color-white`, `--radius-*` and `--font-body` on `:root`
re-tints every existing component at once.

That's the whole theme system: a preset is a neutral ramp plus defaults, and the
picker just regenerates that block of CSS and caches it for the next visit.

Which is why a palette can live in `config.ts` — it never needs to be compiled
into anything, only turned into eleven `--color-neutral-*` declarations.
