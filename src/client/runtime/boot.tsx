// Engine entry point. Built once and embedded in the binary; at runtime it
// pulls config + notes + components from the server's API and renders them.
import { render } from "preact";
import * as preact from "preact";
import * as preactHooks from "preact/hooks";
import * as jsxRuntime from "preact/jsx-runtime";
import * as preactCompat from "preact/compat";
import * as mdxPreact from "@mdx-js/preact";
import { MDXProvider } from "@mdx-js/preact";
import { App } from "../app";
import { builtinComponents } from "../components";
import { LocaleProvider } from "../i18n";
import { lazyNote } from "./load";
import type { RawNote } from "../lib/notes";
import type { GrimoireConfig } from "../../types";

// Expose engine deps so runtime-loaded user components (served as ES modules)
// can resolve `preact`, `preact/hooks`, etc. via the page's import map, whose
// /_dep/* shims re-export from here.
(globalThis as any).__grimoire = { preact, preactHooks, jsxRuntime, preactCompat, mdxPreact };

// Funnel uncaught render errors + rejections to console.error so `check` (which
// captures the page console headlessly) can see them.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) =>
    console.error(`[grimoire] Uncaught: ${(e as ErrorEvent).error?.message ?? (e as ErrorEvent).message}`),
  );
  window.addEventListener("unhandledrejection", (e) =>
    console.error(`[grimoire] Unhandled: ${(e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason}`),
  );
}

interface Manifest {
  config: GrimoireConfig;
  notes: { id: string; segments: string[]; lang: string | null; frontmatter: Record<string, any> }[];
  components: { name: string; url: string }[];
}

async function boot() {
  const root = document.getElementById("app");
  if (!root) return;

  let manifest: Manifest;
  try {
    manifest = await fetch("/api/manifest").then((r) => r.json());
  } catch (e) {
    root.innerHTML = `<div style="padding:2rem;font-family:sans-serif">Failed to load manifest: ${String(e)}</div>`;
    return;
  }

  const defaultLocale = manifest.config?.i18n?.defaultLocale ?? "en";

  // Load user components (transpiled .tsx served as ES modules; bare imports
  // like "preact/hooks" resolve through the import map → /_dep shims).
  const userComponents: Record<string, any> = {};
  await Promise.all(
    (manifest.components ?? []).map(async (c) => {
      try {
        const mod = await import(/* @vite-ignore */ `/_component/${c.url}`);
        for (const [k, v] of Object.entries(mod)) if (k !== "default") userComponents[k] = v;
        if ((mod as any).default) userComponents[c.name] = (mod as any).default;
      } catch (e) {
        console.error(`[grimoire] failed to load component "${c.name}":`, e);
      }
    }),
  );

  const rawNotes: RawNote[] = (manifest.notes ?? []).map((n) => ({
    id: n.id,
    segments: n.segments,
    lang: n.lang,
    module: {
      frontmatter: n.frontmatter,
      default: lazyNote(n.id, n.lang ?? defaultLocale),
    },
  }));

  const components = { ...builtinComponents, ...userComponents };

  render(
    <LocaleProvider i18n={manifest.config?.i18n}>
      <MDXProvider components={components}>
        <App config={manifest.config} rawNotes={rawNotes} />
      </MDXProvider>
    </LocaleProvider>,
    root,
  );

  liveReload();
}

function liveReload() {
  try {
    const es = new EventSource("/__livereload");
    es.onmessage = (e) => {
      if (e.data === "reload") location.reload();
    };
  } catch {
    /* not in dev */
  }
}

boot();
