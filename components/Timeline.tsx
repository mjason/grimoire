import type { ComponentChildren } from "preact";

interface TimelineProps {
  children?: ComponentChildren;
}

/**
 * Timeline — a vertical timeline with a single continuous left border line.
 * The line is drawn on the container's padded-left rail so it stays unbroken
 * behind every TimelineItem dot.
 */
export function Timeline({ children }: TimelineProps) {
  return (
    <div class="not-prose rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="relative pl-6">
        {/* the continuous line — sits at the left rail behind the dots */}
        <div
          class="absolute left-[5px] top-2 bottom-2 w-px bg-neutral-200 dark:bg-neutral-700"
          aria-hidden="true"
        />
        <ol class="space-y-7">{children}</ol>
      </div>
    </div>
  );
}

interface TimelineItemProps {
  title: string;
  date?: string;
  icon?: string;
  children?: ComponentChildren;
}

/**
 * TimelineItem — a single entry. Renders a dot/marker that sits ON the line
 * (accent colored), the title, an optional muted date, and markdown-friendly
 * children below.
 */
export function TimelineItem({ title, date, icon, children }: TimelineItemProps) {
  return (
    <li class="relative">
      {/* dot/marker centered on the line. The rail line is at left:5px within
          the parent's pl-6, so the marker is pulled left to straddle it. */}
      <span
        class="absolute -left-6 top-1 flex h-[11px] w-[11px] items-center justify-center"
        aria-hidden="true"
      >
        {icon ? (
          <span class="text-[11px] leading-none text-[var(--accent)]">{icon}</span>
        ) : (
          <span
            class="h-[11px] w-[11px] rounded-full border-2 border-white bg-[var(--accent)] shadow-sm ring-1 ring-black/5 dark:border-neutral-900 dark:ring-white/10"
          />
        )}
      </span>

      <div class="flex flex-wrap items-baseline gap-x-2">
        <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        {date ? (
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{date}</span>
        ) : null}
      </div>

      {children ? (
        <div class="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 [&_a]:text-[var(--accent)] [&_a]:underline [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] dark:[&_code]:bg-neutral-800">
          {children}
        </div>
      ) : null}
    </li>
  );
}
