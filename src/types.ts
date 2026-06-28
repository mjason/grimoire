import type { ComponentType } from "preact";

/** Visual + behavioural configuration for the whole site. */
export interface ThemeConfig {
  /** A Tailwind color name used as the accent, e.g. "violet", "emerald", "sky". */
  accent?: string;
  /** Initial color mode. "system" follows the OS preference. */
  defaultMode?: "light" | "dark" | "system";
}

/** A supported UI/content language. */
export type Locale = string;

/** Internationalization configuration. */
export interface I18nConfig {
  /** Locale used when a note has no language-specific variant. */
  defaultLocale: Locale;
  /**
   * Locales offered in the language switcher, in display order.
   * Each needs a code (matching note filename suffixes like `.zh.mdx`) and a label.
   */
  locales: { code: Locale; label: string }[];
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
  /** Multi-language support. Omit for a single-language site. */
  i18n?: I18nConfig;
  /** Default network interface to bind, e.g. "0.0.0.0" for LAN access. The
   *  `--host` flag and `HOST` env var override this. Default "localhost". */
  host?: string;
  /** Default port. The `--port` flag and `PORT` env var override this. */
  port?: number;
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
  /**
   * Language of this note, e.g. "en" or "zh". Usually inferred from the file
   * name suffix (`getting-started.zh.mdx`); this overrides that.
   */
  lang?: string;
}

/** Shape of a compiled `.mdx` module (default export + injected frontmatter). */
export interface NoteModule {
  default: ComponentType<Record<string, unknown>>;
  frontmatter?: NoteFrontmatter;
}

/** A fully-resolved note ready to be rendered and indexed by the client. */
export interface NoteMeta {
  /**
   * Base URL slug path, e.g. "data/quarterly-sales". Shared across translations
   * (the language suffix is stripped), so switching language keeps the route.
   */
  id: string;
  /** Category segments (folders) without the file name, e.g. ["data"]. */
  segments: string[];
  /** Language of this note ("en", "zh", …). */
  lang: string;
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
