// The Grimoire engine server. Run directly (`bun run src/serve.ts`) or compiled
// to a single binary. At runtime it reads an external project (config + notes/ +
// components/), compiles content on demand, generates CSS server-side, and serves
// a live, hot-reloading site. Bring your own content; the engine is the binary.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { networkInterfaces } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { DEFAULT_CONFIG } from "./config";
import type { GrimoireConfig } from "./types";
import {
  scanNotes,
  scanComponents,
  compileNote,
  transpileComponent,
  type NoteEntry,
  type ComponentEntry,
} from "./runtime/content";
import { createCssCompiler, extractCandidates, type CssCompiler } from "./runtime/css";

// --- Embedded engine assets (bundled into the binary; read from disk in dev) --
import engineJs from "../dist/engine/app.js" with { type: "text" };
import stylesCss from "./client/styles.css" with { type: "text" };
import engineCandidates from "../dist/engine/candidates.txt" with { type: "text" };
import twIndexCss from "../node_modules/tailwindcss/index.css" with { type: "text" };
import typographyPlugin from "@tailwindcss/typography";
// Optional chart.js chunk a user component may import (loaded on demand).
import depChartjs from "../dist/engine/dep.chartjs.js" with { type: "text" };

// --- CLI / paths -------------------------------------------------------------
function arg(name: string): string | undefined {
  const eq = Bun.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = Bun.argv.indexOf(`--${name}`);
  if (i !== -1 && Bun.argv[i + 1] && !Bun.argv[i + 1]!.startsWith("--")) return Bun.argv[i + 1];
  return undefined;
}
const flag = (name: string) => Bun.argv.includes(`--${name}`);
const rel = (base: string, p: string | undefined, fallback: string) =>
  p ? (isAbsolute(p) ? p : resolve(base, p)) : resolve(base, fallback);

const ROOT = resolve(arg("root") ?? process.cwd());
const NOTES_DIR = rel(ROOT, arg("notes"), "notes");
const COMPONENTS_DIR = rel(ROOT, arg("components"), "components");
// CLI/env take precedence; config supplies the fallback (resolved after load).
const CLI_PORT = arg("port") ?? process.env.PORT;
const CLI_HOST = arg("host") ?? process.env.HOST;
const WATCH = !flag("no-watch");

function findConfig(): string | undefined {
  const explicit = arg("config");
  if (explicit) return rel(ROOT, explicit, "");
  for (const name of ["config.ts", "config.js", "config.mjs", "config.json"]) {
    const p = join(ROOT, name);
    if (existsSync(p)) return p;
  }
  return undefined;
}

async function loadConfig(): Promise<GrimoireConfig> {
  const file = findConfig();
  if (!file || !existsSync(file)) return DEFAULT_CONFIG;
  try {
    if (file.endsWith(".json")) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(await readFile(file, "utf8")) };
    }
    const mod = await import(`${file}?t=${Date.now()}`);
    return { ...DEFAULT_CONFIG, ...(mod.default ?? mod.config ?? {}) };
  } catch (e) {
    console.error(`grimoire: failed to load config (${file}):`, (e as Error).message);
    return DEFAULT_CONFIG;
  }
}

// --- State -------------------------------------------------------------------
interface State {
  config: GrimoireConfig;
  notes: NoteEntry[];
  components: ComponentEntry[];
  css: string;
}
let state: State;
let cssCompiler: CssCompiler;
const noteCache = new Map<string, string>(); // file -> function-body
const compCache = new Map<string, string>(); // file -> transpiled JS

function locales(config: GrimoireConfig): string[] {
  return (config.i18n?.locales ?? []).map((l) => l.code);
}

