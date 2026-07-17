import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildEngine } from "../../src/engine";

const root = resolve(import.meta.dir, "../..");
const outputDir = process.env.GRIMOIRE_E2E_OUTPUT ?? join(tmpdir(), "grimoire-table-e2e");
const stateFile = join(tmpdir(), `grimoire-table-e2e-${process.pid}.json`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function chromiumPath(): string {
  const configured = process.env.GRIMOIRE_CHROMIUM || process.env.CHROME_PATH;
  const candidates = [configured, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
  const found = candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!found) throw new Error("Chromium not found; set GRIMOIRE_CHROMIUM");
  return found;
}

async function waitForServer(): Promise<string> {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const state = JSON.parse(await readFile(stateFile, "utf8"));
      if (state.port) return `http://127.0.0.1:${state.port}`;
    } catch {
      // Server has not written its state yet.
    }
    await Bun.sleep(100);
  }
  throw new Error("Grimoire E2E server did not start");
}

async function assertNoPageOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    metrics.documentWidth <= metrics.viewport + 1,
    `${label} overflows the viewport (${metrics.documentWidth}px > ${metrics.viewport}px)`,
  );
}

async function testDataTable(page: Page, base: string) {
  await page.goto(`${base}/?lang=en#/n/guides/components`);
  const table = page.locator(".data-table").first();
  await table.waitFor();

  const firstCell = table.locator("tbody tr").first().locator("td").first();
  const beforeSort = await firstCell.textContent();
  await table.locator("thead button").first().click();
  const afterSort = await firstCell.textContent();
  assert(beforeSort !== afterSort, "sorting the first DataTable column did not change the first row");

  const filter = table.locator('input[type="search"]');
  await filter.fill("auth");
  await page.waitForTimeout(50);
  assert((await table.textContent())?.includes("2 rows"), "DataTable filter did not reduce the row count");

  await filter.fill("");
  await table.getByRole("button", { name: "Next page" }).click();
  assert((await table.textContent())?.includes("2 / 2"), "DataTable pagination did not advance");
  await table.getByRole("button", { name: "Previous page" }).click();

  await table.screenshot({ path: join(outputDir, "datatable-desktop.png") });
  await assertNoPageOverflow(page, "desktop DataTable page");
}

async function testMarkdownTable(page: Page, base: string) {
  await page.goto(`${base}/?lang=en#/n/reference/markdown-guide`);
  const frame = page.locator(".prose > .not-prose").filter({ has: page.locator("table.grimoire-table") }).first();
  await frame.waitFor();

  const spacing = await frame.evaluate((element) => {
    const table = element.querySelector("table")!;
    const frameRect = element.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const style = getComputedStyle(table);
    const inlineCode = document.querySelector(".prose code:not(pre code)");
    return {
      extraHeight: frameRect.height - tableRect.height,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      beforeContent: inlineCode ? getComputedStyle(inlineCode, "::before").content : "none",
      afterContent: inlineCode ? getComputedStyle(inlineCode, "::after").content : "none",
    };
  });
  assert(spacing.extraHeight <= 3, `Markdown table frame has ${spacing.extraHeight}px of extra vertical space`);
  assert(spacing.marginTop === "0px" && spacing.marginBottom === "0px", "Markdown table margins were not reset");
  assert(!spacing.beforeContent.includes("`") && !spacing.afterContent.includes("`"), "inline code displays generated backticks");

  await frame.screenshot({ path: join(outputDir, "markdown-table-desktop.png") });
  await assertNoPageOverflow(page, "desktop Markdown table page");
}

