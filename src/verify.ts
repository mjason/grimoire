// Compile every note in a project (its notes dir resolved from config, exactly
// like the server) with the runtime MDX compiler and report any that fail — a
// fast pre-flight check: no browser, no engine build needed.
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { scanNotes, compileNote } from "./runtime/content";
import { checkMermaid } from "./check-mermaid";
import { loadConfig, resolveDir } from "./load-config";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export async function runVerify(root: string): Promise<number> {
  // Resolve the notes dir from the project's config (same as the server), so this
  // honors a custom `notes` dir like `content/` instead of assuming `<root>/notes`.
  const config = await loadConfig(root);
  const notesDir = resolveDir(root, config.notes, "notes");
  const locales = (config.i18n?.locales ?? []).map((l: { code: string }) => l.code);
  const notes = await scanNotes(notesDir, locales);

  let failures = 0;
  for (const note of notes) {
    const tag = note.lang ? ` ${DIM}[${note.lang}]${RESET}` : "";
    try {
      const raw = await readFile(note.file, "utf8");
      const body = await compileNote(note.file);
      if (!body || body.length < 1) throw new Error("empty output");
      // Beyond "does it compile?": parse-check any Mermaid diagrams too, since a
      // bad diagram compiles fine and only fails when rendered.
      const issues = await checkMermaid(raw);
      if (issues.length > 0) {
        failures++;
        process.stdout.write(`${RED}✗ ${note.id}${RESET}${tag}\n`);
        for (const it of issues) {
          process.stdout.write(`  ${RED}mermaid:${RESET} ${it.error}\n  ${DIM}${it.source.split("\n")[0]}…${RESET}\n`);
        }
        continue;
      }
      process.stdout.write(`${GREEN}✓${RESET} ${note.id}${tag}\n`);
    } catch (err) {
      failures++;
      process.stdout.write(`${RED}✗ ${note.id}${RESET}${tag}\n  ${(err as Error).message}\n`);
    }
  }
  process.stdout.write(
    `\n${failures === 0 ? GREEN + "✓" : RED + "✗"} ${notes.length - failures}/${notes.length} notes OK${RESET}\n`,
  );
  return failures;
}

if (import.meta.main) {
  runVerify(resolve(process.argv[2] ?? process.cwd()))
    .then((failures) => process.exit(failures === 0 ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
