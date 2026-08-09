// Behaviour of the bidirectional link system: what an author writes, what the
// graph makes of it, and what shows up as a backlink.
import { expect } from "bun:test";
import { feature, scenario } from "../bdd";
import { buildGraph, extractLinks, localGraph, type GraphEntry, type LinkGraph } from "../../src/runtime/links";

/** A tiny project: sources in, resolved graph out — exactly what the server does. */
function project(docs: { id: string; kind?: "note" | "card"; title: string; source: string }[]): LinkGraph {
  const entries: GraphEntry[] = docs.map((doc) => ({
    id: doc.id,
    kind: doc.kind ?? "note",
    title: doc.title,
    links: extractLinks(doc.source),
  }));
  return buildGraph(entries);
}

feature("Bidirectional links", () => {
  scenario("a link written in one note appears as a backlink in the other", async (s) => {
    let graph!: LinkGraph;

    await s.given("two notes, one mentioning the other", () => {
      graph = project([
        { id: "guides/authoring", title: "Authoring", source: "See [[guides/getting-started]]." },
        { id: "guides/getting-started", title: "Getting Started", source: "Welcome." },
      ]);
    });
    await s.then("the first note links out", () => {
      expect(graph.outgoing["guides/authoring"]).toEqual(["guides/getting-started"]);
    });
    await s.and("the second note gains a backlink it never wrote", () => {
      expect(graph.backlinks["guides/getting-started"]).toEqual(["guides/authoring"]);
    });
  });

  scenario("authors can link by title or file name", async (s) => {
    let graph!: LinkGraph;

    await s.given("a note referred to three different ways", () => {
      graph = project([
        { id: "hub", title: "Hub", source: "[[data/quarterly-sales]] [[quarterly-sales]] [[Quarterly Sales]]" },
        { id: "data/quarterly-sales", title: "Quarterly Sales", source: "Numbers." },
      ]);
    });
    await s.then("all three land on the same note, once", () => {
      expect(graph.outgoing.hub).toEqual(["data/quarterly-sales"]);
      expect(graph.edges).toHaveLength(1);
    });
  });

  scenario("an ambiguous name is reported, not guessed", async (s) => {
    let graph!: LinkGraph;

    await s.given("two notes that share a file name", () => {
      graph = project([
        { id: "hub", title: "Hub", source: "Read [[intro]]." },
        { id: "topics/ml/intro", title: "ML Intro", source: "" },
        { id: "topics/nlp/intro", title: "NLP Intro", source: "" },
      ]);
    });
    await s.then("no edge is invented", () => {
      expect(graph.edges).toHaveLength(0);
    });
    await s.and("the author is told which link failed", () => {
      expect(graph.broken).toContainEqual({ source: "hub", target: "intro" });
    });
  });

  scenario("documenting the syntax doesn't create links", async (s) => {
    let graph!: LinkGraph;

    await s.given("a note whose examples are inside code", () => {
      graph = project([
        {
          id: "guides/links",
          title: "Links",
          source: ["Write `[[target]]` like so:", "```md", "[[guides/getting-started]]", "```", "Real: [[real]]"].join("\n"),
        },
        { id: "guides/getting-started", title: "Getting Started", source: "" },
        { id: "real", title: "Real", source: "" },
      ]);
    });
    await s.then("only the link outside the code block counts", () => {
      expect(graph.outgoing["guides/links"]).toEqual(["real"]);
    });
  });

  scenario("notes and cards share one graph", async (s) => {
    let graph!: LinkGraph;

    await s.given("a note linking a card, and the card linking back to another note", () => {
      graph = project([
        { id: "guides/theming", title: "Theming", source: "The trick is [[theme-tokens]]." },
        { id: "theme-tokens", kind: "card", title: "Theme tokens", source: "See [[guides/authoring]]." },
        { id: "guides/authoring", title: "Authoring", source: "" },
      ]);
    });
    await s.then("the card is a first-class node", () => {
      expect(graph.nodes.find((n) => n.id === "theme-tokens")!.kind).toBe("card");
    });
    await s.and("links cross the note/card boundary in both directions", () => {
      expect(graph.backlinks["theme-tokens"]).toEqual(["guides/theming"]);
      expect(graph.backlinks["guides/authoring"]).toEqual(["theme-tokens"]);
    });
  });

  scenario("a reader explores the neighbourhood of one note", async (s) => {
    let graph!: LinkGraph;

    await s.given("a small web of notes", () => {
      graph = project([
        { id: "a", title: "A", source: "[[b]]" },
        { id: "b", title: "B", source: "[[c]]" },
        { id: "c", title: "C", source: "" },
        { id: "far", title: "Far", source: "" },
      ]);
    });
    await s.when("they open the local graph one hop out from B", () => {
      expect(localGraph(graph, "b", 1).nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    });
    await s.then("unrelated notes stay out of the picture", () => {
      expect(localGraph(graph, "b", 3).nodes.map((n) => n.id)).not.toContain("far");
    });
  });

  scenario("a link to a note that doesn't exist yet is surfaced", async (s) => {
    let graph!: LinkGraph;

    await s.given("a note referencing something unwritten", () => {
      graph = project([{ id: "plan", title: "Plan", source: "TODO: write [[future/idea]]." }]);
    });
    await s.then("the graph stays clean", () => {
      expect(graph.edges).toHaveLength(0);
    });
    await s.and("verify has something to report", () => {
      expect(graph.broken).toEqual([{ source: "plan", target: "future/idea" }]);
    });
  });
});
