import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

/** <pre> override that adds a copy-to-clipboard button. */
export function Pre(props: { children?: ComponentChildren; [k: string]: any }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div class="group relative">
      <button
        onClick={copy}
        aria-label="Copy code"
        class="absolute right-2.5 top-2.5 z-10 rounded-md border border-neutral-300/60 bg-white/80 px-2 py-1 text-xs font-medium text-neutral-500 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-[var(--accent)] dark:border-neutral-700 dark:bg-neutral-800/80"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre ref={ref} {...props} />
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
