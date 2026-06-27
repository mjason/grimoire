import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  CLIENT_ENTRY,
  DIST_DIR,
  ROOT_DIR,
  STYLES_ENTRY,
  CONFIG_FILE,
} from "./paths";
import { mdxPlugin } from "./mdx-plugin";
import { writeManifest } from "./manifest";
import { DEFAULT_CONFIG } from "./config";
import type { GrimoireConfig } from "./types";

const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function loadConfig(): Promise<GrimoireConfig> {
  try {
    const mod = await import(`${CONFIG_FILE}?t=${Date.now()}`);
    return { ...DEFAULT_CONFIG, ...(mod.default ?? mod.config ?? {}) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// A small palette so config.theme.accent maps to a real color without
// pulling Tailwind's full color list into the runtime. {base, fg}.
const ACCENTS: Record<string, [string, string]> = {
  violet: ["#7c3aed", "#ffffff"],
  indigo: ["#4f46e5", "#ffffff"],
  blue: ["#2563eb", "#ffffff"],
  sky: ["#0284c7", "#ffffff"],
  cyan: ["#0891b2", "#ffffff"],
  emerald: ["#059669", "#ffffff"],
  green: ["#16a34a", "#ffffff"],
  amber: ["#d97706", "#ffffff"],
  orange: ["#ea580c", "#ffffff"],
  rose: ["#e11d48", "#ffffff"],
  pink: ["#db2777", "#ffffff"],
  fuchsia: ["#c026d3", "#ffffff"],
};

function htmlShell(config: GrimoireConfig): string {
  const title = escapeHtml(config.title ?? "Grimoire");
  const desc = escapeHtml(config.description ?? "");
  const mode = config.theme?.defaultMode ?? "system";
  const [accent, accentFg] = ACCENTS[config.theme?.accent ?? "violet"] ?? ACCENTS.violet!;
  const accentStyle = `:root{--accent:${accent};--accent-fg:${accentFg};--accent-soft:color-mix(in srgb, ${accent} 14%, transparent);}`;
  // Inline boot script: set the color mode before paint to avoid a flash.
  const boot = `(()=>{try{var m=localStorage.getItem("grimoire-mode")||${JSON.stringify(mode)};var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%93%3C/text%3E%3C/svg%3E" />
<link rel="stylesheet" href="/app.css" />
<style>${accentStyle}</style>
<script>${boot}</script>
</head>
<body>
<div id="app"></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function runTailwind(): Promise<void> {
  const bin = join(ROOT_DIR, "node_modules", ".bin", "tailwindcss");
  const proc = Bun.spawn(
    [
      bin,
      "--input",
      STYLES_ENTRY,
      "--output",
      join(DIST_DIR, "app.css"),
      "--minify",
    ],
    { cwd: ROOT_DIR, stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`Tailwind build failed:\n${err}`);
  }
}

async function bundleClient(): Promise<number> {
  const result = await Bun.build({
    entrypoints: [CLIENT_ENTRY],
    outdir: DIST_DIR,
    target: "browser",
    format: "esm",
    minify: true,
    splitting: false,
    naming: { entry: "app.[ext]" },
    plugins: [mdxPlugin],
    define: { "process.env.NODE_ENV": '"production"' },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Client bundle failed.");
  }

  let bytes = 0;
  for (const out of result.outputs) bytes += out.size ?? 0;
  return bytes;
}

export async function build(): Promise<void> {
  const started = performance.now();
  process.stdout.write(`${BOLD}grimoire${RESET} ${DIM}building…${RESET}\n`);

  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  const { notes, components } = await writeManifest();
  const config = await loadConfig();

  const bytes = await bundleClient();
  await runTailwind();
  await writeFile(join(DIST_DIR, "index.html"), htmlShell(config), "utf8");

  const ms = Math.round(performance.now() - started);
  const kb = (bytes / 1024).toFixed(0);
  process.stdout.write(
    `${GREEN}✓${RESET} ${notes} note${notes === 1 ? "" : "s"}, ${components} custom component${components === 1 ? "" : "s"} ${DIM}·${RESET} ${kb} kB js ${DIM}·${RESET} ${ms} ms\n`,
  );
}

if (import.meta.main) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
