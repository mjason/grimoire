// Behaviour of the card box, driven through real files on disk — the same path
// the server takes when it scans a project's `cards/` directory.
import { afterAll, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feature, scenario } from "../bdd";
import { cardFilter, scanCards, type CardEntry } from "../../src/runtime/cards";
import { buildGraph } from "../../src/runtime/links";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Write a throwaway `cards/` directory and scan it. */
async function deck(files: Record<string, string>, locales: string[] = []): Promise<CardEntry[]> {
  const dir = await mkdtemp(join(tmpdir(), "grimoire-cards-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body, "utf8");
  }
  return scanCards(dir, locales);
}

feature("Card notes", () => {
  scenario("an author drops knowledge into a plain text file", async (s) => {
    let cards: CardEntry[] = [];

    await s.given("one markdown file holding three cards", async () => {
      cards = await deck({
        "engine.md": `---
title: Boot sequence
tags: [engine]
---

Config, scan, serve.

---
title: CSS pipeline
id: css-pipeline
tags: [engine, css]
---

Candidates are extracted from sources.

---
title: Release checklist
tags: [process]
---

Tag, build, publish.
`,
      });
    });
    await s.then("each card is its own entry", () => {
      expect(cards.map((c) => c.title)).toEqual(["Boot sequence", "CSS pipeline", "Release checklist"]);
    });
    await s.and("ids come from the title unless one is written", () => {
      expect(cards.map((c) => c.id)).toEqual(["boot-sequence", "css-pipeline", "release-checklist"]);
    });
    await s.and("they all belong to the deck named after the file", () => {
      expect(new Set(cards.map((c) => c.deck))).toEqual(new Set(["engine"]));
    });
  });

  scenario("prose that looks like a card boundary stays prose", async (s) => {
    let cards: CardEntry[] = [];

    await s.given("a card whose body contains a rule and a fenced example", async () => {
      cards = await deck({
        "notes.md": `---
title: Only card
---

Some text.

---

More text after a thematic break.

\`\`\`md
---
title: Not a card
---
\`\`\`

The end.
`,
      });
    });
    await s.then("exactly one card is found", () => {
      expect(cards).toHaveLength(1);
    });
    await s.and("the body survived intact", () => {
      expect(cards[0]!.body).toContain("The end.");
      expect(cards[0]!.body).toContain("Not a card");
    });
  });

  scenario("cards join the knowledge graph", async (s) => {
    let cards: CardEntry[] = [];

    await s.given("two cards, one linking the other and a note", async () => {
      cards = await deck({
        "core.md": `---
title: Alpha
links: [guides/getting-started]
---

Alpha refers to [[beta]].

---
title: Beta
---

Nothing here.
`,
      });
    });
    await s.then("declared and inline links are both collected", () => {
      expect(cards[0]!.links).toEqual(["guides/getting-started", "beta"]);
    });
    await s.and("the graph wires them up with a note", () => {
      const graph = buildGraph([
        ...cards.map((c) => ({ id: c.id, kind: "card" as const, title: c.title, links: c.links })),
        { id: "guides/getting-started", kind: "note" as const, title: "Getting Started", links: [] },
      ]);
      expect(graph.backlinks.beta).toEqual(["alpha"]);
      expect(graph.backlinks["guides/getting-started"]).toEqual(["alpha"]);
    });
  });

  scenario("a reader narrows a large box down", async (s) => {
    let cards: CardEntry[] = [];

    await s.given("two decks with overlapping tags", async () => {
      cards = await deck({
        "engine.md": `---\ntitle: Boot\ntags: [engine]\n---\n\nStarts the server.\n`,
        "authoring.md": `---\ntitle: Frontmatter\ntags: [authoring, yaml]\n---\n\nQuoted dates, please.\n`,
      });
    });
    await s.then("filtering by tag keeps only matching cards", () => {
      expect(cardFilter(cards, { tag: "engine" }).map((c) => c.title)).toEqual(["Boot"]);
    });
    await s.and("filtering by deck works the same way", () => {
      expect(cardFilter(cards, { deck: "authoring" }).map((c) => c.title)).toEqual(["Frontmatter"]);
    });
    await s.and("free text searches the body as well as the title", () => {
      expect(cardFilter(cards, { query: "quoted dates" }).map((c) => c.title)).toEqual(["Frontmatter"]);
    });
  });

  scenario("a deck is translated without forking its ids", async (s) => {
    let cards: CardEntry[] = [];

    await s.given("an English deck and its Chinese sibling", async () => {
      cards = await deck(
        {
          "engine.md": `---\ntitle: Boot sequence\nid: engine-boot\n---\n\nConfig, scan, serve.\n`,
          "engine.zh.md": `---\ntitle: 启动流程\nid: engine-boot\n---\n\n读配置、扫描、提供服务。\n`,
        },
        ["en", "zh"],
      );
    });
    await s.then("both variants keep the same id", () => {
      expect(cards.map((c) => c.id)).toEqual(["engine-boot", "engine-boot"]);
    });
    await s.and("the translation is tagged with its language", () => {
      expect(cards.map((c) => c.lang)).toEqual([undefined, "zh"]);
    });
    await s.and("they share a deck, so the sidebar doesn't split", () => {
      expect(new Set(cards.map((c) => c.deck))).toEqual(new Set(["engine"]));
    });
  });

  scenario("two decks that pick the same id don't collide", async (s) => {
    let cards: CardEntry[] = [];

    await s.given("two decks each defining a card called Overview", async () => {
      cards = await deck({
        "a-deck.md": `---\ntitle: Overview\n---\n\nFirst.\n`,
        "b-deck.md": `---\ntitle: Overview\n---\n\nSecond.\n`,
      });
    });
    await s.then("the first keeps the plain id and the second is namespaced", () => {
      expect(cards.map((c) => c.id)).toEqual(["overview", "b-deck/overview"]);
    });
  });

  scenario("a draft card stays out of the box", async (s) => {
    let cards: CardEntry[] = [];

    await s.given("a deck with one card marked draft", async () => {
      cards = await deck({
        "wip.md": `---\ntitle: Ready\n---\n\nShip it.\n\n---\ntitle: Half-baked\ndraft: true\n---\n\nLater.\n`,
      });
    });
    await s.then("only the finished card is published", () => {
      expect(cards.map((c) => c.title)).toEqual(["Ready"]);
    });
  });

  scenario("an empty or missing cards directory is not an error", async (s) => {
    await s.given("a project with no cards at all", async () => {
      expect(await scanCards("/definitely/not/a/directory")).toEqual([]);
    });
    await s.then("scanning an empty directory is equally quiet", async () => {
      expect(await deck({})).toEqual([]);
    });
  });
});
