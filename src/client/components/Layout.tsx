import { cloneElement, toChildArray, type ComponentChildren, type VNode } from "preact";
import { noteHref } from "../lib/router";

/** Numbered step list. Wrap each step in <Step title="…">; numbers are auto-assigned. */
export function Steps({ children }: { children?: ComponentChildren }) {
  // Keep only element children (drop whitespace/text) so numbering is correct.
  const items = toChildArray(children).filter(
    (c): c is VNode<StepProps> => c != null && typeof c === "object",
  );
  return (
    <div class="grimoire-steps my-6 ml-3 border-l-2 border-neutral-200 pl-6 dark:border-neutral-800">
      {items.map((child, i) => cloneElement(child, { index: i + 1 }))}
    </div>
  );
}

interface StepProps {
  title?: string;
  /** Injected automatically by <Steps>. */
  index?: number;
  children?: ComponentChildren;
}

export function Step({ title, index, children }: StepProps) {
  return (
    <div class="relative mb-6 last:mb-0">
      <span class="accent-bg absolute -left-[34px] flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums">
        {index ?? ""}
      </span>
      {title && <h4 class="mt-0 mb-1 font-semibold text-neutral-800 dark:text-neutral-100">{title}</h4>}
      <div class="prose prose-neutral max-w-none dark:prose-invert [&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

export interface CardProps {
  title?: string;
  icon?: string;
  href?: string;
  /** Internal note id; takes precedence over href. */
  note?: string;
  children?: ComponentChildren;
}

/** A clickable card, great for index/landing pages. */
export function Card({ title, icon, href, note, children }: CardProps) {
  const url = note ? noteHref(note) : href;
  const inner = (
    <div class="group h-full rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      {icon && <div class="mb-2 text-2xl">{icon}</div>}
      {title && <div class="font-semibold text-neutral-800 group-hover:text-[var(--accent)] dark:text-neutral-100">{title}</div>}
      <div class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{children}</div>
    </div>
  );
  return url ? (
    <a href={url} class="no-underline">
      {inner}
    </a>
  ) : (
    inner
  );
}

export function CardGrid({ children, columns = 2 }: { children?: ComponentChildren; columns?: number }) {
  const cols = columns === 3 ? "sm:grid-cols-3" : columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2";
  return <div class={`not-prose my-6 grid grid-cols-1 gap-3 ${cols}`}>{children}</div>;
}

export function Badge({ children, color }: { children?: ComponentChildren; color?: string }) {
  return (
    <span
      class="mr-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: color ? `${color}22` : "var(--accent-soft)",
        color: color ?? "var(--accent)",
      }}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children?: ComponentChildren }) {
  return (
    <kbd class="rounded-md border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
      {children}
    </kbd>
  );
}
