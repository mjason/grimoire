import { describe, expect, test } from "bun:test";
import {
  buildGraph,
  buildLinkIndex,
  extractLinks,
  localGraph,
  parseWikiLinks,
  resolveTarget,
  slugify,
} from "../src/runtime/links";

describe("wiki link parsing", () => {
  test("finds bare targets", () => {
    const refs = parseWikiLinks("See [[data/quarterly-sales]] for numbers.");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.target).toBe("data/quarterly-sales");
    expect(refs[0]!.alias).toBeUndefined();
  });

  test("supports an alias after a pipe", () => {
    const [ref] = parseWikiLinks("[[guides/getting-started|Start here]]");
    expect(ref!.target).toBe("guides/getting-started");
    expect(ref!.alias).toBe("Start here");
  });

  test("splits a heading anchor off the target", () => {
    const [ref] = parseWikiLinks("[[guides/authoring#frontmatter|Frontmatter]]");
    expect(ref!.target).toBe("guides/authoring");
    expect(ref!.anchor).toBe("frontmatter");
    expect(ref!.alias).toBe("Frontmatter");
  });

  test("ignores links inside fenced code blocks", () => {
    const src = ["before [[a]]", "```md", "[[not-a-link]]", "```", "after [[b]]"].join("\n");
    expect(parseWikiLinks(src).map((r) => r.target)).toEqual(["a", "b"]);
  });

  test("ignores links inside inline code", () => {
    expect(parseWikiLinks("write `[[a]]` like this, or [[b]]").map((r) => r.target)).toEqual(["b"]);
  });

  test("tolerates unclosed and empty brackets", () => {
    expect(parseWikiLinks("[[ ]] and [[unclosed and [[ok]]").map((r) => r.target)).toEqual(["ok"]);
  });

  test("trims whitespace inside the brackets", () => {
    expect(parseWikiLinks("[[  spaced/out  |  Label  ]]")[0]).toMatchObject({
      target: "spaced/out",
      alias: "Label",
    });
  });
});

describe("link extraction", () => {
  test("collects wiki links and in-app markdown hrefs, deduped", () => {
    const src = [
      "[[a]] and [[a|again]]",
      "[note](#/n/data/sales) plus [card](#/card/engine-boot)",
      "[external](https://example.com) is ignored",
    ].join("\n");
    expect(extractLinks(src)).toEqual(["a", "data/sales", "card:engine-boot"]);
  });

  test("returns an empty list for link-free prose", () => {
    expect(extractLinks("just words")).toEqual([]);
  });
});

describe("target resolution", () => {
  const entries = [
    { id: "guides/getting-started", kind: "note" as const, title: "Getting Started" },
    { id: "data/quarterly-sales", kind: "note" as const, title: "Quarterly Sales" },
    { id: "engine-boot", kind: "card" as const, title: "Engine Boot" },
    { id: "topics/ml/intro", kind: "note" as const, title: "Intro" },
    { id: "topics/nlp/intro", kind: "note" as const, title: "Intro" },
  ];
  const index = buildLinkIndex(entries);

  test("resolves an exact id", () => {
    expect(resolveTarget("guides/getting-started", index)).toBe("guides/getting-started");
  });

  test("resolves case-insensitively", () => {
    expect(resolveTarget("Guides/Getting-Started", index)).toBe("guides/getting-started");
  });

  test("resolves a unique basename", () => {
    expect(resolveTarget("quarterly-sales", index)).toBe("data/quarterly-sales");
  });

  test("refuses an ambiguous basename", () => {
    expect(resolveTarget("intro", index)).toBeNull();
  });

  test("resolves a title", () => {
    expect(resolveTarget("Getting Started", index)).toBe("guides/getting-started");
  });

  test("honours an explicit kind prefix", () => {
    expect(resolveTarget("card:engine-boot", index)).toBe("engine-boot");
    expect(resolveTarget("note:engine-boot", index)).toBeNull();
  });

  test("returns null for unknown targets", () => {
    expect(resolveTarget("nope", index)).toBeNull();
  });

  test("slugify is the shared normalizer", () => {
    expect(slugify("Getting  Started!")).toBe("getting-started");
    expect(slugify("引擎 启动")).toBe("引擎-启动");
  });
});

describe("graph building", () => {
  const entries = [
    { id: "a", kind: "note" as const, title: "A", tags: ["x"], links: ["b", "c"] },
    { id: "b", kind: "note" as const, title: "B", tags: ["x"], links: ["c", "c", "ghost"] },
    { id: "c", kind: "card" as const, title: "C", tags: [], links: [] },
    { id: "d", kind: "note" as const, title: "D", tags: [], links: [] },
  ];
  const graph = buildGraph(entries);

  test("emits one node per entry with its kind", () => {
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(graph.nodes.find((n) => n.id === "c")!.kind).toBe("card");
  });

  test("deduplicates repeated edges", () => {
    expect(graph.edges.filter((e) => e.source === "b" && e.target === "c")).toHaveLength(1);
  });

  test("never emits an edge to an unresolved target", () => {
    expect(graph.edges.some((e) => e.target === "ghost")).toBe(false);
    expect(graph.broken).toContainEqual({ source: "b", target: "ghost" });
  });

  test("drops self links", () => {
    const g = buildGraph([{ id: "solo", kind: "note", title: "Solo", tags: [], links: ["solo"] }]);
    expect(g.edges).toHaveLength(0);
  });

  test("records outgoing links and backlinks", () => {
    expect(graph.outgoing.a).toEqual(["b", "c"]);
    expect(graph.backlinks.c!.sort()).toEqual(["a", "b"]);
    expect(graph.backlinks.a ?? []).toEqual([]);
  });

  test("counts degree so the view can size nodes", () => {
    expect(graph.nodes.find((n) => n.id === "c")!.degree).toBe(2);
    expect(graph.nodes.find((n) => n.id === "d")!.degree).toBe(0);
  });

  test("localGraph returns a node's neighbourhood within a depth", () => {
    const near = localGraph(graph, "a", 1);
    expect(near.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(localGraph(graph, "d", 2).nodes.map((n) => n.id)).toEqual(["d"]);
  });

  test("localGraph is undirected — backlinks count as neighbours", () => {
    expect(localGraph(graph, "c", 1).nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
  });
});
