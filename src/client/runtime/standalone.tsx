// Standalone single-note entry. Built once and embedded in the binary; the
// export endpoint (serve.ts) inlines one note's data into `window.__GRIMOIRE__`
// and points a page at this bundle, producing a fully self-contained,
// shareable HTML file that renders the note offline — no server, no network.
import { render } from "preact";
import * as preact from "preact";
import * as preactHooks from "preact/hooks";
import * as jsxRuntime from "preact/jsx-runtime";
import * as preactCompat from "preact/compat";
import * as mdxPreact from "@mdx-js/preact";
import { MDXProvider, useMDXComponents } from "@mdx-js/preact";
import type { ComponentType } from "preact";
import { builtinComponents } from "../components";
import { ThemeToggle } from "../components/ThemeToggle";
import { ThemeProvider } from "../lib/theme";
import { CurrentEntryProvider, SiteProvider } from "../lib/site";
import { formatDate } from "../lib/notes";
import type { GraphNode, LinkGraph } from "../../runtime/links";
import type { ThemeSettings } from "../../runtime/theme";

// Expose engine deps so the inlined user-component modules (imported from data:
// URLs) can resolve `preact`, `preact/hooks`, … via the page's import map, whose
// shims re-export from here. Mirrors runtime/boot.tsx.
(globalThis as any).__grimoire = { preact, preactHooks, jsxRuntime, preactCompat, mdxPreact };

// Surface uncaught errors to the console so a headless check can see them.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) =>
    console.error(`[grimoire] Uncaught: ${(e as ErrorEvent).error?.message ?? (e as ErrorEvent).message}`),
  );
  window.addEventListener("unhandledrejection", (e) =>
    console.error(`[grimoire] Unhandled: ${(e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason}`),
  );
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  body: string,
) => (scope: Record<string, unknown>) => Promise<{ default: ComponentType<any> }>;

interface LinkRef {
  id: string;
  title: string;
  kind: "note" | "card";
}

interface Payload {
  config: {
    title?: string;
    description?: string;
    author?: string;
    footer?: string;
    theme?: ThemeSettings;
  };
  note: {
    id: string;
    segments: string[];
    lang: string;
    frontmatter: Record<string, any>;
    body: string;
    links?: LinkRef[];
    backlinks?: LinkRef[];
  };
  // Each user component file, transpiled to an ES module and inlined as a data: URL.
  components: { name: string; module: string }[];
}

/**
 * A one-note graph, so `[[wiki links]]` in an exported file still resolve to a
 * real title (rendered as static text — there's nowhere to navigate to offline).
 */
function localOnlyGraph(note: Payload["note"]): LinkGraph {
  const self: GraphNode = {
    id: note.id,
    kind: "note",
    title: String(note.frontmatter?.title ?? note.id),
    tags: Array.isArray(note.frontmatter?.tags) ? note.frontmatter.tags.map(String) : [],
    degree: 0,
  };
  const refs = [...(note.links ?? []), ...(note.backlinks ?? [])];
  const nodes: GraphNode[] = [
    self,
    ...refs.map((r) => ({ id: r.id, kind: r.kind, title: r.title, tags: [], degree: 1 })),
  ];
  return {
    nodes,
    edges: [],
    outgoing: { [note.id]: (note.links ?? []).map((r) => r.id) },
    backlinks: { [note.id]: (note.backlinks ?? []).map((r) => r.id) },
    broken: [],
  };
}

