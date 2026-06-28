// Cross-compile the binary for every desktop platform into release/.
// Run `bun run build` is performed first so the embedded assets are current.
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ROOT_DIR } from "./paths";
import { buildEngine } from "./engine";

const RELEASE_DIR = join(ROOT_DIR, "release");

const TARGETS: { target: string; out: string }[] = [
  { target: "bun-linux-x64", out: "grimoire-linux-x64" },
  { target: "bun-linux-arm64", out: "grimoire-linux-arm64" },
  { target: "bun-darwin-arm64", out: "grimoire-darwin-arm64" },
  { target: "bun-darwin-x64", out: "grimoire-darwin-x64" },
  { target: "bun-windows-x64", out: "grimoire-windows-x64.exe" },
];

async function main() {
  await buildEngine();

  await rm(RELEASE_DIR, { recursive: true, force: true });
  await mkdir(RELEASE_DIR, { recursive: true });

  const results: { out: string; ok: boolean; size: number }[] = [];

  for (const { target, out } of TARGETS) {
    process.stdout.write(`\x1b[2mcompiling ${target}…\x1b[0m\n`);
    const outfile = join(RELEASE_DIR, out);
    const proc = Bun.spawn(
      [
        "bun",
        "build",
        "--compile",
        "--minify",
        `--target=${target}`,
        join(ROOT_DIR, "src", "serve.ts"),
        "--outfile",
        outfile,
      ],
      { cwd: ROOT_DIR, stdout: "ignore", stderr: "inherit" },
    );
    const code = await proc.exited;
    const size = code === 0 ? Bun.file(outfile).size : 0;
    results.push({ out, ok: code === 0, size });
    process.stdout.write(
      code === 0
        ? `  \x1b[32m✓\x1b[0m ${out} \x1b[2m(${(size / 1024 / 1024).toFixed(1)} MB)\x1b[0m\n`
        : `  \x1b[31m✗\x1b[0m ${out} failed\n`,
    );
  }

  const ok = results.filter((r) => r.ok).length;
  process.stdout.write(`\n${ok}/${TARGETS.length} binaries built into release/\n`);
  if (ok !== TARGETS.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
