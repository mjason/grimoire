// `bun run new <path/to/note> [--title "..."] [--tags a,b]`
//   Creates a starter .mdx note (folders become categories automatically).
//
// `bun run new --card <deck> --title "..." [--id slug] [--tags a,b]`
//   Appends a card to `cards/<deck>.md`, creating the deck if needed.
import { join, dirname } from "node:path";
import { mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { CARDS_DIR, NOTES_DIR } from "./paths";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function tagList(): string[] {
  return (flag("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Append a card to a deck file. Decks are plain markdown, so this is a concat. */
async function newCard(deck: string): Promise<void> {
  const title = flag("title");
  if (!title) {
    console.error('Usage: bun run new --card <deck> --title "Title" [--id slug] [--tags a,b]');
    process.exit(1);
  }
  const file = join(CARDS_DIR, `${deck.replace(/\.mdx?$/, "")}.md`);
  const id = flag("id");
  const tags = tagList();
  const block =
    `---\ntitle: ${title}\n` +
    (id ? `id: ${id}\n` : "") +
    // No sample `[[link]]` in the body: a placeholder target would show up as a
    // broken link the moment you run `verify`.
    `tags: [${tags.join(", ")}]\n---\n\nOne idea, stated plainly. Link to a note or card with double brackets.\n`;

  await mkdir(dirname(file), { recursive: true });
  // A card block must be preceded by a blank line to start a new card.
  const prefix = existsSync(file) ? "\n" : "";
  await appendFile(file, prefix + block, "utf8");
  console.log(`✓ Added "${title}" to cards/${deck}.md`);
}

async function main() {
  const deck = flag("card");
  if (deck) return newCard(deck);

  const rel = process.argv[2];
  if (!rel || rel.startsWith("--")) {
    console.error(
      'Usage: bun run new <path/to/note> [--title "Title"] [--tags a,b]\n' +
        '       bun run new --card <deck> --title "Title" [--id slug] [--tags a,b]',
    );
    process.exit(1);
  }

  const slug = rel.replace(/\.mdx$/, "");
  const file = join(NOTES_DIR, `${slug}.mdx`);
  if (existsSync(file)) {
    console.error(`✗ ${slug}.mdx already exists.`);
    process.exit(1);
  }

  const title = flag("title") ?? titleCase(slug.split("/").pop()!);
  const tags = tagList();
  const today = new Date().toISOString().slice(0, 10);

  const body = `---
title: ${title}
description:
tags: [${tags.join(", ")}]
date: "${today}"
icon: 📝
---

Write your note here. You can drop in components without importing them:

<Callout type="tip">
This is a starter note — edit \`notes/${slug}.mdx\`.
</Callout>
`;

  await mkdir(dirname(file), { recursive: true });
  await Bun.write(file, body);
  console.log(`✓ Created notes/${slug}.mdx`);
}

main();
