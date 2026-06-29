// Daemon controls so an AI/agent can manage the server without holding a
// terminal: `grimoire start | stop | restart | status`. The server itself still
// hot-reloads in the background. State lives in <root>/.grimoire/.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

function arg(name: string): string | undefined {
  const eq = Bun.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = Bun.argv.indexOf(`--${name}`);
  if (i !== -1 && Bun.argv[i + 1] && !Bun.argv[i + 1]!.startsWith("--")) return Bun.argv[i + 1];
  return undefined;
}

const ROOT = resolve(arg("root") ?? process.cwd());
const DIR = join(ROOT, ".grimoire");
const STATE = join(DIR, "daemon.json");
const LOG = join(DIR, "daemon.log");

interface DaemonState {
  pid: number;
  url: string;
  host: string;
  port: number;
  root: string;
  startedAt: string;
}

function readState(): DaemonState | null {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return null;
  }
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDaemon(sub: string): Promise<void> {
  if (sub === "stop") return stop(false);
  if (sub === "status") return status();
  if (sub === "restart") {
    await stop(true);
    return start();
  }
  return start();
}

async function start(): Promise<void> {
  const existing = readState();
  if (existing && alive(existing.pid)) {
    process.stdout.write(`\x1b[2m📓 already running\x1b[0m (pid ${existing.pid}) → \x1b[4m${existing.url}\x1b[0m\n`);
    return;
  }
  mkdirSync(DIR, { recursive: true });
  rmSync(STATE, { force: true });

  // Re-run ourselves in foreground `serve` mode, detached, logging to a file.
  // Replace whichever daemon subcommand triggered us (start/restart) with serve.
  const self = process.execPath;
  const SUBS = ["start", "stop", "restart", "status"];
  const args = Bun.argv
    .slice(1)
    .map((a) => (SUBS.includes(a) ? "serve" : a))
    .concat(["--daemon-state", STATE]);
  const out = openSync(LOG, "a");
  // detached + unref so it outlives this process; windowsHide avoids a console
  // window popping up on Windows.
  const child = spawn(self, args, {
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  child.unref();

  // Wait for the child to bind + write its state (or fail).
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const s = readState();
    if (s && s.pid === child.pid && alive(s.pid)) {
      try {
        const r = await fetch(`http://${s.host === "0.0.0.0" ? "localhost" : s.host}:${s.port}/healthz`, {
          signal: AbortSignal.timeout(800),
        });
        if (r.ok) {
          process.stdout.write(
            `\n  📓 \x1b[1mGrimoire\x1b[0m started \x1b[2m(pid ${child.pid})\x1b[0m\n` +
              `     \x1b[2m→\x1b[0m \x1b[4m${s.url}\x1b[0m\n` +
              `     \x1b[2mstop:\x1b[0m grimoire stop   \x1b[2mlogs:\x1b[0m ${LOG}\n\n`,
          );
          return;
        }
      } catch {
        /* not up yet */
      }
    }
    if (!alive(child.pid)) break;
    await sleep(150);
  }
  process.stderr.write(`\x1b[31m✗\x1b[0m failed to start — see ${LOG}\n`);
  process.exit(1);
}

async function stop(quiet: boolean): Promise<void> {
  const s = readState();
  if (!s || !alive(s.pid)) {
    rmSync(STATE, { force: true });
    if (!quiet) process.stdout.write("\x1b[2m📓 not running\x1b[0m\n");
    return;
  }
  try {
    process.kill(s.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 40 && alive(s.pid); i++) await sleep(100);
  if (alive(s.pid)) {
    try {
      process.kill(s.pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  rmSync(STATE, { force: true });
  if (!quiet) process.stdout.write(`\x1b[32m✓\x1b[0m stopped \x1b[2m(pid ${s.pid})\x1b[0m\n`);
}

function status(): void {
  const s = readState();
  if (s && alive(s.pid)) {
    process.stdout.write(
      `\x1b[32m●\x1b[0m running \x1b[2m(pid ${s.pid})\x1b[0m → \x1b[4m${s.url}\x1b[0m\n` +
        `  \x1b[2mroot:\x1b[0m ${s.root}  \x1b[2msince:\x1b[0m ${s.startedAt}\n`,
    );
  } else {
    if (s) rmSync(STATE, { force: true }); // stale
    process.stdout.write("\x1b[2m○ stopped\x1b[0m\n");
  }
}

// Used by the running server to advertise itself to the daemon controls.
export function writeDaemonState(state: Omit<DaemonState, "root"> & { root?: string }): void {
  const path = arg("daemon-state");
  if (!path) return;
  const file = isAbsolute(path) ? path : resolve(ROOT, path);
  try {
    mkdirSync(join(file, ".."), { recursive: true });
    Bun.write(file, JSON.stringify({ ...state, root: state.root ?? ROOT }));
  } catch {
    /* best effort */
  }
}

export function daemonStatePath(): string | undefined {
  return arg("daemon-state");
}
// silence unused-import lint for existsSync in some builds
void existsSync;
