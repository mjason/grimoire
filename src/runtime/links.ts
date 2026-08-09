// Bidirectional links + the knowledge graph.
//
// Authors write `[[target]]`, `[[target|Label]]` or `[[target#heading|Label]]`
// in any note or card. This module turns that syntax into resolved edges: every
// entry (note or card) gets its outgoing links, its backlinks, and a place in a
// graph the UI can draw.
//
// Pure — no node/browser APIs — because the server builds the graph and the
// client re-derives local views of it.

export type EntryKind = "note" | "card";

export interface WikiLinkRef {
  /** What the author wrote, minus alias/anchor. */
  target: string;
  /** Display text after a `|`. */
  alias?: string;
  /** Heading anchor after a `#`. */
  anchor?: string;
  /** The full `[[…]]` source text. */
  raw: string;
  /** Offset of the match in the source. */
  index: number;
}

/** Lowercase a label into a comparable slug, keeping unicode letters/digits. */
export function slugify(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Blank out fenced blocks and inline code, preserving length so match offsets
 * still point at the original source. `[[a]]` inside a code sample is a code
 * sample, not a link.
 */
export function stripCode(source: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  return source
    .replace(/^([ \t]*)(```+|~~~+)[^\n]*\n[\s\S]*?^\1?\2[^\n]*$/gm, blank)
    // An unterminated fence swallows the rest of the document, same as markdown.
    .replace(/^([ \t]*)(```+|~~~+)[^\n]*\n[\s\S]*$/m, blank)
    .replace(/`+[^`\n]*`+/g, blank);
}

const WIKI_RE = /\[\[([^[\]\n]+?)\]\]/g;

/** Split `target#anchor|alias` into its parts. */
export function parseWikiTarget(inner: string): Omit<WikiLinkRef, "raw" | "index"> | null {
  const [left, ...aliasParts] = inner.split("|");
  const alias = aliasParts.join("|").trim();
  const hash = left!.indexOf("#");
  const target = (hash === -1 ? left! : left!.slice(0, hash)).trim();
  const anchor = hash === -1 ? "" : left!.slice(hash + 1).trim();
  if (!target) return null;
  return { target, ...(alias ? { alias } : {}), ...(anchor ? { anchor } : {}) };
}

/** Every `[[wiki link]]` in a source document, in order, ignoring code. */
export function parseWikiLinks(source: string): WikiLinkRef[] {
  const scannable = stripCode(source);
  const out: WikiLinkRef[] = [];
  for (const match of scannable.matchAll(WIKI_RE)) {
    const parsed = parseWikiTarget(match[1]!);
    if (parsed) out.push({ ...parsed, raw: match[0], index: match.index });
  }
  return out;
}

// In-app hrefs an author may write as ordinary markdown links.
const NOTE_HREF_RE = /\((?:#\/n\/)([^)\s]+)\)/g;
const CARD_HREF_RE = /\((?:#\/card\/)([^)\s]+)\)/g;

/**
 * All link targets a document declares: wiki links plus in-app markdown hrefs,
 * in document order, deduplicated. Card hrefs keep a `card:` prefix so they
 * resolve unambiguously.
 */
export function extractLinks(source: string): string[] {
  const scannable = stripCode(source);
  const found: { index: number; target: string }[] = [];
  for (const match of scannable.matchAll(WIKI_RE)) {
    const parsed = parseWikiTarget(match[1]!);
    if (parsed) found.push({ index: match.index, target: parsed.target });
  }
  for (const match of scannable.matchAll(NOTE_HREF_RE)) {
    found.push({ index: match.index, target: decodeURIComponent(match[1]!) });
  }
  for (const match of scannable.matchAll(CARD_HREF_RE)) {
    found.push({ index: match.index, target: `card:${decodeURIComponent(match[1]!)}` });
  }
  found.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { target } of found) {
    if (seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

// --- Resolution --------------------------------------------------------------

export interface IndexableEntry {
  id: string;
  kind: EntryKind;
  title?: string;
  /** Extra names that should resolve to this entry. */
  aliases?: string[];
}

export interface LinkIndex {
  byId: Map<string, IndexableEntry>;
  /** Keys that may be ambiguous map to every candidate id. */
  byName: Map<string, string[]>;
}

function addName(map: Map<string, string[]>, key: string, id: string) {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.includes(id)) list.push(id);
  map.set(key, list);
}

/** Build the lookup used by `resolveTarget`. */
export function buildLinkIndex(entries: IndexableEntry[]): LinkIndex {
  const byId = new Map<string, IndexableEntry>();
  const byName = new Map<string, string[]>();
  for (const entry of entries) {
    byId.set(entry.id.toLowerCase(), entry);
    const base = entry.id.split("/").pop() ?? entry.id;
    addName(byName, slugify(base), entry.id);
    if (entry.title) addName(byName, slugify(entry.title), entry.id);
    for (const alias of entry.aliases ?? []) addName(byName, slugify(alias), entry.id);
  }
  return { byId, byName };
}

/**
 * Resolve what an author wrote to a real entry id, or null when it doesn't
 * exist or is ambiguous. Tries, in order: an explicit `note:`/`card:` prefix,
 * the exact id, then a unique basename/title/alias.
 */
export function resolveTarget(target: string, index: LinkIndex): string | null {
  const raw = String(target ?? "").trim();
  if (!raw) return null;

  const prefixed = /^(note|card):(.*)$/i.exec(raw);
  if (prefixed) {
    const kind = prefixed[1]!.toLowerCase() as EntryKind;
    const rest = prefixed[2]!.trim();
    const direct = index.byId.get(rest.toLowerCase());
    if (direct) return direct.kind === kind ? direct.id : null;
    const named = index.byName.get(slugify(rest)) ?? [];
    const matches = named.filter((id) => index.byId.get(id.toLowerCase())?.kind === kind);
    return matches.length === 1 ? matches[0]! : null;
  }

  const exact = index.byId.get(raw.toLowerCase());
  if (exact) return exact.id;

  const candidates = index.byName.get(slugify(raw)) ?? [];
  return candidates.length === 1 ? candidates[0]! : null;
}

// --- Graph -------------------------------------------------------------------

export interface GraphEntry extends IndexableEntry {
  title?: string;
  description?: string;
  tags?: string[];
  /** Raw, unresolved targets as written by the author. */
  links?: string[];
}

export interface GraphNode {
  id: string;
  kind: EntryKind;
  title: string;
  /** One-line summary, shown in link previews. */
  description?: string;
  tags: string[];
  /** Unique neighbours, in either direction — used to size the node. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface LinkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** id → resolved outgoing ids, in source order. */
  outgoing: Record<string, string[]>;
  /** id → ids that link here. */
  backlinks: Record<string, string[]>;
  /** Links that pointed at nothing — surfaced by `verify` and the UI. */
  broken: GraphEdge[];
}

/** Resolve every entry's links into a graph of nodes, edges and backlinks. */
export function buildGraph(entries: GraphEntry[]): LinkGraph {
  const index = buildLinkIndex(entries);
  const outgoing: Record<string, string[]> = {};
  const backlinks: Record<string, string[]> = {};
  const broken: GraphEdge[] = [];
  const edges: GraphEdge[] = [];
  const seenEdge = new Set<string>();
  const neighbours = new Map<string, Set<string>>();

  for (const entry of entries) {
    outgoing[entry.id] ??= [];
    backlinks[entry.id] ??= [];
    neighbours.set(entry.id, neighbours.get(entry.id) ?? new Set());
  }

  for (const entry of entries) {
    for (const raw of entry.links ?? []) {
      const target = resolveTarget(raw, index);
      if (!target) {
        broken.push({ source: entry.id, target: raw });
        continue;
      }
      if (target === entry.id) continue; // a note linking to itself adds nothing
      if (!outgoing[entry.id]!.includes(target)) outgoing[entry.id]!.push(target);
      if (!backlinks[target]!.includes(entry.id)) backlinks[target]!.push(entry.id);
      const key = `${entry.id} ${target}`;
      if (!seenEdge.has(key)) {
        seenEdge.add(key);
        edges.push({ source: entry.id, target });
      }
      neighbours.get(entry.id)!.add(target);
      neighbours.get(target)!.add(entry.id);
    }
  }

  const nodes: GraphNode[] = entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    title: entry.title ?? entry.id,
    ...(entry.description ? { description: entry.description } : {}),
    tags: entry.tags ?? [],
    degree: neighbours.get(entry.id)!.size,
  }));

  return { nodes, edges, outgoing, backlinks, broken };
}

/** The neighbourhood around one entry, walked undirectedly up to `depth` hops. */
export function localGraph(graph: LinkGraph, id: string, depth = 1): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!byId.has(id)) return { nodes: [], edges: [] };

  const keep = new Set<string>([id]);
  let frontier = [id];
  for (let hop = 0; hop < Math.max(0, depth); hop++) {
    const next: string[] = [];
    for (const current of frontier) {
      const around = [...(graph.outgoing[current] ?? []), ...(graph.backlinks[current] ?? [])];
      for (const neighbour of around) {
        if (keep.has(neighbour)) continue;
        keep.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}
