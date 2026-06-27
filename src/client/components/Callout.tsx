import type { ComponentChildren } from "preact";

type Kind = "note" | "info" | "tip" | "warning" | "danger" | "success";

const STYLES: Record<Kind, { ring: string; icon: string; label: string; emoji: string }> = {
  note: { ring: "border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/40", icon: "text-neutral-500", label: "Note", emoji: "📝" },
  info: { ring: "border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40", icon: "text-sky-500", label: "Info", emoji: "💡" },
  tip: { ring: "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40", icon: "text-emerald-500", label: "Tip", emoji: "✅" },
  success: { ring: "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40", icon: "text-emerald-500", label: "Success", emoji: "🎉" },
  warning: { ring: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40", icon: "text-amber-500", label: "Warning", emoji: "⚠️" },
  danger: { ring: "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40", icon: "text-rose-500", label: "Danger", emoji: "🚨" },
};

export interface CalloutProps {
  type?: Kind;
  title?: string;
  children?: ComponentChildren;
}

/** A coloured admonition box. `<Callout type="warning">…</Callout>` */
export function Callout({ type = "note", title, children }: CalloutProps) {
  const s = STYLES[type] ?? STYLES.note;
  return (
    <div class={`my-6 rounded-xl border px-4 py-3 ${s.ring}`}>
      <div class="mb-1 flex items-center gap-2 font-semibold">
        <span aria-hidden>{s.emoji}</span>
        <span class={s.icon}>{title ?? s.label}</span>
      </div>
      <div class="prose-sm prose-neutral dark:prose-invert [&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}
