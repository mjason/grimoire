import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import typographyPlugin from "@tailwindcss/typography";
import twIndexCss from "../node_modules/tailwindcss/index.css" with { type: "text" };
import { createCssCompiler } from "../src/runtime/css";
import stylesCss from "../src/client/styles.css" with { type: "text" };

const INLINE_CODE_SELECTOR =
  ".prose :where(code):not(pre code)::before, .prose :where(code):not(pre code)::after";

let compiledCss = "";
let window: Window;

beforeAll(async () => {
  const compiler = await createCssCompiler(stylesCss, {
    twIndexCss,
    typographyPlugin: typographyPlugin as unknown,
  });
  compiledCss = compiler.build(["prose"]);

  window = new Window();
  const style = window.document.createElement("style");
  style.textContent = compiledCss;
  window.document.head.append(style);
});

afterAll(() => window.close());

describe("prose theme", () => {
  test("suppresses Typography's generated backticks around inline code", () => {
    const sheet = window.document.styleSheets[0]!;
    const override = Array.from(sheet.cssRules).find(
      (rule) => "selectorText" in rule && rule.selectorText === INLINE_CODE_SELECTOR,
    ) as CSSStyleRule | undefined;

    expect(override?.style.content).toBe("none");

    const generatedBackticks = [...compiledCss.matchAll(/content:\s*"`";/g)];
    expect(generatedBackticks).toHaveLength(2);
    expect(compiledCss.indexOf(INLINE_CODE_SELECTOR)).toBeGreaterThan(
      generatedBackticks.at(-1)!.index,
    );
  });

  test("keeps the inline override away from fenced code blocks", () => {
    expect(INLINE_CODE_SELECTOR).toContain(":not(pre code)");
  });
});
