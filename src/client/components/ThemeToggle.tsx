import { useEffect, useState } from "preact/hooks";

type Mode = "light" | "dark";

function current(): Mode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** A sun/moon button that toggles + persists the color mode. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(current());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    try {
      localStorage.setItem("grimoire-mode", mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  return (
    <button
      onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
      class="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-[var(--accent)] dark:hover:bg-neutral-800"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      {mode === "dark" ? (
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
        </svg>
      ) : (
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
