import { join } from "node:path";
import { ROOT_DIR, DIST_DIR } from "./paths";
import { existsSync } from "node:fs";

/**
 * Compile the server (with its embedded assets) into a single self-contained
 * binary using `bun build --compile`. Run `bun run build` first.
 */
async function compile() {
  if (!existsSync(join(DIST_DIR, "engine", "app.js"))) {
    console.error("✗ engine not built — run `bun run engine` first.");
    process.exit(1);
  }

  const outName = process.env.OUTFILE ?? "grimoire";
  const outfile = join(ROOT_DIR, outName);

  const target = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1];

  const cmd = [
    "bun",
    "build",
    "--compile",
    "--minify",
    join(ROOT_DIR, "src", "serve.ts"),
    "--outfile",
    outfile,
  ];
  if (target) cmd.push(`--target=${target}`);

  process.stdout.write(`\x1b[1mgrimoire\x1b[0m \x1b[2mcompiling binary…\x1b[0m\n`);
  const proc = Bun.spawn(cmd, { cwd: ROOT_DIR, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) process.exit(code);

  const size = Bun.file(outfile).size;
  process.stdout.write(
    `\x1b[32m✓\x1b[0m binary ready: \x1b[1m${outName}\x1b[0m \x1b[2m(${(size / 1024 / 1024).toFixed(1)} MB)\x1b[0m\n  Run it: \x1b[4m./${outName}\x1b[0m\n`,
  );
}

compile();
