import { render } from "preact";
import { MDXProvider } from "@mdx-js/preact";
import { App } from "./app";
import { mdxComponents } from "./components";
import { config } from "./generated/manifest";

const root = document.getElementById("app");
if (root) {
  render(
    <MDXProvider components={mdxComponents}>
      <App config={config} />
    </MDXProvider>,
    root,
  );
}
