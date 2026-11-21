"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import { FREE_WEEK_ENDED, FREE_WEEK_LAST_DAY, FREE_WEEK_LEFT } from "@/lib/mm/freeWeek";
import { headlineFeatures, moreFeatures, type PremiumFeature, type PremiumIcon } from "@/lib/mm/premiumFeatures";
import { useFreeWeekDaysLeft, useFreeWeekEnded } from "../_lib/freeWeek";
import { useT } from "../_lib/i18n";
import { BoltIcon, BookmarkIcon, CalendarIcon, CameraIcon, FridgeIcon, PodiumIcon, PotIcon, ShrinkIcon, StarIcon, SwapIcon } from "./icons";
import { FeaturePicture, PICTURED, PremiumHeroPicture } from "./PremiumPictures";

// The Premium offer's parts around the plans (AppStorePlans), on the paywall of a Premium feature, the one-time free-trial offer and the plans page (/app/pro).
// The founder, 20 November 2026 (23:05, on the paywall: "This has got to look more interesting also mention is a 7 day free trial"):
//  * PremiumHero: the sheet's top is a picture of what Premium does (PremiumPictures.tsx: our recipes as a little week, a photo in the scanner's corners), then
//    the free trial said plainly ("Try Premium free for 7 days") with the chosen plan's price straight under it ("Then £49.99 a year."), then why the sheet
//    opened. App Review 3.1.2(c): the headline is smaller than the billed amount under the plans (the largest price on the screen) and the price after the
//    trial is never apart from the trial words;
//  * TrialStory: how the free trial works, as three steps (today, cancelling before it ends, the day the plan starts and what is charged). The app sends no
//    reminder before the trial ends, so the steps never promise one;
//  * PremiumOffer: what Premium adds (lib/mm/premiumFeatures.ts, the one list): the four most loved as picture cards, the rest as a compact list, then what
//    stays free.
// Nothing here names a price of its own: the prices are StoreKit's, handed in by AppStorePlans. Pip never shares a screen with a price.
// Colours (colour meeting, 19 November 2026, approved by the founder that day): the compact list's icons each in a page-fill well in the link green; the trial
// card white with the card line, today's dot lime with a dark green centre, the later steps' rings the edge grey and the line between them the mid grey.

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

/** One of the four: its picture on its own colour, its name and a few words. */
function FeatureCard({ f }: { f: PremiumFeature }) {
  const t = useT();
  const Icon = ICONS[f.icon];
  return (
    <li className="overflow-hidden rounded-[1.25rem] border border-line bg-card shadow-[var(--card-shadow)]">
      {PICTURED.includes(f.id) ? <FeaturePicture id={f.id} /> : (
        <span aria-hidden className="flex h-[88px] items-center justify-center bg-fill text-accent"><Icon className="h-9 w-9" /></span>
      )}
      <span className="block p-3">
        <span className="block text-base font-[800] leading-snug">{t(f.title)}</span>
        <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t(f.line, f.values)}</span>
      </span>
    </li>
  );
}

/** One of the rest, compact: its icon in a page-fill well, its name and a few words. */
function FeatureRow({ f }: { f: PremiumFeature }) {
  const t = useT();
  const Icon = ICONS[f.icon];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span aria-hidden className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-[12px] bg-fill text-accent"><Icon className="h-[20px] w-[20px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug">{t(f.title)}</span>
        <span className="block text-[0.9375rem] leading-snug text-muted">{t(f.line, f.values)}</span>
      </span>
    </li>
  );
}

/** What Premium adds: the four as picture cards (two across, one across at large text), the rest compact, then what stays free. `level`: h3 in a sheet, h2 on a page. */
export function PremiumOffer({ level = "h3" }: { level?: "h2" | "h3" } = {}) {
  const t = useT();
  const Heading = level;
  const head = headlineFeatures();
  const more = moreFeatures();
  return (
    <div>
      <Heading className="text-[1.25rem] font-[800] leading-snug tracking-[-0.01em]">{t("What Premium adds")}</Heading>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.25rem),1fr))] gap-2.5">
        {head.map((f) => <FeatureCard key={f.id} f={f} />)}
      </ul>
      {more.length > 0 && (
        <ul className="mt-2.5 divide-y divide-line rounded-[1.25rem] border border-line bg-card px-3.5 py-0.5">
          {more.map((f) => <FeatureRow key={f.id} f={f} />)}
        </ul>
      )}
      <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("Every menu, recipe and label stays free, and so does your food diary.")}</p>
    </div>
  );
}

