// Card notes: small, atomic pieces of project knowledge kept in plain text
// (`cards/*.md`). They show up three ways — as a grid embedded in a note
// (<Cards tag="engine" />), as the browsable #/cards deck, and as a single card
// page with its own links and backlinks.
import { useMemo, useState } from "preact/hooks";
import { cardFilter } from "../../runtime/cards";
import { lazyCard } from "../runtime/load";
import { cardHref, hrefFor } from "../lib/router";
import { CurrentEntryProvider, useSite, type CardMeta } from "../lib/site";
import { formatDate } from "../lib/notes";
import { useLocale } from "../i18n";
import { Connections } from "./Connections";

const TILE =
  "group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-4 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900";

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div class="mt-3 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          class="rounded-full bg-neutral-100 px-2 py-0.5 text-[0.7rem] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300"
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}

/** One card as a clickable tile. */
export function CardTile({ card }: { card: CardMeta }) {
  return (
    <a href={cardHref(card.id)} class={TILE} data-card={card.id} data-testid="card-tile">
      <div class="flex items-center gap-2 font-semibold text-neutral-800 group-hover:text-[var(--accent)] dark:text-neutral-100">
        {card.icon && <span>{card.icon}</span>}
        <span class="min-w-0 truncate">{card.title}</span>
      </div>
      {(card.description || card.excerpt) && (
        <p class="mt-1.5 line-clamp-4 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {card.description || card.excerpt}
        </p>
      )}
      <div class="mt-auto">
        <TagRow tags={card.tags} />
        <div class="grimoire-category mt-3 text-neutral-400">{card.deck}</div>
      </div>
    </a>
  );
}

/** A card's markdown body, compiled on demand. */
export function CardBody({ id }: { id: string }) {
  const { locale } = useLocale();
  const Body = useMemo(() => lazyCard(id, locale), [id, locale]);
  return (
    <div class="prose prose-neutral max-w-none dark:prose-invert">
      <Body />
    </div>
  );
}

function toIds(value: string[] | string | undefined): string[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return undefined;
}

/**
 * MDX component: a filtered grid of cards.
 * `<Cards tag="engine" columns={3} />`, `<Cards ids="engine-boot,css-pipeline" expand />`
 */
export function Cards({
  tag,
  deck,
  ids,
  query,
  limit,
  columns = 2,
  expand = false,
}: {
  tag?: string;
  deck?: string;
  ids?: string[] | string;
  query?: string;
  limit?: number;
  columns?: number;
  expand?: boolean;
}) {
  const site = useSite();
  const { t } = useLocale();
  const matched = useMemo(() => {
    const found = cardFilter(site.cards, { tag, deck, query, ids: toIds(ids) });
    return typeof limit === "number" ? found.slice(0, limit) : found;
  }, [site.cards, tag, deck, query, ids, limit]);

  if (matched.length === 0) {
    return <p class="not-prose py-4 text-sm text-neutral-400">{t("cards.none")}</p>;
  }

  if (expand) {
    return (
      <div class="not-prose my-6 space-y-4">
        {matched.map((card) => (
          <article
            key={card.id}
            class="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800"
            data-card={card.id}
          >
            <a
              href={cardHref(card.id)}
              class="flex items-center gap-2 font-semibold no-underline hover:text-[var(--accent)]"
            >
              {card.icon && <span>{card.icon}</span>}
              {card.title}
            </a>
            <div class="mt-2">
              <CurrentEntryProvider id={card.id}>
                <CardBody id={card.id} />
              </CurrentEntryProvider>
            </div>
            <TagRow tags={card.tags} />
          </article>
        ))}
      </div>
    );
  }

  const cols = Math.min(4, Math.max(1, columns));
  const gridClass =
    cols === 1
      ? "grid-cols-1"
      : cols === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : cols === 3
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div class={`not-prose my-6 grid gap-3 ${gridClass}`} data-testid="cards-grid">
      {matched.map((card) => (
        <CardTile key={card.id} card={card} />
      ))}
    </div>
  );
}

