import { rawNotes } from "../generated/manifest";
import type { NoteMeta } from "../../types";

interface RawNote {
  id: string;
  segments: string[];
  lang: string | null;
  module: Record<string, any>;
}

/** Format a date string (ISO or YYYY-MM-DD) as e.g. "Jun 27, 2026" (UTC-safe). */
export function formatDate(value?: string): string {
  if (!value) return "";
  const iso = value.length >= 10 ? value.slice(0, 10) : value;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function humanize(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Resolve the raw generated note list into fully-typed NoteMeta (all languages). */
export function resolveNotes(defaultLocale = "en"): NoteMeta[] {
  const notes = (rawNotes as RawNote[]).map((n): NoteMeta => {
    const mod = n.module;
    const fm = (mod.frontmatter ?? {}) as Record<string, any>;
    const fallback = humanize(n.id.split("/").pop() || "untitled");
    return {
      id: n.id,
      segments: n.segments,
      lang: n.lang ?? fm.lang ?? defaultLocale,
      title: fm.title ?? fallback,
      description: fm.description,
      tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
      date: fm.date,
      draft: Boolean(fm.draft),
      icon: fm.icon,
      order: typeof fm.order === "number" ? fm.order : 0,
      Component: mod.default,
    };
  });
  return notes.filter((n) => !n.draft);
}

/**
 * For each base slug, pick the best note for the active locale:
 * exact language match → default-locale fallback → any. This keeps untranslated
 * notes visible (in the default language) and links translations by slug.
 */
export function notesForLocale(
  notes: NoteMeta[],
  locale: string,
  defaultLocale: string,
): NoteMeta[] {
  const byId = new Map<string, NoteMeta[]>();
  for (const n of notes) {
    const list = byId.get(n.id) ?? [];
    list.push(n);
    byId.set(n.id, list);
  }
  const out: NoteMeta[] = [];
  for (const variants of byId.values()) {
    out.push(
      variants.find((v) => v.lang === locale) ??
        variants.find((v) => v.lang === defaultLocale) ??
        variants[0]!,
    );
  }
  return out;
}

/** Resolve a single route id to the best note for the locale. */
export function findNote(
  notes: NoteMeta[],
  id: string,
  locale: string,
  defaultLocale: string,
): NoteMeta | undefined {
  const variants = notes.filter((n) => n.id === id);
  if (variants.length === 0) return undefined;
  return (
    variants.find((v) => v.lang === locale) ??
    variants.find((v) => v.lang === defaultLocale) ??
    variants[0]
  );
}

export interface TreeNode {
  /** Folder segment name (humanized for display via `label`). */
  name: string;
  label: string;
  /** Full segment path, e.g. "data/finance". */
  path: string;
  notes: NoteMeta[];
  children: TreeNode[];
}

/** Build a nested category tree from the flat note list. */
export function buildTree(notes: NoteMeta[], order: string[] = []): TreeNode {
  const root: TreeNode = { name: "", label: "", path: "", notes: [], children: [] };

  const findChild = (node: TreeNode, seg: string): TreeNode => {
    let child = node.children.find((c) => c.name === seg);
    if (!child) {
      const path = node.path ? `${node.path}/${seg}` : seg;
      child = { name: seg, label: humanize(seg), path, notes: [], children: [] };
      node.children.push(child);
    }
    return child;
  };

  for (const note of notes) {
    let node = root;
    for (const seg of note.segments) node = findChild(node, seg);
    node.notes.push(note);
  }

  const sortNode = (node: TreeNode) => {
    node.notes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    node.children.sort((a, b) => a.label.localeCompare(b.label));
    node.children.forEach(sortNode);
  };
  sortNode(root);

  // Apply explicit top-level ordering from config.
  if (order.length) {
    root.children.sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.label.localeCompare(b.label);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  return root;
}

export interface TagCount {
  tag: string;
  count: number;
}

export function collectTags(notes: NoteMeta[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Lightweight client-side fuzzy-ish search over title/description/tags. */
export function searchNotes(notes: NoteMeta[], query: string): NoteMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const score = (note: NoteMeta): number => {
    const haystack = [
      note.title,
      note.description ?? "",
      note.tags.join(" "),
      note.id,
    ]
      .join(" ")
      .toLowerCase();
    let s = 0;
    for (const t of terms) {
      const idx = haystack.indexOf(t);
      if (idx === -1) return -1;
      s += note.title.toLowerCase().includes(t) ? 3 : 1;
    }
    return s;
  };
  return notes
    .map((n) => ({ n, s: score(n) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.n);
}
