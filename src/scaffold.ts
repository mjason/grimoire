// `bun run new <path/to/note> [--title "..."] [--tags a,b]`
// Creates a starter .mdx note (folders become categories automatically).
import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { NOTES_DIR } from "./paths";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

async function main() {
  const rel = process.argv[2];
  if (!rel || rel.startsWith("--")) {
    console.error('Usage: bun run new <path/to/note> [--title "Title"] [--tags a,b]');
    process.exit(1);
  }

  const slug = rel.replace(/\.mdx$/, "");
  const file = join(NOTES_DIR, `${slug}.mdx`);
  if (existsSync(file)) {
    console.error(`✗ ${slug}.mdx already exists.`);
    process.exit(1);
  }

  const title = flag("title") ?? titleCase(slug.split("/").pop()!);
  const tags = (flag("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
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
