"use client";

// Relative imports (not "@/"), so the unit tests can load the words below (tests/onboarding.test.ts).
import { useState } from "react";
import { parseNumber } from "../../../lib/mm/addFood";
import { FOOD_SCAN_ENABLED } from "../../../lib/mm/config";
import { LOG_IS_PAID } from "../../../lib/mm/entitlements";
import { formatInt } from "../../../lib/mm/format";
import { tk } from "../../../lib/mm/i18n";
import type { Goal } from "../../../lib/mm/types";
import { MinusIcon, PlusIcon } from "../_components/icons";
import { dismissKeyboard } from "../_components/SearchDone";
import { useT } from "../_lib/i18n";

// Pieces of the onboarding screens that more than one file draws (page.tsx, the targets step and the body steps): the big headline, the small
// label, the card corners and the number card with − and +. Moved out of page.tsx unchanged, except that the number card gained a Done
// button and a way to start an empty box from a suggestion. Also the words page.tsx needs that the unit tests check (a page file may export nothing else):
// Pip's reaction to each goal and step 10's line on what is free.

/**
 * The big headline, in one plain ink like Home's title and every one of the founder's reference pictures (2026-10-15: no accent words in
 * headings). 2rem since the onboarding redesign meeting (20 November 2026), so each screen's first content sits above the sticky button at 375x667.
 */
export const HEADLINE = "text-[2rem] font-[700] leading-[1.08] tracking-[-0.03em]";
/** The small label inside a card ("Calories"): sentence case, semibold, at least 13 px, in the caption grey (colour meeting, 19 November 2026: spaced capitals
 *  were hard to read). Kept under its old name. */
export const CAPS = "text-[0.875rem] font-semibold text-muted";
/** Cards, tiles and list rows share Home's 20 px corners. */
export const CARD = "rounded-[1.25rem]";

type Icon = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;

/**
 * A number with − and + either side, for the daily targets. The words on the buttons don't name the number, so the label stays the card's.
 * While the box is in use a Done button takes the place of the little round picture (an iPhone's number pad has no Return key); an empty box that is
 * tapped with − or + starts from `from` (the suggestion for it) when there is one, instead of from the lowest number. A tap goes to the next round number
 * (1,370 and + is 1,400, then 1,450, 1,500; usability test 2026-11-19: stepping from 1,370 by 50 could never reach the 1,500 Elsie wanted). `invalid` marks the box as wrong
 * for assistive technology, and `describedBy` is the id of the line that says what is wrong.
 * The box looks like a box you can type in (Margaret couldn't see how to type her GP's 1,500: the soft fill alone is about 1.1:1 on the white card), with a
 * 1.5 px edge in the --edge token (#7a817d, 3.99:1 on white, WCAG 1.4.11). After a tap on − or + a hidden polite line says the new number ("Calories, 1,550";
 * the low-vision tester heard nothing); typing announces nothing. The − and + are white with the same edge (colour meeting, 19 November 2026: never grey
 * pills you tap), and Done is the ink pill. `large`: the figure a size bigger (calories and protein, which come first); `highlight`: a ring in the link green round the
 * card (the targets screen's Calories box when the questions were skipped: tap it to type your own number).
 */
