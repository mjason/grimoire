import { useMemo, useState } from "preact/hooks";

export interface Column {
  key: string;
  label?: string;
  align?: "left" | "right" | "center";
  /** Optional formatter for cell display. */
  format?: (value: any, row: Record<string, any>) => any;
}

export interface DataTableProps {
  data: Record<string, any>[];
  /** Columns to show. If omitted, inferred from the first row's keys. */
  columns?: (Column | string)[];
  /** Rows per page. 0 disables pagination. Default 10. */
  pageSize?: number;
  searchable?: boolean;
  caption?: string;
}

function normalizeColumns(cols: DataTableProps["columns"], data: Record<string, any>[]): Column[] {
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

/**
 * An interactive table with client-side sorting, full-text filtering and
 * pagination. Usable directly from MDX:
 *
 * ```mdx
 * <DataTable searchable data={[{ name: "Ada", score: 99 }, ...]} />
 * ```
 */
export function DataTable({ data, columns, pageSize = 10, searchable = true, caption }: DataTableProps) {
  const cols = useMemo(() => normalizeColumns(columns, data), [columns, data]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) =>
      cols.some((c) => String(row[c.key] ?? "").toLowerCase().includes(q)),
    );
  }, [data, cols, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const pages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const rows =
    pageSize > 0 ? sorted.slice(current * pageSize, current * pageSize + pageSize) : sorted;

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  return (
    <figure class="not-prose my-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {searchable && (
        <div class="flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
          <svg class="h-4 w-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setPage(0);
            }}
            placeholder="Filter rows…"
            class="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
          <span class="shrink-0 text-xs tabular-nums text-neutral-400">{filtered.length} rows</span>
        </div>
      )}
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b border-neutral-200 dark:border-neutral-800">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  class={`cursor-pointer select-none whitespace-nowrap px-4 py-2.5 font-semibold text-neutral-600 hover:text-[var(--accent)] dark:text-neutral-300 ${align(c.align)}`}
                >
                  <span class="inline-flex items-center gap-1">
                    {c.label}
                    <span class="text-[var(--accent)]">
                      {sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                class="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-800/40"
              >
                {cols.map((c) => (
                  <td key={c.key} class={`px-4 py-2.5 tabular-nums ${align(c.align)}`}>
                    {c.format ? c.format(row[c.key], row) : String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} class="px-4 py-8 text-center text-neutral-400">
                  No matching rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(pageSize > 0 && pages > 1) || caption ? (
        <div class="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-2.5 text-xs text-neutral-500 dark:border-neutral-800">
          <span>{caption}</span>
          {pageSize > 0 && pages > 1 && (
            <div class="flex items-center gap-2">
              <button
                disabled={current === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                class="rounded-md px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
              >
                ← Prev
              </button>
              <span class="tabular-nums">
                {current + 1} / {pages}
              </span>
              <button
                disabled={current >= pages - 1}
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                class="rounded-md px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      ) : null}
    </figure>
  );
}

function align(a?: "left" | "right" | "center"): string {
  return a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
}
