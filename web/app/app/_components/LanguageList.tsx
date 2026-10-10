"use client";

import { LOCALES, type Locale } from "@/lib/mm/i18n";
import { CheckIcon } from "./icons";
import { radioKeyNav } from "./ui";

// The languages as a grid of big cards, each written in its own script with its English name under it (the first onboarding
// screen and Settings › Language). Choosing one is up to the caller: onboarding previews it straight away, Settings switches to it.
// Two cards a row on a phone; one a row when the text is large enough that two wouldn't fit.

export function LanguageList({ value, onChange, label }: { value: Locale; onChange: (l: Locale) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5">
      {LOCALES.map((l, i) => {
        const on = l.code === value;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(l.code)}
            onKeyDown={(e) => radioKeyNav(e, i, LOCALES.length, (n) => onChange(LOCALES[n]!.code))}
            className={`relative flex min-h-[4.75rem] min-w-0 flex-col justify-center rounded-3xl border-2 px-4 py-3 text-start transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-accent bg-accent-soft shadow-[0_10px_30px_-14px_var(--accent)]" : "glass border-transparent hover:bg-soft-strong"}`}
          >
            {/* the name keeps its own direction (bdi) but lines up with the English name under it, on the page's reading side */}
            <span className="block pe-6 text-[1.2rem] font-extrabold leading-tight [overflow-wrap:anywhere]"><bdi lang={l.htmlLang} dir={l.dir}>{l.name}</bdi></span>
            {l.code !== "en" && <span lang="en" className="mt-0.5 block text-sm text-muted">{l.english}</span>}
            {on && (
              <span aria-hidden className="bg-sun absolute end-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full text-on-accent shadow">
                <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
