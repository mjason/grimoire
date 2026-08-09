import { describe, expect, test } from "bun:test";
import { searchCards, searchNotes } from "../src/client/lib/notes";
import type { NoteMeta } from "../src/types";

const note = (over: Partial<NoteMeta>): NoteMeta => ({
  id: "x",
  segments: [],
  lang: "en",
  title: "X",
  tags: [],
  draft: false,
  order: 0,
  Component: (() => null) as unknown as NoteMeta["Component"],
  ...over,
});

const notes = [
  note({ id: "guides/authoring", title: "Authoring Notes", tags: ["guide"], description: "Frontmatter rules" }),
  note({ id: "data/sales", title: "Quarterly Sales", tags: ["finance"], description: "Revenue by region" }),
];

const cards = [
  { id: "engine-boot", title: "Boot sequence", tags: ["engine"], deck: "engine", excerpt: "Config, scan, serve." },
  { id: "card-format", title: "Card file format", tags: ["cards"], deck: "engine", excerpt: "YAML blocks." },
];

describe("note search", () => {
  test("matches titles, descriptions and tags", () => {
    expect(searchNotes(notes, "authoring").map((n) => n.id)).toEqual(["guides/authoring"]);
    expect(searchNotes(notes, "revenue").map((n) => n.id)).toEqual(["data/sales"]);
    expect(searchNotes(notes, "finance").map((n) => n.id)).toEqual(["data/sales"]);
  });

  test("requires every term to match", () => {
    expect(searchNotes(notes, "quarterly sales")).toHaveLength(1);
    expect(searchNotes(notes, "quarterly authoring")).toHaveLength(0);
  });

  test("ranks title hits above body hits", () => {
    const ranked = searchNotes(
      [note({ id: "a", title: "Charts", description: "" }), note({ id: "b", title: "Other", description: "charts" })],
      "charts",
    );
    expect(ranked.map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("an empty query matches nothing", () => {
    expect(searchNotes(notes, "   ")).toEqual([]);
  });
});

describe("card search", () => {
  test("searches titles, excerpts, tags and decks", () => {
    expect(searchCards(cards, "boot").map((c) => c.id)).toEqual(["engine-boot"]);
    expect(searchCards(cards, "yaml").map((c) => c.id)).toEqual(["card-format"]);
    expect(searchCards(cards, "engine").map((c) => c.id).sort()).toEqual(["card-format", "engine-boot"]);
  });

  test("is case-insensitive", () => {
    expect(searchCards(cards, "BOOT SEQUENCE").map((c) => c.id)).toEqual(["engine-boot"]);
  });

  test("an empty query matches nothing", () => {
    expect(searchCards(cards, "")).toEqual([]);
  });
});
