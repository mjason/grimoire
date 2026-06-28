import { watch } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { build } from "./build";
import {
  DIST_DIR,
  NOTES_DIR,
  COMPONENTS_DIR,
  CONFIG_FILE,
  CLIENT_DIR,
} from "./paths";

const LIVERELOAD = `
<script>
(() => {
  let es;
  function connect() {
    es = new EventSource("/__livereload");
    es.onmessage = (e) => { if (e.data === "reload") location.reload(); };
    es.onerror = () => { es.close(); setTimeout(connect, 1000); };
  }
  connect();
})();
</script>`;

const clients = new Set<ReadableStreamDefaultController>();
let building: Promise<void> | null = null;

function notifyReload() {
  for (const c of clients) {
    try {
      c.enqueue(`data: reload\n\n`);
    } catch {
      /* client gone */
    }
  }
}

async function rebuild(reason: string) {
  if (building) return;
  building = (async () => {
    const t = performance.now();
    try {
      await build();
      process.stdout.write(`\x1b[2m↻ rebuilt (${reason}) in ${Math.round(performance.now() - t)}ms\x1b[0m\n`);
      notifyReload();
    } catch (err) {
      console.error(`\x1b[31m✗ rebuild failed:\x1b[0m`, (err as Error).message);
    }
  })();
  await building;
  building = null;
}

async function serveAsset(path: string, type: string): Promise<Response> {
  const file = Bun.file(join(DIST_DIR, path));
  if (!(await file.exists())) return new Response("not found", { status: 404 });
  return new Response(file, { headers: { "content-type": type, "cache-control": "no-store" } });
}

async function main() {
  const port = Number(process.env.PORT ?? 4321);
  await rebuild("initial");

  Bun.serve({
    port,
    async fetch(req) {
      const { pathname } = new URL(req.url);

      if (pathname === "/__livereload") {
        let ref: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          start(controller) {
            ref = controller;
            clients.add(controller);
          },
          cancel() {
            clients.delete(ref);
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }

      if (pathname === "/app.js") return serveAsset("app.js", "text/javascript; charset=utf-8");
      if (pathname === "/app.css") return serveAsset("app.css", "text/css; charset=utf-8");

      // SPA shell with live-reload injected.
      const htmlPath = join(DIST_DIR, "index.html");
      if (!existsSync(htmlPath)) return new Response("building…", { status: 503 });
      let html = await readFile(htmlPath, "utf8");
      html = html.replace("</body>", `${LIVERELOAD}</body>`);
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    },
  });

  process.stdout.write(
    `\n  📓  \x1b[1mGrimoire dev\x1b[0m \x1b[2m(live reload)\x1b[0m\n      \x1b[2m→\x1b[0m \x1b[4mhttp://localhost:${port}\x1b[0m\n\n`,
  );

  // Watch authoring dirs + client source for changes.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (reason: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => rebuild(reason), 80);
  };

  for (const dir of [NOTES_DIR, COMPONENTS_DIR, CLIENT_DIR]) {
    if (!existsSync(dir)) continue;
    watch(dir, { recursive: true }, (_e, file) => {
      const name = String(file ?? "");
      // Ignore the auto-generated manifest, or each build would retrigger itself.
      if (name.includes("generated")) return;
      schedule(name || "change");
    });
  }
  if (existsSync(CONFIG_FILE)) watch(CONFIG_FILE, () => schedule("config.ts"));
}

main();
