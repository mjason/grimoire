// The other half of a bidirectional link: what this entry points at, and what
// points back at it. Rendered under every note and card, and available inside a
// note body as <Backlinks /> / <Links />.
import { nodeHref, useCurrentEntry, useSite } from "../lib/site";
import type { GraphNode } from "../../runtime/links";
import { useLocale } from "../i18n";
import { GraphView } from "./GraphView";

function NodeChip({ node }: { node: GraphNode }) {
  return (
    <a
      href={nodeHref(node)}
      data-kind={node.kind}
      class="flex items-start gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm no-underline transition hover:border-[var(--accent)] dark:border-neutral-800"
    >
      <span class="mt-0.5 shrink-0 text-xs opacity-60">{node.kind === "card" ? "🃏" : "📄"}</span>
      <span class="min-w-0">
        <span class="block truncate font-medium text-neutral-700 dark:text-neutral-200">
          {node.title}
        </span>
        {node.description && (
          <span class="mt-0.5 line-clamp-1 block text-xs text-neutral-400">{node.description}</span>
        )}
      </span>
    </a>
  );
}

function NodeList({ ids, empty }: { ids: string[]; empty: string }) {
  const site = useSite();
  const nodes = ids.flatMap((id) => {
    const node = site.nodeById.get(id);
    return node ? [node] : [];
  });
  if (nodes.length === 0) {
    return <p class="px-1 py-2 text-sm text-neutral-400">{empty}</p>;
  }
  return (
    <div class="grid gap-2 sm:grid-cols-2">
      {nodes.map((node) => (
        <NodeChip key={node.id} node={node} />
      ))}
    </div>
  );
}

/** Notes/cards this entry links to. `of` defaults to the entry on screen. */
export function Links({ of }: { of?: string }) {
  const site = useSite();
  const { t } = useLocale();
  const current = useCurrentEntry();
  const id = of ? site.resolve(of)?.id ?? of : current;
  if (!id) return null;
  return (
    <div class="not-prose">
      <NodeList ids={site.graph.outgoing[id] ?? []} empty={t("links.none")} />
    </div>
  );
}

/** Notes/cards that link here. `of` defaults to the entry on screen. */
export function Backlinks({ of }: { of?: string }) {
  const site = useSite();
  const { t } = useLocale();
  const current = useCurrentEntry();
  const id = of ? site.resolve(of)?.id ?? of : current;
  if (!id) return null;
  return (
    <div class="not-prose">
      <NodeList ids={site.graph.backlinks[id] ?? []} empty={t("links.noBacklinks")} />
    </div>
  );
}

const HEADING = "grimoire-category text-neutral-400";

/** The full connections panel shown at the foot of a note or card. */
export function Connections({ id, graph = true }: { id: string; graph?: boolean }) {
  const site = useSite();
  const { t } = useLocale();
  const out = site.graph.outgoing[id] ?? [];
  const back = site.graph.backlinks[id] ?? [];
  if (out.length === 0 && back.length === 0) return null;

  return (
    <section class="not-prose mt-12 border-t border-neutral-200 pt-8 dark:border-neutral-800" data-testid="connections">
      <h2 class="mb-4 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
        {t("links.title")}
      </h2>
      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-2">
          <div class={HEADING}>
            {t("links.outgoing")} <span class="opacity-60">{out.length}</span>
          </div>
          <NodeList ids={out} empty={t("links.none")} />
        </div>
        <div class="space-y-2" data-testid="backlinks">
          <div class={HEADING}>
            {t("links.backlinks")} <span class="opacity-60">{back.length}</span>
          </div>
          <NodeList ids={back} empty={t("links.noBacklinks")} />
        </div>
      </div>
      {graph && (
        <div class="mt-6 space-y-2">
          <div class={HEADING}>{t("graph.local")}</div>
          <GraphView focus={id} depth={1} height={260} />
        </div>
      )}
    </section>
  );
}
