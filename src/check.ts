// Full-render check: render every note (each locale) in a headless browser and
// report anything that would break in a real browser — component exceptions,
// Mermaid errors, failed component loads, console errors. Unlike `verify` (which
// only proves a note compiles), this catches runtime render failures, so an AI
// can self-check its work without a human opening a browser.
//
//   bun run check                # checks ./notes
//   bun run check /path/to/proj  # checks another project
//
// Needs a Chromium/Chrome (set GRIMOIRE_CHROMIUM=/path, or one is auto-detected).
// No browser available? `bun run verify` is the browser-free fallback (compile +
// Mermaid syntax).
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright-core";
import { buildEngine } from "./engine";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const YEL = "\x1b[33m";
const RESET = "\x1b[0m";

function findChromium(): string | null {
  const env = process.env.GRIMOIRE_CHROMIUM || process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  for (const p of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const chromePath = findChromium();
  if (!chromePath) {
    process.stderr.write(
      `${RED}✗${RESET} No Chromium/Chrome found.\n` +
        `  Set ${YEL}GRIMOIRE_CHROMIUM${RESET}=/path/to/chromium, or run ${YEL}bun run verify${RESET} ` +
        `(browser-free: compile + Mermaid syntax).\n`,
    );
    process.exit(2);
  }

  // Fresh engine so the check reflects the current components.
  await buildEngine();

  // Start the server; it writes its bound address to the state file (covers the
  // auto-incremented port if ours is taken).
  const stateFile = join(tmpdir(), `grimoire-check-${process.pid}.json`);
  await rm(stateFile, { force: true });
  const server = Bun.spawn(
    ["bun", "src/serve.ts", "--root", root, "--host", "127.0.0.1", "--port", "43219", "--no-watch", "--daemon-state", stateFile],
    { stdout: "ignore", stderr: "ignore" },
  );

  let base = "";
  for (let i = 0; i < 60 && !base; i++) {
    try {
      const s = JSON.parse(await readFile(stateFile, "utf8"));
      if (s.port) base = `http://127.0.0.1:${s.port}`;
    } catch {
      /* not up yet */
    }
    if (!base) await sleep(150);
  }
  if (!base) {
    server.kill();
    process.stderr.write(`${RED}✗${RESET} server did not start\n`);
    process.exit(1);
  }

  const manifest = (await (await fetch(`${base}/api/manifest`)).json()) as {
    config?: { i18n?: { defaultLocale?: string } };
    notes: { id: string; lang: string | null }[];
  };
  const defaultLocale = manifest.config?.i18n?.defaultLocale ?? "en";

  const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
  const ctx = await browser.newContext();

  let failures = 0;
  for (const note of manifest.notes) {
    const lang = note.lang ?? defaultLocale;
    const label = `${note.id}${note.lang ? ` ${DIM}[${note.lang}]${RESET}` : ""}`;
    const errors: string[] = [];

    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`uncaught: ${e.message.split("\n")[0]}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().split("\n")[0]);
    });
    // pin the locale before app scripts run
    await page.addInitScript((l) => {
      try {
        localStorage.setItem("grimoire-locale", l as string);
      } catch {
        /* ignore */
      }
    }, lang);

    const path = note.id.split("/").map(encodeURIComponent).join("/");
    // cache-busting query forces a fresh app instance per note
    const url = `${base}/?_check=${encodeURIComponent(note.id + ":" + lang)}#/n/${path}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await sleep(1400); // let effects (incl. Mermaid) run
    } catch (e) {
      errors.push(`navigation: ${(e as Error).message.split("\n")[0]}`);
    }
    await page.close();

    if (errors.length) {
      failures++;
      process.stdout.write(`${RED}✗${RESET} ${label}\n`);
      for (const e of [...new Set(errors)]) process.stdout.write(`  ${RED}·${RESET} ${e}\n`);
    } else {
      process.stdout.write(`${GREEN}✓${RESET} ${label}\n`);
    }
  }

  await browser.close();
  server.kill();
  await rm(stateFile, { force: true });

  process.stdout.write(
    `\n${failures === 0 ? GREEN + "✓" : RED + "✗"} ${manifest.notes.length - failures}/${manifest.notes.length} notes rendered clean${RESET}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
