// Site-wide data every part of the UI needs — including components rendered deep
// inside a compiled MDX body, which can't receive props: the card index, the link
// graph, and the resolver that turns `[[a target]]` into a real destination.
import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useContext, useMemo } from "preact/hooks";
import {
  buildLinkIndex,
  resolveTarget,
  type GraphNode,
  type LinkGraph,
  type LinkIndex,
} from "../../runtime/links";
import { useLocale } from "../i18n";

export interface CardMeta {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  deck: string;
  icon?: string;
  color?: string;
  date?: string;
  order?: number;
  index: number;
  lang?: string;
  links: string[];
  /** Plain-text preview of the card body, for grids. */
  excerpt: string;
}

const EMPTY_GRAPH: LinkGraph = { nodes: [], edges: [], outgoing: {}, backlinks: {}, broken: [] };

export interface SiteData {
  cards: CardMeta[];
  graph: LinkGraph;
  nodeById: Map<string, GraphNode>;
  cardById: Map<string, CardMeta>;
  /** False in an exported single file, where there's nowhere to navigate to. */
  navigable: boolean;
  /** Resolve an author-written link target to a graph node, or null if broken. */
  resolve: (target: string) => GraphNode | null;
}

function makeSiteData(cards: CardMeta[], graph: LinkGraph, navigable = true): SiteData {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const index: LinkIndex = buildLinkIndex(graph.nodes);
  return {
    cards,
    graph,
    nodeById,
    cardById,
    navigable,
    resolve: (target: string) => {
      const id = resolveTarget(target, index);
      return id ? nodeById.get(id) ?? null : null;
    },
  };
}

const SiteContext = createContext<SiteData>(makeSiteData([], EMPTY_GRAPH));

export function useSite(): SiteData {
  return useContext(SiteContext);
}

/** One card per id, choosing the active locale's variant (default as fallback). */
export function cardsForLocale(
  cards: CardMeta[],
  locale: string,
  defaultLocale: string,
): CardMeta[] {
  const byId = new Map<string, CardMeta[]>();
  for (const card of cards) {
    const list = byId.get(card.id) ?? [];
    list.push(card);
    byId.set(card.id, list);
  }
  return [...byId.values()].map((variants) => {
    const langOf = (c: CardMeta) => c.lang ?? defaultLocale;
    return (
      variants.find((c) => langOf(c) === locale) ??
      variants.find((c) => langOf(c) === defaultLocale) ??
      variants[0]!
    );
  });
}

export function SiteProvider({
  cards,
  graph,
  navigable = true,
  children,
}: {
  cards?: CardMeta[];
  graph?: LinkGraph;
  navigable?: boolean;
  children: ComponentChildren;
}) {
  const { locale, defaultLocale } = useLocale();
  const value = useMemo(
    () =>
      makeSiteData(
        cardsForLocale(cards ?? [], locale, defaultLocale),
        graph ?? EMPTY_GRAPH,
        navigable,
      ),
    [cards, graph, navigable, locale, defaultLocale],
  );
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

// Which note/card is on screen, so components inside a compiled MDX body — a
// bare `<Backlinks />`, say — know what they belong to without being told.
const CurrentEntryContext = createContext<string | null>(null);

export function useCurrentEntry(): string | null {
  return useContext(CurrentEntryContext);
}

export function CurrentEntryProvider({ id, children }: { id: string; children: ComponentChildren }) {
  return <CurrentEntryContext.Provider value={id}>{children}</CurrentEntryContext.Provider>;
}

/** The route href for a graph node (notes and cards live at different paths). */
export function nodeHref(node: { id: string; kind: string }): string {
  const path = node.id.split("/").map(encodeURIComponent).join("/");
  return node.kind === "card" ? `#/card/${path}` : `#/n/${path}`;
}