async function rebuild(): Promise<void> {
  const config = await loadConfig();
  const [notes, components] = await Promise.all([
    scanNotes(NOTES_DIR, locales(config)),
    scanComponents(COMPONENTS_DIR),
  ]);

  // Candidate class names: engine (precomputed) + user notes/components sources.
  const candidates = new Set(engineCandidates.split("\n").filter(Boolean));
  await Promise.all(
    [...notes.map((n) => n.file), ...components.map((c) => c.file)].map(async (f) => {
      try {
        extractCandidates(await readFile(f, "utf8"), candidates);
      } catch {
        /* ignore unreadable */
      }
    }),
  );
  const css = cssCompiler.build([...candidates]);

  noteCache.clear();
  compCache.clear();
  state = { config, notes, components, css };
}

function resolveNoteEntry(id: string, lang: string | null): NoteEntry | undefined {
  const def = state.config.i18n?.defaultLocale ?? "en";
  const want = lang ?? def;
  const variants = state.notes.filter((n) => n.id === id);
  const langOf = (n: NoteEntry) => n.lang ?? def;
  return (
    variants.find((n) => langOf(n) === want) ??
    variants.find((n) => langOf(n) === def) ??
    variants[0]
  );
}

// --- Dependency shims for runtime-loaded user components ----------------------
function depModule(name: string): string | null {
  switch (name) {
    case "preact":
      return `const m=globalThis.__grimoire.preact;export default m;export const {h,render,hydrate,Fragment,Component,createContext,createElement,cloneElement,toChildArray,options,createRef,isValidElement}=m;`;
    case "preact/hooks":
      return `export const {useState,useEffect,useRef,useMemo,useCallback,useReducer,useContext,useLayoutEffect,useImperativeHandle,useErrorBoundary,useId,useDebugValue}=globalThis.__grimoire.preactHooks;`;
    case "preact/jsx-runtime":
    case "preact/jsx-dev-runtime":
      return `const m=globalThis.__grimoire.jsxRuntime;export default m;export const {jsx,jsxs,Fragment}=m;export const jsxDEV=m.jsxDEV||m.jsx;`;
    case "mdx-preact":
      return `export const {MDXProvider,useMDXComponents,withMDXComponents}=globalThis.__grimoire.mdxPreact;`;
    case "preact-compat": {
      // preact/compat is bundled into the engine (shares its preact instance);
      // re-export the common React-compat surface from the runtime namespace.
      const names =
        "forwardRef,memo,lazy,Suspense,createPortal,PureComponent,Children,createFactory," +
        "unmountComponentAtNode,findDOMNode,version,StrictMode,startTransition,useTransition," +
        "useDeferredValue,useSyncExternalStore,useInsertionEffect,Component,Fragment,createElement," +
        "cloneElement,createContext,createRef,isValidElement,useState,useEffect,useRef,useMemo," +
        "useCallback,useContext,useReducer,useLayoutEffect,useImperativeHandle,useDebugValue,useId";
      return `const m=globalThis.__grimoire.preactCompat;export default (m.default||m);export const {${names}}=m;`;
    }
    default:
      return null;
  }
}

