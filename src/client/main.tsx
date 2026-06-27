import { render } from "preact";
import { MDXProvider } from "@mdx-js/preact";
import { App } from "./app";
import { mdxComponents } from "./components";
import { config } from "./generated/manifest";
import { LocaleProvider } from "./i18n";

const root = document.getElementById("app");
if (root) {
  render(
    <LocaleProvider i18n={config.i18n}>
      <MDXProvider components={mdxComponents}>
        <App config={config} />
      </MDXProvider>
    </LocaleProvider>,
    root,
  );
}
