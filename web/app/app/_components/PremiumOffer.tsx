"use client";

import type { ComponentType, SVGProps } from "react";
import { PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { tk } from "@/lib/mm/i18n";
import { useT } from "../_lib/i18n";
import { BasketIcon, BoltIcon, BookmarkIcon, CameraIcon, StarIcon, SwapIcon } from "./icons";
import { Pip } from "./Mascot";

// The top of the iPhone app's Premium offer (the one-time free-trial offer after setup, and the paywall on a Premium feature), founder 2026-11-16: "the premium for
// free 7 days looks basic, make it look more interesting". A dark card like the tab bar with Pip and the free week, how the free week works, and what Premium adds as
// tiles. The plans and Apple's words follow underneath (AppStorePlans). Nothing here names a price: the prices are StoreKit's own, shown with the plans.
// Colours (colour meeting, 19 November 2026, approved by the founder that day): the card is the ink token with no glow, the headline white, its quieter lines
// on-ink-2 (10.3:1), the free trial said in white bold words (no lime pill: lime is never a badge), today's dot lime with a dark green centre, day 7's ring
// on-ink-2 and the line between the two days the mid grey; Pip cheers on the ink. What Premium adds: white tiles with the card line, each icon in a page-fill
// well in the link green (no lime discs).

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const FEATURES: ReadonlyArray<{ Icon: Icon; title: string; line: string }> = [
  ...(PHOTO_RECIPES_ENABLED ? [{ Icon: CameraIcon, title: tk("Make it at home"), line: tk("Cook any dish from a photo") }] : []),
  { Icon: BoltIcon, title: tk("Every Truth card"), line: tk("Not just three a day") },
  { Icon: SwapIcon, title: tk("Every Smart Swap"), line: tk("And every Quick answer") },
  { Icon: StarIcon, title: tk("Top 5 picks"), line: tk("For your goal at every chain") },
  { Icon: BasketIcon, title: tk("Cheapest protein"), line: tk("The full list, every shop") },
  { Icon: BookmarkIcon, title: tk("Saved orders"), line: tk("As many as you like") },
];

/** `trial` = the free trial this Apple ID can still have, in days (null = none: the card offers Premium without one). */
export function PremiumOffer({ trial }: { trial: number | null }) {
  const t = useT();
  return (
    <div>
      <section aria-labelledby="premium-hero" className="on-ink relative overflow-hidden rounded-[1.5rem] bg-ink p-5 text-on-ink">
        <div className="relative flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {trial && <p className="text-[0.9375rem] font-bold leading-snug text-on-ink">{t("{days}-day free trial", { days: trial })}</p>}
            <h3 id="premium-hero" className="mt-3 text-[2rem] font-[800] leading-[1.05] tracking-[-0.02em]">
              {trial ? t("Try Premium free for {days} days", { days: trial }) : t("Unlock everything")}
            </h3>
            <p className="mt-2 text-base leading-snug text-on-ink-2">{t("Everything that's free stays free.")}</p>
          </div>
          <Pip mood="cheer" size={92} className="-me-1 shrink-0" />
        </div>

        {trial && (
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
        )}
      </section>

      <h3 className="mt-5 text-[1.0625rem] font-bold tracking-[-0.01em]">{t("What Premium adds")}</h3>
      <ul className="mt-2.5 grid grid-cols-2 gap-2.5">
        {FEATURES.map(({ Icon, title, line }) => (
          <li key={title} className="rounded-[1.125rem] border border-line bg-card p-3.5">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-fill text-accent"><Icon className="h-[18px] w-[18px]" /></span>
            <span className="mt-2 block text-[0.9375rem] font-bold leading-snug">{t(title)}</span>
            <span className="block text-[0.8125rem] leading-snug text-muted">{t(line)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
