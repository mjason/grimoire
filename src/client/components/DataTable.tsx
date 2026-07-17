import {
  createTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type Row,
  type SortingState,
  type Table,
  type TableOptionsResolved,
  type TableState,
} from "@tanstack/table-core";
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from "@tanstack/virtual-core";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { CSSProperties } from "preact/compat";
import { TABLE_CLASS, TABLE_FRAME_CLASS, TABLE_SCROLL_CLASS } from "./tableStyles";

type DataRow = Record<string, any>;

export interface Column {
  key: string;
  label?: string;
  align?: "left" | "right" | "center";
  /** Optional formatter for cell display. */
  format?: (value: any, row: DataRow) => any;
}

export interface DataTableProps {
  data: DataRow[];
  /** Columns to show. If omitted, inferred from the first row's keys. */
  columns?: (Column | string)[];
  /** Rows per page. 0 disables pagination. Default 10. */
  pageSize?: number;
  searchable?: boolean;
  caption?: string;
  /** Virtualize unpaginated tables. "auto" enables it above 100 rows. */
  virtualize?: boolean | "auto";
  /** Height of the virtual scroll area in pixels. */
  height?: number;
  /** Estimated row height used before rows are measured. */
  estimatedRowHeight?: number;
  /** Stable identity for rows after sorting and filtering. */
  getRowId?: (row: DataRow, index: number) => string;
}

function normalizeColumns(cols: DataTableProps["columns"], data: DataRow[]): Column[] {
  const source = cols ?? Object.keys(data[0] ?? {});
  return source.map((c) =>
    typeof c === "string" ? { key: c, label: titleize(c) } : { label: titleize(c.key), ...c },
  );
}

