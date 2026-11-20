"use client";

import { PRICE_STEP, pounds, settleRange, type PriceRange } from "@/lib/mm/servingPrice";
import { Button, Sheet } from "../_components/ui";
import { useT } from "../_lib/i18n";

// The "Serving price" sheet behind the field that took the Occasion field's place on the Recipes screen (founder 2026-11-20: "they can adjust for the range
// of per serving cost that they want"): one track with two handles, the cheapest and the dearest serving to show, in 10p steps. The range applies as it moves;
// the button says how many recipes it leaves and closes the sheet; "Back to every price" puts the default range back. Occasion is now in More.

// The meal plan's budget handle (plan/page.tsx), here twice over one track: each input lets only its handle take a finger, so both can be reached.
const RANGE =
  "pointer-events-none absolute inset-0 h-12 w-full appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:w-9 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:bg-ink [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-9 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-[var(--shadow-lift)] focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-accent";

export function ServingPriceSheet({ open, onClose, bounds, chosen, onChange, count }: {
  open: boolean;
  onClose: () => void;
  /** The default range: the shop's cheapest and dearest serving. */
  bounds: PriceRange;
  /** The chosen range, or null for the default. */
  chosen: PriceRange | null;
  onChange: (range: PriceRange | null) => void;
  /** How many recipes a range would show. */
  count: (range: PriceRange | null) => number;
}) {
  const t = useT();
  const now = chosen ?? bounds;
  const span = Math.max(PRICE_STEP, bounds.max - bounds.min);
  const set = (next: PriceRange) => onChange(settleRange(next, bounds));
  const n = count(chosen);
  return (
    <Sheet open={open} onClose={onClose} title={t("Serving price")}>
      <div className="pb-2">
        <p className="app-numbers text-center text-[1.75rem] font-[800] tracking-[-0.02em]">{pounds(now.min)} – {pounds(now.max)}</p>
        <p className="mt-0.5 text-center text-[0.9375rem] text-muted">{chosen ? t("a serving") : t("a serving (default)")}</p>
        <div className="relative mx-1 mt-5 h-12">
          <span aria-hidden className="absolute inset-x-[1.125rem] top-1/2 h-2 -translate-y-1/2 rounded-full bg-line" />
          <span aria-hidden className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-bar" style={{ insetInlineStart: `calc(1.125rem + (100% - 2.25rem) * ${(now.min - bounds.min) / span})`, width: `calc((100% - 2.25rem) * ${(now.max - now.min) / span})` }} />
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={PRICE_STEP}
            value={now.min}
            onChange={(e) => set({ min: Math.min(Number(e.target.value), now.max), max: now.max })}
            aria-label={t("Lowest price a serving")}
            aria-valuetext={t("{price} a serving", { price: pounds(now.min) })}
            className={RANGE}
          />
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={PRICE_STEP}
            value={now.max}
            onChange={(e) => set({ min: now.min, max: Math.max(Number(e.target.value), now.min) })}
            aria-label={t("Highest price a serving")}
            aria-valuetext={t("{price} a serving", { price: pounds(now.max) })}
            className={RANGE}
          />
        </div>
        <div className="app-numbers mt-1 flex justify-between gap-3 text-[0.875rem] leading-snug">
          <span><span className="block font-bold">{pounds(bounds.min)}</span><span className="text-muted">{t("Cheapest")}</span></span>
          <span className="text-end"><span className="block font-bold">{pounds(bounds.max)}</span><span className="text-muted">{t("Dearest")}</span></span>
        </div>
        <div className="mt-5 grid gap-2">
          <Button full size="lg" onClick={onClose}>{n === 1 ? t("Show 1 recipe") : t("Show {n} recipes", { n })}</Button>
          {chosen && <Button variant="secondary" full onClick={() => onChange(null)}>{t("Back to every price")}</Button>}
        </div>
      </div>
    </Sheet>
  );
}
