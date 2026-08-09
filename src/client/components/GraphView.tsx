// The knowledge graph, drawn from the resolved link graph.
//
// The layout is computed once, deterministically (see runtime/layout.ts), so the
// map looks the same every visit and never animates in the background. Pan with
// a drag, zoom with the wheel, click a node to open it.
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { localGraph, type GraphEdge, type GraphNode } from "../../runtime/links";
import { forceLayout } from "../../runtime/layout";
import { nodeHref, useSite } from "../lib/site";
import { useLocale } from "../i18n";

const VIEW = 100; // the view box is VIEW tall; its width follows the container
const PADDING = 8;
/** How far the square layout may be stretched to fill a wide container. */
const MAX_ASPECT = 2.4;

interface Placed extends GraphNode {
  x: number;
  y: number;
}

function place(nodes: GraphNode[], edges: GraphEdge[], width: number): Placed[] {
  const positions = forceLayout(nodes, edges);
  const spanX = width - PADDING * 2;
  const spanY = VIEW - PADDING * 2;
  return nodes.map((node, i) => ({
    ...node,
    x: PADDING + positions[i]!.x * spanX,
    y: PADDING + positions[i]!.y * spanY,
  }));
}

/**
 * The container's aspect ratio, so the drawing fills it instead of being
 * letterboxed into a square in the middle of a wide panel.
 */
function useAspect(ref: { current: HTMLElement | null }): number {
  const [aspect, setAspect] = useState(1.6);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setAspect(Math.min(MAX_ASPECT, Math.max(1, width / height)));
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return aspect;
}

const LABEL_SIZE = 2.4;
const radiusOf = (node: Placed, focused: boolean) =>
  1.7 + Math.min(3.2, node.degree * 0.55) + (focused ? 0.8 : 0);
const shortTitle = (title: string) => (title.length > 22 ? `${title.slice(0, 21)}…` : title);

interface LabelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const hits = (a: LabelBox, b: LabelBox) =>
  !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);

/**
 * Where each node's label goes, if it gets one. Densely packed graphs turn into
 * a smear of overlapping text, so place labels greedily — the focused node
 * first, then the best-connected — trying below the node and then above it, and
 * drop any that still collides. Labels are nudged inward so none is clipped by
 * the edge of the view. Deterministic, like the layout itself.
 */
function labelPositions(
  placed: Placed[],
  focusId: string | null,
  viewWidth: number,
): Map<string, { x: number; y: number }> {
  // Seed the occupied space with the nodes themselves: a label that lands on a
  // circle is just as unreadable as one that lands on another label.
  const boxes: LabelBox[] = placed.map((node) => {
    const r = radiusOf(node, node.id === focusId);
    return { x1: node.x - r, y1: node.y - r, x2: node.x + r, y2: node.y + r };
  });
  const out = new Map<string, { x: number; y: number }>();
  const order = [...placed].sort(
    (a, b) =>
      Number(b.id === focusId) - Number(a.id === focusId) ||
      b.degree - a.degree ||
      a.id.localeCompare(b.id),
  );

  for (const node of order) {
    const width = shortTitle(node.title).length * LABEL_SIZE * 0.58 + 1;
    const r = radiusOf(node, node.id === focusId);
    const half = width / 2;
    const margin = half + 2;
    const x = Math.min(Math.max(node.x, margin), Math.max(margin, viewWidth - margin));
    const height = LABEL_SIZE * 1.3;
    // Baseline candidates: under the node, then over it.
    const candidates = [node.y + r + 2.6, node.y - r - 1.2];
    for (const baseline of candidates) {
      const box = { x1: x - half, y1: baseline - height * 0.8, x2: x + half, y2: baseline + height * 0.2 };
      if (box.y1 < 0 || box.y2 > VIEW) continue;
      if (boxes.some((b) => hits(box, b))) continue;
      boxes.push(box);
      out.set(node.id, { x, y: baseline });
      break;
    }
  }
  return out;
}