function titleize(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export interface DataTableModelOptions {
  data: DataRow[];
  columns: Column[];
  query?: string;
  sorting?: SortingState;
  pageIndex?: number;
  pageSize?: number;
  getRowId?: DataTableProps["getRowId"];
}

/** Build the same TanStack row pipeline used by the component. Exported for regression tests. */
export function createDataTableModel({
  data,
  columns,
  query = "",
  sorting = [],
  pageIndex = 0,
  pageSize = 10,
  getRowId,
}: DataTableModelOptions): Table<DataRow> {
  const columnDefs: ColumnDef<DataRow>[] = columns.map((column) => ({
    id: column.key,
    accessorFn: (row) => row[column.key],
    header: column.label,
    sortUndefined: "last",
  }));
  const effectivePageSize = pageSize > 0 ? pageSize : Math.max(1, data.length);

  return createTable({
    data,
    columns: columnDefs,
    state: {
      globalFilter: query,
      sorting,
      pagination: { pageIndex, pageSize: effectivePageSize },
    } as TableState,
    onStateChange: () => {},
    renderFallbackValue: null,
    getRowId: getRowId
      ? (row, index) => getRowId(row, index)
      : (row, index) => String(row.id ?? index),
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  } as TableOptionsResolved<DataRow>);
}

interface VirtualizationContext {
  virtualize: boolean | "auto";
  paginationEnabled: boolean;
  rowCount: number;
  standalone: boolean;
  printing: boolean;
}

export function shouldVirtualizeDataTable({
  virtualize,
  paginationEnabled,
  rowCount,
  standalone,
  printing,
}: VirtualizationContext): boolean {
  if (standalone || printing || paginationEnabled) return false;
  return virtualize === true || (virtualize === "auto" && rowCount > 100);
}

function useRowVirtualizer(
  rows: Row<DataRow>[],
  scrollRef: { current: HTMLDivElement | null },
  estimateSize: number,
  enabled: boolean,
) {
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const instanceRef = useRef<Virtualizer<HTMLDivElement, HTMLTableRowElement> | null>(null);
  const options = {
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    getItemKey: (index: number) => rows[index]?.id ?? index,
    overscan: 6,
    enabled,
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    onChange: () => rerender(0),
  };

  if (!instanceRef.current) instanceRef.current = new Virtualizer(options);
  else instanceRef.current.setOptions(options);

  const instance = instanceRef.current;
  useLayoutEffect(() => instance._didMount(), [instance]);
  useLayoutEffect(() => instance._willUpdate());
  return instance;
}

/**
 * Interactive structured table powered by TanStack Table. Large unpaginated
 * datasets can use TanStack Virtual without changing the existing MDX API.
 */
export function DataTable({
  data,
  columns,
  pageSize = 10,
  searchable = true,
  caption,
  virtualize = "auto",
  height = 440,
  estimatedRowHeight = 44,
  getRowId,
}: DataTableProps) {
  const cols = useMemo(() => normalizeColumns(columns, data), [columns, data]);
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(0);
  const [printing, setPrinting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const paginationEnabled = pageSize > 0 && virtualize !== true;
  const modelPageSize = paginationEnabled ? pageSize : 0;
  const table = useMemo(
    () => createDataTableModel({
      data,
      columns: cols,
      query,
      sorting,
      pageIndex: page,
      pageSize: modelPageSize,
      getRowId,
    }),
    [data, cols, query, sorting, page, modelPageSize, getRowId],
  );

  const filteredCount = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;
  const pages = paginationEnabled ? Math.max(1, table.getPageCount()) : 1;
  const current = Math.min(page, pages - 1);
  const standalone = typeof window !== "undefined" && "__GRIMOIRE__" in window;
  const virtual = shouldVirtualizeDataTable({
    virtualize,
    paginationEnabled,
    rowCount: rows.length,
    standalone,
    printing,
  });
  const virtualizer = useRowVirtualizer(rows, scrollRef, estimatedRowHeight, virtual);
  const virtualRows = virtual ? virtualizer.getVirtualItems() : [];

  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);

  useEffect(() => {
    const beforePrint = () => setPrinting(true);
    const afterPrint = () => setPrinting(false);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  const toggleSort = (key: string) => {
    setSorting((currentSorting) => {
      const active = currentSorting[0];
      return active?.id === key ? [{ id: key, desc: !active.desc }] : [{ id: key, desc: false }];
    });
    setPage(0);
  };

  const widthFor = (index: number): string | undefined => {
    if (!virtual) return undefined;
    return `${100 / Math.max(cols.length, 1)}%`;
  };

  const cellStyle = (column: Column, index: number): CSSProperties => ({
    textAlign: column.align ?? "left",
    width: widthFor(index),
  });

  const renderRow = (row: Row<DataRow>, virtualIndex?: number, start?: number) => (
    <tr
      key={row.id}
      data-index={virtualIndex}
      aria-rowindex={virtualIndex == null ? undefined : virtualIndex + 2}
      ref={virtual ? virtualizer.measureElement : undefined}
      style={virtual ? { transform: `translateY(${start ?? 0}px)` } : undefined}
    >
      {cols.map((column, index) => (
        <td key={column.key} style={cellStyle(column, index)}>
          {column.format
            ? column.format(row.original[column.key], row.original)
            : String(row.original[column.key] ?? "")}
        </td>
      ))}
    </tr>
  );

  return (
    <figure class={`${TABLE_FRAME_CLASS} data-table`}>
      {searchable && (
        <div class="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <svg aria-hidden="true" class="h-4 w-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onInput={(event) => {
              setQuery((event.target as HTMLInputElement).value);
              setPage(0);
            }}
            placeholder="Filter rows..."
            aria-label="Filter table rows"
            class="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
          <span class="shrink-0 text-xs tabular-nums text-neutral-400">{filteredCount} rows</span>
        </div>
      )}
      <div
        ref={scrollRef}
        class={`${TABLE_SCROLL_CLASS} ${virtual ? "overflow-y-auto" : ""}`}
        style={virtual ? { height: `${height}px` } : undefined}
      >
        <table
          class={`${TABLE_CLASS} ${virtual ? "grimoire-table-virtual" : ""}`.trim()}
          aria-rowcount={filteredCount + 1}
          style={{ minWidth: `${Math.max(480, cols.length * 120)}px` }}
        >
          <thead>
            <tr>
              {cols.map((column, index) => {
                const direction = sorting[0]?.id === column.key
                  ? sorting[0]!.desc ? "descending" : "ascending"
                  : "none";
                return (
                  <th key={column.key} aria-sort={direction} style={cellStyle(column, index)}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      style={{
                        justifyContent: column.align === "right"
                          ? "flex-end"
                          : column.align === "center" ? "center" : "flex-start",
                      }}
                    >
                      <span>{column.label}</span>
                      <span aria-hidden="true" class="inline-block w-3 text-[var(--accent)]">
                        {direction === "ascending" ? "↑" : direction === "descending" ? "↓" : ""}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody style={virtual ? { height: `${virtualizer.getTotalSize()}px` } : undefined}>
            {virtual
              ? virtualRows.map((item) => renderRow(rows[item.index]!, item.index, item.start))
              : rows.map((row) => renderRow(row))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} class="table-empty">No matching rows.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(paginationEnabled && pages > 1) || caption ? (
        <div class="flex items-center justify-between gap-3 border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800">
          <span class="min-w-0">{caption}</span>
          {paginationEnabled && pages > 1 && (
            <div class="flex shrink-0 items-center gap-1 whitespace-nowrap">
              <button
                type="button"
                aria-label="Previous page"
                title="Previous page"
                disabled={current === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                class="whitespace-nowrap rounded-md px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
              >
                ←
              </button>
              <span class="tabular-nums">{current + 1} / {pages}</span>
              <button
                type="button"
                aria-label="Next page"
                title="Next page"
                disabled={current >= pages - 1}
                onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
                class="whitespace-nowrap rounded-md px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
              >
                →
              </button>
            </div>
          )}
        </div>
      ) : null}
    </figure>
  );
}
