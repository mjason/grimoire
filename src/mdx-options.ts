// Shared MDX compile options, used by the runtime note compiler (server) so
// notes get the same GFM + code-viewer + DSL highlighting as before, but emitted
// as a portable `function-body` the client evaluates with the preact runtime.
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { remarkCodeMeta, rehypeCodeLines, rehypeMermaid } from "./code-plugins";
import { rehypeDmagic } from "./dmagic";

export function mdxCompileOptions(outputFormat: "program" | "function-body") {
  return {
    outputFormat,
    jsxImportSource: "preact",
    providerImportSource: "@mdx-js/preact",
    remarkPlugins: [remarkGfm, remarkCodeMeta],
    rehypePlugins: [
      rehypeSlug,
      rehypeMermaid, // before highlight — pull ```mermaid out as a diagram
      [rehypeHighlight, { detect: true, ignoreMissing: true }],
      rehypeDmagic,
      rehypeCodeLines,
    ],
    development: false,
  } as const;
}
