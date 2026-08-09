// The Grimoire engine server. Run directly (`bun run src/serve.ts`) or compiled
// to a single binary. At runtime it reads an external project (config + notes/ +
// components/ + cards/), compiles content on demand, resolves every `[[link]]`
// into a knowledge graph, generates themed CSS server-side, and serves a live,
// hot-reloading site. Bring your own content; the engine is the binary.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { findConfig as findProjectConfig, loadConfig as loadProjectConfig, resolveDir } from "./load-config";
import type { GrimoireConfig } from "./types";
import {
  scanNotes,
  scanComponents,
  compileNote,
  compileMdx,
  transpileComponent,
  type NoteEntry,
  type ComponentEntry,
} from "./runtime/content";
import { createCssCompiler, extractCandidates, type CssCompiler } from "./runtime/css";
import { scanCards, type CardEntry } from "./runtime/cards";
import { buildGraph, type GraphEntry, type LinkGraph } from "./runtime/links";
import {
  MODE_STORAGE_KEY,
  THEME_CSS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  customPresets,
  mergeThemeSettings,
  resolveTheme,
  themeCatalog,
  themeCss,
  type ThemePreset,
  type ThemeSettings,
} from "./runtime/theme";
import { runDaemon, writeDaemonState } from "./daemon";

// --- Embedded engine assets (bundled into the binary; read from disk in dev) --
import engineJs from "../dist/engine/app.js" with { type: "text" };
import standaloneJs from "../dist/engine/standalone.js" with { type: "text" };
import stylesCss from "./client/styles.css" with { type: "text" };
import engineCandidates from "../dist/engine/candidates.txt" with { type: "text" };
import twIndexCss from "../node_modules/tailwindcss/index.css" with { type: "text" };
import typographyPlugin from "@tailwindcss/typography";
// Optional chart.js chunk a user component may import (loaded on demand).
import depChartjs from "../dist/engine/dep.chartjs.js" with { type: "text" };
import depMermaid from "../dist/engine/dep.mermaid.js" with { type: "text" };

// --- CLI / paths -------------------------------------------------------------
function arg(name: string): string | undefined {
  const eq = Bun.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = Bun.argv.indexOf(`--${name}`);
  if (i !== -1 && Bun.argv[i + 1] && !Bun.argv[i + 1]!.startsWith("--")) return Bun.argv[i + 1];
  return undefined;
}
const flag = (name: string) => Bun.argv.includes(`--${name}`);

const ROOT = resolve(arg("root") ?? process.cwd());
// notes/components dirs: --flag → config → default (resolved per rebuild).
const CLI_NOTES = arg("notes");
const CLI_COMPONENTS = arg("components");
const CLI_CARDS = arg("cards");
// CLI/env take precedence; config supplies the fallback (resolved after load).
const CLI_PORT = arg("port") ?? process.env.PORT;
const CLI_HOST = arg("host") ?? process.env.HOST;
const WATCH = !flag("no-watch");

// Config discovery + loading live in ./load-config (shared with the CLI checks
// so server and `verify` resolve a project identically). Bind them to this run's
// ROOT and --config flag.
const findConfig = (): string | undefined => findProjectConfig(ROOT, arg("config"));
const loadConfig = (): Promise<GrimoireConfig> => loadProjectConfig(ROOT, arg("config"));

// --- State -------------------------------------------------------------------
interface State {
  config: GrimoireConfig;
  notes: NoteEntry[];
  components: ComponentEntry[];
  cards: CardEntry[];
  /** The client-facing card list, built once per rebuild rather than per request. */
  cardsMeta: ReturnType<typeof cardMeta>[];
  graph: LinkGraph;
  theme: ThemeSettings;
  /** Palettes the author defined in `config.theme.presets` / `theme.preset`. */
  themePresets: ThemePreset[];
  /** The site theme as CSS, built once per rebuild rather than per request. */
  themeCss: string;
  css: string;
  notesDir: string;
  componentsDir: string;
  cardsDir: string;
}
let state: State;
let cssCompiler: CssCompiler;
const noteCache = new Map<string, string>(); // file -> function-body
const compCache = new Map<string, string>(); // file -> transpiled JS
const cardCache = new Map<string, string>(); // card id -> function-body

function locales(config: GrimoireConfig): string[] {
  return (config.i18n?.locales ?? []).map((l) => l.code);
}

/** The site's own theme, with the legacy `defaultMode` field folded into `mode`. */
function themeSettings(config: GrimoireConfig): ThemeSettings {
  const theme = config.theme ?? {};
  return mergeThemeSettings(
    theme.defaultMode ? { mode: theme.defaultMode } : null,
    theme as ThemeSettings,
  );
}

