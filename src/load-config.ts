// Shared project-config resolution used by both the server (serve.ts) and the
// CLI checks (verify.ts). Keeping this in one place is deliberate: `verify` once
// hardcoded `<root>/notes` and ignored the config's `notes` field, so it silently
// scanned nothing on projects that put their notes elsewhere (e.g. `content/`).
// Everyone resolves the project the same way now.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { DEFAULT_CONFIG } from "./config";
import type { GrimoireConfig } from "./types";

// Recognized config filenames, in priority order. `.jsonc` is included so
// comment-annotated configs load (JSON.parse alone would choke on them).
const CONFIG_NAMES = ["config.ts", "config.js", "config.mjs", "config.json", "config.jsonc"];

/** Resolve `p` against `base` (absolute stays as-is), or `base/fallback` when `p` is unset. */
export function resolveDir(base: string, p: string | undefined, fallback: string): string {
  return p ? (isAbsolute(p) ? p : resolve(base, p)) : resolve(base, fallback);
}

/** Locate a project's config file: `explicit` (a `--config` path) wins, else the
 *  first of the known names present under `root`. Returns undefined if none. */
export function findConfig(root: string, explicit?: string): string | undefined {
  if (explicit) return resolveDir(root, explicit, "");
  for (const name of CONFIG_NAMES) {
    const p = join(root, name);
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Parse JSON with comments + trailing commas (jsonc). String contents are
 *  preserved, so `//` or `/*` inside a value isn't mistaken for a comment. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inStr = false;
  let line = false;
  let block = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const n = text[i + 1];
    if (line) {
      if (c === "\n") {
        line = false;
        out += c;
      }
    } else if (block) {
      if (c === "*" && n === "/") {
        block = false;
        i++;
      }
    } else if (inStr) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "/" && n === "/") {
      line = true;
      i++;
    } else if (c === "/" && n === "*") {
      block = true;
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** Load a project's config (jsonc / json / ts / js / mjs) merged over the defaults.
 *  Falls back to the defaults when there's no config or it fails to parse. */
export async function loadConfig(root: string, explicit?: string): Promise<GrimoireConfig> {
  const file = findConfig(root, explicit);
  if (!file || !existsSync(file)) return DEFAULT_CONFIG;
  try {
    if (file.endsWith(".json") || file.endsWith(".jsonc")) {
      return { ...DEFAULT_CONFIG, ...(parseJsonc(await readFile(file, "utf8")) as object) };
    }
    const mod = await import(`${file}?t=${Date.now()}`);
    return { ...DEFAULT_CONFIG, ...(mod.default ?? mod.config ?? {}) };
  } catch (e) {
    console.error(`grimoire: failed to load config (${file}):`, (e as Error).message);
    return DEFAULT_CONFIG;
  }
}
