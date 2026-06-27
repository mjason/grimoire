import { useEffect, useState } from "preact/hooks";

export type Route =
  | { kind: "home" }
  | { kind: "note"; id: string }
  | { kind: "tag"; tag: string }
  | { kind: "tags" };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (!h || h === "/" ) return { kind: "home" };
  const parts = h.replace(/^\//, "").split("/");
  if (parts[0] === "n") return { kind: "note", id: parts.slice(1).map(decodeURIComponent).join("/") };
  if (parts[0] === "tag") return { kind: "tag", tag: decodeURIComponent(parts[1] ?? "") };
  if (parts[0] === "tags") return { kind: "tags" };
  return { kind: "home" };
}

export function hrefFor(route: Route): string {
  switch (route.kind) {
    case "home":
      return "#/";
    case "note":
      return `#/n/${route.id.split("/").map(encodeURIComponent).join("/")}`;
    case "tag":
      return `#/tag/${encodeURIComponent(route.tag)}`;
    case "tags":
      return "#/tags";
  }
}

export function noteHref(id: string): string {
  return hrefFor({ kind: "note", id });
}

export function navigate(href: string): void {
  if (location.hash === href) return;
  location.hash = href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
