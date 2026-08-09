// Compile every note in a project (its notes dir resolved from config, exactly
// like the server) with the runtime MDX compiler and report any that fail — a
// fast pre-flight check: no browser, no engine build needed.
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { scanNotes, compileNote, compileMdx } from "./runtime/content";
import { scanCards } from "./runtime/cards";
import { buildGraph, type GraphEntry } from "./runtime/links";
import { checkMermaid } from "./check-mermaid";
import { loadConfig, resolveDir } from "./load-config";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export async function runVerify(root: string): Promise<number> {
  // Resolve the notes dir from the project's config (same as the server), so this
  // honors a custom `notes` dir like `content/` instead of assuming `<root>/notes`.
  const config = await loadConfig(root);
  const notesDir = resolveDir(root, config.notes, "notes");
  const cardsDir = resolveDir(root, config.cards, "cards");
  const locales = (config.i18n?.locales ?? []).map((l: { code: string }) => l.code);
  const notes = await scanNotes(notesDir, locales);
  const cards = await scanCards(cardsDir, locales);

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
  const noteFailures = failures;

  // Cards compile through the same MDX pipeline, so check them the same way.
  for (const card of cards) {
    const tag = card.lang ? ` ${DIM}[${card.lang}]${RESET}` : "";
    try {
      await compileMdx(card.body);
      const issues = await checkMermaid(card.body);
      if (issues.length > 0) throw new Error(`mermaid: ${issues[0]!.error}`);
      process.stdout.write(`${GREEN}✓${RESET} ${DIM}card${RESET} ${card.id}${tag}\n`);
    } catch (err) {
      failures++;
      process.stdout.write(`${RED}✗ card ${card.id}${RESET}${tag}\n  ${(err as Error).message}\n`);
    }
  }

  // Every `[[link]]` that points at nothing. Not fatal — a note can legitimately
  // reference something you haven't written yet — but always worth seeing.
  const entries: GraphEntry[] = [
    ...new Map(
      notes.map((n): [string, GraphEntry] => [
        n.id,
        {
          id: n.id,
          kind: "note",
          title: String(n.frontmatter?.title ?? n.id),
          aliases: Array.isArray(n.frontmatter?.aliases) ? n.frontmatter.aliases.map(String) : [],
          links: n.links,
        },
      ]),
    ).values(),
    ...new Map(
      cards.map((c): [string, GraphEntry] => [
        c.id,
        { id: c.id, kind: "card", title: c.title, links: c.links },
      ]),
    ).values(),
  ];
  const graph = buildGraph(entries);
  if (graph.broken.length > 0) {
    process.stdout.write(`\n${YELLOW}!${RESET} ${graph.broken.length} unresolved link(s):\n`);
    for (const link of graph.broken) {
      process.stdout.write(`  ${DIM}${link.source}${RESET} → ${YELLOW}[[${link.target}]]${RESET}\n`);
    }
  }

  const total = notes.length + cards.length;
  process.stdout.write(
    `\n${failures === 0 ? GREEN + "✓" : RED + "✗"} ${total - failures}/${total} entries OK` +
      `${RESET} ${DIM}(${notes.length - noteFailures} notes, ${cards.length - (failures - noteFailures)} cards, ` +
      `${graph.edges.length} links)${RESET}\n`,
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
