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

async function compileNote(id: string, lang: string): Promise<ComponentType<any>> {
  const path = id.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`/api/note/${path}?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.text();
  const scope = { ...jsxRuntime, useMDXComponents, baseUrl: location.href };
  const mod = await new AsyncFunction(body)(scope);
  return mod.default;
}

export function loadNoteComponent(id: string, lang: string): Promise<ComponentType<any>> {
  const key = `${lang}::${id}`;
  let p = cache.get(key);
  if (!p) {
    p = compileNote(id, lang);
    cache.set(key, p);
  }
  return p;
}

export function clearNoteCache(): void {
  cache.clear();
}

/** A component that lazily fetches + evaluates a note's compiled MDX on mount. */
export function lazyNote(id: string, lang: string): ComponentType<any> {
  return function LazyNote(props: Record<string, unknown>) {
    const [state, setState] = useState<{ Comp?: ComponentType<any>; err?: string }>({});
    useEffect(() => {
      let alive = true;
      setState({});
      loadNoteComponent(id, lang).then(
        (Comp) => alive && setState({ Comp }),
        (e) => alive && setState({ err: String(e?.message ?? e) }),
      );
      return () => {
        alive = false;
      };
    }, [id, lang]);

    if (state.err) {
      return h(
        "div",
        {
          class:
            "not-prose rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
        },
        h("strong", null, "Failed to render note. "),
        state.err,
      );
    }
    if (!state.Comp) {
      return h("div", { class: "py-12 text-center text-sm text-neutral-400" }, "Loading…");
    }
    return h(state.Comp, props);
  };
}
