// Validate Mermaid diagrams from the command line — no browser needed.
// `verify` only proves a note *compiles*; a bad ```mermaid block compiles fine
// and only fails when rendered. mermaid.parse() runs the same grammar check the
// browser does, under a minimal happy-dom shim, so we can catch it headlessly.
import { Window } from "happy-dom";

let mermaidP: Promise<any> | null = null;

async function getMermaid(): Promise<any> {
  if (!mermaidP) {
    mermaidP = (async () => {
      const w = new Window();
      const g = globalThis as any;
      for (const k of ["navigator", "getComputedStyle", "MutationObserver", "Element", "SVGElement", "Node"]) {
        if ((w as any)[k] !== undefined) g[k] = (w as any)[k];
      }
      g.window = w.window;
      g.document = w.document;
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      return mermaid;
    })();
  }
  return mermaidP;
}

/** Pull every Mermaid source out of a raw .mdx note: ```mermaid fenced blocks
 *  and `<Mermaid chart={`…`} />` / `<Mermaid chart="…" />` component forms. */
export function extractMermaid(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/```mermaid\b[^\n]*\n([\s\S]*?)\n```/g)) out.push(m[1]!);
  for (const m of src.matchAll(/<Mermaid\b[^>]*?\bchart=\{`([\s\S]*?)`\}/g)) out.push(m[1]!);
  for (const m of src.matchAll(/<Mermaid\b[^>]*?\bchart="([^"]*)"/g)) out.push(m[1]!);
  return out.map((s) => s.trim()).filter(Boolean);
}

export interface MermaidIssue {
  source: string; // the diagram source
  error: string; // first line of the parser error
}

/** Parse-check every Mermaid diagram in a note. Returns one issue per bad block.
 *  If mermaid itself can't be loaded, returns [] (never blocks verify). */
export async function checkMermaid(mdxSource: string): Promise<MermaidIssue[]> {
  const blocks = extractMermaid(mdxSource);
  if (blocks.length === 0) return [];
  let mermaid: any;
  try {
    mermaid = await getMermaid();
  } catch {
    return [];
  }
  const issues: MermaidIssue[] = [];
  for (const source of blocks) {
    try {
      await mermaid.parse(source);
    } catch (e) {
      issues.push({ source, error: String((e as Error)?.message ?? e).split("\n")[0]!.trim() });
    }
  }
  return issues;
}