/**
 * Validate the author's palettes, warning about any that were rejected — a
 * malformed ramp should say so in the terminal, not vanish from the picker.
 */
function resolveThemePresets(config: GrimoireConfig): ThemePreset[] {
  const theme = config.theme ?? {};
  const declared = [
    ...(Array.isArray(theme.presets) ? theme.presets : []),
    ...(theme.preset && typeof theme.preset === "object" ? [theme.preset] : []),
  ];
  const accepted = customPresets(declared);
  if (declared.length > accepted.length) {
    console.error(
      `grimoire: ${declared.length - accepted.length} theme preset(s) ignored — ` +
        `each needs a valid \`neutral\` ramp of 11 colours (50 → 950).`,
    );
  }
  return accepted;
}

/**
 * One graph node per note *slug* (translations share it) plus one per card, with
 * link targets unioned across a note's language variants.
 */
function graphEntries(notes: NoteEntry[], cards: CardEntry[], defaultLocale: string): GraphEntry[] {
  const byId = new Map<string, GraphEntry>();
  for (const note of notes) {
    const fm = note.frontmatter ?? {};
    const existing = byId.get(note.id);
    const isDefault = (note.lang ?? defaultLocale) === defaultLocale;
    const aliases = Array.isArray(fm.aliases) ? fm.aliases.map(String) : [];
    if (!existing) {
      byId.set(note.id, {
        id: note.id,
        kind: "note",
        title: fm.title ? String(fm.title) : note.id.split("/").pop()!,
        description: fm.description ? String(fm.description) : undefined,
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
        links: [...note.links],
        aliases,
      });
      continue;
    }
    // Prefer the default-locale title, but keep every variant's links + aliases.
    if (isDefault && fm.title) existing.title = String(fm.title);
    if (isDefault && fm.description) existing.description = String(fm.description);
    existing.links = [...new Set([...(existing.links ?? []), ...note.links])];
    existing.aliases = [...new Set([...(existing.aliases ?? []), ...aliases])];
  }
  const cardsById = new Map<string, GraphEntry>();
  for (const card of cards) {
    const existing = cardsById.get(card.id);
    const isDefault = (card.lang ?? defaultLocale) === defaultLocale;
    if (!existing) {
      cardsById.set(card.id, {
        id: card.id,
        kind: "card",
        title: card.title,
        description: card.description ?? cardExcerpt(card.body, 120),
        tags: card.tags,
        links: [...card.links],
      });
      continue;
    }
    if (isDefault) {
      existing.title = card.title;
      existing.description = card.description ?? cardExcerpt(card.body, 120);
    }
    existing.links = [...new Set([...(existing.links ?? []), ...card.links])];
  }
  return [...byId.values(), ...cardsById.values()];
}

/** Markdown flattened to a plain-text preview, for card grids. */
function cardExcerpt(body: string, max = 260): string {
  const text = body
    .replace(/^```[\s\S]*?^```/gm, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, alias?: string) => alias ?? target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*+\s]+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The client-facing shape of a card: everything but the raw markdown body. */
function cardMeta(card: CardEntry) {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    tags: card.tags,
    deck: card.deck,
    icon: card.icon,
    color: card.color,
    date: card.date,
    order: card.order,
    index: card.index,
    lang: card.lang,
    links: card.links,
    excerpt: cardExcerpt(card.body),
  };
}

