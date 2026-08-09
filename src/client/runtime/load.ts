// Runtime note loading: fetch a note's compiled MDX (a portable `function-body`)
// from the server and evaluate it with the preact runtime — no bundler needed.
import * as jsxRuntime from "preact/jsx-runtime";
import { useMDXComponents } from "@mdx-js/preact";
import { useEffect, useState } from "preact/hooks";
import { h, type ComponentType } from "preact";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  body: string,
) => (scope: Record<string, unknown>) => Promise<{ default: ComponentType<any> }>;

const cache = new Map<string, Promise<ComponentType<any>>>();

const encodeId = (id: string) => id.split("/").map(encodeURIComponent).join("/");

/** Fetch a compiled MDX function-body and evaluate it into a component. */
async function evaluate(url: string): Promise<ComponentType<any>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.text();
  const scope = { ...jsxRuntime, useMDXComponents, baseUrl: location.href };
  const mod = await new AsyncFunction(body)(scope);
  return mod.default;
}

function cached(key: string, load: () => Promise<ComponentType<any>>): Promise<ComponentType<any>> {
  let p = cache.get(key);
  if (!p) {
    p = load();
    cache.set(key, p);
  }
  return p;
}

export function loadNoteComponent(id: string, lang: string): Promise<ComponentType<any>> {
  return cached(`note:${lang}::${id}`, () =>
    evaluate(`/api/note/${encodeId(id)}?lang=${encodeURIComponent(lang)}`),
  );
}

export function loadCardComponent(id: string, lang: string): Promise<ComponentType<any>> {
  return cached(`card:${lang}::${id}`, () =>
    evaluate(`/api/card/${encodeId(id)}?lang=${encodeURIComponent(lang)}`),
  );
}

export function clearNoteCache(): void {
  cache.clear();
}

/** A component that lazily fetches + evaluates a note's compiled MDX on mount. */
export function lazyNote(id: string, lang: string): ComponentType<any> {
  return lazyBody(id, () => loadNoteComponent(id, lang), "Note");
}

/** The same, for one card's markdown body. */
export function lazyCard(id: string, lang: string): ComponentType<any> {
  return lazyBody(`${lang}::${id}`, () => loadCardComponent(id, lang), "Card");
}

function lazyBody(
  id: string,
  load: () => Promise<ComponentType<any>>,
  label: string,
): ComponentType<any> {
  return function LazyBody(props: Record<string, unknown>) {
    const [state, setState] = useState<{ Comp?: ComponentType<any>; err?: string }>({});
    useEffect(() => {
      let alive = true;
      setState({});
      load().then(
        (Comp) => alive && setState({ Comp }),
        (e) => {
          const err = String(e?.message ?? e);
          console.error(`[grimoire] ${label} "${id}": ${err.split("\n")[0]}`);
          if (alive) setState({ err });
        },
      );
      return () => {
        alive = false;
      };
    }, [id]);

    if (state.err) {
      return h(
        "div",
        {
          class:
            "not-prose rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
        },
        h("strong", null, `Failed to render ${label.toLowerCase()}. `),
        state.err,
      );
    }
    if (!state.Comp) {
      return h("div", { class: "py-12 text-center text-sm text-neutral-400" }, "Loading…");
    }
    return h(state.Comp, props);
  };
}
