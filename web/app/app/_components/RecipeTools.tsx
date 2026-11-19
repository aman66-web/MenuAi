"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FOOD_SCAN_ENABLED, GATING_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { useIsPro } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { HaveChips, ScanFrameIcon, WeekStrip } from "./FeaturePreviews";
import { ChevronRightIcon, FlameIcon, PotIcon } from "./icons";
import { useGate } from "./Paywall";

// The cooking tools, on Home under the day's numbers (founder 2026-11-19: "move from image one, those three things ... in that gap"): Scan your food across the
// width (Premium; the one dark card, its two choices on it: calories and macros, or Make it at home), then the meal plan and Cook with what you already have,
// each a row of its own showing what it does. Recipes starts with its search and the dishes. On the website, where nothing is sold, the scan card is hidden.
export function RecipeTools() {
  const t = useT();
  const pro = useIsPro();
  const { gate } = useGate();
  const router = useRouter();
  return (
    <>
        {(FOOD_SCAN_ENABLED || PHOTO_RECIPES_ENABLED) && (
          // One card for both photo features (founder 2026-11-19: "scan your food, where it tells you the calories, and scan to recipes, almost the same thing ...
          // they have scan to get the macros or scan to recipe"): the scanner's corners round the camera, and the two choices as big buttons on
          // the card itself, so nothing is hidden behind another tap. Both are Premium: Scan your food asks on its own page, Make it at home opens the paywall here.
          // a light card since 2026-11-19 (founder: the scan card's dark "may be better ... for the background of the top part instead": the day's numbers are dark now)
          <section data-coach="home-photo" aria-labelledby="scan-h" className="glass relative mt-4 overflow-hidden rounded-[1.5rem] p-3.5">
            <div className="flex items-start gap-3">
              <ScanFrameIcon />
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span id="scan-h" className="text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Scan your food")}</span>
                  {!pro && <span className="inline-block rounded-full bg-sun px-2 py-0.5 text-[0.8125rem] font-bold leading-snug text-[var(--on-accent)]">{t("Premium")}</span>}
                </p>
                <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{t("Take a photo of a meal: see its calories and macros, or get the recipe to make it at home.")}</p>
              </div>
            </div>
            {/* one above the other, the whole width, so each says its words on one line at any text size (side by side they broke in two) */}
            <div className="mt-3 grid gap-2">
              {FOOD_SCAN_ENABLED && (
                <Link href="/app/scan" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-sun px-4 py-2 text-center text-[0.9375rem] font-bold leading-tight text-[var(--on-accent)] transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <FlameIcon aria-hidden className="h-4 w-4 shrink-0" />{t("Calories and macros")}
                </Link>
              )}
              {PHOTO_RECIPES_ENABLED && (
                <button type="button" onClick={() => gate("photoRecipe", () => router.push("/app/recipes/photo"))} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#1d2320] px-4 py-2 text-center text-[0.9375rem] font-bold leading-tight text-white transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <PotIcon aria-hidden className="h-4 w-4 shrink-0" />{t("Make it at home")}
                </button>
              )}
            </div>
          </section>
        )}

        {/* the meal plan and Cook with what you already have, each a row of its own (founder 2026-11-19, on the phone: "I feel like these aren't noticed much
            the meal plan is a big thing it should have its own row"): the meal plan in the app's lime under the dark scan card, so the eye meets it next; each
            card says in words what it does, with a small picture of the result (a week of days, the foods you'd type) */}
        {/* the meal plan (founder 2026-11-18; app/app/plan; Premium): a week of our recipes for the person's goal and budget, with the shopping list and each meal's price */}
        {/* the colours (founder 2026-11-19: "choose the best colours for each thing"): the dark is the day's numbers alone, the lime is for buttons and progress,
            and each feature card has a soft tint of its own so it is noticed and known by its colour: the meal plan a pale green, Cook with what you have a cream */}
        <Link href="/app/plan" className="mt-3 block rounded-[1.5rem] bg-[#e4f0d0] p-4 text-[#1d2320] shadow-[0_14px_30px_-24px_rgba(0,0,0,0.45)] transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Meal plan")}</span>
                {GATING_ENABLED && !pro && <span className="inline-block rounded-full bg-[#1d2320] px-2 py-0.5 text-[0.8125rem] font-bold leading-snug text-[var(--sun)]">{t("Premium")}</span>}
              </span>
              <span className="mt-0.5 block text-[0.9375rem] leading-snug text-[#3d4a3f]">{t("Pip plans 7 days of meals for your goal, with one shopping list.")}</span>
            </span>
            <ChevronRightIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          </span>
          <span className="mt-3 block"><WeekStrip onTint /></span>
        </Link>

        {/* Cook with what you already have (founder 2026-11-19; app/app/recipes/fridge): our recipes for what's in the fridge, free; Pip's own one is Premium inside */}
        <Link href="/app/recipes/fridge" className="mt-3 block rounded-[1.5rem] bg-[#fbeccb] p-4 text-start text-[#1d2320] shadow-[0_14px_30px_-24px_rgba(0,0,0,0.45)] transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Cook with what you already have")}</span>
              <span className="mt-0.5 block text-[0.9375rem] leading-snug text-[#5a4a2c]">{t("Tell us what's in your fridge and get recipes for it.")}</span>
            </span>
            <ChevronRightIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          </span>
          <span className="mt-3 block"><HaveChips large /></span>
        </Link>
    </>
  );
}