async function rebuild(): Promise<void> {
  const config = await loadConfig();
  // --flag overrides config overrides the default.
  const notesDir = resolveDir(ROOT, CLI_NOTES ?? config.notes, "notes");
  const componentsDir = resolveDir(ROOT, CLI_COMPONENTS ?? config.components, "components");
  const cardsDir = resolveDir(ROOT, CLI_CARDS ?? config.cards, "cards");
  const [notes, components, cards] = await Promise.all([
    scanNotes(notesDir, locales(config)),
    scanComponents(componentsDir),
    scanCards(cardsDir, locales(config)),
  ]);

  const graph = buildGraph(graphEntries(notes, cards, config.i18n?.defaultLocale ?? "en"));

  // Candidate class names: engine (precomputed) + user notes/components/cards.
  const candidates = new Set(engineCandidates.split("\n").filter(Boolean));
  await Promise.all(
    [...notes.map((n) => n.file), ...components.map((c) => c.file), ...new Set(cards.map((c) => c.file))].map(
      async (f) => {
        try {
          extractCandidates(await readFile(f, "utf8"), candidates);
        } catch {
          /* ignore unreadable */
        }
      },
    ),
  );
  const css = cssCompiler.build([...candidates]);

  const theme = themeSettings(config);
  const themePresets = resolveThemePresets(config);

  noteCache.clear();
  compCache.clear();
  cardCache.clear();
  state = {
    config,
    notes,
    components,
    cards,
    cardsMeta: cards.map(cardMeta),
    graph,
    theme,
    themePresets,
    themeCss: cssSafe(themeCss(resolveTheme(theme, themeCatalog(themePresets)))),
    css,
    notesDir,
    componentsDir,
    cardsDir,
  };
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

/** Pick a card's language variant, mirroring how notes resolve. */
function resolveCardEntry(id: string, lang: string | null): CardEntry | undefined {
  const def = state.config.i18n?.defaultLocale ?? "en";
  const want = lang ?? def;
  const variants = state.cards.filter((c) => c.id === id);
  const langOf = (c: CardEntry) => c.lang ?? def;
  return (
    variants.find((c) => langOf(c) === want) ??
    variants.find((c) => langOf(c) === def) ??
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
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
/** A `</style>` inside a value must not be able to close the tag it lives in. */
function cssSafe(css: string): string {
  return css.replace(/<\/(style)/gi, "<\\/$1");
}
/**
 * Inline script (runs before paint) that applies the reader's own theme: the CSS
 * they last generated, then the light/dark decision. Cached CSS is written by the
 * theme picker, so a personal theme never flashes the site default first.
 */
function themeBootScript(config: GrimoireConfig): string {
  const mode = themeSettings(config).mode ?? "system";
  return (
    `(()=>{try{var d=document,r=d.documentElement;` +
    `var css=localStorage.getItem(${JSON.stringify(THEME_CSS_STORAGE_KEY)});` +
    `if(css){var s=d.createElement("style");s.id="grimoire-theme-vars";s.textContent=css;` +
    `(d.head||r).appendChild(s);}` +
    `var m=null;try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"null");` +
    `if(t&&typeof t.mode==="string")m=t.mode;}catch(e){}` +
    `if(!m)m=localStorage.getItem(${JSON.stringify(MODE_STORAGE_KEY)})||${JSON.stringify(mode)};` +
    `r.classList.toggle("dark",m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches));` +
    `}catch(e){}})();`
  );
}
function indexHtml(config: GrimoireConfig): string {
  const lang = config.i18n?.defaultLocale ?? "en";
  const boot = themeBootScript(config);
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
      mermaid: "/_dep/mermaid",
    },
  });
  return `<!doctype html><html lang="${lang}"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(config.title ?? "Grimoire")}</title>
<meta name="description" content="${esc(config.description ?? "")}"/>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%93%3C/text%3E%3C/svg%3E"/>
<link rel="stylesheet" href="/app.css"/>
<style>${state.themeCss}</style>
<script>${boot}</script>
<script type="importmap">${importmap}</script>
</head><body><div id="app"></div>
<script type="module" src="/app.js"></script>
</body></html>`;
}

// --- Single-file export ------------------------------------------------------
// Assemble one note into a fully self-contained, shareable HTML file: inlined
// CSS + theme boot, the compiled note body, every user component transpiled and
// inlined as a data: URL module, and the chart.js / mermaid dep chunks only when
// the note actually needs them. Opens and renders with no server and no network.
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const jsDataUrl = (js: string) => `data:text/javascript;base64,${b64(js)}`;

/** Bare specifier → engine shim, mirroring the SPA import map in indexHtml but
 *  resolved to inline data: URLs so the file has no network dependencies. */
function shimDataUrl(name: string): string {
  return jsDataUrl(depModule(name)!);
}

/** Graph ids → `{ id, title, kind }`, for the export payload. */
function titlesFor(ids: string[]) {
  return ids.flatMap((id) => {
    const node = state.graph.nodes.find((n) => n.id === id);
    return node ? [{ id: node.id, title: node.title, kind: node.kind }] : [];
  });
}

