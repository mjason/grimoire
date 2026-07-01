import { useEffect, useRef, useState } from "preact/hooks";

// Mermaid is large (~3.5 MB) and lives in its own served chunk, imported the
// first time a diagram actually renders — notes without diagrams never load it.
let mermaidP: Promise<any> | null = null;
function loadMermaid(): Promise<any> {
  if (!mermaidP) mermaidP = import("mermaid").then((m) => m.default ?? m);
  return mermaidP;
}
let seq = 0;

/**
 * Render a Mermaid diagram. Used both directly (`<Mermaid chart="..." />`) and
 * for ```mermaid fenced blocks (rewritten to `<mermaid>` by rehypeMermaid).
 * Re-themes automatically when dark mode is toggled; on a syntax error it shows
 * the message and the source instead of blowing up the page.
 */
export function Mermaid({ chart, children }: { chart?: string; children?: unknown }) {
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const seqRef = useRef(0);

  const source = String(chart ?? (typeof children === "string" ? children : "")).trim();

  // Track the `dark` class on <html> so the diagram re-renders on theme toggle.
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!source) return;
    const token = ++seqRef.current;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "inherit",
        });
        // Validate first: a syntax error throws here cleanly, so render() never
        // runs and never leaves its "error" diagram orphaned in the DOM.
        await mermaid.parse(source);
        const out = await mermaid.render(`mmd-${seq++}`, source);
        if (token === seqRef.current) {
          setSvg(out.svg);
          setErr(null);
        }
      } catch (e) {
        if (token === seqRef.current) setErr((e as Error)?.message || String(e));
      }
    })();
  }, [source, dark]);

  if (err) {
    return (
      <div class="not-prose my-6 overflow-hidden rounded-xl border border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30">
        <div class="border-b border-red-200 px-4 py-2 text-xs font-medium text-red-600 dark:border-red-900/60 dark:text-red-400">
          Mermaid error — {err}
        </div>
        <pre class="overflow-x-auto p-4 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{source}</pre>
      </div>
    );
  }

  if (svg) {
    return (
      <div
        class="not-prose my-6 flex justify-center overflow-x-auto rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/40 [&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <div class="not-prose my-6 flex items-center justify-center rounded-xl border border-dashed border-neutral-200 py-10 text-sm text-neutral-400 dark:border-neutral-800">
      rendering diagram…
    </div>
  );
}
