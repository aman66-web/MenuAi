"use client";

import Link from "next/link";
import { formatGrams, formatInt } from "@/lib/mm/format";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { Gauge } from "./Gauge";
import { ChevronRightIcon } from "./icons";

// Home's first page, "Today" (moved here unchanged from app/app/page.tsx when Home's numbers became three pages, 2026-11-19): today's calories as a dial beside
// protein, carbs and fat, on ink (founder 2026-11-19), measured from the founder's picture of these cards (2026-10-15, "exactly like image 2").
// The colour meeting (19 November 2026, approved by the founder that day): the dial says what people want, "1,580 left" (or "120 over") in its middle, with
// "420 eaten" in lime and "of 2,000 kcal" under it; no percentage (it stopped at 100% and hid going over) and no grey disc. Going over is said in words in the
// same colour and weight, never by a colour: the arc or bar is simply full. Labels in sentence case; protein, carbs and fat told apart by their words and fixed
// order, never by hue; their figures 15 px and their bars 8 px. The dial and bars also tell a screen reader the real figures (aria-valuetext).
// Each card opens Stats (founder 2026-11-20): the calories card its Calories tab, the protein, carbs and fat card its Macros tab (StatsLink).

/** Two cards side by side, stacked when the text is large: the minimum width is in rem, so it grows with the text size. */
export const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3.5";
/** The content width under which PAIR stacks its two cards (2 x 9.75rem + the 0.875rem gap): Home's pages then show one under another. */
export const PAIR_STACK_REM = 20.375;
/** The day's numbers' cards: ink with white words (16:1) and the light card shadow; `on-ink` turns any focus ring inside lime. */
export const DARK_CARD = "on-ink rounded-[1.25rem] bg-ink text-on-ink shadow-[var(--card-shadow)]";
/** The dial and bars on the ink cards: lime on the mid-grey track (--ring-track, 3.21:1 against ink; lime 3.97:1 on it). */
export const ON_DARK = { "--bar": "var(--sun)" } as React.CSSProperties;
/** An ink card that opens Stats: it shrinks a little while pressed. */
export const LINKED_CARD = "relative transition-transform duration-150 has-[>a:active]:scale-[0.985] motion-reduce:transition-none";

/**
 * Makes the ink card it sits in open Stats (founder 2026-11-20): a link over the whole card, first in it, so a screen reader hears its name ("See calorie
 * stats") and then the card's own figures, which stay readable one by one. Its focus ring is drawn inside the card, in lime (.on-ink). The card shows it can be
 * opened with a small chevron (StatsChevron).
 */
export function StatsLink({ href, name }: { href: string; name: string }) {
  return (
    // the ring's offset inline: the global :focus-visible rule (globals.css, unlayered) would otherwise put it 3 px outside, lime on the light page
    <Link href={href} className="absolute inset-0 z-[1] rounded-[1.25rem]" style={{ outlineOffset: -4 }}>
      <span className="sr-only">{name}</span>
    </Link>
  );
}

/** The small chevron at an ink card's top right that says it opens. */
export function StatsChevron({ className = "" }: { className?: string }) {
  return <ChevronRightIcon aria-hidden className={`h-[18px] w-[18px] shrink-0 text-on-ink-2 ${className}`} />;
}

/**
 * "Protein", then "56g / 150g" (the eaten grams in lime, the target in white) and an 8 px bar; past the target, "18 g over" in words under the bar. `onDark`:
 * on the ink numbers card (the only place it is used today); otherwise the same in ink and the secondary grey.
 */
export function MacroRow({ label, eaten, target, onDark = false }: { label: string; eaten: number; target?: number; /** On the ink numbers card. */ onDark?: boolean }) {
  const t = useT();
  const fraction = target ? Math.min(1, Math.max(0, eaten / target)) : 0;
  // from the figures shown, so "56g / 50g" and "6 g over" always agree
  const over = target ? Math.round(eaten) - Math.round(target) : 0;
  return (
    <div>
      <p className={`text-[0.8125rem] font-semibold leading-snug ${onDark ? "text-on-ink-2" : "text-muted"}`}>{label}</p>
      {/* the app's own sans with even-width figures, like the dial (never the mono face: its slashed zero read as "Øg / 1ØØg") */}
      <p className="app-numbers mt-0.5 text-[0.9375rem] leading-snug">
        <span className={onDark ? "text-sun" : "text-foreground"}>{formatGrams(eaten)}</span>
        {target ? <span className={onDark ? "text-on-ink" : "text-muted"}> / {formatGrams(target)}</span> : null}
      </p>
      {target ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--ring-track)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={t("{eaten} grams of {target} grams", { eaten: formatInt(eaten), target: formatInt(target) })}>
          <div className="h-full rounded-full bg-[var(--bar)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${fraction * 100}%` }} />
        </div>
      ) : null}
      {over > 0 && <p className={`app-numbers mt-1 text-[0.9375rem] font-semibold leading-snug ${onDark ? "text-on-ink" : "text-foreground"}`}>{t("{n} g over", { n: formatInt(over) })}</p>}
    </div>
  );
}

