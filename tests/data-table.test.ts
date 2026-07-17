import { describe, expect, test } from "bun:test";
import {
  createDataTableModel,
  shouldVirtualizeDataTable,
  type Column,
} from "../src/client/components/DataTable";

const columns: Column[] = [
  { key: "name", label: "Name" },
  { key: "score", label: "Score" },
];
const data = [
  { id: "a", name: "Alpha", score: 2 },
  { id: "b", name: "Beta", score: 1 },
  { id: "c", name: "Gamma", score: 3 },
];

describe("DataTable model", () => {
  test("filters, sorts and paginates through TanStack's row pipeline", () => {
    const table = createDataTableModel({
      data,
      columns,
      query: "a",
      sorting: [{ id: "score", desc: true }],
      pageIndex: 1,
      pageSize: 1,
    });

    expect(table.getFilteredRowModel().rows).toHaveLength(3);
    expect(table.getPageCount()).toBe(3);
    expect(table.getRowModel().rows.map((row) => row.original.id)).toEqual(["a"]);
  });

  test("keeps stable row ids across sorting", () => {
    const table = createDataTableModel({
      data,
      columns,
      sorting: [{ id: "score", desc: true }],
      pageSize: 0,
    });

    expect(table.getRowModel().rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });
});

describe("DataTable virtualization", () => {
  test("automatically virtualizes only large unpaginated browser tables", () => {
    const base = {
      virtualize: "auto" as const,
      paginationEnabled: false,
      rowCount: 101,
      standalone: false,
      printing: false,
    };

    expect(shouldVirtualizeDataTable(base)).toBe(true);
    expect(shouldVirtualizeDataTable({ ...base, rowCount: 100 })).toBe(false);
    expect(shouldVirtualizeDataTable({ ...base, paginationEnabled: true })).toBe(false);
  });

  test("renders complete tables for standalone exports and printing", () => {
    const base = {
      virtualize: true as const,
      paginationEnabled: false,
      rowCount: 1_000,
      standalone: false,
      printing: false,
    };

    expect(shouldVirtualizeDataTable({ ...base, standalone: true })).toBe(false);
    expect(shouldVirtualizeDataTable({ ...base, printing: true })).toBe(false);
  });
});
