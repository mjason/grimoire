// SSR smoke-test: compile + render every note to a string with the real
// component map. Catches MDX wiring errors, undefined components and crashes
// in component render paths — without needing a browser. (Effects/canvas are
// skipped during string rendering, which is exactly what we want here.)
import { mdxPlugin } from "./mdx-plugin";
import { writeManifest } from "./manifest";
import { CONFIG_FILE } from "./paths";

Bun.plugin(mdxPlugin);

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function main() {
  let locales: string[] = [];
  try {
    const cfg = (await import(CONFIG_FILE)).default;
    locales = (cfg?.i18n?.locales ?? []).map((l: { code: string }) => l.code);
  } catch {
    /* no config / no i18n */
  }
  await writeManifest(locales);

  // Dynamic imports so they evaluate *after* the MDX plugin is registered.
  const { h } = await import("preact");
  const { renderToString } = await import("preact-render-to-string");
  const { mdxComponents } = await import("./client/components");
  const { resolveNotes } = await import("./client/lib/notes");

  const notes = resolveNotes();
  let failures = 0;

  for (const note of notes) {
    try {
      const html = renderToString(h(note.Component as any, { components: mdxComponents }));
      if (!html || html.length < 1) throw new Error("rendered empty output");
      process.stdout.write(`${GREEN}✓${RESET} ${note.id} ${DIM}(${html.length} chars)${RESET}\n`);
    } catch (err) {
      failures++;
      process.stdout.write(`${RED}✗ ${note.id}${RESET}\n  ${(err as Error).message}\n`);
    }
  }

  process.stdout.write(
    `\n${failures === 0 ? GREEN + "✓" : RED + "✗"} ${notes.length - failures}/${notes.length} notes rendered${RESET}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