export function StepperCard({ id, label, Icon, value, onChange, step, min, max, placeholder, from, invalid, describedBy, large, highlight, className = "" }: { id: string; label: string; Icon: Icon; value: string; onChange: (v: string) => void; step: number; min: number; max: number; placeholder?: string; from?: number; invalid?: boolean; describedBy?: string; large?: boolean; highlight?: boolean; className?: string }) {
  const t = useT();
  // read like every other number box ("2,000" and digits typed in another numeral system count)
  const parsed = parseNumber(value);
  const n = typeof parsed === "number" ? parsed : NaN;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const [said, setSaid] = useState("");
  const set = (x: number) => {
    onChange(String(x));
    setSaid(t("{label}, {value}", { label, value: formatInt(x) }));
  };
  const bump = (d: number) => {
    const empty = !Number.isFinite(n);
    if (empty && from !== undefined && Number.isFinite(from) && from > 0) return set(clamp(Math.round(from / step) * step));
    if (empty) return set(clamp(min));
    const cur = Math.round(n);
    set(clamp(d > 0 ? Math.floor(cur / step) * step + step : Math.ceil(cur / step) * step - step));
  };
  // Like Home's calories card: a small label, the figure big in a regular weight, and the two round buttons under it
  // (side by side with the figure they left no room for "Optional" on a 390 px phone).
  const round = "grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-edge bg-card transition active:scale-90 active:bg-background hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <div className={`group/step glass ${CARD} min-w-0 p-4 ${highlight ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""} ${className}`}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <label htmlFor={id} id={`${id}-label`} className={CAPS}>{label}</label>
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background text-accent group-focus-within/step:hidden"><Icon className="h-4 w-4" /></span>
        <button
          type="button"
          // a tap keeps the focus in the box until the click lands (otherwise this button, which shows only while the box is in use, would go before it was tapped)
          onMouseDown={(e) => e.preventDefault()}
          onClick={dismissKeyboard}
          className="relative hidden h-8 shrink-0 items-center rounded-full bg-ink px-3.5 text-[0.875rem] font-bold text-on-ink transition hover:bg-ink-pressed active:bg-ink-pressed before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] active:scale-95 group-focus-within/step:inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("Done")}
        </button>
      </div>
      <input id={id} inputMode="numeric" autoComplete="off" value={value} onChange={(e) => { setSaid(""); onChange(e.target.value); }} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={invalid ? describedBy : undefined} className={`app-numbers mt-2 min-h-11 w-full min-w-0 rounded-xl border-[1.5px] border-edge bg-card px-2 py-1 text-center ${large ? "text-[2.125rem]" : "text-[1.75rem]"} font-medium leading-none tracking-[-0.01em] placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`} />
      <div className="mt-2 flex items-center justify-center gap-3">
        <button type="button" aria-label={t("Decrease")} aria-describedby={`${id}-label`} onClick={() => bump(-step)} className={round}><MinusIcon className="h-5 w-5" /></button>
        <button type="button" aria-label={t("Increase")} aria-describedby={`${id}-label`} onClick={() => bump(step)} className={round}><PlusIcon className="h-5 w-5" /></button>
      </div>
      <span aria-live="polite" className="sr-only">{said}</span>
    </div>
  );
}

/**
 * What Pip says once a goal is picked: plain words, no health claims (CLAUDE.md rule 3) and no praise for a choice ("Great choice." for Lose weight alone;
 * the onboarding meeting of 19 November). "Meals and orders", because the app is for cooking and shopping too, not only eating out.
 */
export const GOAL_REACTION: Readonly<Record<Goal, string>> = {
  lose: tk("Got it. I'll look for meals and orders that fit a lower calorie target."),
  maintain: tk("Got it. I'll keep your meals and orders around your target."),
  buildMuscle: tk("Got it. I'll look for higher-protein meals and orders that fit your calories."),
  glp1: tk("Got it: smaller, protein-first orders."),
  other: tk("Got it. I'll show you the numbers and keep your meals and orders around your target."),
};

/**
 * Step 10's one line on what is free (shown only where free and paid are told apart, to someone without Premium). Adding what you eat is named on the
 * free side or the paid side as this build's + button treats it (`logIsPaid`: LOG_IS_PAID, never bare needsPaywall, which is true on a build with no gating at
 * all), and Scan your food only where it exists. "Such as", because more is paid than fits in a line (each of those buttons says so itself), so the list never
 * reads as complete.
 */
export function freePremiumLine(logIsPaid: boolean, scanOn: boolean): string {
  if (logIsPaid) {
    return scanOn
      ? tk("Free: every menu, our recipes and supermarket products. Premium adds extras, such as adding what you eat, Meal plan and Scan your food.")
      : tk("Free: every menu, our recipes and supermarket products. Premium adds extras, such as adding what you eat and Meal plan.");
  }
  return scanOn
    ? tk("Free: every menu, our recipes and supermarket products, and adding what you eat. Premium adds extras, such as Meal plan and Scan your food.")
    : tk("Free: every menu, our recipes and supermarket products, and adding what you eat. Premium adds extras, such as Meal plan.");
}

/** This build's line (see freePremiumLine). */
export const FREE_PREMIUM_LINE = freePremiumLine(LOG_IS_PAID, FOOD_SCAN_ENABLED);
