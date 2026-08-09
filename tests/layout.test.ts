import { describe, expect, test } from "bun:test";
import { forceLayout } from "../src/runtime/layout";

const nodes = (...ids: string[]) => ids.map((id) => ({ id }));
const edge = (source: string, target: string) => ({ source, target });

describe("force layout", () => {
  test("places nothing for an empty graph", () => {
    expect(forceLayout([], [])).toEqual([]);
  });

  test("centres a lone node", () => {
    expect(forceLayout(nodes("a"), [])).toEqual([{ id: "a", x: 0.5, y: 0.5 }]);
  });

  test("returns one position per node, in input order", () => {
    const result = forceLayout(nodes("a", "b", "c"), [edge("a", "b")]);
    expect(result.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  test("keeps every coordinate finite and inside the unit square", () => {
    const result = forceLayout(nodes("a", "b", "c", "d", "e"), [
      edge("a", "b"),
      edge("b", "c"),
      edge("c", "a"),
    ]);
    for (const p of result) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  test("is deterministic — the same graph always draws the same picture", () => {
    const graph = () => forceLayout(nodes("a", "b", "c", "d"), [edge("a", "b"), edge("c", "d")]);
    expect(graph()).toEqual(graph());
  });

  test("ignores edges whose endpoints aren't in the node list", () => {
    expect(() => forceLayout(nodes("a", "b"), [edge("a", "ghost")])).not.toThrow();
    expect(forceLayout(nodes("a", "b"), [edge("a", "ghost")])).toHaveLength(2);
  });

  test("separates nodes rather than stacking them", () => {
    const result = forceLayout(nodes("a", "b", "c", "d", "e", "f"), []);
    const distances: number[] = [];
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        distances.push(Math.hypot(result[i]!.x - result[j]!.x, result[i]!.y - result[j]!.y));
      }
    }
    expect(Math.min(...distances)).toBeGreaterThan(0.05);
  });

  test("stays fast on a large graph by shortening the run", () => {
    const many = Array.from({ length: 240 }, (_, i) => ({ id: `n${i}` }));
    const links = many.slice(1).map((n, i) => ({ source: many[i]!.id, target: n.id }));
    const started = performance.now();
    const result = forceLayout(many, links);
    expect(result).toHaveLength(240);
    expect(result.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("pulls linked nodes closer than unlinked ones", () => {
    const result = forceLayout(nodes("a", "b", "c"), [edge("a", "b")]);
    const at = (id: string) => result.find((p) => p.id === id)!;
    const gap = (x: string, y: string) => Math.hypot(at(x).x - at(y).x, at(x).y - at(y).y);
    expect(gap("a", "b")).toBeLessThan(gap("a", "c"));
  });
});
