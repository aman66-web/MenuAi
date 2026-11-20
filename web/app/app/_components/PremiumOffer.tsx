"use client";

import type { ComponentType, SVGProps } from "react";
import { FOOD_SCAN_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { tk } from "@/lib/mm/i18n";
import { useT } from "../_lib/i18n";
import { BasketIcon, BoltIcon, BookmarkIcon, CalendarIcon, CameraIcon, FridgeIcon, PotIcon, StarIcon, SwapIcon } from "./icons";

// The iPhone app's Premium offer (the one-time free-trial offer on a later day, and the paywall on a Premium feature), founder 2026-11-16: "the premium for
// free 7 days looks basic, make it look more interesting". Two parts, with the plans and their prices between them (AppStorePlans):
//  * PremiumOffer, at the top: what Premium adds, as tiles, and that everything free stays free;
//  * TrialStory, below the prices and the Continue button: the free trial's headline and its badge, and how the free week works, on a dark card.
// The onboarding meeting of 20 November 2026 (App Review 3.1.2(c)): the billed amount must be the clearest price on the screen, so the 2rem "Try Premium free for
// {days} days" headline and its trial badge moved from the top to below the prices, and Pip came off (he never shares a screen with a price). Nothing here names
// a price: the prices are StoreKit's own, shown with the plans.
// Colours (colour meeting, 19 November 2026, approved by the founder that day): the trial card is the ink token with no glow, the headline white, its quieter lines
// on-ink-2 (10.3:1), the free trial said in white bold words (no lime pill: lime is never a badge), today's dot lime with a dark green centre, day 7's ring
// on-ink-2 and the line between the two days the mid grey. What Premium adds: white tiles with the card line, each icon in a page-fill well in the link green.

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// What Premium adds (the meeting: the paywall's list names Meal plan, Cook with what you already have, Scan your food and Make it at home, the last three where the
// photo features exist). To be fed by lib/mm/premiumFeatures.ts, the one shared list, once it lands.
const FEATURES: ReadonlyArray<{ Icon: Icon; title: string; line: string }> = [
  { Icon: CalendarIcon, title: tk("Meal plan"), line: tk("A week of meals for your goal, with one shopping list") },
  ...(FOOD_SCAN_ENABLED ? [{ Icon: CameraIcon, title: tk("Scan your food"), line: tk("A photo of a meal, an estimate of its calories and macros") }] : []),
  ...(PHOTO_RECIPES_ENABLED ? [{ Icon: PotIcon, title: tk("Make it at home"), line: tk("Cook any dish from a photo") }] : []),
  ...(PHOTO_RECIPES_ENABLED ? [{ Icon: FridgeIcon, title: tk("Cook with what you have"), line: tk("Pip makes a new recipe from your fridge") }] : []),
  { Icon: BoltIcon, title: tk("Every Truth card"), line: tk("Not just three a day") },
  { Icon: SwapIcon, title: tk("Every Smart Swap"), line: tk("And every Quick answer") },
  { Icon: StarIcon, title: tk("Top 5 picks"), line: tk("For your goal at every chain") },
  { Icon: BasketIcon, title: tk("Cheapest protein"), line: tk("The full list, every shop") },
  { Icon: BookmarkIcon, title: tk("Saved orders"), line: tk("As many as you like") },
];

/** The top of the offer: what Premium adds (the free trial is said below the prices, in TrialStory). */
export function PremiumOffer() {
  const t = useT();
  return (
    <div>
      <h3 className="text-[1.25rem] font-[800] leading-snug tracking-[-0.01em]">{t("What Premium adds")}</h3>
      <ul className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2">
        {FEATURES.map(({ Icon, title, line }) => (
          <li key={title} className="flex items-start gap-2.5 rounded-[1.125rem] border border-line bg-card p-3">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill text-accent"><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="block text-[0.9375rem] font-bold leading-snug">{t(title)}</span>
              <span className="block text-[0.8125rem] leading-snug text-muted">{t(line)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Everything that's free stays free.")}</p>
    </div>
  );
}

/** The free trial, below the prices: its badge, the headline and how the free week works. Nothing when this Apple ID can't have a trial. */
export function TrialStory({ trial }: { trial: number | null }) {
  const t = useT();
  if (!trial) return null;
  return (
    <section aria-labelledby="premium-trial" className="on-ink mt-4 rounded-[1.5rem] bg-ink p-5 text-on-ink">
      <p className="text-[0.9375rem] font-bold leading-snug text-on-ink">{t("{days}-day free trial", { days: trial })}</p>
      <h3 id="premium-trial" className="mt-2 text-[2rem] font-[800] leading-[1.05] tracking-[-0.02em]">{t("Try Premium free for {days} days", { days: trial })}</h3>
      <ol className="relative mt-5 space-y-0">
        {[
          { when: t("Today"), what: t("Premium unlocks. You pay nothing now.") },
          { when: t("Day {days}", { days: trial }), what: t("Your plan starts, unless you cancel at least 24 hours before then in your App Store settings.") },
        ].map((s, i, all) => (
          <li key={s.when} className="relative flex gap-3 pb-4 last:pb-0">
            {i < all.length - 1 && <span aria-hidden className="absolute start-[0.6875rem] top-6 h-[calc(100%-1rem)] w-0.5 rounded-full bg-ring-track" />}
            <span aria-hidden className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${i === 0 ? "bg-sun" : "border-2 border-on-ink-2"}`}>
              {i === 0 && <span className="h-2 w-2 rounded-full bg-on-sun" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-bold">{s.when}</span>
              <span className="block text-[0.9375rem] leading-snug text-on-ink-2">{s.what}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
