import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

function CopyButton({ targetRef, floating }: { targetRef: { current: HTMLElement | null }; floating?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = targetRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };
  const base =
    "rounded-md border border-neutral-300/60 bg-white/80 px-2 py-1 text-xs font-medium text-neutral-500 backdrop-blur transition hover:text-[var(--accent)] dark:border-neutral-700 dark:bg-neutral-800/80";
  if (floating) {
    return (
      <button onClick={copy} aria-label="Copy code" class={`absolute right-2.5 top-2.5 z-10 opacity-0 group-hover:opacity-100 ${base}`}>
        {copied ? "Copied!" : "Copy"}
      </button>
    );
  }
  return (
    <button onClick={copy} aria-label="Copy code" class={base}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/**
 * <pre> override that turns every fenced code block into a code viewer:
 * filename header (from `title="…"`), language badge, copy button, optional
 * line numbers (`showLineNumbers`) + line highlighting (`{1,3-5}`), and a
 * collapse control for very tall blocks.
 */
export function Pre({ children }: { children?: ComponentChildren; [k: string]: any }) {
  const preRef = useRef<HTMLPreElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsible, setCollapsible] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && el.scrollHeight > 540) {
      setCollapsible(true);
      setCollapsed(true);
    }
  }, []);

  // Read metadata off the compiled <code> child (set by the code plugins).
  const arr = Array.isArray(children) ? children : [children];
  const codeVnode = arr.find((c) => c && typeof c === "object") as any;
  const cprops = codeVnode?.props ?? {};
  const title: string | undefined = cprops["data-title"] ?? cprops.dataTitle;
  const className: string = cprops.className ?? cprops.class ?? "";
  const language: string | undefined =
    cprops["data-lang"] ?? cprops.dataLang ?? /language-([\w-]+)/.exec(className)?.[1];

  return (
    <div class="not-prose group relative my-6 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      {title ? (
        <div class="flex items-center justify-between border-b border-neutral-200 bg-neutral-100/70 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-800/40">
          <span class="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            <svg class="h-3.5 w-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            {title}
          </span>
          <div class="flex items-center gap-2">
            {language && <span class="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{language}</span>}
            <CopyButton targetRef={preRef} />
          </div>
        </div>
      ) : (
        <CopyButton targetRef={preRef} floating />
      )}

      <div ref={bodyRef} class="relative" style={collapsed ? { maxHeight: "480px", overflow: "hidden" } : undefined}>
        <pre ref={preRef} class="!m-0 overflow-x-auto bg-transparent py-4 text-sm leading-relaxed">
          {children}
        </pre>
        {collapsible && collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            class="absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-neutral-50 to-transparent pb-2 pt-10 text-xs font-medium text-[var(--accent)] dark:from-neutral-900"
          >
            Show more ↓
          </button>
        )}
      </div>
    </div>
  );
}

/** Heading override that adds a hover anchor link using the slug id. */
function heading(level: 2 | 3 | 4) {
  const Tag = `h${level}` as any;
  return function Heading({ id, children, ...rest }: { id?: string; children?: ComponentChildren; [k: string]: any }) {
    return (
      <Tag id={id} {...rest} class="group/anchor scroll-mt-20">
        {children}
        {id && (
          <button
            type="button"
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
            class="ml-2 align-middle text-[var(--accent)] opacity-0 transition group-hover/anchor:opacity-60 hover:!opacity-100"
            aria-label="Scroll to this section"
          >
            #
          </button>
        )}
      </Tag>
    );
  };
}

export const H2 = heading(2);
export const H3 = heading(3);
export const H4 = heading(4);

/** Anchor override: external links open in a new tab. */
export function A({ href = "", children, ...rest }: { href?: string; children?: ComponentChildren; [k: string]: any }) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
      {external && <span class="ml-0.5 align-super text-[0.65em] opacity-60">↗</span>}
    </a>
  );
}

/** Wrap raw markdown tables so they scroll horizontally on small screens. */
export function Table(props: { children?: ComponentChildren; [k: string]: any }) {
  return (
    <div class="my-6 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
      <table {...props} class="!my-0 w-full" />
    </div>
  );
}