export function GraphView({
  focus,
  depth = 1,
  height = 420,
  showLabels,
  class: className = "",
}: {
  /** Centre the view on one entry (a note or card id) and its neighbourhood. */
  focus?: string;
  depth?: number;
  height?: number;
  showLabels?: boolean;
  class?: string;
}) {
  const site = useSite();
  const { t } = useLocale();
  const boxRef = useRef<HTMLDivElement>(null);
  const aspect = useAspect(boxRef);
  const viewWidth = VIEW * aspect;
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
    pointerId: number;
    target: Element;
    moved: boolean;
  } | null>(null);
  // A drag that ends over a node must not also open it.
  const dragged = useRef(false);

  const focusId = focus ? site.resolve(focus)?.id ?? null : null;
  const sub = useMemo(
    () => (focusId ? localGraph(site.graph, focusId, depth) : site.graph),
    [site.graph, focusId, depth],
  );
  const placed = useMemo(() => place(sub.nodes, sub.edges, viewWidth), [sub, viewWidth]);
  const byId = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed]);

  const active = hovered ?? focusId;
  const related = useMemo(() => {
    if (!active) return null;
    const set = new Set<string>([active]);
    for (const edge of sub.edges) {
      if (edge.source === active) set.add(edge.target);
      if (edge.target === active) set.add(edge.source);
    }
    return set;
  }, [active, sub.edges]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, scale: Math.min(4, Math.max(0.4, v.scale * (e.deltaY < 0 ? 1.12 : 0.89))) }));
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    // Deliberately no pointer capture yet: capturing here would swallow the
    // click that opens a node. It starts once the pointer actually moves.
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ox: view.x,
      oy: view.y,
      pointerId: e.pointerId,
      target: e.currentTarget as Element,
      moved: false,
    };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return; // still a click, not a drag
      d.moved = true;
      try {
        d.target.setPointerCapture(d.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
    }
    const rect = d.target.getBoundingClientRect();
    const scale = viewWidth / Math.max(1, rect.width);
    setView((v) => ({ ...v, x: d.ox + dx * scale, y: d.oy + dy * scale }));
  };
  const endDrag = () => {
    dragged.current = drag.current?.moved ?? false;
    drag.current = null;
  };

  const labels = showLabels ?? placed.length <= 120;
  const labelled = useMemo(
    () => (labels ? labelPositions(placed, focusId, viewWidth) : new Map<string, { x: number; y: number }>()),
    [labels, placed, focusId, viewWidth],
  );

  if (placed.length === 0) {
    return (
      <div
        class={`grid place-items-center rounded-2xl border border-dashed border-neutral-300 text-sm text-neutral-400 dark:border-neutral-700 ${className}`}
        style={{ height }}
      >
        {t("graph.empty")}
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      class={`not-prose relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/40 ${className}`}
      style={{ height }}
      data-testid="graph-view"
    >
      <svg
        viewBox={`0 0 ${viewWidth} ${VIEW}`}
        class="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label={t("graph.title")}
      >
        <g
          transform={`translate(${viewWidth / 2} ${VIEW / 2}) scale(${view.scale}) translate(${
            view.x - viewWidth / 2
          } ${view.y - VIEW / 2})`}
        >
          <g class="text-neutral-400">
            {sub.edges.map((edge) => {
              const a = byId.get(edge.source);
              const b = byId.get(edge.target);
              if (!a || !b) return null;
              const lit = related ? related.has(a.id) && related.has(b.id) : false;
              return (
                <line
                  key={`${edge.source}->${edge.target}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={lit ? "var(--accent)" : "currentColor"}
                  stroke-width={lit ? 0.45 : 0.25}
                  opacity={related && !lit ? 0.12 : lit ? 0.85 : 0.3}
                />
              );
            })}
          </g>

          {placed.map((node) => {
            const dim = related ? !related.has(node.id) : false;
            const isFocus = node.id === focusId;
            const r = radiusOf(node, isFocus);
            return (
              <g
                key={node.id}
                opacity={dim ? 0.3 : 1}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered((h) => (h === node.id ? null : h))}
                data-node={node.id}
                data-kind={node.kind}
                class="cursor-pointer"
              >
                <a
                  href={nodeHref(node)}
                  aria-label={node.title}
                  onClick={(e: MouseEvent) => {
                    if (dragged.current) e.preventDefault();
                  }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={node.kind === "card" ? "var(--color-white)" : "var(--accent)"}
                    stroke="var(--accent)"
                    stroke-width={node.kind === "card" ? 0.7 : isFocus ? 0.9 : 0}
                  />
                  {(() => {
                    const at = labelled.get(node.id);
                    if (!at && node.id !== active) return null;
                    return (
                      <text
                        x={at?.x ?? node.x}
                        y={at?.y ?? node.y + r + 2.6}
                        text-anchor="middle"
                        class="pointer-events-none fill-current"
                        style={{ fontSize: LABEL_SIZE, fontWeight: isFocus ? 700 : 400 }}
                      >
                        {shortTitle(node.title)}
                      </text>
                    );
                  })()}
                </a>
              </g>
            );
          })}
        </g>
      </svg>

      <div class="pointer-events-none absolute bottom-2 left-3 flex items-center gap-3 text-[0.65rem] text-neutral-400">
        <span class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full bg-[var(--accent)]" /> {t("graph.legend.note")}
        </span>
        <span class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full border border-[var(--accent)] bg-[var(--color-white)]" />{" "}
          {t("graph.legend.card")}
        </span>
      </div>

      {view.scale !== 1 || view.x !== 0 || view.y !== 0 ? (
        <button
          type="button"
          onClick={() => setView({ scale: 1, x: 0, y: 0 })}
          class="absolute right-2 top-2 rounded-lg border border-neutral-200 bg-white/80 px-2 py-1 text-xs text-neutral-500 backdrop-blur hover:text-[var(--accent)] dark:border-neutral-700 dark:bg-neutral-800/80"
        >
          {t("graph.reset")}
        </button>
      ) : null}
    </div>
  );
}

/** MDX-facing wrapper: `<Graph note="engine-boot" depth={2} height={320} />`. */
export function Graph({
  note,
  card,
  focus,
  ...rest
}: {
  note?: string;
  card?: string;
  focus?: string;
  depth?: number;
  height?: number;
  showLabels?: boolean;
}) {
  const target = focus ?? note ?? (card ? `card:${card}` : undefined);
  return <GraphView focus={target} {...rest} />;
}
