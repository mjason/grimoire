// The card note system: atomic, text-driven knowledge cards.
//
// A deck is one plain Markdown file under `cards/`. Cards inside it are
// separated by their own YAML frontmatter block — nothing else, no database:
//
//     ---
//     title: Engine boot
//     id: engine-boot
//     tags: [engine, runtime]
//     links: [guides/getting-started]
//     ---
//
//     The engine reads config, scans notes, then serves.
//
//     ---
//     title: CSS pipeline
//     ---
//
//     Candidates are extracted from sources — see [[engine-boot]].
//
// A `---` only starts a card when it sits on its own after a blank line, closes
// within a reasonable window, parses as YAML, and declares a `title` or `id`.
// Everything else (a thematic break, a table, prose) stays body text.
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import matter from "gray-matter";
import { extractLinks, slugify } from "./links";

export interface CardEntry {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  /** The deck (source file) this card belongs to. */
  deck: string;
  file: string;
  /** Position within its deck file — the stable sort key. */
  index: number;
  /** Resolved-later link targets: declared `links:` plus `[[…]]` in the body. */
  links: string[];
  /** Raw markdown, compiled on demand. */
  body: string;
  icon?: string;
  color?: string;
  date?: string;
  order?: number;
  draft?: boolean;
  lang?: string;
}

/** How far past a `---` we'll look for the closing fence before giving up. */
const MAX_FRONTMATTER_LINES = 60;

function humanize(slug: string): string {
  return slug
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function toLinks(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function toDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

interface Block {
  start: number;
  close: number;
  data: Record<string, any>;
}

/** Locate every real card header in a deck file. */
function findBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== "---") continue;
    if (i > 0 && lines[i - 1]!.trim() !== "") continue;

    let close = -1;
    const limit = Math.min(lines.length, i + MAX_FRONTMATTER_LINES + 1);
    for (let j = i + 1; j < limit; j++) {
      if (lines[j]!.trim() === "---") {
        close = j;
        break;
      }
    }
    if (close === -1) continue;

    const yaml = lines.slice(i + 1, close).join("\n");
    if (!/^\s*[A-Za-z_][\w-]*\s*:/m.test(yaml)) continue;

    let data: Record<string, any>;
    try {
      data = (matter(`---\n${yaml}\n---\n`).data ?? {}) as Record<string, any>;
    } catch {
      continue; // malformed YAML is body text, not a card
    }
    if (!data.title && !data.id) continue;

    blocks.push({ start: i, close, data });
    i = close;
  }
  return blocks;
}

/** Parse one deck file into its cards. Ids are local; `indexCards` makes them unique. */
export function parseCardFile(text: string, opts: { file: string; deck: string }): CardEntry[] {
  const lines = String(text ?? "").split("\n");
  const blocks = findBlocks(lines);

  return blocks.flatMap((block, i): CardEntry[] => {
    const next = blocks[i + 1]?.start ?? lines.length;
    const body = lines.slice(block.close + 1, next).join("\n").trim();
    const data = block.data;

    const id = String(data.id ?? "").trim() || slugify(String(data.title ?? ""));
    if (!id) return [];
    const title = String(data.title ?? "").trim() || humanize(id);

    const declared = toLinks(data.links);
    const inBody = extractLinks(body);
    const links = [...new Set([...declared, ...inBody])];

    return [
      {
        id,
        title,
        description: data.description ? String(data.description) : undefined,
        tags: toTags(data.tags),
        deck: opts.deck,
        file: opts.file,
        index: i,
        links,
        body,
        icon: data.icon ? String(data.icon) : undefined,
        color: data.color ? String(data.color) : undefined,
        date: toDate(data.date),
        order: typeof data.order === "number" ? data.order : undefined,
        draft: Boolean(data.draft),
        lang: data.lang ? String(data.lang) : undefined,
      },
    ];
  });
}

/**
 * Make card ids unique across decks. The first card to claim an id keeps it;
 * later collisions are namespaced by their deck (`authoring/dup`). Order-stable,
 * so ids don't shuffle between runs.
 *
 * Ids are unique *per language*: `engine.md` and `engine.zh.md` are translations
 * of the same cards, so they deliberately share ids.
 */
export function indexCards(cards: CardEntry[]): CardEntry[] {
  const taken = new Set<string>();
  const key = (card: CardEntry, id: string) => `${card.lang ?? ""}::${id}`;
  return cards.map((card) => {
    if (!taken.has(key(card, card.id))) {
      taken.add(key(card, card.id));
      return card;
    }
    let candidate = `${card.deck}/${card.id}`;
    let n = 2;
    while (taken.has(key(card, candidate))) candidate = `${card.deck}/${card.id}-${n++}`;
    taken.add(key(card, candidate));
    return { ...card, id: candidate };
  });
}

export interface CardQuery {
  tag?: string;
  deck?: string;
  query?: string;
  ids?: string[];
}

/** The subset of a card the filter needs — the client only holds an excerpt. */
export interface CardLike {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  deck: string;
  body?: string;
  excerpt?: string;
}

/** Filter a card list. An empty query returns everything. */
export function cardFilter<T extends CardLike>(cards: T[], q: CardQuery): T[] {
  if (q.ids?.length) {
    const byId = new Map(cards.map((c) => [c.id, c]));
    return q.ids.map((id) => byId.get(id)).filter((c): c is T => Boolean(c));
  }
  const needle = q.query?.trim().toLowerCase();
  return cards.filter((card) => {
    if (q.tag && !card.tags.includes(q.tag)) return false;
    if (q.deck && card.deck !== q.deck) return false;
    if (needle) {
      const hay = [
        card.title,
        card.description ?? "",
        card.body ?? card.excerpt ?? "",
        card.tags.join(" "),
        card.deck,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

async function walk(dir: string, match: (name: string) => boolean): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...(await walk(full, match)));
    } else if (match(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Scan a project's `cards/` directory into a unique, ordered card list. */
export async function scanCards(cardsDir: string, locales: string[] = []): Promise<CardEntry[]> {
  const files = (await walk(cardsDir, (n) => /\.(md|mdx|markdown)$/i.test(n))).sort();
  const all: CardEntry[] = [];
  for (const file of files) {
    let deck = relative(cardsDir, file).split(sep).join("/").replace(/\.(md|mdx|markdown)$/i, "");
    let lang: string | undefined;
    const dot = deck.lastIndexOf(".");
    if (dot > 0 && locales.includes(deck.slice(dot + 1))) {
      lang = deck.slice(dot + 1);
      deck = deck.slice(0, dot);
    }
    if (!deck) deck = basename(file).replace(/\.[^.]+$/, "");
    try {
      const text = await readFile(file, "utf8");
      for (const card of parseCardFile(text, { file, deck })) {
        all.push(lang ? { ...card, lang: card.lang ?? lang } : card);
      }
    } catch {
      /* unreadable deck — skip it rather than failing the whole scan */
    }
  }
  // Drafts are dropped before ids are assigned, so an unpublished card never
  // pushes a published one into a namespaced id.
  return indexCards(all.filter((card) => !card.draft));
}
