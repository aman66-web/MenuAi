"use client";

import { LOCALES, type Locale } from "@/lib/mm/i18n";
import { PickTile } from "./DietPicker";
import { radioKeyNav } from "./ui";

// The languages as a grid of big cards, each written in its own script with its English name under it (the first onboarding
// screen and Settings › Language). Choosing one is up to the caller: onboarding previews it straight away, Settings switches to it.
// Two cards a row on a phone; one a row when the text is large enough that two wouldn't fit. The chosen language is the one dark
// card with the lime tick, like a chosen diet. White cards on the onboarding page; light grey ones, flat, in the Settings sheet.

export function LanguageList({ value, onChange, label }: { value: Locale; onChange: (l: Locale) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5">
      {LOCALES.map((l, i) => {
        const on = l.code === value;
        return (
          <PickTile
            key={l.code}
            on={on}
            tall
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(l.code)}
            onKeyDown={(e) => radioKeyNav(e, i, LOCALES.length, (n) => onChange(LOCALES[n]!.code))}
          >
            {/* the name keeps its own direction (bdi) but lines up with the English name under it, on the page's reading side */}
            <span className="block text-[1.1875rem] font-bold leading-tight [overflow-wrap:anywhere]"><bdi lang={l.htmlLang} dir={l.dir}>{l.name}</bdi></span>
            {/* the English name under it: muted grey, or a solid light grey on the chosen dark card (never text at reduced opacity) */}
            {l.code !== "en" && <span lang="en" className={`mt-1 block text-[0.875rem] font-medium leading-snug ${on ? "text-[#b9c0bc]" : "text-muted"}`}>{l.english}</span>}
          </PickTile>
        );
      })}
    </div>
  );
}
