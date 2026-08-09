// End-to-end coverage for the three systems that only really exist in a browser:
// the theme picker, bidirectional links + the graph, and the card box.
//
//   bun run test:e2e:knowledge
//
// Needs a Chromium (auto-detected, or set GRIMOIRE_CHROMIUM). Screenshots land in
// GRIMOIRE_E2E_OUTPUT (default: a temp directory), which is handy when a layout
// assertion fails and you want to see what the page actually looked like.
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { buildEngine } from "../../src/engine";

const root = resolve(import.meta.dir, "../..");
const outputDir = process.env.GRIMOIRE_E2E_OUTPUT ?? join(tmpdir(), "grimoire-knowledge-e2e");
const stateFile = join(tmpdir(), `grimoire-knowledge-e2e-${process.pid}.json`);

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
  for (let attempt = 0; attempt < 100; attempt++) {
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

/** Read a resolved CSS custom property off <html>. */
const cssVar = (page: Page, name: string) =>
  page.evaluate((prop) => getComputedStyle(document.documentElement).getPropertyValue(prop).trim(), name);

/** Wait for a custom property to settle on a new value (the picker re-renders async). */
async function waitForVar(page: Page, name: string, previous: string, label: string): Promise<string> {
  await page
    .waitForFunction(
      ([prop, before]) =>
        getComputedStyle(document.documentElement).getPropertyValue(prop!).trim() !== before,
      [name, previous] as const,
      { timeout: 5000 },
    )
    .catch(() => {
      throw new Error(label);
    });
  return cssVar(page, name);
}

const hash = (page: Page) => page.evaluate(() => location.hash);

/**
 * Open the sidebar's theme picker (the mobile header has a hidden twin).
 * Idempotent: the panel deliberately stays open while you try things out, and
 * clicking the button again would close it.
 */
async function openPicker(page: Page) {
  const panel = page.locator('[data-testid="theme-picker-panel"]');
  if (!(await panel.isVisible())) {
    await page.locator('aside [data-testid="theme-picker-button"]').click();
  }
  await panel.waitFor();
}

async function goto(page: Page, base: string, route: string) {
  await page.goto(`${base}/?lang=en${route}`);
  await page.waitForLoadState("networkidle");
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

// --- Theme -------------------------------------------------------------------

async function testThemePicker(page: Page, base: string) {
  await goto(page, base, "#/");
  const siteAccent = await cssVar(page, "--accent");
  const siteWhite = await cssVar(page, "--color-white");
  const siteNeutral = await cssVar(page, "--color-neutral-500");
  assert(siteAccent !== "", "the site theme did not reach the page");

  await openPicker(page);

  // A palette declared only in config.ts is offered next to the built-ins.
  const custom = page.locator('[data-preset="moss"]');
  assert(await custom.isVisible(), "the palette defined in config.theme.presets is missing");
  await custom.click();
  const mossAccent = await waitForVar(page, "--accent", siteAccent, "the custom palette did not apply");
  assert(
    (await cssVar(page, "--color-neutral-500")) !== siteNeutral,
    "the custom palette's neutral ramp did not reach the page",
  );

  await openPicker(page);
  await page.locator('[data-preset="paper"]').click();
  await waitForVar(page, "--accent", mossAccent, "switching back to a built-in did not apply");

  const paperAccent = await cssVar(page, "--accent");
  const paperWhite = await cssVar(page, "--color-white");
  assert(paperAccent !== siteAccent, "picking a preset did not change the accent");
  assert(paperWhite !== siteWhite, "picking a preset did not re-tint the surfaces");

  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  assert(/serif/i.test(bodyFont), `the paper preset did not switch to a serif body (got ${bodyFont})`);

  // Persisted, and re-applied on the next visit.
  const stored = await page.evaluate(() => localStorage.getItem("grimoire-theme"));
  assert(JSON.parse(stored ?? "{}").preset === "paper", "the chosen preset was not persisted");
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert((await cssVar(page, "--accent")) === paperAccent, "the theme did not survive a reload");

  // An explicit accent overrides the preset's own.
  await openPicker(page);
  await page.locator('[data-accent="emerald"]').click();
  const emerald = await waitForVar(page, "--accent", paperAccent, "choosing an accent did nothing");
  assert(emerald.toLowerCase() === "#059669", `expected the emerald accent, got ${emerald}`);

  // Reading size moves the prose without touching the interface scale.
  const rootSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  const proseBefore = await page.evaluate(
    () => getComputedStyle(document.querySelector("main")!).fontSize,
  );
  await page.locator('[data-testid="theme-font-size"]').fill("1.35");
  await page
    .waitForFunction(
      () => getComputedStyle(document.documentElement).getPropertyValue("--prose-size").trim() === "1.35rem",
      null,
      { timeout: 5000 },
    )
    .catch(() => {
      throw new Error("the text-size slider did not apply");
    });
  assert(
    (await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === rootSize,
    "changing the text size also rescaled the interface",
  );
  assert(
    (await page.evaluate(() => getComputedStyle(document.querySelector("main")!).fontSize)) === proseBefore,
    "changing the text size leaked outside .prose",
  );

  // Dark mode is a class on <html>, driven by the same store.
  await page.locator("aside").getByRole("button", { name: "Dark", exact: true }).click();
  await page
    .waitForFunction(() => document.documentElement.classList.contains("dark"), null, { timeout: 5000 })
    .catch(() => {
      throw new Error("switching to dark mode did not add the dark class");
    });

  await page.screenshot({ path: join(outputDir, "theme-paper-dark.png"), fullPage: false });

  // Reset hands the look back to the site.
  await page.locator('[data-testid="theme-reset"]').click();
  const restored = await waitForVar(page, "--accent", emerald, "reset did not restore the site accent");
  assert(restored === siteAccent, `reset left the accent at ${restored}, expected ${siteAccent}`);
  assert((await cssVar(page, "--color-white")) === siteWhite, "reset did not restore the site surfaces");
  assert(
    await page.evaluate(() => localStorage.getItem("grimoire-theme") === null),
    "reset did not clear the stored theme",
  );

  await assertNoPageOverflow(page, "theme picker page");
}

// --- Links + graph -----------------------------------------------------------

/** `theme.uiFont` / `theme.categoryFont` reach the real sidebar, not just the CSS. */
async function testNavTypography(page: Page, base: string) {
  await goto(page, base, "#/");

  const fonts = await page.evaluate(() => {
    const nav = document.querySelector("aside")!;
    const link = nav.querySelector('nav a[href^="#/n/"]')!;
    const category = nav.querySelector(".grimoire-category")!;
    const prose = document.querySelector("main") ?? document.body;
    return {
      nav: getComputedStyle(nav).fontFamily,
      link: getComputedStyle(link).fontFamily,
      category: getComputedStyle(category).fontFamily,
      categoryTransform: getComputedStyle(category).textTransform,
      body: getComputedStyle(prose).fontFamily,
    };
  });

  // The demo config asks for a sans body/nav and mono category labels.
  assert(/mono/i.test(fonts.category), `category labels ignored theme.categoryFont (${fonts.category})`);
  assert(!/mono/i.test(fonts.nav), `the nav picked up the category typeface (${fonts.nav})`);
  assert(fonts.link === fonts.nav, "note links do not inherit the navigation typeface");
  assert(fonts.categoryTransform === "uppercase", "category labels lost their styling");

  // And the scales are wired: nudging one moves only that part.
  const before = await page.evaluate(() => ({
    nav: getComputedStyle(document.querySelector("aside nav a")!).fontSize,
    category: getComputedStyle(document.querySelector("aside .grimoire-category")!).fontSize,
  }));
  await page.evaluate(() => document.documentElement.style.setProperty("--category-scale", "1.6"));
  const after = await page.evaluate(() => ({
    nav: getComputedStyle(document.querySelector("aside nav a")!).fontSize,
    category: getComputedStyle(document.querySelector("aside .grimoire-category")!).fontSize,
  }));
  assert(after.category !== before.category, "--category-scale did not resize category labels");
  assert(after.nav === before.nav, "--category-scale leaked into the rest of the navigation");
  await page.evaluate(() => document.documentElement.style.removeProperty("--category-scale"));
}

async function testWikiLinks(page: Page, base: string) {
  await goto(page, base, "#/n/guides/knowledge-graph");
  const link = page.locator("article .wikilink").first();
  await link.waitFor();

  const target = await link.getAttribute("data-to");
  assert(target, "a wiki link rendered without a resolved target");

  // Hovering previews the destination without navigating.
  await link.hover();
  const previewVisible = await page
    .locator(".wikilink-host:hover .wikilink-preview")
    .first()
    .isVisible();
  assert(previewVisible, "hovering a wiki link did not show its preview");

  await link.click();
  await page.waitForFunction((want) => location.hash.includes(want), target, { timeout: 5000 });
  assert((await hash(page)).includes(target), `clicking [[${target}]] did not navigate there`);
}

async function testBacklinks(page: Page, base: string) {
  // `guides/theming` and the `link-resolution` card both link to `engine-boot`.
  await goto(page, base, "#/card/engine-boot");
  await page.locator('[data-testid="card-page"]').waitFor();

  const backlinks = page.locator('[data-testid="backlinks"]');
  await backlinks.waitFor();
  const text = (await backlinks.textContent()) ?? "";
  assert(text.includes("Theming"), `backlinks missed the note that links here (got: ${text})`);
  assert(text.includes("Link resolution"), `backlinks missed the card that links here (got: ${text})`);

  // The backlink is a real link back to its source.
  await backlinks.locator("a").first().click();
  await page.waitForFunction(() => location.hash !== "#/card/engine-boot", null, { timeout: 5000 });
  assert((await hash(page)) !== "#/card/engine-boot", "a backlink did not navigate");
}

async function testGraph(page: Page, base: string) {
  await goto(page, base, "#/graph");
  const graph = page.locator('[data-testid="graph-view"]');
  await graph.waitFor();

  const nodes = graph.locator("g[data-node]");
  const count = await nodes.count();
  assert(count > 5, `the graph drew only ${count} nodes`);

  // Deterministic layout: the same graph draws the same picture twice.
  const positionsOf = () =>
    graph.locator("circle").evaluateAll((circles) =>
      circles.map((c) => `${c.getAttribute("cx")},${c.getAttribute("cy")}`).join("|"),
    );
  const first = await positionsOf();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await graph.waitFor();
  assert(first === (await positionsOf()), "the graph layout was not deterministic across reloads");

  const kinds = await nodes.evaluateAll((groups) => groups.map((g) => g.getAttribute("data-kind")));
  assert(kinds.includes("note") && kinds.includes("card"), "the graph is missing notes or cards");

  await graph.screenshot({ path: join(outputDir, "graph.png") });

  const cardNode = graph.locator('g[data-node="engine-boot"] a');
  await cardNode.click();
  await page.waitForFunction(() => location.hash.includes("engine-boot"), null, { timeout: 5000 });
  assert((await hash(page)).includes("engine-boot"), "clicking a graph node did not open it");

  await assertNoPageOverflow(page, "graph page");
}

// --- Cards -------------------------------------------------------------------

async function testCards(page: Page, base: string) {
  await goto(page, base, "#/cards");
  const grid = page.locator('[data-testid="cards-grid"]');
  await grid.waitFor();

  const tiles = grid.locator('[data-testid="card-tile"]');
  const total = await tiles.count();
  assert(total >= 5, `expected the sample deck, found ${total} cards`);

  const search = page.locator('[data-testid="cards-search"]');
  await search.fill("tailwind");
  await page.waitForFunction(
    (before) => document.querySelectorAll('[data-testid="card-tile"]').length < before,
    total,
    { timeout: 5000 },
  );
  const filtered = await tiles.count();
  assert(filtered > 0 && filtered < total, `search matched ${filtered} of ${total} cards`);

  await search.fill("");
  await page.waitForFunction(
    (before) => document.querySelectorAll('[data-testid="card-tile"]').length === before,
    total,
    { timeout: 5000 },
  );

  await grid.screenshot({ path: join(outputDir, "cards.png") });

  const first = tiles.first();
  const id = await first.getAttribute("data-card");
  await first.click();
  await page.locator('[data-testid="card-page"]').waitFor();
  assert((await hash(page)).includes(id!), "opening a card tile did not route to that card");

  // The card's markdown body is compiled and rendered, not just its excerpt.
  await page
    .waitForFunction(
      () => (document.querySelector('[data-testid="card-page"] .prose')?.textContent ?? "").trim().length > 40,
      null,
      { timeout: 5000 },
    )
    .catch(() => {
      throw new Error("the card body did not render");
    });

  await assertNoPageOverflow(page, "card page");
}

async function testSidebarSearch(page: Page, base: string) {
  await goto(page, base, "#/");
  await page.locator('aside input[type="search"]').fill("boot sequence");

  const cardHit = page.locator('aside a[href="#/card/engine-boot"]');
  await cardHit.waitFor({ timeout: 5000 });
  await cardHit.click();
  await page.locator('[data-testid="card-page"]').waitFor();
  assert((await hash(page)) === "#/card/engine-boot", "the sidebar search did not open the card");
}

async function testMobile(page: Page, base: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["#/graph", "#/cards", "#/card/engine-boot", "#/n/guides/knowledge-graph"]) {
    await goto(page, base, route);
    await assertNoPageOverflow(page, `mobile ${route}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

// --- Runner ------------------------------------------------------------------

async function main() {
  await mkdir(outputDir, { recursive: true });
  await rm(stateFile, { force: true });
  await buildEngine();

  const server = Bun.spawn(
    [
      "bun", join(root, "src/serve.ts"), "serve",
      "--root", root, "--host", "127.0.0.1",
      "--port", "43221", "--no-watch", "--daemon-state", stateFile,
    ],
    { cwd: root, stdout: "ignore", stderr: "pipe" },
  );

  let browser: Browser | undefined;
  try {
    const base = await waitForServer();
    browser = await chromium.launch({ executablePath: chromiumPath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(`uncaught: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console: ${message.text()}`);
    });

    await testThemePicker(page, base);
    await testNavTypography(page, base);
    await testWikiLinks(page, base);
    await testBacklinks(page, base);
    await testGraph(page, base);
    await testCards(page, base);
    await testSidebarSearch(page, base);
    await testMobile(page, base);

    assert(failures.length === 0, `the page logged errors:\n  ${failures.join("\n  ")}`);
    process.stdout.write(`✓ theme / links / graph / cards E2E passed\n  screenshots: ${outputDir}\n`);
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
