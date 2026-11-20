"use client";

import type { ComponentType, SVGProps } from "react";
import { headlineFeatures, moreFeatures, type PremiumFeature, type PremiumIcon } from "@/lib/mm/premiumFeatures";
import { useT } from "../_lib/i18n";
import { BoltIcon, BookmarkIcon, CalendarIcon, CameraIcon, ChevronRightIcon, FridgeIcon, PodiumIcon, PotIcon, ShrinkIcon, StarIcon, SwapIcon } from "./icons";

// The Premium offer's two parts around the plans (AppStorePlans), on the paywall of a Premium feature, the one-time free-trial offer and the plans page (/app/pro).
// The overnight audit of 20 November 2026 (App Review 3.1.2(c), and the sheet was two to four screens long before the price): the plans, the billed amount and
// Continue come first; then
//  * PremiumOffer: what Premium adds, as a short one-column checklist of four (lib/mm/premiumFeatures.ts, the one list), the rest behind "See everything Premium
//    adds", and what stays free;
//  * TrialStory: how the free week works, on a white card with the line (so the ink Continue stays the only dark block), its headline smaller than the price.
// Nothing here names a price of its own: the price in the trial's Day 7 line is StoreKit's, handed in by AppStorePlans. Pip never shares a screen with a price.
// Colours (colour meeting, 19 November 2026, approved by the founder that day): each icon in a page-fill well in the link green; the trial card white with the
// card line, today's dot lime with a dark green centre, day 7's ring the edge grey and the line between the two days the mid grey.

const ICONS: Record<PremiumIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  calendar: CalendarIcon,
  camera: CameraIcon,
  pot: PotIcon,
  fridge: FridgeIcon,
  bolt: BoltIcon,
  swap: SwapIcon,
  shrink: ShrinkIcon,
  star: StarIcon,
  podium: PodiumIcon,
  bookmark: BookmarkIcon,
};

function FeatureRow({ f }: { f: PremiumFeature }) {
  const t = useT();
  const Icon = ICONS[f.icon];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill text-accent"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug">{t(f.title)}</span>
        <span className="block text-[0.9375rem] leading-snug text-muted">{t(f.line, f.values)}</span>
      </span>
    </li>
  );
}

/** What Premium adds: four named first, the rest behind a disclosure, then what stays free. `level`: h3 in a sheet (under its h2 title), h2 on a page. */
export function PremiumOffer({ level = "h3" }: { level?: "h2" | "h3" } = {}) {
  const t = useT();
  const Heading = level;
  const head = headlineFeatures();
  const more = moreFeatures();
  return (
    <div>
      <Heading className="text-[1.25rem] font-[800] leading-snug tracking-[-0.01em]">{t("What Premium adds")}</Heading>
      <ul className="mt-1 divide-y divide-line">
        {head.map((f) => <FeatureRow key={f.id} f={f} />)}
      </ul>
      {more.length > 0 && (
        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-semibold text-accent underline underline-offset-[3px] [&::-webkit-details-marker]:hidden">
            {t("See everything Premium adds")}
            <ChevronRightIcon aria-hidden className="h-4 w-4 transition-transform group-open:rotate-90" />
          </summary>
          <ul className="divide-y divide-line">
            {more.map((f) => <FeatureRow key={f.id} f={f} />)}
          </ul>
        </details>
      )}
      <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Every menu, recipe and label stays free, and so does your food diary.")}</p>
    </div>
  );
}

/**
 * The free trial, below the prices: how the free week works, for the plan that is chosen (`price` and `per` are StoreKit's, as AppStorePlans shows them).
 * Nothing when that plan has no free trial for this Apple ID.
 */
export function TrialStory({ trial, price, per }: { trial: number | null; price: string; per: string }) {
  const t = useT();
  if (!trial) return null;
  return (
    <section aria-labelledby="premium-trial" className="mt-4 rounded-[1.25rem] border border-line bg-card p-4">
      <h3 id="premium-trial" className="text-[1.125rem] font-bold leading-snug">{t("Try Premium free for {days} days", { days: trial })}</h3>
      <ol className="relative mt-3.5 space-y-0">
        {[
          { when: t("Today"), what: t("Premium unlocks. You pay nothing now.") },
          { when: t("Day {days}", { days: trial }), what: t("{price} {per} is charged and your subscription starts, unless you cancel at least 24 hours before in your App Store settings.", { price, per }) },
        ].map((s, i, all) => (
          <li key={s.when} className="relative flex gap-3 pb-4 last:pb-0">
            {i < all.length - 1 && <span aria-hidden className="absolute start-[0.6875rem] top-6 h-[calc(100%-1rem)] w-0.5 rounded-full bg-ring-track" />}
            <span aria-hidden className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${i === 0 ? "bg-sun" : "border-2 border-edge bg-card"}`}>
              {i === 0 && <span className="h-2 w-2 rounded-full bg-on-sun" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-bold">{s.when}</span>
              <span className="app-numbers block text-[0.9375rem] leading-snug text-muted">{s.what}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
