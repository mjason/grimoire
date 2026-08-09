// remark plugin: turn `[[target]]`, `[[target|Label]]` and `[[target#anchor]]`
// into a <wikilink> element, which the client renders as a resolved (or visibly
// broken) link with a hover preview.
//
// Runs on mdast text nodes only, so `[[…]]` inside code spans and fenced blocks
// is left alone by construction — no source-level stripping needed here.
import { parseWikiTarget } from "./runtime/links";

type Node = { type: string; value?: string; children?: Node[]; [k: string]: any };

const WIKI_RE = /\[\[([^[\]\n]+?)\]\]/g;

function wikiNode(target: string, alias: string | undefined, anchor: string | undefined): Node {
  const label = alias ?? target;
  const href = `#/n/${target.split("/").map(encodeURIComponent).join("/")}${anchor ? `#${anchor}` : ""}`;
  return {
    // A link node keeps this readable if the <wikilink> component is ever absent.
    type: "link",
    url: href,
    children: [{ type: "text", value: label }],
    data: {
      hName: "wikilink",
      hProperties: {
        to: target,
        label,
        ...(anchor ? { anchor } : {}),
      },
    },
  };
}

/** Split one text node into text + wikilink nodes. Returns null when there's nothing to do. */
function splitText(node: Node): Node[] | null {
  const value = String(node.value ?? "");
  if (!value.includes("[[")) return null;

  const out: Node[] = [];
  let last = 0;
  for (const match of value.matchAll(WIKI_RE)) {
    const parsed = parseWikiTarget(match[1]!);
    if (!parsed) continue;
    if (match.index > last) out.push({ type: "text", value: value.slice(last, match.index) });
    out.push(wikiNode(parsed.target, parsed.alias, parsed.anchor));
    last = match.index + match[0].length;
  }
  if (out.length === 0) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

const SKIP = new Set(["link", "linkReference", "definition", "code", "inlineCode", "mdxjsEsm"]);

function transform(node: Node): void {
  if (!Array.isArray(node.children)) return;
  const next: Node[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      const split = splitText(child);
      if (split) {
        next.push(...split);
        continue;
      }
    } else if (!SKIP.has(child.type)) {
      transform(child);
    }
    next.push(child);
  }
  node.children = next;
}

export function remarkWikiLink() {
  return (tree: Node) => transform(tree);
}
