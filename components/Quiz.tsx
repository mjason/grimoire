import { useState } from "preact/hooks";

interface QuizProps {
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
}

export function Quiz({ question, options, answer, explanation }: QuizProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  const isCorrect = answered && selected === answer;

  // Decide the visual state classes for each option button.
  function optionClasses(index: number): string {
    const base =
      "w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

    if (!answered) {
      return (
        base +
        " border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
      );
    }

    // The correct option is always highlighted green once answered.
    if (index === answer) {
      return (
        base +
        " border-green-500 bg-green-50 text-green-800 dark:border-green-500/70 dark:bg-green-500/10 dark:text-green-300"
      );
    }

    // The chosen-but-wrong option turns red.
    if (index === selected) {
      return (
        base +
        " border-red-500 bg-red-50 text-red-800 dark:border-red-500/70 dark:bg-red-500/10 dark:text-red-300"
      );
    }

    // Other untouched options after answering: muted/neutral.
    return (
      base +
      " border-neutral-200 bg-white text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500"
    );
  }

  return (
    <div class="not-prose rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p class="mb-4 font-semibold text-neutral-900 dark:text-neutral-100">
        {question}
      </p>

      <ul class="flex flex-col gap-2">
        {options.map((option, index) => (
          <li key={index}>
            <button
              type="button"
              class={optionClasses(index)}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              <span class="inline-flex w-full items-center justify-between gap-3">
                <span>{option}</span>
                {answered && index === answer && (
                  <span class="shrink-0 text-green-600 dark:text-green-400" aria-hidden="true">
                    ✓
                  </span>
                )}
                {answered && index === selected && index !== answer && (
                  <span class="shrink-0 text-red-600 dark:text-red-400" aria-hidden="true">
                    ✗
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {answered && (
        <div class="mt-4">
          <p
            class={
              "flex items-center gap-2 text-sm font-medium " +
              (isCorrect
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400")
            }
          >
            <span aria-hidden="true">{isCorrect ? "✓" : "✗"}</span>
            <span>{isCorrect ? "Correct!" : "Not quite."}</span>
          </p>

          {explanation && (
            <div class="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
              {explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
