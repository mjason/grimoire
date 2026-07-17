import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { Table } from "../src/client/components/elements";

describe("Table", () => {
  test("wraps markdown tables and preserves their attributes", () => {
    const wrapper = Table({ class: "report-table", id: "results", children: "rows" });
    const scroller = wrapper.props.children as VNode;
    const table = scroller.props.children as VNode;

    expect(wrapper.type).toBe("div");
    expect(wrapper.props.class).toContain("not-prose");
    expect(scroller.type).toBe("div");
    expect(table.type).toBe("table");
    expect(table.props).toMatchObject({
      class: "grimoire-table report-table",
      id: "results",
      children: "rows",
    });
  });
});
