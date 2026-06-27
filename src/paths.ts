import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to `src/`. */
export const SRC_DIR = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the project root (one level above `src/`). */
export const ROOT_DIR = resolve(SRC_DIR, "..");

export const NOTES_DIR = join(ROOT_DIR, "notes");
export const COMPONENTS_DIR = join(ROOT_DIR, "components");
export const CONFIG_FILE = join(ROOT_DIR, "config.ts");
export const DIST_DIR = join(ROOT_DIR, "dist");

export const CLIENT_DIR = join(SRC_DIR, "client");
export const CLIENT_ENTRY = join(CLIENT_DIR, "main.tsx");
export const STYLES_ENTRY = join(CLIENT_DIR, "styles.css");
export const GENERATED_DIR = join(CLIENT_DIR, "generated");
export const MANIFEST_FILE = join(GENERATED_DIR, "manifest.ts");
