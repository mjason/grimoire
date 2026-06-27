import { useState } from "preact/hooks";
import { useLocale } from "../i18n";

/** Globe dropdown to switch UI + content language. Hidden when <2 locales. */
export function LanguageSwitcher() {
  const { locale, setLocale, i18n, t } = useLocale();
  const [open, setOpen] = useState(false);

  if (!i18n || i18n.locales.length < 2) return null;
  const active = i18n.locales.find((l) => l.code === locale);

  return (
    <div class="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("ui.language")}
        title={t("ui.language")}
        class="flex items-center gap-1 rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-[var(--accent)] dark:hover:bg-neutral-800"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
        </svg>
        <span class="text-xs font-medium uppercase">{active?.code ?? locale}</span>
      </button>
      {open && (
        <>
          <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div class="absolute right-0 z-50 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {i18n.locales.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLocale(l.code);
                  setOpen(false);
                }}
                class={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  locale === l.code ? "font-semibold text-[var(--accent)]" : "text-neutral-600 dark:text-neutral-300"
                }`}
              >
                {l.label}
                {locale === l.code && <span aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
