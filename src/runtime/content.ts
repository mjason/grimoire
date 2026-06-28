// Runtime content layer: scan an external notes/ + components/ directory, parse
// frontmatter, and compile on demand (MDX → portable function-body, TSX → ESM).
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import { compile } from "@mdx-js/mdx";
import { mdxCompileOptions } from "../mdx-options";

export interface NoteEntry {
  id: string;
  segments: string[];
  lang: string | null;
  file: string;
  frontmatter: Record<string, any>;
}

export interface ComponentEntry {
  name: string;
  url: string; // path under components/, used as the /_component/<url> route
  file: string;
}

async function walk(dir: string, match: (n: string) => boolean): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...(await walk(full, match)));
    } else if (match(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function toPascalCase(name: string): string {
  return name
    .replace(/\.[tj]sx?$/, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
}

function noteIdentity(
  absPath: string,
  notesDir: string,
  locales: string[],
): { id: string; segments: string[]; lang: string | null } {
  const rel = relative(notesDir, absPath).split(sep).join("/").replace(/\.mdx$/, "");
  const parts = rel.split("/");
  let fileSlug = parts.pop()!;
  const segments = parts;
  let lang: string | null = null;
  const dot = fileSlug.lastIndexOf(".");
  if (dot > 0) {
    const suffix = fileSlug.slice(dot + 1);
    if (locales.includes(suffix)) {
      lang = suffix;
      fileSlug = fileSlug.slice(0, dot);
    }
  }
  const id = fileSlug === "index" ? segments.join("/") : [...segments, fileSlug].join("/");
  return { id, segments, lang };
}

export async function scanNotes(notesDir: string, locales: string[]): Promise<NoteEntry[]> {
  const files = (await walk(notesDir, (n) => n.endsWith(".mdx"))).sort();
  const out: NoteEntry[] = [];
  for (const file of files) {
    const { id, segments, lang } = noteIdentity(file, notesDir, locales);
    let data: Record<string, any> = {};
    try {
      data = matter(await readFile(file, "utf8")).data ?? {};
    } catch {
      /* malformed frontmatter — treat as empty */
    }
    if (data.draft) continue;
    // Normalize a YAML Date back to a plain string for JSON transport.
    if (data.date instanceof Date) data.date = data.date.toISOString().slice(0, 10);
    out.push({ id, segments, lang, file, frontmatter: data });
  }
  return out;
}

export async function scanComponents(componentsDir: string): Promise<ComponentEntry[]> {
  const files = (
    await walk(componentsDir, (n) => /\.[tj]sx?$/.test(n) && !n.startsWith("index."))
  ).sort();
  return files.map((file) => ({
    name: toPascalCase(basename(file)),
    url: relative(componentsDir, file).split(sep).join("/"),
    file,
  }));
}

/** Compile a note's MDX into a portable function-body the client evaluates. */
export async function compileNote(file: string): Promise<string> {
  const { content } = matter(await readFile(file, "utf8"));
  const compiled = await compile(content, mdxCompileOptions("function-body") as any);
  return String(compiled);
}

// External bare specifiers resolved by the page's import map (→ /_dep shims).
const COMPONENT_EXTERNALS = [
  "preact",
  "preact/hooks",
  "preact/jsx-runtime",
  "preact/jsx-dev-runtime",
  "preact/compat",
  "@mdx-js/preact",
  "chart.js",
  "chart.js/auto",
];

let tmpDirPromise: Promise<string> | null = null;
function tmpDir(): Promise<string> {
  return (tmpDirPromise ??= mkdtemp(join(tmpdir(), "grimoire-comp-")));
}

/** Bundle a user .tsx/.ts component into a browser ES module. We use Bun.build
 *  (not Bun.Transpiler) so the JSX runtime import is emitted; preact deps are
 *  externalized and resolved at runtime via the import map. */
export async function transpileComponent(file: string): Promise<string> {
  const src = await readFile(file, "utf8");
  const dir = await tmpDir();
  // The `@jsxImportSource preact` pragma makes Bun use preact's JSX runtime
  // regardless of any tsconfig (absent in the standalone binary).
  const tmp = join(dir, `${Bun.hash(file).toString(36)}.tsx`);
  await writeFile(tmp, `/* @jsxImportSource preact */\n${src}`);

  const result = await Bun.build({
    entrypoints: [tmp],
    target: "browser",
    format: "esm",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    external: COMPONENT_EXTERNALS,
  });
  if (!result.success) {
    throw new Error(result.logs.map((l) => String(l)).join("\n"));
  }
  return await result.outputs[0]!.text();
}
