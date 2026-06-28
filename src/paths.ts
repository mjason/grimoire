import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to `src/`. */
export const SRC_DIR = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the project root (one level above `src/`). */
export const ROOT_DIR = resolve(SRC_DIR, "..");

export const NOTES_DIR = join(ROOT_DIR, "notes");
export const DIST_DIR = join(ROOT_DIR, "dist");
export const CLIENT_DIR = join(SRC_DIR, "client");