/**
 * The top of the plans: the picture, then the free trial for the chosen plan said plainly with its price straight under it (`trial`, `price`, `per`: StoreKit's,
 * from AppStorePlans), or, with no free trial for this Apple ID, a plain headline; then `reason`, why the sheet opened. While StoreKit answers (`waiting`) the
 * headline keeps its place unseen, so nothing jumps.
 */
export function PremiumHero({ trial: offered, price, per, waiting, reason, level = "h3" }: { trial: number | null; price: string | null; per: string; waiting: boolean; reason?: ReactNode; level?: "h2" | "h3" }) {
  const t = useT();
  // the account's free week is over (lib/mm/freeWeek.ts): said plainly, before anything about a trial
  const ended = useFreeWeekEnded();
  // while it runs, the days left, as Settings says them (the meeting of 21 November 2026, Tara and Bea: "Get more with Premium" never said Premium was on);
  // an Apple trial a store still offered then isn't headlined over it (it would start only on buying, not when the free week ends)
  const left = useFreeWeekDaysLeft();
  const daysLeft = ended ? 0 : left;
  const trial = daysLeft > 0 ? null : offered;
  const Heading = level;
  return (
    <div className="mb-5">
      <PremiumHeroPicture />
      {/* never larger than the billed amount under the plans (2rem): App Review 3.1.2(c) */}
      <Heading className={`mt-4 text-balance text-[1.625rem] font-[800] leading-[1.15] tracking-[-0.02em] ${waiting ? "invisible" : ""}`}>
        {ended ? t(FREE_WEEK_ENDED) : trial && !waiting ? t("Try Premium free for {days} days", { days: trial })
          : daysLeft > 0 ? (daysLeft === 1 ? t(FREE_WEEK_LAST_DAY) : t(FREE_WEEK_LEFT, { n: daysLeft })) : t("Get more with Premium")}
      </Heading>
      {trial && price && !waiting && !ended && <p className="app-numbers mt-1 text-[1.125rem] font-bold leading-snug">{t("Then {price} {per}.", { price, per })}</p>}
      {reason && <p className="mt-2 text-base leading-snug text-muted">{reason}</p>}
    </div>
  );
}

/**
 * The free trial, below the prices: how it works for the plan that is chosen (`price` and `per` are StoreKit's, as AppStorePlans shows them), in three steps.
 * Nothing when that plan has no free trial for this Apple ID.
 */
export function TrialStory({ trial, price, per }: { trial: number | null; price: string; per: string }) {
  const t = useT();
  if (!trial) return null;
  const steps = [
    { when: t("Today"), what: t("Premium unlocks. You pay nothing now.") },
    { when: t("Before day {days}", { days: trial }), what: t("Cancel in your App Store settings at least 24 hours before, and you pay nothing.") },
    { when: t("Day {days}", { days: trial }), what: t("Your plan starts. You pay {price} {per}.", { price, per }) },
  ];
  return (
    <section aria-labelledby="premium-trial" className="mt-5 rounded-[1.25rem] border border-line bg-card p-4">
      <h3 id="premium-trial" className="text-[1.125rem] font-bold leading-snug">{t("How your free trial works")}</h3>
      <ol className="relative mt-3.5 space-y-0">
        {steps.map((s, i) => (
          <li key={s.when} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className="absolute start-[11px] top-[26px] h-[calc(100%-22px)] w-[2px] rounded-full bg-ring-track" />}
            <span aria-hidden className={`mt-[2px] grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full ${i === 0 ? "border-2 border-on-sun bg-sun" : "border-2 border-edge bg-card"}`}>
              {i === 0 && <span className="h-[8px] w-[8px] rounded-full bg-on-sun" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-bold">{s.when}</span>
              <span className={`app-numbers block text-[0.9375rem] leading-snug ${i === steps.length - 1 ? "font-semibold text-foreground" : "text-muted"}`}>{s.what}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
