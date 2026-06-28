import { useMemo, useState } from "preact/hooks";
import type { NoteMeta } from "../types";
import type { GrimoireConfig } from "../types";
import {
  buildTree,
  collectTags,
  formatDate,
  notesForLocale,
  resolveNotes,
  searchNotes,
  type RawNote,
  type TreeNode,
} from "./lib/notes";
import { hrefFor, noteHref, useRoute, type Route } from "./lib/router";
import { ThemeToggle } from "./components/ThemeToggle";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { useLocale } from "./i18n";

export function App({ config, rawNotes }: { config: GrimoireConfig; rawNotes: RawNote[] }) {
  const { locale, defaultLocale } = useLocale();
  const allNotes = useMemo(() => resolveNotes(rawNotes, defaultLocale), [rawNotes, defaultLocale]);
  // One note per slug, chosen for the active language (with default fallback).
  const notes = useMemo(
    () => notesForLocale(allNotes, locale, defaultLocale),
    [allNotes, locale, defaultLocale],
  );
  const tree = useMemo(() => buildTree(notes, config.categoryOrder ?? []), [notes, config]);
  const tags = useMemo(() => collectTags(notes), [notes]);
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const route = useRoute();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div class="min-h-screen lg:flex">
      {/* Mobile top bar */}
      <header class="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden dark:border-neutral-800 dark:bg-neutral-950/80">
        <a href="#/" class="flex items-center gap-2 font-semibold no-underline">
          <span>📓</span>
          <span>{config.title}</span>
        </a>
        <div class="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <button
            onClick={() => setNavOpen((o) => !o)}
            class="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Toggle navigation"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      <Sidebar
        config={config}
        tree={tree}
        tags={tags}
        notes={notes}
        route={route}
        open={navOpen}
        onNavigate={() => setNavOpen(false)}
      />

      {navOpen && (
        <div
          class="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <main class="min-w-0 flex-1">
        <div class="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 lg:px-12">
          <Content route={route} notes={notes} byId={byId} tags={tags} />
        </div>
      </main>
    </div>
  );
}

// --- Sidebar --------------------------------------------------------------

function Sidebar(props: {
  config: GrimoireConfig;
  tree: TreeNode;
  tags: { tag: string; count: number }[];
  notes: NoteMeta[];
  route: Route;
  open: boolean;
  onNavigate: () => void;
}) {
  const { config, tree, tags, notes, route, open, onNavigate } = props;
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchNotes(notes, query), [notes, query]);

  return (
    <aside
      class={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-neutral-200 bg-neutral-50/60 backdrop-blur transition-transform dark:border-neutral-800 dark:bg-neutral-900/60 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div class="flex items-center justify-between px-5 py-5">
        <a href="#/" onClick={onNavigate} class="flex items-center gap-2 text-lg font-bold no-underline">
          <span class="text-2xl">📓</span>
          <span class="leading-tight">{config.title}</span>
        </a>
        <span class="hidden items-center lg:flex">
          <LanguageSwitcher />
          <ThemeToggle />
        </span>
      </div>

      <div class="px-4 pb-3">
        <div class="relative">
          <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder={t("search.placeholder")}
            class="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:accent-ring dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 pb-6 text-sm">
        {query.trim() ? (
          <SearchList results={results} route={route} onNavigate={onNavigate} />
        ) : (
          <>
            <TreeView node={tree} route={route} onNavigate={onNavigate} depth={0} />
            {tags.length > 0 && (
              <div class="mt-6">
                <div class="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {t("nav.tags")}
                </div>
                <div class="flex flex-wrap gap-1.5 px-2">
                  {tags.map((t) => (
                    <a
                      key={t.tag}
                      href={hrefFor({ kind: "tag", tag: t.tag })}
                      onClick={onNavigate}
                      class={`rounded-full border px-2 py-0.5 text-xs no-underline transition ${
                        route.kind === "tag" && route.tag === t.tag
                          ? "accent-bg border-transparent"
                          : "border-neutral-200 text-neutral-600 hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      {t.tag}
                      <span class="ml-1 opacity-50">{t.count}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      {config.footer && (
        <div class="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-400 dark:border-neutral-800">
          {config.footer}
        </div>
      )}
    </aside>
  );
}

function TreeView({
  node,
  route,
  onNavigate,
  depth,
}: {
  node: TreeNode;
  route: Route;
  onNavigate: () => void;
  depth: number;
}) {
  return (
    <div class={depth > 0 ? "ml-3 border-l border-neutral-200 pl-2 dark:border-neutral-800" : ""}>
      {node.children.map((child) => (
        <div key={child.path} class="mt-1">
          {depth >= 0 && (
            <div class="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {child.label}
            </div>
          )}
          <NoteLinks notes={child.notes} route={route} onNavigate={onNavigate} />
          {child.children.length > 0 && (
            <TreeView node={child} route={route} onNavigate={onNavigate} depth={depth + 1} />
          )}
        </div>
      ))}
      {depth === 0 && <NoteLinks notes={node.notes} route={route} onNavigate={onNavigate} />}
    </div>
  );
}

function NoteLinks({
  notes,
  route,
  onNavigate,
}: {
  notes: NoteMeta[];
  route: Route;
  onNavigate: () => void;
}) {
  return (
    <>
      {notes.map((n) => {
        const active = route.kind === "note" && route.id === n.id;
        return (
          <a
            key={n.id}
            href={noteHref(n.id)}
            onClick={onNavigate}
            class={`flex items-center gap-2 rounded-lg px-2 py-1.5 no-underline transition ${
              active
                ? "accent-bg font-medium"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {n.icon && <span class="text-base leading-none">{n.icon}</span>}
            <span class="truncate">{n.title}</span>
          </a>
        );
      })}
    </>
  );
}

function SearchList({
  results,
  route,
  onNavigate,
}: {
  results: NoteMeta[];
  route: Route;
  onNavigate: () => void;
}) {
  const { t } = useLocale();
  if (results.length === 0) {
    return <p class="px-2 py-6 text-center text-neutral-400">{t("search.none")}</p>;
  }
  return <NoteLinks notes={results} route={route} onNavigate={onNavigate} />;
}

// --- Main content ---------------------------------------------------------

function Content({
  route,
  notes,
  byId,
  tags,
}: {
  route: Route;
  notes: NoteMeta[];
  byId: Map<string, NoteMeta>;
  tags: { tag: string; count: number }[];
}) {
  if (route.kind === "note") {
    const note = byId.get(route.id);
    if (!note) return <NotFound id={route.id} />;
    return <NoteView note={note} />;
  }
  if (route.kind === "tag") return <TagView tag={route.tag} notes={notes} />;
  if (route.kind === "tags") return <TagsIndex tags={tags} />;
  return <Home notes={notes} />;
}

function NoteView({ note }: { note: NoteMeta }) {
  const Body = note.Component;
  return (
    <article class="animate-fade">
      <header class="mb-8 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        {note.segments.length > 0 && (
          <div class="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--accent)]">
            {note.segments.join(" / ")}
          </div>
        )}
        <h1 class="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          {note.icon && <span class="mr-2">{note.icon}</span>}
          {note.title}
        </h1>
        {note.description && (
          <p class="mt-2 text-lg text-neutral-500 dark:text-neutral-400">{note.description}</p>
        )}
        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          {note.date && <time>{formatDate(note.date)}</time>}
          {note.tags.map((t) => (
            <a
              key={t}
              href={hrefFor({ kind: "tag", tag: t })}
              class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 no-underline hover:text-[var(--accent)] dark:bg-neutral-800 dark:text-neutral-300"
            >
              #{t}
            </a>
          ))}
        </div>
      </header>
      <div class="prose prose-neutral max-w-none dark:prose-invert">
        <Body />
      </div>
    </article>
  );
}

function Home({ notes }: { notes: NoteMeta[] }) {
  const { t } = useLocale();
  const recent = [...notes]
    .filter((n) => n.date)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 6);
  const list = recent.length > 0 ? recent : notes.slice(0, 6);

  return (
    <div class="animate-fade">
      <h1 class="text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
        {t("home.welcome")} 👋
      </h1>
      <p class="mt-3 text-lg text-neutral-500 dark:text-neutral-400">
        {t("home.subtitle", { count: notes.length })}
      </p>
      <div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.map((n) => (
          <a
            key={n.id}
            href={noteHref(n.id)}
            class="group rounded-2xl border border-neutral-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div class="flex items-center gap-2 font-semibold text-neutral-800 group-hover:text-[var(--accent)] dark:text-neutral-100">
              {n.icon && <span>{n.icon}</span>}
              {n.title}
            </div>
            {n.description && (
              <p class="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                {n.description}
              </p>
            )}
            <div class="mt-3 flex flex-wrap gap-1.5">
              {n.tags.slice(0, 3).map((t) => (
                <span key={t} class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                  #{t}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function TagView({ tag, notes }: { tag: string; notes: NoteMeta[] }) {
  const { t } = useLocale();
  const matches = notes.filter((n) => n.tags.includes(tag));
  return (
    <div class="animate-fade">
      <h1 class="text-3xl font-bold tracking-tight">
        <span class="text-[var(--accent)]">#</span>
        {tag}
      </h1>
      <p class="mt-2 text-neutral-500 dark:text-neutral-400">
        {t("tag.count", { count: matches.length, tag })}
      </p>
      <ul class="mt-6 space-y-2">
        {matches.map((n) => (
          <li key={n.id}>
            <a href={noteHref(n.id)} class="block rounded-xl border border-neutral-200 px-4 py-3 no-underline transition hover:border-[var(--accent)] dark:border-neutral-800">
              <span class="font-medium text-neutral-800 dark:text-neutral-100">
                {n.icon} {n.title}
              </span>
              {n.description && (
                <span class="mt-0.5 block text-sm text-neutral-500 dark:text-neutral-400">
                  {n.description}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagsIndex({ tags }: { tags: { tag: string; count: number }[] }) {
  const { t } = useLocale();
  return (
    <div class="animate-fade">
      <h1 class="text-3xl font-bold tracking-tight">{t("tags.all")}</h1>
      <div class="mt-6 flex flex-wrap gap-2">
        {tags.map((t) => (
          <a
            key={t.tag}
            href={hrefFor({ kind: "tag", tag: t.tag })}
            class="rounded-full border border-neutral-200 px-3 py-1 text-sm no-underline transition hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-neutral-700"
          >
            #{t.tag} <span class="opacity-50">{t.count}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function NotFound({ id }: { id: string }) {
  const { t } = useLocale();
  return (
    <div class="animate-fade py-16 text-center">
      <div class="text-6xl">🔍</div>
      <h1 class="mt-4 text-2xl font-bold">{t("note.notFound.title")}</h1>
      <p class="mt-2 text-neutral-500">
        {t("note.notFound.body", { id })}
      </p>
      <a href="#/" class="accent-text mt-4 inline-block font-medium">
        {t("note.back")}
      </a>
    </div>
  );
}
