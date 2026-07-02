// Full-render check: render every note (each locale) in a headless browser and
// report anything that would break in a real browser — component exceptions,
// Mermaid errors, failed component loads, console errors. Unlike `verify` (which
// only proves a note compiles), this catches runtime render failures, so an AI
// can self-check its work without a human opening a browser.
//
//   bun run check                # dev, checks ./notes
//   grimoire check               # same, from the binary
//   grimoire check /path/to/proj # another project
//
// The browser is Bun's built-in `Bun.WebView` (Bun 1.3.12+): zero deps on macOS
// (WKWebView), and Chrome/Chromium via CDP elsewhere (auto-detected, or set
// GRIMOIRE_CHROMIUM / BUN_CHROME_PATH). No Playwright, no separate download — so
// this works straight from the compiled binary too.
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const YEL = "\x1b[33m";
const RESET = "\x1b[0m";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Returns a process exit code: 0 = all clean, 1 = errors found, 2 = no browser. */
export async function runCheck(root: string): Promise<number> {
  // Running from source (dev) vs the compiled binary: in dev we rebuild the
  // engine first and launch the server via `bun serve.ts`; the binary already
  // embeds the engine and re-launches itself.
  const serveSrc = join(import.meta.dir, "serve.ts");
  const isDev = existsSync(serveSrc);
  if (isDev) {
    const { buildEngine } = await import("./engine");
    await buildEngine();
  }

  const stateFile = join(tmpdir(), `grimoire-check-${process.pid}.json`);
  await rm(stateFile, { force: true });
  const serveArgs = [
    "serve", "--root", root, "--host", "127.0.0.1",
    "--port", "43219", "--no-watch", "--daemon-state", stateFile,
  ];
  const cmd = isDev ? ["bun", serveSrc, ...serveArgs] : [process.execPath, ...serveArgs];
  const server = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });

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
    return 1;
  }

  const manifest = (await (await fetch(`${base}/api/manifest`)).json()) as {
    config?: { i18n?: { defaultLocale?: string } };
    notes: { id: string; lang: string | null }[];
  };
  const defaultLocale = manifest.config?.i18n?.defaultLocale ?? "en";

  // Prefer an explicitly configured Chrome path (Bun reads BUN_CHROME_PATH).
  const chromePath = process.env.GRIMOIRE_CHROMIUM || process.env.CHROME_PATH;
  if (chromePath && !process.env.BUN_CHROME_PATH) process.env.BUN_CHROME_PATH = chromePath;

  let current: string[] = [];
  let wv: any;
  try {
    wv = new (Bun as any).WebView({
      headless: true,
      console: (level: unknown, ...args: unknown[]) => {
        if (String(level) === "error") current.push(args.map(String).join(" "));
      },
    });
  } catch (e) {
    server.kill();
    await rm(stateFile, { force: true });
    process.stderr.write(
      `${RED}✗${RESET} couldn't launch a browser: ${(e as Error).message}\n` +
        `  Install Chromium/Chrome (or set ${YEL}GRIMOIRE_CHROMIUM${RESET}), or run ${YEL}verify${RESET} (browser-free).\n`,
    );
    return 2;
  }

  let failures = 0;
  for (let i = 0; i < manifest.notes.length; i++) {
    const note = manifest.notes[i]!;
    const lang = note.lang ?? defaultLocale;
    const label = `${note.id}${note.lang ? ` ${DIM}[${note.lang}]${RESET}` : ""}`;
    current = [];

    const path = note.id.split("/").map(encodeURIComponent).join("/");
    const url = `${base}/?lang=${encodeURIComponent(lang)}&_check=${i}#/n/${path}`;
    try {
      await wv.navigate(url);
      await sleep(1400); // let effects (incl. Mermaid) run
    } catch (e) {
      current.push(`navigation: ${(e as Error).message.split("\n")[0]}`);
    }

    const errors = [...new Set(current)];
    if (errors.length) {
      failures++;
      process.stdout.write(`${RED}✗${RESET} ${label}\n`);
      for (const e of errors) process.stdout.write(`  ${RED}·${RESET} ${e}\n`);
    } else {
      process.stdout.write(`${GREEN}✓${RESET} ${label}\n`);
    }
  }

  try {
    wv.close();
  } catch {
    /* ignore */
  }
  server.kill();
  await rm(stateFile, { force: true });

  process.stdout.write(
    `\n${failures === 0 ? GREEN + "✓" : RED + "✗"} ${manifest.notes.length - failures}/${manifest.notes.length} notes rendered clean${RESET}\n`,
  );
  return failures === 0 ? 0 : 1;
}

if (import.meta.main) {
  runCheck(resolve(process.argv[2] ?? process.cwd()))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
