import { useEffect, useState } from "preact/hooks";

export type Route =
  | { kind: "home" }
  | { kind: "note"; id: string; anchor?: string }
  | { kind: "tag"; tag: string }
  | { kind: "tags" }
  | { kind: "graph" }
  | { kind: "cards" }
  | { kind: "card"; id: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (!h || h === "/") return { kind: "home" };
  // A wiki link may carry a heading anchor: `#/n/guides/authoring#frontmatter`.
  const hashAt = h.indexOf("#");
  const anchor = hashAt === -1 ? undefined : decodeURIComponent(h.slice(hashAt + 1));
  const path = hashAt === -1 ? h : h.slice(0, hashAt);
  const parts = path.replace(/^\//, "").split("/");
  const rest = () => parts.slice(1).map(decodeURIComponent).join("/");
  if (parts[0] === "n") return { kind: "note", id: rest(), ...(anchor ? { anchor } : {}) };
  if (parts[0] === "tag") return { kind: "tag", tag: decodeURIComponent(parts[1] ?? "") };
  if (parts[0] === "tags") return { kind: "tags" };
  if (parts[0] === "graph") return { kind: "graph" };
  if (parts[0] === "cards") return { kind: "cards" };
  if (parts[0] === "card") return { kind: "card", id: rest() };
  return { kind: "home" };
}

const encodeId = (id: string) => id.split("/").map(encodeURIComponent).join("/");

export function hrefFor(route: Route): string {
  switch (route.kind) {
    case "home":
      return "#/";
    case "note":
      return `#/n/${encodeId(route.id)}${route.anchor ? `#${route.anchor}` : ""}`;
    case "tag":
      return `#/tag/${encodeURIComponent(route.tag)}`;
    case "tags":
      return "#/tags";
    case "graph":
      return "#/graph";
    case "cards":
      return "#/cards";
    case "card":
      return `#/card/${encodeId(route.id)}`;
  }
}

export function noteHref(id: string): string {
  return hrefFor({ kind: "note", id });
}

export function cardHref(id: string): string {
  return hrefFor({ kind: "card", id });
}

export function navigate(href: string): void {
  if (location.hash === href) return;
  location.hash = href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      const next = parseHash(location.hash);
      setRoute(next);
      // A heading anchor scrolls itself once the note renders; otherwise go to top.
      if (!(next.kind === "note" && next.anchor)) window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
