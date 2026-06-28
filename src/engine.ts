// Build the engine client (the part baked into the binary): bundle the runtime
// boot entry into dist/engine/app.js and precompute the Tailwind candidate class
// names used by the engine + built-in components.
import { mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { SRC_DIR, DIST_DIR, CLIENT_DIR } from "./paths";
import { extractCandidates } from "./runtime/css";

// Extra npm deps a user component may import. Pre-bundled into served ES module
// chunks (preact externalized so preact/compat shares the engine's instance),
// so `import Chart from "chart.js/auto"` etc. resolve via the page import map.
// chart.js is self-contained (no preact), so it bundles cleanly into a served
// chunk loaded on demand. (preact/compat is instead bundled into the engine and
// exposed via a shim — see boot.tsx / serve.ts — so it shares preact's instance.)
const DEP_CHUNKS: Record<string, string> = {
  "dep.chartjs.js": `export * from "chart.js";\nexport { default } from "chart.js/auto";`,
};

async function buildDepChunks(): Promise<void> {
  // Entries must live inside the project so Bun.build resolves node_modules.
  const dir = join(DIST_DIR, ".dep-src");
  await mkdir(dir, { recursive: true });
  try {
    for (const [out, src] of Object.entries(DEP_CHUNKS)) {
      const entry = join(dir, out);
      await writeFile(entry, src);
      const r = await Bun.build({
        entrypoints: [entry],
        target: "browser",
        format: "esm",
        minify: true,
        define: { "process.env.NODE_ENV": '"production"' },
      });
      if (!r.success) {
        for (const log of r.logs) console.error(log);
        throw new Error(`dep chunk ${out} failed`);
      }
      await writeFile(join(ENGINE_OUT, out), await r.outputs[0]!.text(), "utf8");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const ENGINE_OUT = join(DIST_DIR, "engine");
const BOOT_ENTRY = join(CLIENT_DIR, "runtime", "boot.tsx");

async function walk(dir: string, match: (n: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "generated") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, match)));
    else if (match(e.name)) out.push(full);
  }
  return out;
}

export async function buildEngine(): Promise<void> {
  const started = performance.now();
  await mkdir(ENGINE_OUT, { recursive: true });

  const result = await Bun.build({
    entrypoints: [BOOT_ENTRY],
    outdir: ENGINE_OUT,
    target: "browser",
    format: "esm",
    minify: true,
    naming: { entry: "app.[ext]" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("engine bundle failed");
  }
  const bytes = result.outputs.reduce((n, o) => n + (o.size ?? 0), 0);

  // Pre-bundle optional dep chunks (chart.js, preact/compat) for user components.
  await buildDepChunks();

  // Precompute Tailwind candidates from the engine + built-in component sources.
  const files = await walk(CLIENT_DIR, (n) => /\.(tsx?|css)$/.test(n));
  const candidates = new Set<string>();
  for (const f of files) extractCandidates(await readFile(f, "utf8"), candidates);
  await writeFile(join(ENGINE_OUT, "candidates.txt"), [...candidates].join("\n"), "utf8");

  const ms = Math.round(performance.now() - started);
  process.stdout.write(
    `\x1b[32m✓\x1b[0m engine built \x1b[2m·\x1b[0m ${(bytes / 1024).toFixed(0)} kB js \x1b[2m·\x1b[0m ${candidates.size} candidates \x1b[2m·\x1b[0m ${ms} ms\n`,
  );
}

if (import.meta.main) {
  buildEngine().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