async function buildExportHtml(entry: NoteEntry): Promise<string> {
  const config = state.config;
  const lang = entry.lang ?? config.i18n?.defaultLocale ?? "en";

  // Compiled note body (reuse the per-note cache the note API populates).
  let body = noteCache.get(entry.file);
  if (body == null) {
    body = await compileNote(entry.file);
    noteCache.set(entry.file, body);
  }

  // Transpile every user component (reuse the cache) and inline it as a module.
  const components = await Promise.all(
    state.components.map(async (c) => {
      let js = compCache.get(c.file);
      if (js == null) {
        js = await transpileComponent(c.file);
        compCache.set(c.file, js);
      }
      return { name: c.name, src: js };
    }),
  );

  // Only ship the heavy dep chunks when they're reachable: mermaid if the note
  // renders a diagram, chart.js if a user component imports it (the built-in
  // <Chart> bundles chart.js into standalone.js already).
  const usesMermaid = /\bmermaid\b|\bMermaid\b/.test(body);
  const usesChart = components.some((c) => /["']chart\.js(\/auto)?["']/.test(c.src));

  const imports: Record<string, string> = {};
  if (components.length) {
    imports["preact"] = shimDataUrl("preact");
    imports["preact/hooks"] = shimDataUrl("preact/hooks");
    imports["preact/jsx-runtime"] = shimDataUrl("preact/jsx-runtime");
    imports["preact/jsx-dev-runtime"] = shimDataUrl("preact/jsx-dev-runtime");
    imports["preact/compat"] = shimDataUrl("preact-compat");
    imports["@mdx-js/preact"] = shimDataUrl("mdx-preact");
  }
  if (usesChart) {
    const url = jsDataUrl(depChartjs);
    imports["chart.js"] = url;
    imports["chart.js/auto"] = url;
  }
  if (usesMermaid) imports["mermaid"] = jsDataUrl(depMermaid);

  const payload = {
    config: {
      title: config.title,
      description: config.description,
      author: config.author,
      footer: config.footer,
      // An exported file carries the site's palettes so its own theme toggle
      // resolves exactly like the live site.
      theme: { ...state.theme, presets: state.themePresets },
    },
    note: {
      id: entry.id,
      segments: entry.segments,
      lang,
      frontmatter: entry.frontmatter,
      body,
      // A shared file keeps its place in the graph, as plain text: the reader
      // sees what this note links to and what links back, without a server.
      links: titlesFor(state.graph.outgoing[entry.id] ?? []),
      backlinks: titlesFor(state.graph.backlinks[entry.id] ?? []),
    },
    components: components.map((c) => ({ name: c.name, module: jsDataUrl(c.src) })),
  };
  // Serialize for an inline <script>: escape `<` so a value can't close the tag.
  const payloadJs = JSON.stringify(payload).replace(/</g, "\\u003c");

  const fm = entry.frontmatter ?? {};
  const title = (fm.title as string) ?? entry.id.split("/").pop() ?? "Untitled";
  const pageTitle = config.title ? `${title} · ${config.title}` : title;
  const importmap = Object.keys(imports).length
    ? `\n<script type="importmap">${JSON.stringify({ imports })}</script>`
    : "";

  return `<!doctype html><html lang="${esc(lang)}"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(String(fm.description ?? config.description ?? ""))}"/>
<meta name="generator" content="Grimoire"/>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%93%3C/text%3E%3C/svg%3E"/>
<style>${cssSafe(state.css)}</style>
<style>${state.themeCss}</style>
<script>${themeBootScript(config)}</script>${importmap}
</head><body><div id="app"></div>
<script>window.__GRIMOIRE__=${payloadJs}</script>
<script type="module" src="${jsDataUrl(standaloneJs)}"></script>
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

  const startServer = (boundPort: number) =>
    Bun.serve({
      port: boundPort,
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
            // The client rebuilds the same catalog from these, so its picker and
            // its resolver agree with the CSS the server already inlined.
            theme: { ...state.theme, presets: state.themePresets, picker: c.theme?.picker },
            categoryOrder: c.categoryOrder,
            footer: c.footer,
            i18n: c.i18n,
          },
          notes: state.notes.map((n) => ({
            id: n.id,
            segments: n.segments,
            lang: n.lang,
            frontmatter: n.frontmatter,
            links: n.links,
          })),
          cards: state.cardsMeta,
          graph: state.graph,
          components: state.components.map((c) => ({ name: c.name, url: c.url })),
        });
      }

      if (p === "/api/graph") return json(state.graph);

      if (p === "/api/cards") return json(state.cardsMeta);

      if (p.startsWith("/api/card/")) {
        const id = safeDecode(p.slice("/api/card/".length));
        if (id == null) return new Response("bad request", { status: 400 });
        const card = resolveCardEntry(id, url.searchParams.get("lang"));
        if (!card) return new Response(`card not found: ${id}`, { status: 404 });
        try {
          const key = `${card.lang ?? ""}::${card.id}`;
          let body = cardCache.get(key);
          if (body == null) {
            body = await compileMdx(card.body);
            cardCache.set(key, body);
          }
          return txt(body, "text/plain; charset=utf-8");
        } catch (e) {
          return new Response(`compile error: ${(e as Error).message}`, { status: 500 });
        }
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

      if (p.startsWith("/api/export/")) {
        const id = safeDecode(p.slice("/api/export/".length));
        if (id == null) return new Response("bad request", { status: 400 });
        const entry = resolveNoteEntry(id, url.searchParams.get("lang"));
        if (!entry) return new Response(`note not found: ${id}`, { status: 404 });
        try {
          const html = await buildExportHtml(entry);
          const inline = url.searchParams.get("inline") === "1";
          const base = (id.replace(/[/\\]+/g, "-").replace(/[^\w.-]+/g, "") || "note") + ".html";
          const disposition = inline
            ? "inline"
            : `attachment; filename="${base}"; filename*=UTF-8''${encodeURIComponent(base)}`;
          return new Response(html, {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "content-disposition": disposition,
              ...NOCACHE,
            },
          });
        } catch (e) {
          return new Response(`export error: ${(e as Error).message}`, { status: 500 });
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
        if (name === "mermaid") return txt(depMermaid, "text/javascript; charset=utf-8");
        const mod = depModule(name);
        if (mod == null) return new Response("unknown dep", { status: 404 });
        return txt(mod, "text/javascript; charset=utf-8");
      }

      if (p === "/__livereload") {
        // Always answer with an event-stream so the browser's EventSource never
        // errors on the MIME type. With --no-watch the stream just stays idle
        // (it's never registered for reload notifications).
        let ref: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          start(c) {
            ref = c;
            if (WATCH) sseClients.add(c);
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

  // Bind the requested port; if it's taken (e.g. another instance), move to the
  // next free one so multiple projects can run at once. The chosen port is shown
  // in the banner and recorded in the daemon state.
  let server: ReturnType<typeof startServer> | undefined;
  for (let bp = port, i = 0; i < 64 && !server; i++, bp++) {
    for (let attempt = 0; attempt < (i === 0 ? 5 : 1); attempt++) {
      try {
        server = startServer(bp);
        break;
      } catch (e) {
        const msg = String((e as { code?: string; message?: string }).code ?? (e as Error).message ?? e);
        if (!/EADDRINUSE|address already in use/i.test(msg)) throw e;
        if (i === 0 && attempt < 4) {
          await Bun.sleep(120); // retry same port a few times (covers restart races)
          continue;
        }
        break; // give up on this port, try the next
      }
    }
  }
  if (!server) throw new Error(`could not bind a free port near ${port}`);
  if (server.port !== port) {
    process.stdout.write(`\x1b[2m  port ${port} in use → using ${server.port}\x1b[0m\n`);
  }

  const localHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  // If launched by `grimoire start`, advertise our address to the daemon controls.
  writeDaemonState({
    pid: process.pid,
    host,
    port: server.port,
    url: `http://${localHost}:${server.port}`,
    startedAt: new Date().toISOString(),
  });

  banner(host, server.port);
  if (flag("open")) openBrowser(`http://${localHost}:${server.port}`);
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
      `      \x1b[2mnotes:\x1b[0m ${state.notes.length}  \x1b[2mcards:\x1b[0m ${state.cards.length}` +
      `  \x1b[2mlinks:\x1b[0m ${state.graph.edges.length}  \x1b[2mcomponents:\x1b[0m ${state.components.length}\n` +
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
  for (const dir of [state.notesDir, state.componentsDir, state.cardsDir]) {
    if (existsSync(dir)) watch(dir, { recursive: true }, schedule);
  }
  const cfg = findConfig();
  if (cfg && existsSync(cfg)) watch(cfg, schedule);
}

// Dispatch subcommands:
//   verify              → browser-free check (compile + Mermaid syntax)
//   check               → headless full-render check (needs Chromium)
//   start|stop|restart|status → daemon controls
//   serve / (none)      → run the server in the foreground
const argv = Bun.argv.slice(1);
const DAEMON_SUBS = ["start", "stop", "restart", "status"];
const onError = (e: unknown) => {
  console.error(e);
  process.exit(1);
};
if (argv.includes("verify")) {
  import("./verify")
    .then(({ runVerify }) => runVerify(ROOT))
    .then((failures) => process.exit(failures === 0 ? 0 : 1))
    .catch(onError);
} else if (argv.includes("check")) {
  import("./check")
    .then(({ runCheck }) => runCheck(ROOT))
    .then((code) => process.exit(code))
    .catch(onError);
} else {
  const subcommand = argv.find((a) => DAEMON_SUBS.includes(a));
  if (subcommand) runDaemon(subcommand).catch(onError);
  else main().catch(onError);
}
