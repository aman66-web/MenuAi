"use client";

import type { MealType } from "@/lib/mm/recipes";
import { radioKeyNav } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { RecipeThumb } from "../recipes/RecipeThumb";

// The plan's seven days as one week across the screen (founder 2026-11-21: "make it look better visually"), all seven in view so nothing scrolls sideways (a
// tester didn't know the old strip of day buttons scrolled, usability test 2026-11-19): each day its short name, its date and a picture of its main meal. The
// day shown is lime with the dark green edge (chosen, never "do this"); today has a small dot under it, as on Home's week. A screen reader hears each day's full
// name and date, and "(today)".

export interface StripDay {
  /** "Sat" */
  short: string;
  /** "21" */
  date: string;
  /** What a screen reader hears: "Saturday 21 November (today)". */
  label: string;
  /** The day's main meal, for its picture (none when it is hidden). */
  picture: { id: string; name: string; meal: MealType } | null;
}

export function DayStrip({ days, day, todayIndex, onDay }: { days: readonly StripDay[]; day: number; todayIndex: number; onDay: (i: number) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Day")} className="mt-5 grid grid-cols-7 gap-1.5">
      {days.map((d, i) => {
        const on = day === i;
        return (
          <button key={i} type="button" role="radio" aria-checked={on} onClick={() => onDay(i)} onKeyDown={(e) => radioKeyNav(e, i, days.length, onDay)}
            className={`flex min-w-0 flex-col items-center gap-1.5 rounded-[1rem] border-[1.5px] px-1 pb-1.5 pt-2.5 transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card text-foreground hover:bg-background"}`}>
            <span aria-hidden className={`max-w-full truncate text-[0.8125rem] leading-none ${on ? "font-bold" : "font-semibold text-muted"}`}>{d.short}</span>
            <span aria-hidden className="app-numbers text-[1.125rem] font-[800] leading-none">{d.date}</span>
            {d.picture ? <RecipeThumb id={d.picture.id} name={d.picture.name} meal={d.picture.meal} size="fit" className={on ? "ring-2 ring-card" : ""} />
              : <span aria-hidden className="aspect-square w-full max-w-10 rounded-xl bg-fill" />}
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === todayIndex ? (on ? "bg-on-sun" : "bg-ink") : ""}`} />
            <span className="sr-only">{d.label}</span>
          </button>
        );
      })}
    </div>
  );
}
