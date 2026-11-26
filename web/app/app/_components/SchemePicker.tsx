"use client";

import { COLOUR_SCHEME_NAMES, COLOUR_SCHEMES, schemeOf, type ColourScheme } from "@/lib/mm/colourSchemes";
import { useSettings } from "../_lib/hooks";
import { chooseColourScheme } from "../_lib/colourScheme";
import { useT } from "../_lib/i18n";
import { CheckIcon } from "./icons";
import { radioKeyNav } from "./ui";

// The colour scheme choice (founder 2026-11-26), the same on the welcome screens' last question and in Settings › Colours: one tile per scheme with a small
// picture of the app in it (a numbers card in the scheme's dark colour with its ring and bar, and a chosen chip on the light page), its name and the tick. Each
// tile carries its own scheme's colours (globals.css .scheme-…), so all six show at once whatever the app is in. A tap recolours the whole app straight away and
// keeps it on this device; Lime, today's look, is ticked until another is picked. Radios, so a screen reader hears "Ocean, radio button, 3 of 6".

export function SchemePicker({ label, className = "" }: { label: string; className?: string }) {
  const t = useT();
  const current = schemeOf(useSettings().colourScheme);
  const pick = (s: ColourScheme) => chooseColourScheme(s);
  return (
    <div role="radiogroup" aria-label={label} className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3 ${className}`}>
      {COLOUR_SCHEMES.map((s, i) => {
        const on = s === current;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => pick(s)}
            onKeyDown={(e) => radioKeyNav(e, i, COLOUR_SCHEMES.length, (n) => pick(COLOUR_SCHEMES[n]!))}
            className={`scheme-${s} flex w-full flex-col gap-3 rounded-[1.25rem] text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-2 border-on-sun bg-sun p-3 text-on-sun" : "border-[1.5px] border-edge bg-card p-[12.5px] text-foreground hover:bg-background active:bg-background"}`}
          >
            <SchemePicture />
            <span className="flex min-h-7 items-center gap-2">
              <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-tight [overflow-wrap:anywhere]">{t(COLOUR_SCHEME_NAMES[s])}</span>
              <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${on ? "bg-on-sun text-sun" : "border-[1.5px] border-edge"}`}>
                {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The app in miniature, in the colours of the tile it sits in: Home's numbers card (the dark colour, its ring and bar in the bright one) over a chosen chip. */
function SchemePicture() {
  return (
    <span aria-hidden className="block">
      <span className="flex items-center gap-2.5 rounded-[0.875rem] bg-ink p-2.5">
        <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" strokeWidth="5" className="stroke-ring-track" />
          <circle cx="18" cy="18" r="14" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray="58 88" className="stroke-sun" />
        </svg>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="block h-2 w-4/5 rounded-full bg-on-ink" />
          <span className="block h-2 w-1/2 rounded-full bg-on-ink-2" />
          <span className="block h-2 w-full overflow-hidden rounded-full bg-ring-track"><span className="block h-full w-2/3 rounded-full bg-sun" /></span>
        </span>
      </span>
      <span className="mt-2 flex items-center gap-1.5">
        <span className="block h-6 w-12 rounded-full border-2 border-on-sun bg-sun" />
        <span className="block h-6 flex-1 rounded-full bg-tint-plan" />
        <span className="block h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
      </span>
    </span>
  );
}
