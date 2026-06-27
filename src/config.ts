import type { GrimoireConfig } from "./types";

/**
 * Identity helper that gives you full type-checking + autocompletion when
 * authoring the project's `config.ts`.
 *
 * ```ts
 * import { defineConfig } from "./src/config";
 * export default defineConfig({ title: "My Grimoire" });
 * ```
 */
export function defineConfig(config: GrimoireConfig): GrimoireConfig {
  return config;
}

export const DEFAULT_CONFIG: GrimoireConfig = {
  title: "Grimoire",
  description: "An AI-authored notebook.",
  theme: { accent: "violet", defaultMode: "system" },
};
