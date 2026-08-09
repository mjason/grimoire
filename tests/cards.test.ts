import { describe, expect, test } from "bun:test";
import { cardFilter, indexCards, parseCardFile } from "../src/runtime/cards";

const deck = (body: string) => parseCardFile(body, { file: "/cards/engine.md", deck: "engine" });

describe("card file parsing", () => {
  const cards = deck(`---
title: Engine boot
id: engine-boot
tags: [engine, runtime]
icon: 🚀
links: [guides/getting-started]
---

The engine reads config, scans notes, then serves.

---
title: CSS pipeline
tags: [engine]
---

Tailwind candidates are extracted from sources, see [[engine-boot]].
`);

  test("reads every card in the file", () => {
    expect(cards).toHaveLength(2);
  });

  test("keeps explicit ids and slugifies the rest", () => {
    expect(cards[0]!.id).toBe("engine-boot");
    expect(cards[1]!.id).toBe("css-pipeline");
  });

  test("carries frontmatter through", () => {
    expect(cards[0]!.title).toBe("Engine boot");
    expect(cards[0]!.tags).toEqual(["engine", "runtime"]);
    expect(cards[0]!.icon).toBe("🚀");
    expect(cards[0]!.deck).toBe("engine");
    expect(cards[0]!.file).toBe("/cards/engine.md");
  });

  test("keeps the body markdown, trimmed", () => {
    expect(cards[0]!.body).toBe("The engine reads config, scans notes, then serves.");
    expect(cards[1]!.body).toContain("[[engine-boot]]");
  });

  test("merges declared links with the ones written in the body", () => {
    expect(cards[0]!.links).toEqual(["guides/getting-started"]);
    expect(cards[1]!.links).toEqual(["engine-boot"]);
  });

  test("records source order for stable sorting", () => {
    expect(cards.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe("card file edge cases", () => {
  test("a thematic break inside a body is not a card boundary", () => {
    const cards = deck(`---
title: One
---

before

---

after
`);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.body).toContain("after");
  });

  test("leading prose before the first card is ignored", () => {
    const cards = deck(`Notes about the engine.

---
title: Real card
---

Body.
`);
    expect(cards.map((c) => c.title)).toEqual(["Real card"]);
  });

  test("a block without a title or id is not a card", () => {
    const cards = deck(`---
tags: [nope]
---

orphan body

---
title: Kept
---

body
`);
    expect(cards.map((c) => c.title)).toEqual(["Kept"]);
  });

  test("an id-only card falls back to a humanized title", () => {
    expect(deck(`---\nid: quick-note\n---\n\nbody\n`)[0]).toMatchObject({
      id: "quick-note",
      title: "Quick Note",
    });
  });

  test("malformed yaml is skipped instead of throwing", () => {
    expect(() => deck(`---\ntitle: [unclosed\n---\n\nbody\n`)).not.toThrow();
  });

  test("an empty file yields no cards", () => {
    expect(deck("")).toEqual([]);
  });

  test("normalizes a comma-separated tag string", () => {
    expect(deck(`---\ntitle: T\ntags: engine, runtime\n---\nbody\n`)[0]!.tags).toEqual([
      "engine",
      "runtime",
    ]);
  });

  test("normalizes a YAML date to a plain string", () => {
    expect(deck(`---\ntitle: T\ndate: 2026-08-09\n---\nbody\n`)[0]!.date).toBe("2026-08-09");
  });
});

describe("card indexing", () => {
  const cards = [
    ...parseCardFile(`---\ntitle: Dup\n---\nfirst\n`, { file: "/cards/a.md", deck: "a" }),
    ...parseCardFile(`---\ntitle: Dup\n---\nsecond\n`, { file: "/cards/b.md", deck: "b" }),
  ];

  test("disambiguates duplicate ids by deck", () => {
    const indexed = indexCards(cards);
    expect(indexed.map((c) => c.id)).toEqual(["dup", "b/dup"]);
  });

  test("is deterministic across runs", () => {
    expect(indexCards(cards).map((c) => c.id)).toEqual(indexCards(cards).map((c) => c.id));
  });
});

describe("card filtering", () => {
  const cards = indexCards([
    ...parseCardFile(`---\ntitle: Alpha\ntags: [engine]\n---\nabout tailwind\n`, {
      file: "/cards/a.md",
      deck: "core",
    }),
    ...parseCardFile(`---\ntitle: Beta\ntags: [notes]\n---\nabout mdx\n`, {
      file: "/cards/b.md",
      deck: "authoring",
    }),
  ]);

  test("filters by tag", () => {
    expect(cardFilter(cards, { tag: "engine" }).map((c) => c.title)).toEqual(["Alpha"]);
  });

  test("filters by deck", () => {
    expect(cardFilter(cards, { deck: "authoring" }).map((c) => c.title)).toEqual(["Beta"]);
  });

  test("filters by free text over title, body and tags", () => {
    expect(cardFilter(cards, { query: "mdx" }).map((c) => c.title)).toEqual(["Beta"]);
    expect(cardFilter(cards, { query: "engine" }).map((c) => c.title)).toEqual(["Alpha"]);
  });

  test("filters by explicit ids, preserving the requested order", () => {
    expect(cardFilter(cards, { ids: ["beta", "alpha"] }).map((c) => c.title)).toEqual([
      "Beta",
      "Alpha",
    ]);
  });

  test("an empty filter returns everything", () => {
    expect(cardFilter(cards, {})).toHaveLength(2);
  });
});
