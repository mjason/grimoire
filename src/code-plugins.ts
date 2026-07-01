// Two tiny unified plugins that turn fenced code blocks into a rich "code viewer".
//
// Author syntax (in any .mdx note):
//   ```ts title="server.ts" {2,4-6} showLineNumbers
//   ...code...
//   ```
//
// remarkCodeMeta parses the meta string into data-* attributes on the <code>.
// rehypeCodeLines (run AFTER syntax highlighting) splits the highlighted code
// into per-line <span>s so the client can render line numbers + highlight lines.

type Node = { type: string; tagName?: string; children?: Node[]; [k: string]: any };

function walk(node: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null) {
  visit(node, parent);
  if (node.children) for (const child of node.children) walk(child, visit, node);
}

function parseTitle(meta: string): string | undefined {
  return /title="([^"]*)"/.exec(meta)?.[1] ?? /title='([^']*)'/.exec(meta)?.[1];
}

/** Parse `{1,3-5}` into a Set of 1-based line numbers. */
function parseRanges(spec: unknown): Set<number> {
  const set = new Set<number>();
  if (typeof spec !== "string") return set;
  for (const part of spec.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i);
  }
  return set;
}

/** remark: read each code node's `meta` + `lang` into hProperties (data-* attrs). */
export function remarkCodeMeta() {
  return (tree: Node) => {
    walk(tree, (node) => {
      if (node.type !== "code") return;
      const meta: string = node.meta || "";
      const data = (node.data ||= {});
      const props = (data.hProperties ||= {});
      if (node.lang) props["data-lang"] = node.lang;
      const title = parseTitle(meta);
      if (title) props["data-title"] = title;
      const hl = /\{([\d,\-\s]+)\}/.exec(meta);
      if (hl) props["data-highlight"] = hl[1]!.replace(/\s/g, "");
      if (/(^|\s)(showLineNumbers|lineNumbers|numbers)(\s|$)/.test(meta)) {
        props["data-numbers"] = "true";
      }
    });
  };
}

/** Concatenate all text under a hast node. */
function textOf(node: Node): string {
  if (node.type === "text") return String(node.value ?? "");
  return (node.children ?? []).map(textOf).join("");
}

/**
 * rehype (run BEFORE highlighting): turn a ```mermaid fenced block into a
 * `<mermaid chart="…">` element (mapped to the Mermaid component) so it renders
 * as a diagram instead of a highlighted code block.
 */
export function rehypeMermaid() {
  return (tree: Node) => {
    walk(tree, (node, parent) => {
      if (node.tagName !== "code" || parent?.tagName !== "pre") return;
      const props: Record<string, any> = node.properties ?? {};
      const cls = Array.isArray(props.className) ? props.className.join(" ") : String(props.className ?? "");
      const lang = props["data-lang"] ?? props.dataLang ?? /language-([\w-]+)/.exec(cls)?.[1];
      if (lang !== "mermaid") return;
      const raw = textOf(node).replace(/\n$/, "");
      // Rewrite the wrapping <pre> in place → <mermaid chart="…">.
      parent.tagName = "mermaid";
      parent.properties = { chart: raw };
      parent.children = [];
    });
  };
}

/** Read a hast property that may be camelCased (dataX) or hyphenated (data-x). */
function getProp(props: Record<string, any>, hyphen: string): any {
  const camel = hyphen.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return props[hyphen] ?? props[camel];
}

/** Split a flat list of hast nodes into lines, re-wrapping elements per line. */
function splitLines(nodes: Node[]): Node[][] {
  let lines: Node[][] = [[]];
  const push = (n: Node) => lines[lines.length - 1]!.push(n);
  for (const node of nodes) {
    if (node.type === "text") {
      const parts = String(node.value).split("\n");
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part !== "") push({ type: "text", value: part });
      });
    } else if (node.type === "element") {
      const inner = splitLines(node.children ?? []);
      inner.forEach((lineChildren, i) => {
        if (i > 0) lines.push([]);
        push({ ...node, children: lineChildren });
      });
    } else {
      push(node);
    }
  }
  return lines;
}

/** rehype: wrap each line of a highlighted code block in <span class="code-line">. */
export function rehypeCodeLines() {
  return (tree: Node) => {
    walk(tree, (node, parent) => {
      if (node.tagName !== "code" || parent?.tagName !== "pre") return;
      const props: Record<string, any> = (node.properties ||= {});
      const highlighted = parseRanges(getProp(props, "data-highlight"));

      const lines = splitLines(node.children ?? []);
      while (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();

      node.children = lines.map((children, i) => ({
        type: "element",
        tagName: "span",
        properties: {
          className: ["code-line"],
          ...(highlighted.has(i + 1) ? { "data-hl": "true" } : {}),
        },
        children,
      }));

      if (getProp(props, "data-numbers")) {
        const cn = (props.className ||= []);
        if (Array.isArray(cn)) cn.push("with-line-numbers");
        else props.className = `${cn} with-line-numbers`;
      }
    });
  };
}
