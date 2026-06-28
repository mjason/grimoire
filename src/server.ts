// The runtime served by the compiled single-file binary.
// The three built assets are embedded directly into the executable as text,
// so the binary is fully self-contained — no external files at runtime.
import indexHtml from "../dist/index.html" with { type: "text" };
import appJs from "../dist/app.js" with { type: "text" };
import appCss from "../dist/app.css" with { type: "text" };

function arg(name: string): string | undefined {
  const i = Bun.argv.indexOf(`--${name}`);
  if (i !== -1 && Bun.argv[i + 1]) return Bun.argv[i + 1];
  const eq = Bun.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=")[1] : undefined;
}

const port = Number(arg("port") ?? process.env.PORT ?? 4321);
const host = arg("host") ?? process.env.HOST ?? "localhost";

// This is a local tool that's rebuilt often, so never let the browser cache
// anything — guarantees an updated binary always shows fresh content. (Assets
// are also ?v=<hash> busted in the HTML as a second line of defence.) The cost
// is re-fetching ~0.5 MB from embedded memory on a full page reload — instant.
function asset(body: string, type: string): Response {
  return new Response(body, {
    headers: { "content-type": type, "cache-control": "no-store" },
  });
}

const server = Bun.serve({
  port,
  hostname: host,
  fetch(req) {
    const { pathname } = new URL(req.url);
    switch (pathname) {
      case "/app.js":
        return asset(appJs, "text/javascript; charset=utf-8");
      case "/app.css":
        return asset(appCss, "text/css; charset=utf-8");
      case "/healthz":
        return new Response("ok");
      default:
        // SPA fallback: every other route serves the shell (hash routing).
        // Never cache the shell, so the latest hashed asset URLs are always used.
        return new Response(indexHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-cache, no-store, must-revalidate",
          },
        });
    }
  },
});

const url = `http://${host}:${server.port}`;
process.stdout.write(
  `\n  📓  \x1b[1mGrimoire\x1b[0m is live\n      \x1b[2m→\x1b[0m \x1b[4m${url}\x1b[0m\n      \x1b[2mPress Ctrl+C to stop\x1b[0m\n\n`,
);

if (Bun.argv.includes("--open")) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    /* best effort */
  }
}
