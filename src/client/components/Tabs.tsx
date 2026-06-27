import { useState } from "preact/hooks";
import type { ComponentChildren, VNode } from "preact";

export interface TabProps {
  label: string;
  children?: ComponentChildren;
}

/** A single tab panel. Must be a direct child of <Tabs>. */
export function Tab(_props: TabProps): VNode | null {
  // Rendering is handled by <Tabs>; this is a structural marker.
  return null;
}

export interface TabsProps {
  children?: ComponentChildren;
}

/**
 * Tabbed content:
 *
 * ```mdx
 * <Tabs>
 *   <Tab label="npm">…</Tab>
 *   <Tab label="bun">…</Tab>
 * </Tabs>
 * ```
 */
export function Tabs({ children }: TabsProps) {
  const items = (Array.isArray(children) ? children : [children])
    .filter(Boolean)
    .filter((c: any) => c && c.props && typeof c.props.label === "string") as VNode<TabProps>[];
  const [active, setActive] = useState(0);

  if (items.length === 0) return null;

  return (
    <div class="not-prose my-6 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <div role="tablist" class="flex gap-1 border-b border-neutral-200 bg-neutral-50 px-2 pt-2 dark:border-neutral-800 dark:bg-neutral-900">
        {items.map((item, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            class={`-mb-px rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-medium transition ${
              active === i
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {item.props.label}
          </button>
        ))}
      </div>
      <div class="prose prose-neutral max-w-none px-4 py-3 dark:prose-invert [&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {items[active]?.props.children}
      </div>
    </div>
  );
}