async function testMobile(page: Page, base: string) {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${base}/?lang=en#/n/guides/components`);
  const dataTable = page.locator(".data-table").first();
  await dataTable.waitFor();
  await dataTable.screenshot({ path: join(outputDir, "datatable-mobile.png") });
  await assertNoPageOverflow(page, "mobile DataTable page");

  await page.goto(`${base}/?lang=en#/n/reference/markdown-guide`);
  const markdownFrame = page.locator(".prose > .not-prose").filter({ has: page.locator("table.grimoire-table") }).first();
  await markdownFrame.waitFor();
  const widths = await markdownFrame.evaluate((element) => {
    const scroller = element.firstElementChild as HTMLElement;
    const frame = element.getBoundingClientRect();
    return {
      frameLeft: frame.left,
      frameRight: frame.right,
      viewport: window.innerWidth,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      maxRowHeight: Math.max(
        ...Array.from(element.querySelectorAll("tbody tr"), (row) => row.getBoundingClientRect().height),
      ),
    };
  });
  assert(widths.frameLeft >= 0 && widths.frameRight <= widths.viewport + 1, "mobile Markdown table escapes its frame");
  assert(widths.scrollWidth >= widths.clientWidth, "mobile Markdown table scroller has invalid dimensions");
  assert(widths.maxRowHeight <= 72, `mobile Markdown rows are too tall (${widths.maxRowHeight}px)`);
  await markdownFrame.screenshot({ path: join(outputDir, "markdown-table-mobile.png") });
  await assertNoPageOverflow(page, "mobile Markdown table page");
}

async function testVirtualTable(page: Page, base: string) {
  const entry = join(tmpdir(), `grimoire-virtual-table-${process.pid}.tsx`);
  const dataTablePath = join(root, "src/client/components/DataTable.tsx");
  const preactPath = join(root, "node_modules/preact/dist/preact.module.js");
  await writeFile(entry, `
    import { h, render } from ${JSON.stringify(preactPath)};
    import { DataTable } from ${JSON.stringify(dataTablePath)};
    const data = Array.from({ length: 250 }, (_, index) => ({
      id: \`row-\${index}\`, name: \`Row \${index}\`, score: index,
    }));
    render(
      h(DataTable, { data, columns: ["name", "score"], searchable: false,
        pageSize: 0, virtualize: true, height: 240, getRowId: (row) => row.id }),
      document.getElementById("app"),
    );
  `);

  try {
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "iife",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
    });
    assert(result.success, `virtual table fixture failed to build: ${result.logs.join("\n")}`);
    const script = (await result.outputs[0]!.text()).replaceAll("</script", "<\\/script");
    await page.setViewportSize({ width: 900, height: 700 });
    await page.setContent(`
      <link rel="stylesheet" href="${base}/app.css">
      <div id="app"></div>
      <script>${script}</script>
    `);

    const table = page.locator(".data-table");
    await table.waitFor();
    await page.waitForTimeout(100);
    const scroller = table.locator("table").locator("..");
    const initial = await table.locator("tbody tr").evaluateAll((rows) => ({
      count: rows.length,
      first: rows[0]?.getAttribute("data-index"),
    }));
    assert(initial.count > 0 && initial.count < 250, `virtual table rendered ${initial.count} DOM rows`);

    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(100);
    const afterScroll = await table.locator("tbody tr").first().getAttribute("data-index");
    assert(afterScroll !== initial.first, "virtual table window did not update after scrolling");
    await table.screenshot({ path: join(outputDir, "datatable-virtual.png") });

    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await page.waitForTimeout(50);
    const printRows = await table.locator("tbody tr").count();
    assert(printRows === 250, `print mode rendered ${printRows} of 250 rows`);
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  } finally {
    await rm(entry, { force: true });
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await rm(stateFile, { force: true });
  await buildEngine();

  const server = Bun.spawn([
    "bun",
    join(root, "src/serve.ts"),
    "serve",
    "--root",
    root,
    "--host",
    "127.0.0.1",
    "--port",
    "43219",
    "--no-watch",
    "--daemon-state",
    stateFile,
  ], { cwd: root, stdout: "ignore", stderr: "pipe" });

  let browser: Browser | undefined;
  try {
    const base = await waitForServer();
    browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await testDataTable(page, base);
    await testMarkdownTable(page, base);
    await testMobile(page, base);
    await testVirtualTable(page, base);
    process.stdout.write(`✓ table E2E passed\n  screenshots: ${outputDir}\n`);
  } finally {
    await browser?.close();
    server.kill();
    await rm(stateFile, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
