import type { ComponentType } from "preact";

/** Visual + behavioural configuration for the whole site. */
export interface ThemeConfig {
  /** A Tailwind color name used as the accent, e.g. "violet", "emerald", "sky". */
  accent?: string;
  /** Initial color mode. "system" follows the OS preference. */
  defaultMode?: "light" | "dark" | "system";
}

/** Top-level site configuration, authored in the project's `config.ts`. */
export interface GrimoireConfig {
  /** Site title, shown in the header and browser tab. */
  title: string;
  /** Short tagline shown under the title / in metadata. */
  description?: string;
  author?: string;
  theme?: ThemeConfig;
  /**
   * Explicit ordering for the top-level categories in the sidebar.
   * Categories not listed here are appended afterwards, alphabetically.
   * Use the folder name, e.g. ["guides", "data", "reference"].
   */
  categoryOrder?: string[];
  /** Optional small print rendered in the sidebar footer (supports plain text). */
  footer?: string;
}

/** Frontmatter an author may place at the top of any `.mdx` note. */
export interface NoteFrontmatter {
  title?: string;
  description?: string;
  tags?: string[];
  /** ISO date string, e.g. "2026-06-27". */
  date?: string;
  /** When true, the note is hidden from navigation/search. */
  draft?: boolean;
  /** An emoji or short string shown beside the note in the sidebar. */
  icon?: string;
  /** Lower numbers sort first within a category. Defaults to 0. */
  order?: number;
}

/** Shape of a compiled `.mdx` module (default export + injected frontmatter). */
export interface NoteModule {
  default: ComponentType<Record<string, unknown>>;
  frontmatter?: NoteFrontmatter;
}

/** A fully-resolved note ready to be rendered and indexed by the client. */
export interface NoteMeta {
  /** URL slug path, e.g. "data/quarterly-sales". Folders become path segments. */
  id: string;
  /** Category segments (folders) without the file name, e.g. ["data"]. */
  segments: string[];
  title: string;
  description?: string;
  tags: string[];
  date?: string;
  draft: boolean;
  icon?: string;
  order: number;
  /** The compiled MDX component. */
  Component: ComponentType<Record<string, unknown>>;
}