// --- Route views -------------------------------------------------------------

/** `#/cards` — the whole deck, searchable and filterable. */
export function CardsIndex() {
  const site = useSite();
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [deck, setDeck] = useState<string | null>(null);

  const decks = useMemo(
    () => [...new Set(site.cards.map((c) => c.deck))].sort((a, b) => a.localeCompare(b)),
    [site.cards],
  );
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of site.cards) for (const tg of card.tags) counts.set(tg, (counts.get(tg) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [site.cards]);

  const matched = useMemo(
    () => cardFilter(site.cards, { query, tag: tag ?? undefined, deck: deck ?? undefined }),
    [site.cards, query, tag, deck],
  );

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs no-underline transition ${
      active
        ? "accent-bg border-transparent"
        : "border-neutral-200 text-neutral-600 hover:border-[var(--accent)] hover:text-[var(--accent)] dark:border-neutral-700 dark:text-neutral-300"
    }`;

  return (
    <div class="animate-fade">
      <h1 class="text-3xl font-bold tracking-tight">🃏 {t("cards.title")}</h1>
      <p class="mt-2 text-neutral-500 dark:text-neutral-400">
        {t("cards.count", { count: site.cards.length })}
      </p>

      <div class="mt-6 space-y-3">
        <input
          type="search"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder={t("cards.search")}
          data-testid="cards-search"
          class="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:accent-ring dark:border-neutral-700 dark:bg-neutral-800"
        />
        {decks.length > 1 && (
          <div class="flex flex-wrap gap-1.5">
            <button type="button" class={chip(deck === null)} onClick={() => setDeck(null)}>
              {t("cards.allDecks")}
            </button>
            {decks.map((d) => (
              <button key={d} type="button" class={chip(deck === d)} onClick={() => setDeck(d)}>
                {d}
              </button>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div class="flex flex-wrap gap-1.5">
            {tags.map(([tg, count]) => (
              <button
                key={tg}
                type="button"
                class={chip(tag === tg)}
                onClick={() => setTag((current) => (current === tg ? null : tg))}
              >
                #{tg} <span class="opacity-50">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {matched.length === 0 ? (
        <p class="mt-10 text-center text-neutral-400">{t("cards.none")}</p>
      ) : (
        <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="cards-grid">
          {matched.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

/** `#/card/<id>` — one card, in full, with its place in the graph. */
export function CardPage({ id }: { id: string }) {
  const site = useSite();
  const { t } = useLocale();
  const card = site.cardById.get(id);

  if (!card) {
    return (
      <div class="animate-fade py-16 text-center">
        <div class="text-6xl">🃏</div>
        <h1 class="mt-4 text-2xl font-bold">{t("card.notFound.title")}</h1>
        <p class="mt-2 text-neutral-500">{t("note.notFound.body", { id })}</p>
        <a href={hrefFor({ kind: "cards" })} class="accent-text mt-4 inline-block font-medium">
          {t("card.back")}
        </a>
      </div>
    );
  }

  return (
    <CurrentEntryProvider id={card.id}>
      <article class="animate-fade" data-testid="card-page">
        <header class="mb-8 border-b border-neutral-200 pb-6 dark:border-neutral-800">
          <a
            href={hrefFor({ kind: "cards" })}
            class="grimoire-category text-[var(--accent)] no-underline"
          >
            {card.deck}
          </a>
          <h1 class="mt-2 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            {card.icon && <span class="mr-2">{card.icon}</span>}
            {card.title}
          </h1>
          <div class="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
            {card.date && <time>{formatDate(card.date)}</time>}
            {card.tags.map((tag) => (
              <a
                key={tag}
                href={hrefFor({ kind: "tag", tag })}
                class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 no-underline hover:text-[var(--accent)] dark:bg-neutral-800 dark:text-neutral-300"
              >
                #{tag}
              </a>
            ))}
          </div>
        </header>
        <CardBody id={card.id} />
        <Connections id={card.id} />
      </article>
    </CurrentEntryProvider>
  );
}
