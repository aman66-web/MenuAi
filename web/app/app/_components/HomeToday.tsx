"use client";

import { formatGrams, formatInt } from "@/lib/mm/format";
import { useT } from "../_lib/i18n";
import { Gauge } from "./Gauge";

// Home's first page, "Today" (moved here unchanged from app/app/page.tsx when Home's numbers became three pages, 2026-11-19): today's calories as a dial beside
// protein, carbs and fat, on the app's dark (founder 2026-11-19), measured from the founder's picture of these cards (2026-10-15, "exactly like image 2").
// The dial and bars now also tell a screen reader the real figures (aria-valuetext), not only a percentage capped at 100.

/** Two cards side by side, stacked when the text is large: the minimum width is in rem, so it grows with the text size. */
export const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3.5";
/** The content width under which PAIR stacks its two cards (2 x 9.75rem + the 0.875rem gap): Home's pages then show one under another. */
export const PAIR_STACK_REM = 20.375;
/** The day's numbers' cards: the app's dark (the colour the scan card had), white words. */
export const DARK_CARD = "rounded-[1.25rem] bg-[#1d2320] text-white shadow-[0_18px_40px_-20px_rgba(0,0,0,0.6)]";
/** The dial and bars on the dark cards: lime on a faint white track. */
export const ON_DARK = { "--ring-track": "rgba(255,255,255,0.14)", "--bar": "var(--sun)" } as React.CSSProperties;

/**
 * "PROTEIN      56g / 150g" and a thin bar well below it, measured from the founder's picture of this card (2026-10-15, "exactly like the
 * design in image 2"): the label in small spaced capitals and the figures in DM Mono, both the same grey, on one line; the bar spans the row.
 */
export function MacroRow({ label, eaten, target, onDark = false }: { label: string; eaten: number; target?: number; /** On the dark numbers card. */ onDark?: boolean }) {
  const t = useT();
  const fraction = target ? Math.min(1, Math.max(0, eaten / target)) : 0;
  return (
    <div>
      <p className={`flex flex-wrap items-baseline justify-between gap-x-1.5 gap-y-0.5 ${onDark ? "text-white/75" : "text-muted"}`}>
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em]">{label}</span>
        <span className="app-numbers whitespace-nowrap font-mono text-[0.6875rem] font-normal">{formatGrams(eaten)}{target ? ` / ${formatGrams(target)}` : null}</span>
      </p>
      {target ? (
        <div className="mt-[1.1rem] h-1 overflow-hidden rounded-full bg-[var(--ring-track)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={t("{eaten} grams of {target} grams", { eaten: formatInt(eaten), target: formatInt(target) })}>
          <div className="h-full rounded-full bg-[var(--bar)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${fraction * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function HomeToday({ calories, target, targets, eaten }: {
  /** Today's calories as eaten. */
  calories: number;
  /** The day's calorie target. */
  target: number;
  targets: { protein?: number; carbs?: number; fat?: number };
  eaten: { protein: number; carbs: number; fat: number };
}) {
  const t = useT();
  const used = Math.min(1, Math.max(0, calories / target));
  const shown = Math.round(calories);
  const left = shown <= target ? t("{n} left", { n: formatInt(target - shown) }) : t("{n} over", { n: formatInt(shown - target) });
  return (
    <div className={`app-numbers h-full ${PAIR}`} style={ON_DARK}>
      {/* Measured from the founder's picture of this card ("exactly like image 2"): the small label at the top, a dial about 55% of the
          card's width with a thick track and a small grey centre, plenty of room around it, the figures in a regular weight below. */}
      <div className={`${DARK_CARD} flex min-h-[14.25rem] min-w-0 flex-col items-center justify-between gap-5 px-4 pb-3.5 pt-4 text-center`}>
        <p className="self-start text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-white/75">{t("Calories")}</p>
        <Gauge id="home" label={t("Calories used today")} fraction={used} size={100} stroke={17} disc
          valueText={t("{eaten} of {target} kcal, {left}", { eaten: formatInt(shown), target: formatInt(target), left })}>
          <span aria-hidden className="text-[23px] font-[800] leading-none tracking-tight">{Math.round(used * 100)}%</span>
        </Gauge>
        <div>
          <p className="text-[1.25rem] font-normal leading-tight [overflow-wrap:anywhere]">
            <span className="text-[var(--sun)]">{formatInt(calories)}</span> <span>/ {formatInt(target)}</span>
          </p>
          <p className="mt-0.5 text-[1.0625rem] font-normal leading-tight">kcal</p>
          {/* what's left, said in words (usability test 2026-11-19: "no figure says 1,028 left anywhere, so she must subtract in her head"), from the figure
              shown, so eaten and left add up to the target exactly (usability test 2026-11-19: George's 319 and 1,232 made 1,551) */}
          <p className="mt-1.5 text-[0.9375rem] font-bold leading-tight">{left}</p>
        </div>
      </div>
      <div className={`${DARK_CARD} flex min-w-0 flex-col justify-center gap-[2.1rem] px-4 py-6`}>
        <MacroRow onDark label={t("Protein")} eaten={eaten.protein} target={targets.protein} />
        <MacroRow onDark label={t("Carbs")} eaten={eaten.carbs} target={targets.carbs} />
        <MacroRow onDark label={t("Fat")} eaten={eaten.fat} target={targets.fat} />
      </div>
    </div>
  );
}
