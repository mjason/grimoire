// A tiny deterministic force-directed layout (Fruchterman–Reingold) for the
// knowledge graph. Deterministic on purpose: the same notes always draw the same
// picture, so the map stays recognisable between visits — and testable.
//
// Pure, dependency-free, and run once per render (not animated), so it costs a
// few milliseconds and never spins the CPU.

export interface LayoutNode {
  id: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

export interface LayoutOptions {
  iterations?: number;
  /** Pulls everything toward the centre; higher keeps islands from drifting off. */
  gravity?: number;
}

/** Stable 32-bit hash, so a node's initial jitter depends only on its id. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Lay nodes out in the unit square. Returns one entry per input node, in input
 * order, with x/y in [0, 1].
 */
export function forceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): Positioned[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) return [{ id: nodes[0]!.id, x: 0.5, y: 0.5 }];

  // Each iteration is O(n²); ease off on big graphs so a large vault still
  // renders instantly. Small graphs (the common case) get the full 320.
  const iterations = options.iterations ?? Math.min(320, Math.max(80, Math.round(300_000 / (n * n))));
  const gravity = options.gravity ?? 0.02;
  const index = new Map(nodes.map((node, i) => [node.id, i]));

  // Seed on a circle, nudged by a hash of the id so symmetric graphs still relax.
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    const radius = 0.35 + hash(nodes[i]!.id) * 0.12;
    xs[i] = Math.cos(angle) * radius;
    ys[i] = Math.sin(angle) * radius;
  }

  const links = edges
    .map((e) => [index.get(e.source), index.get(e.target)] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] !== undefined && pair[1] !== undefined);

  // Ideal edge length. Generous on purpose: a cramped cluster is unreadable
  // once you put a label under every node.
  const k = Math.sqrt(1 / n) * 1.15;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temp = 0.28;
  // Cool to the same final temperature whatever the iteration count, so a
  // shortened run still settles instead of stopping while it's still hot.
  const cooling = 0.02 ** (1 / iterations);

  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);

    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ux = xs[i]! - xs[j]!;
        let uy = ys[i]! - ys[j]!;
        let dist = Math.hypot(ux, uy);
        if (dist < 1e-4) {
          // Perfectly coincident nodes need a deterministic nudge to separate.
          ux = (hash(`${i}:${j}`) - 0.5) * 1e-3;
          uy = (hash(`${j}:${i}`) - 0.5) * 1e-3;
          dist = Math.hypot(ux, uy) || 1e-4;
        }
        const force = (k * k) / dist;
        const fx = (ux / dist) * force;
        const fy = (uy / dist) * force;
        dx[i]! += fx;
        dy[i]! += fy;
        dx[j]! -= fx;
        dy[j]! -= fy;
      }
    }

    // Attraction along edges. Damped, so a chain of links doesn't collapse into
    // a knot that no label can sit next to.
    for (const [a, b] of links) {
      const ux = xs[a]! - xs[b]!;
      const uy = ys[a]! - ys[b]!;
      const dist = Math.hypot(ux, uy) || 1e-4;
      const force = ((dist * dist) / k) * 0.7;
      const fx = (ux / dist) * force;
      const fy = (uy / dist) * force;
      dx[a]! -= fx;
      dy[a]! -= fy;
      dx[b]! += fx;
      dy[b]! += fy;
    }

    // Gravity, then a temperature-limited step.
    for (let i = 0; i < n; i++) {
      dx[i]! -= xs[i]! * gravity * n * k;
      dy[i]! -= ys[i]! * gravity * n * k;
      const len = Math.hypot(dx[i]!, dy[i]!) || 1e-9;
      const limit = Math.min(len, temp);
      xs[i]! += (dx[i]! / len) * limit;
      ys[i]! += (dy[i]! / len) * limit;
    }
    temp *= cooling;
  }

  // Normalize into the unit square (a degenerate axis collapses to the middle).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]!);
    maxX = Math.max(maxX, xs[i]!);
    minY = Math.min(minY, ys[i]!);
    maxY = Math.max(maxY, ys[i]!);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  return nodes.map((node, i) => ({
    id: node.id,
    x: spanX > 1e-6 ? (xs[i]! - minX) / spanX : 0.5,
    y: spanY > 1e-6 ? (ys[i]! - minY) / spanY : 0.5,
  }));
}
