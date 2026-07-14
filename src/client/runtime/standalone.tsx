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
import { formatDate } from "../lib/notes";

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

interface Payload {
  config: { title?: string; description?: string; author?: string; footer?: string };
  note: { id: string; segments: string[]; lang: string; frontmatter: Record<string, any>; body: string };
  // Each user component file, transpiled to an ES module and inlined as a data: URL.
  components: { name: string; module: string }[];
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
    <MDXProvider components={components}>
      <StandalonePage data={data} Body={Body} />
    </MDXProvider>,
    root,
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
              <div class="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--accent)]">
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
