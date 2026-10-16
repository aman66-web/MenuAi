"use client";

import { parseNumber } from "@/lib/mm/addFood";
import { MinusIcon, PlusIcon } from "../_components/icons";
import { dismissKeyboard } from "../_components/SearchDone";
import { useT } from "../_lib/i18n";

// Pieces of the onboarding screens that more than one file draws (page.tsx, the targets step and the body steps): the big headline, the small
// spaced-capitals label, the card corners, the number card with − and +, and our own plate. Moved out of page.tsx unchanged, except that the number
// card gained a Done button and a way to start an empty box from a suggestion.

/**
 * The big headline, in one plain ink like Home's title and every one of the founder's reference pictures (2026-10-15: no accent words in
 * headings); a touch heavier than before so it sits with Home's heavy "Home".
 */
export const HEADLINE = "text-[2.5rem] font-[700] leading-[1.05] tracking-[-0.03em]";
/** Home's small spaced-capitals label inside a card ("CALORIES"). */
export const CAPS = "text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted";
/** Cards, tiles and list rows share Home's 20 px corners. */
export const CARD = "rounded-[1.25rem]";

type Icon = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;

/**
 * A number with − and + either side, for the daily targets. The words on the buttons don't name the number, so the label stays the card's.
 * While the box is in use a Done button takes the place of the little round picture (an iPhone's number pad has no Return key); an empty box that is
 * tapped with − or + starts from `from` (the suggestion for it) when there is one, instead of from the lowest number. A tap steps from the number as it
 * stands (2110 and + is 2160, not the nearest 50 first), because the plan's numbers are not multiples of the step. `invalid` marks the box as wrong
 * for assistive technology, and `describedBy` is the id of the line that says what is wrong.
 */
export function StepperCard({ id, label, Icon, value, onChange, step, min, max, placeholder, from, invalid, describedBy }: { id: string; label: string; Icon: Icon; value: string; onChange: (v: string) => void; step: number; min: number; max: number; placeholder?: string; from?: number; invalid?: boolean; describedBy?: string }) {
  const t = useT();
  // read like every other number box ("2,000" and digits typed in another numeral system count)
  const parsed = parseNumber(value);
  const n = typeof parsed === "number" ? parsed : NaN;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const bump = (d: number) => {
    const empty = !Number.isFinite(n);
    if (empty && from !== undefined && Number.isFinite(from) && from > 0) return onChange(String(clamp(Math.round(from / step) * step)));
    const start = empty ? (d > 0 ? min - step : min + step) : Math.round(n);
    onChange(String(clamp(start + d)));
  };
  // Like Home's calories card: a small spaced-capitals label, the figure big in a regular weight, and the two round grey buttons under it
  // (side by side with the figure they left no room for "Optional" on a 390 px phone).
  const round = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-soft-strong transition active:scale-90 hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <div className={`group/step glass ${CARD} min-w-0 p-4`}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <label htmlFor={id} id={`${id}-label`} className={CAPS}>{label}</label>
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-soft-strong group-focus-within/step:hidden"><Icon className="h-4 w-4" /></span>
        <button
          type="button"
          // a tap keeps the focus in the box until the click lands (otherwise this button, which shows only while the box is in use, would go before it was tapped)
          onMouseDown={(e) => e.preventDefault()}
          onClick={dismissKeyboard}
          className="relative hidden h-8 shrink-0 items-center rounded-full bg-foreground px-3.5 text-[0.875rem] font-bold text-background transition before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] active:scale-95 group-focus-within/step:inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("Done")}
        </button>
      </div>
      <input id={id} inputMode="numeric" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={invalid ? describedBy : undefined} className="app-numbers mt-3 min-h-11 w-full min-w-0 rounded-xl bg-transparent px-0 py-1 text-center text-[1.75rem] font-medium leading-none tracking-[-0.01em] placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" aria-label={t("Decrease")} aria-describedby={`${id}-label`} onClick={() => bump(-step)} className={round}><MinusIcon className="h-5 w-5" /></button>
        <button type="button" aria-label={t("Increase")} aria-describedby={`${id}-label`} onClick={() => bump(step)} className={round}><PlusIcon className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

/** Our own plate and fork (the app icon's mark), as the picture beside a headline: never a photo of food. */
export function PlateArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 220" aria-hidden focusable="false" className={className}>
      <defs>
        <filter id="plate-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#111814" floodOpacity="0.2" />
        </filter>
      </defs>
      <g filter="url(#plate-shadow)">
        <circle cx="110" cy="110" r="84" fill="#ffffff" />
        <circle cx="110" cy="110" r="64" fill="none" stroke="#ecfccb" strokeWidth="5" />
        <g fill="#15803d" transform="translate(110 110) scale(0.5) translate(-256 -266)">
          <rect x="213" y="156" width="18" height="90" rx="9" />
          <rect x="247" y="156" width="18" height="90" rx="9" />
          <rect x="281" y="156" width="18" height="90" rx="9" />
          <path d="M213 226 H299 V244 C299 264 286 276 271 280 V360 C271 369 264 376 256 376 C248 376 241 369 241 360 V280 C226 276 213 264 213 244 Z" />
        </g>
      </g>
    </svg>
  );
}
