// Syntax highlighting for the dark-magician DSL.
//
// The DSL is embedded inside Python strings, e.g.
//   ctx.dsl("($close - ts_mean($close, $N)) / ts_std($close, $N)", N=20)
// or written directly in a ```dmagic fenced block.
//
// We tokenize the DSL and emit spans reusing highlight.js token classes, so the
// existing theme colors apply with no extra CSS (beyond hljs-variable/operator).

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[]; properties?: Record<string, any> };

const KEYWORDS = new Set(["True", "False", "None", "and", "or", "not", "且", "或", "非"]);

interface Token {
  cls: string | null; // highlight.js class, or null for plain text
  value: string;
}

/** Tokenize a DSL string into highlight.js-classed tokens. */
export function tokenizeDmagic(src: string): Token[] {
  const out: Token[] = [];
  const push = (cls: string | null, value: string) => value && out.push({ cls, value });
  const ident = /[\p{L}_][\p{L}\p{N}_]*/uy;
  const number = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const op = /\*\*|\/\/|<=|>=|==|!=|[+\-*/%<>=]/y;
  let i = 0;

  while (i < src.length) {
    const ch = src[i]!;

    // whitespace (preserve)
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j]!)) j++;
      push(null, src.slice(i, j));
      i = j;
      continue;
    }

    // $sigil variable / builtin constant
    if (ch === "$") {
      ident.lastIndex = i + 1;
      const m = ident.exec(src);
      if (m && m.index === i + 1) {
        const name = m[0];
        push(name === "nan" || name === "inf" ? "hljs-literal" : "hljs-variable", "$" + name);
        i = ident.lastIndex;
        continue;
      }
      push(null, "$");
      i++;
      continue;
    }

    // number
    number.lastIndex = i;
    const nm = number.exec(src);
    if (nm && nm.index === i) {
      push("hljs-number", nm[0]);
      i = number.lastIndex;
      continue;
    }

    // identifier → keyword / function / kwarg / plain
    ident.lastIndex = i;
    const im = ident.exec(src);
    if (im && im.index === i) {
      const word = im[0];
      const end = ident.lastIndex;
      let k = end;
      while (k < src.length && /\s/.test(src[k]!)) k++;
      const next = src[k];
      if (KEYWORDS.has(word)) push("hljs-keyword", word);
      else if (next === "(") push("hljs-title function_", word);
      else if (next === "=" && src[k + 1] !== "=") push("hljs-attr", word);
      else push(null, word);
      i = end;
      continue;
    }

    // operators
    op.lastIndex = i;
    const om = op.exec(src);
    if (om && om.index === i) {
      push("hljs-operator", om[0]);
      i = op.lastIndex;
      continue;
    }

    // punctuation / anything else
    push(null, ch);
    i++;
  }
  return out;
}

function tokensToHast(tokens: Token[]): HastNode[] {
  return tokens.map((t) =>
    t.cls
      ? {
          type: "element",
          tagName: "span",
          properties: { className: t.cls.split(" ") },
          children: [{ type: "text", value: t.value }],
        }
      : { type: "text", value: t.value },
  );
}

/** Concatenated text content of a hast subtree. */
function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function hasClass(node: HastNode, name: string): boolean {
  const c = node.properties?.className;
  return Array.isArray(c) ? c.includes(name) : typeof c === "string" && c.split(" ").includes(name);
}

// Does this text actually look like DSL? (contains a $sigil)
const DSL_MARKER = /\$[\p{L}_]/u;

function walk(node: HastNode, visit: (n: HastNode, parent: HastNode | null) => void, parent: HastNode | null = null) {
  visit(node, parent);
  if (node.children) for (const c of node.children) walk(c, visit, node);
}

/**
 * rehype plugin (run AFTER rehype-highlight, BEFORE the line splitter):
 * - `language-dmagic` / `language-dm` blocks: tokenize the whole body as DSL.
 * - `language-python` blocks: re-tokenize DSL inside string spans containing `$`.
 */
export function rehypeDmagic() {
  return (tree: HastNode) => {
    walk(tree, (node, parent) => {
      if (node.tagName !== "code" || parent?.tagName !== "pre") return;
      const className = node.properties?.className;
      const classes = Array.isArray(className) ? className : typeof className === "string" ? className.split(" ") : [];
      const isDmagic = classes.includes("language-dmagic") || classes.includes("language-dm");
      const isPython = classes.includes("language-python") || classes.includes("language-py");

      if (isDmagic) {
        const text = textOf(node);
        node.children = tokensToHast(tokenizeDmagic(text));
        if (!classes.includes("hljs")) classes.push("hljs");
        node.properties!.className = classes;
        return;
      }

      if (isPython) {
        // Replace the contents of each highlighted string that contains a DSL sigil.
        walk(node, (n) => {
          if (n.type === "element" && hasClass(n, "hljs-string")) {
            const text = textOf(n);
            if (DSL_MARKER.test(text)) {
              n.children = tokensToHast(tokenizeDmagic(text));
            }
          }
        });
      }
    });
  };
}
