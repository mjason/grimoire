// Compile every note in ./notes with the runtime MDX compiler and report any
// that fail — a fast pre-flight check (no browser, no engine build needed).
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { scanNotes, compileNote } from "./runtime/content";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function loadLocales(root: string): Promise<string[]> {
  for (const name of ["config.json", "config.ts", "config.js", "config.mjs"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    try {
      const cfg = name.endsWith(".json")
        ? JSON.parse(await readFile(p, "utf8"))
        : (await import(`${p}?t=${Date.now()}`)).default;
      return (cfg?.i18n?.locales ?? []).map((l: { code: string }) => l.code);
    } catch {
      return [];
    }
  }
  return [];
}

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const notesDir = resolve(root, "notes");
  const locales = await loadLocales(root);
  const notes = await scanNotes(notesDir, locales);

  let failures = 0;
  for (const note of notes) {
    try {
      const body = await compileNote(note.file);
      if (!body || body.length < 1) throw new Error("empty output");
      process.stdout.write(`${GREEN}✓${RESET} ${note.id}${note.lang ? ` ${DIM}[${note.lang}]${RESET}` : ""}\n`);
    } catch (err) {
      failures++;
      process.stdout.write(`${RED}✗ ${note.id}${RESET}\n  ${(err as Error).message}\n`);
    }
  }
  process.stdout.write(
    `\n${failures === 0 ? GREEN + "✓" : RED + "✗"} ${notes.length - failures}/${notes.length} notes compiled${RESET}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
