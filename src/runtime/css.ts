// Server-side Tailwind: compile the engine stylesheet + scan note/component
// sources for class names, generating the final CSS in-process (no CLI, no
// browser runtime). Works in the standalone binary via injected resources.

export interface TailwindResources {
  /** Contents of `tailwindcss/index.css` (the only stylesheet Tailwind loads). */
  twIndexCss: string;
  /** The `@tailwindcss/typography` plugin module (default export). */
  typographyPlugin: unknown;
}

export interface CssCompiler {
  build: (candidates: string[]) => string;
}

function stripSources(css: string): string {
  // `@source` directives are for Tailwind's own file scanner; we extract
  // candidates ourselves, so drop them (the files don't exist in the binary).
  return css.replace(/^\s*@source\b[^;]*;\s*$/gm, "");
}

/** Create a reusable Tailwind compiler from the engine stylesheet. */
export async function createCssCompiler(
  stylesCss: string,
  res: TailwindResources,
): Promise<CssCompiler> {
  const { compile } = await import("tailwindcss");
  const compiler = await compile(stripSources(stylesCss), {
    base: "/",
    loadStylesheet: async (id: string) => {
      if (id === "tailwindcss" || id.endsWith("tailwindcss/index.css") || id === "tailwindcss/index.css") {
        return { base: "/", content: res.twIndexCss };
      }
      throw new Error(`grimoire: cannot resolve stylesheet import "${id}"`);
    },
    loadModule: async (id: string) => {
      if (id.includes("typography")) {
        return { base: "/", module: res.typographyPlugin, path: id };
      }
      throw new Error(`grimoire: cannot resolve module "${id}"`);
    },
  });
  return compiler as unknown as CssCompiler;
}

// Token shape that covers Tailwind utilities incl. variants (`dark:`, `hover:`),
// fractions (`w-1/2`), arbitrary values (`text-[var(--accent)]`, `p-[3px]`).
const CANDIDATE_RE = /-?(?:[a-zA-Z@][a-zA-Z0-9_-]*|\[[^\]\s]*\])(?:[:/](?:[a-zA-Z0-9_.%#-]+|\[[^\]\s]*\]))*!?/g;

/** Extract candidate class names from arbitrary source text. */
export function extractCandidates(text: string, into: Set<string> = new Set()): Set<string> {
  for (const m of text.matchAll(CANDIDATE_RE)) into.add(m[0]);
  return into;
}