export function HomeToday({ calories, target, targets, eaten, estimates = 0 }: {
  /** Today's calories as eaten. */
  calories: number;
  /** How many of today's foods are Scan your food estimates (CLAUDE.md rule 1's one exception): counted, and said so under the figures. */
  estimates?: number;
  /** The day's calorie target. */
  target: number;
  targets: { protein?: number; carbs?: number; fat?: number };
  eaten: { protein: number; carbs: number; fat: number };
}) {
  const t = useT();
  const used = Math.min(1, Math.max(0, calories / target));
  // what's left, from the figure shown, so eaten and left add up to the target exactly (usability test 2026-11-19: George's 319 and 1,232 made 1,551)
  const shown = Math.round(calories);
  const over = shown > target;
  const n = formatInt(over ? shown - target : target - shown);
  const left = over ? t("{n} over", { n }) : t("{n} left", { n });
  return (
    <div className={`app-numbers h-full ${PAIR}`} style={ON_DARK}>
      <div className={`${DARK_CARD} ${LINKED_CARD} flex min-h-[14.25rem] min-w-0 flex-col items-center justify-between gap-4 px-4 pb-4 pt-4 text-center`}>
        <StatsLink href="/app/stats" name={t("See calorie stats")} />
        <div className="flex w-full items-center justify-between gap-2">
          <p className="text-[0.8125rem] font-semibold leading-snug text-on-ink-2">{t("Calories")}</p>
          <StatsChevron className="-me-1" />
        </div>
        {/* "1,580 left" in the middle: the figure largest, the word under it (the sentence's own word order in each language, from one translated
            string), in px like the dial itself so it always fits inside the ring; the same words, with the figures, are in the dial's spoken value */}
        <Gauge id="home" label={t("Calories used today")} fraction={used} size={112} stroke={13} wide
          valueText={t("{eaten} of {target} kcal, {left}", { eaten: formatInt(shown), target: formatInt(target), left })}>
          <span aria-hidden className="flex max-w-[4.75rem] flex-col items-center text-center text-[14px] font-semibold leading-tight">
            <Rich text={over ? t("{n} over") : t("{n} left")} values={{ n: <span className="block text-[22px] font-[800] leading-none tracking-tight">{n}</span> }} />
          </span>
        </Gauge>
        <div>
          <p className="text-[1.0625rem] font-semibold leading-tight text-sun [overflow-wrap:anywhere]">{t("{n} eaten", { n: formatInt(shown) })}</p>
          <p className="mt-1 text-[0.9375rem] leading-tight [overflow-wrap:anywhere]">{t("of {n} kcal", { n: formatInt(target) })}</p>
          {/* the same words as the Today page: an estimate from a photo is never counted without saying so */}
          {estimates > 0 && <p className="mt-1.5 text-[0.8125rem] leading-snug text-on-ink-2">{estimates === 1 ? t("Includes 1 estimate") : t("Includes {n} estimates", { n: estimates })}</p>}
        </div>
      </div>
      <div className={`${DARK_CARD} ${LINKED_CARD} flex min-w-0 flex-col justify-center gap-5 px-4 py-5`}>
        <StatsLink href="/app/stats?tab=macros" name={t("See protein, carbs and fat stats")} />
        <StatsChevron className="absolute end-3 top-3.5" />
        <MacroRow onDark label={t("Protein")} eaten={eaten.protein} target={targets.protein} />
        <MacroRow onDark label={t("Carbs")} eaten={eaten.carbs} target={targets.carbs} />
        <MacroRow onDark label={t("Fat")} eaten={eaten.fat} target={targets.fat} />
      </div>
    </div>
  );
}
