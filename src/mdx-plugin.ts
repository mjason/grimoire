import type { BunPlugin } from "bun";
import { compile } from "@mdx-js/mdx";
import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";

/**
 * A Bun bundler plugin that compiles `.mdx` files into Preact components.
 *
 * - Frontmatter is stripped with gray-matter and re-exported as `frontmatter`.
 * - GitHub-flavoured markdown (tables, task lists, strikethrough) is enabled.
 * - Headings get slugged ids (for anchor links) and code blocks are
 *   syntax-highlighted at build time (zero runtime cost).
 * - Custom components are resolved from context via `@mdx-js/preact`, so notes
 *   can use `<Chart/>`, `<DataTable/>`, etc. without importing anything.
 */
export const mdxPlugin: BunPlugin = {
  name: "grimoire-mdx",
  setup(build) {
    build.onLoad({ filter: /\.mdx$/ }, async (args) => {
      const raw = await Bun.file(args.path).text();
      const { content, data } = matter(raw);

      const compiled = await compile(content, {
        jsxImportSource: "preact",
        providerImportSource: "@mdx-js/preact",
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ],
        development: false,
      });

      const code = `${String(compiled)}
export const frontmatter = ${JSON.stringify(data)};`;

      return { contents: code, loader: "js" };
    });
  },
};
