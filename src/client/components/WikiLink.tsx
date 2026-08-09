// `[[target]]` rendered. A resolved link navigates and previews its destination
// on hover; an unresolved one stays visible but is marked broken, so a typo is
// obvious in the page instead of silently doing nothing.
import type { ComponentChildren } from "preact";
import { nodeHref, useSite } from "../lib/site";

function textOf(children: ComponentChildren): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  return "";
}

export function WikiLink({
  to = "",
  label,
  anchor,
  children,
}: {
  to?: string;
  label?: string;
  anchor?: string;
  children?: ComponentChildren;
  [k: string]: unknown;
}) {
  const site = useSite();
  const node = site.resolve(to);
  const text = label ?? textOf(children) ?? to;

  if (!node) {
    return (
      <span class="wikilink-broken" title={`Unresolved link: ${to}`} data-wikilink="broken">
        {text}
      </span>
    );
  }

  const href = `${nodeHref(node)}${anchor ? `#${anchor}` : ""}`;
  const summary = node.description ?? "";

  return (
    <span class="wikilink-host">
      {site.navigable ? (
        <a href={href} class="wikilink" data-wikilink={node.kind} data-to={node.id}>
          {text}
        </a>
      ) : (
        // An exported single file has nowhere to navigate to — show the link's
        // shape without pretending it works.
        <span class="wikilink wikilink-static" data-wikilink="static" data-to={node.id}>
          {text}
        </span>
      )}
      <span class="wikilink-preview not-prose" role="tooltip" aria-hidden="true">
        <span class="wikilink-preview-title">
          {node.kind === "card" ? "🃏" : "📄"} {node.title}
        </span>
        {summary && <span class="wikilink-preview-body">{summary}</span>}
        {node.tags.length > 0 && (
          <span class="wikilink-preview-tags">{node.tags.map((tag) => `#${tag}`).join(" ")}</span>
        )}
      </span>
    </span>
  );
}