// --- HTML shell --------------------------------------------------------------
const ACCENTS: Record<string, [string, string]> = {
  violet: ["#7c3aed", "#fff"], indigo: ["#4f46e5", "#fff"], blue: ["#2563eb", "#fff"],
  sky: ["#0284c7", "#fff"], cyan: ["#0891b2", "#fff"], emerald: ["#059669", "#fff"],
  green: ["#16a34a", "#fff"], amber: ["#d97706", "#fff"], orange: ["#ea580c", "#fff"],
  rose: ["#e11d48", "#fff"], pink: ["#db2777", "#fff"], fuchsia: ["#c026d3", "#fff"],
};
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function indexHtml(config: GrimoireConfig): string {
  const [accent, fg] = ACCENTS[config.theme?.accent ?? "violet"] ?? ACCENTS.violet!;
  const mode = config.theme?.defaultMode ?? "system";
  const lang = config.i18n?.defaultLocale ?? "en";
  const boot = `(()=>{try{var m=localStorage.getItem("grimoire-mode")||${JSON.stringify(mode)};document.documentElement.classList.toggle("dark",m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches));}catch(e){}})();`;
  const importmap = JSON.stringify({
    imports: {
      preact: "/_dep/preact",
      "preact/hooks": "/_dep/preact/hooks",
      "preact/jsx-runtime": "/_dep/preact/jsx-runtime",
      "preact/jsx-dev-runtime": "/_dep/preact/jsx-dev-runtime",
      "preact/compat": "/_dep/preact-compat",
      "@mdx-js/preact": "/_dep/mdx-preact",
      "chart.js": "/_dep/chartjs",
      "chart.js/auto": "/_dep/chartjs",
    },
  });
  return `<!doctype html><html lang="${lang}"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(config.title ?? "Grimoire")}</title>
<meta name="description" content="${esc(config.description ?? "")}"/>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%93%3C/text%3E%3C/svg%3E"/>
<link rel="stylesheet" href="/app.css"/>
<style>:root{--accent:${accent};--accent-fg:${fg};--accent-soft:color-mix(in srgb, ${accent} 14%, transparent);}</style>
<script>${boot}</script>
<script type="importmap">${importmap}</script>
</head><body><div id="app"></div>
<script type="module" src="/app.js"></script>
</body></html>`;
}

// --- Responses ---------------------------------------------------------------
const NOCACHE = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}
const txt = (body: string, type: string) =>
  new Response(body, { headers: { "content-type": type, ...NOCACHE } });
const json = (obj: unknown) =>
  new Response(JSON.stringify(obj), { headers: { "content-type": "application/json", ...NOCACHE } });

const sseClients = new Set<ReadableStreamDefaultController>();
function notifyReload() {
  for (const c of sseClients) {
    try {
      c.enqueue(`data: reload\n\n`);
    } catch {
      sseClients.delete(c); // evict a controller whose connection dropped
    }
  }
}