async function boot() {
  const root = document.getElementById("app");
  if (!root) return;
  const data: Payload | undefined = (window as any).__GRIMOIRE__;
  if (!data) {
    console.error("[grimoire] No note data embedded (window.__GRIMOIRE__ missing).");
    root.innerHTML = `<div style="padding:2rem;font-family:sans-serif">No note data embedded.</div>`;
    return;
  }

  // Load inlined user components (bare imports like "preact/hooks" resolve via the
  // page import map → data: URL shims → globalThis.__grimoire). Mirrors boot.tsx.
  const userComponents: Record<string, any> = {};
  await Promise.all(
    (data.components ?? []).map(async (c) => {
      try {
        const mod = await import(/* @vite-ignore */ c.module);
        for (const [k, v] of Object.entries(mod)) if (k !== "default") userComponents[k] = v;
        if ((mod as any).default) userComponents[c.name] = (mod as any).default;
      } catch (e) {
        console.error(`[grimoire] failed to load component "${c.name}":`, e);
      }
    }),
  );
  const components = { ...builtinComponents, ...userComponents };

  let Body: ComponentType<any>;
  try {
    const scope = { ...jsxRuntime, useMDXComponents, baseUrl: location.href };
    const mod = await new AsyncFunction(data.note.body)(scope);
    Body = mod.default;
  } catch (e) {
    console.error(`[grimoire] Failed to evaluate note "${data.note.id}":`, e);
    root.innerHTML = `<div style="padding:2rem;font-family:sans-serif;color:#e11d48">Failed to render note: ${String((e as Error)?.message ?? e)}</div>`;
    return;
  }

  render(
    <ThemeProvider siteTheme={data.config?.theme}>
      <SiteProvider graph={localOnlyGraph(data.note)} navigable={false}>
        <CurrentEntryProvider id={data.note.id}>
          <MDXProvider components={components}>
            <StandalonePage data={data} Body={Body} />
          </MDXProvider>
        </CurrentEntryProvider>
      </SiteProvider>
    </ThemeProvider>,
    root,
  );
}

/** The note's place in the graph, frozen into plain text for an offline file. */
function StaticConnections({ note }: { note: Payload["note"] }) {
  const groups: { label: string; refs: LinkRef[] }[] = [
    { label: "Links to", refs: note.links ?? [] },
    { label: "Linked from", refs: note.backlinks ?? [] },
  ].filter((g) => g.refs.length > 0);
  if (groups.length === 0) return null;

  return (
    <section class="mt-12 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <div class="grid gap-5 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.label}>
            <div class="grimoire-category text-neutral-400">
              {group.label}
            </div>
            <ul class="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
              {group.refs.map((ref) => (
                <li key={ref.id}>
                  {ref.kind === "card" ? "🃏" : "📄"} {ref.title}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function StandalonePage({ data, Body }: { data: Payload; Body: ComponentType<any> }) {
  const fm = data.note.frontmatter ?? {};
  const title = fm.title ?? data.note.id.split("/").pop() ?? "Untitled";
  const tags: string[] = Array.isArray(fm.tags) ? fm.tags.map(String) : [];

  return (
    <div class="min-h-screen">
      <div class="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 lg:px-12 xl:max-w-4xl 2xl:max-w-5xl">
        <div class="mb-8 flex items-center justify-between">
          <span class="flex items-center gap-2 text-lg font-bold">
            <span class="text-2xl">📓</span>
            <span class="leading-tight">{data.config.title}</span>
          </span>
          <ThemeToggle />
        </div>

        <article class="animate-fade">
          <header class="mb-8 border-b border-neutral-200 pb-6 dark:border-neutral-800">
            {data.note.segments.length > 0 && (
              <div class="grimoire-category mb-2 text-[var(--accent)]">
                {data.note.segments.join(" / ")}
              </div>
            )}
            <h1 class="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {fm.icon && <span class="mr-2">{fm.icon}</span>}
              {title}
            </h1>
            {fm.description && (
              <p class="mt-2 text-lg text-neutral-500 dark:text-neutral-400">{fm.description}</p>
            )}
            <div class="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
              {fm.date && <time>{formatDate(String(fm.date))}</time>}
              {tags.map((t) => (
                <span
                  key={t}
                  class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  #{t}
                </span>
              ))}
            </div>
          </header>

          <div class="prose prose-neutral max-w-none dark:prose-invert">
            <Body />
          </div>
          <StaticConnections note={data.note} />
        </article>

        {data.config.footer && (
          <footer class="mt-12 border-t border-neutral-200 pt-6 text-xs text-neutral-400 dark:border-neutral-800">
            {data.config.footer}
          </footer>
        )}
      </div>
    </div>
  );
}

boot();