// --- Server ------------------------------------------------------------------
async function main() {
  cssCompiler = await createCssCompiler(stylesCss, {
    twIndexCss,
    typographyPlugin: typographyPlugin as unknown,
  });
  await rebuild();

  const host = CLI_HOST ?? state.config.host ?? "localhost";
  const port = Number(CLI_PORT ?? state.config.port ?? 4321);

  // DNS-rebinding guard: honor only requests whose Host is a local address.
  // Permissive — any IP literal, localhost, *.local, or the bound host — so it
  // never blocks normal localhost/LAN use but rejects public-domain rebinding.
  const allowedHosts = new Set([host.toLowerCase(), "localhost"]);
  const hostAllowed = (h: string) =>
    !h ||
    allowedHosts.has(h) ||
    /^[\d.]+$/.test(h) || // ipv4 literal
    h.includes(":") || h.startsWith("[") || // ipv6 literal
    h.endsWith(".local") || h.endsWith(".localhost");

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      const p = url.pathname;

      const reqHost = (req.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
      if (!hostAllowed(reqHost)) return new Response("forbidden host", { status: 403 });

      if (p === "/app.js") return txt(engineJs, "text/javascript; charset=utf-8");
      if (p === "/app.css") return txt(state.css, "text/css; charset=utf-8");
      if (p === "/healthz") return new Response("ok");

      if (p === "/api/manifest") {
        const c = state.config;
        return json({
          // Only the client-facing fields — never echo the whole config (host,
          // port, or anything a user adds later) to every visitor.
          config: {
            title: c.title,
            description: c.description,
            author: c.author,
            theme: c.theme,
            categoryOrder: c.categoryOrder,
            footer: c.footer,
            i18n: c.i18n,
          },
          notes: state.notes.map((n) => ({
            id: n.id,
            segments: n.segments,
            lang: n.lang,
            frontmatter: n.frontmatter,
          })),
          components: state.components.map((c) => ({ name: c.name, url: c.url })),
        });
      }

      if (p.startsWith("/api/note/")) {
        const id = safeDecode(p.slice("/api/note/".length));
        if (id == null) return new Response("bad request", { status: 400 });
        const entry = resolveNoteEntry(id, url.searchParams.get("lang"));
        if (!entry) return new Response(`note not found: ${id}`, { status: 404 });
        try {
          let body = noteCache.get(entry.file);
          if (body == null) {
            body = await compileNote(entry.file);
            noteCache.set(entry.file, body);
          }
          return txt(body, "text/plain; charset=utf-8");
        } catch (e) {
          return new Response(`compile error: ${(e as Error).message}`, { status: 500 });
        }
      }

      if (p.startsWith("/_component/")) {
        const urlPath = safeDecode(p.slice("/_component/".length));
        if (urlPath == null) return new Response("bad request", { status: 400 });
        const comp = state.components.find((c) => c.url === urlPath);
        if (!comp) return new Response("component not found", { status: 404 });
        try {
          let js = compCache.get(comp.file);
          if (js == null) {
            js = await transpileComponent(comp.file);
            compCache.set(comp.file, js);
          }
          return txt(js, "text/javascript; charset=utf-8");
        } catch (e) {
          return new Response(`transpile error: ${(e as Error).message}`, { status: 500 });
        }
      }

      if (p.startsWith("/_dep/")) {
        const name = p.slice("/_dep/".length);
        if (name === "chartjs") return txt(depChartjs, "text/javascript; charset=utf-8");
        const mod = depModule(name);
        if (mod == null) return new Response("unknown dep", { status: 404 });
        return txt(mod, "text/javascript; charset=utf-8");
      }

      if (p === "/__livereload") {
        if (!WATCH) return new Response("", { status: 204 });
        let ref: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          start(c) {
            ref = c;
            sseClients.add(c);
          },
          cancel() {
            sseClients.delete(ref);
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
        });
      }

      // SPA fallback
      return new Response(indexHtml(state.config), {
        headers: { "content-type": "text/html; charset=utf-8", ...NOCACHE },
      });
    },
  });

  banner(host, server.port);
  if (flag("open")) openBrowser(`http://${host === "0.0.0.0" || host === "::" ? "localhost" : host}:${server.port}`);
  if (WATCH) startWatching();
}

/** Non-internal IPv4 addresses, for LAN access hints when binding 0.0.0.0. */
function lanIps(): string[] {
  const out: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const a of iface ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}

function banner(host: string, port: number) {
  const all = host === "0.0.0.0" || host === "::" || host === "";
  const urls = all
    ? [`http://localhost:${port}`, ...lanIps().map((ip) => `http://${ip}:${port}`)]
    : [`http://${host}:${port}`];
  const lines = urls
    .map((u, i) => `      \x1b[2m${i === 0 ? "→" : " "}\x1b[0m \x1b[4m${u}\x1b[0m`)
    .join("\n");
  process.stdout.write(
    `\n  📓  \x1b[1mGrimoire\x1b[0m\n` +
      `      \x1b[2mroot:\x1b[0m ${ROOT}\n` +
      `      \x1b[2mnotes:\x1b[0m ${state.notes.length}  \x1b[2mcomponents:\x1b[0m ${state.components.length}\n` +
      `${lines}\n\n`,
  );
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    /* best effort */
  }
}

function startWatching() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await rebuild();
        process.stdout.write(`\x1b[2m↻ rebuilt — ${state.notes.length} notes\x1b[0m\n`);
        notifyReload();
      } catch (e) {
        console.error("rebuild failed:", (e as Error).message);
      }
    }, 80);
  };
  for (const dir of [NOTES_DIR, COMPONENTS_DIR]) {
    if (existsSync(dir)) watch(dir, { recursive: true }, schedule);
  }
  const cfg = findConfig();
  if (cfg && existsSync(cfg)) watch(cfg, schedule);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
