"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FOOD_SCAN_ENABLED, GATING_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { useIsPro } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { HaveChips, ScanFrameIcon, WeekStrip } from "./FeaturePreviews";
import { FlameIcon, PotIcon } from "./icons";
import { useGate } from "./Paywall";

// The cooking tools, on Home under the day's numbers (founder 2026-11-19: "move from image one, those three things ... in that gap"): Scan your food across the
// width (Premium; the one dark card, its two choices on it: calories and macros, or Make it at home), then Cook with what you already have and the meal plan side
// by side, each showing what it does. Recipes starts with its search and the dishes. On the website, where nothing is sold, the scan card is hidden.
export function RecipeTools() {
  const t = useT();
  const pro = useIsPro();
  const { gate } = useGate();
  const router = useRouter();
  return (
    <>
        {(FOOD_SCAN_ENABLED || PHOTO_RECIPES_ENABLED) && (
          // One card for both photo features (founder 2026-11-19: "scan your food, where it tells you the calories, and scan to recipes, almost the same thing ...
          // they have scan to get the macros or scan to recipe"): the one dark card, the scanner's corners round the camera, and the two choices as big buttons on
          // the card itself, so nothing is hidden behind another tap. Both are Premium: Scan your food asks on its own page, Make it at home opens the paywall here.
          <section data-coach="home-photo" aria-labelledby="scan-h" className="relative mt-4 overflow-hidden rounded-[1.5rem] bg-[#1d2320] p-3.5 text-white shadow-[0_18px_40px_-20px_rgba(0,0,0,0.6)]">
            <div className="flex items-start gap-3">
              <ScanFrameIcon onDark />
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span id="scan-h" className="text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Scan your food")}</span>
                  {!pro && <span className="inline-block rounded-full bg-sun px-2 py-0.5 text-[0.8125rem] font-bold leading-snug text-[var(--on-accent)]">{t("Premium")}</span>}
                </p>
                <p className="mt-0.5 text-[0.875rem] leading-snug text-white/80">{t("Take a photo of a meal: see its calories and macros, or get the recipe to make it at home.")}</p>
              </div>
            </div>
            {/* one above the other, the whole width, so each says its words on one line at any text size (side by side they broke in two) */}
            <div className="mt-3 grid gap-2">
              {FOOD_SCAN_ENABLED && (
                <Link href="/app/scan" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-sun px-4 py-2 text-center text-[0.9375rem] font-bold leading-tight text-[var(--on-accent)] transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <FlameIcon aria-hidden className="h-4 w-4 shrink-0" />{t("Calories and macros")}
                </Link>
              )}
              {PHOTO_RECIPES_ENABLED && (
                <button type="button" onClick={() => gate("photoRecipe", () => router.push("/app/recipes/photo"))} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-center text-[0.9375rem] font-bold leading-tight text-[#1d2320] transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <PotIcon aria-hidden className="h-4 w-4 shrink-0" />{t("Make it at home")}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Cook with what you have and the meal plan side by side, under Make it at home (founder 2026-11-19: "the most important one will be where make it at home
            is and take up that entire space. And the least important two should be on the same line ... so it's not taken up all the way"): each its icon and name,
            the line saying what it does kept for a screen reader, so the dishes start higher up the page. At the largest text the two still share the row. */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {/* Cook with what you have (founder 2026-11-19; app/app/recipes/fridge): our recipes for what's in the fridge, free; Pip's own one is Premium inside */}
          {/* each shows what it gives you (founder 2026-11-19: the icons were "hard to recognize"): the foods you'd type in, a week of days */}
          <Link href="/app/recipes/fridge" className="glass lift flex min-h-[4.5rem] min-w-0 flex-col gap-2.5 rounded-[1.25rem] p-3 text-start">
            <span className="block hyphens-auto text-[1rem] font-[800] leading-[1.25] [overflow-wrap:anywhere]">
              {t("Cook with what you already have")}
              <span className="sr-only">. {t("Tell us what's in your fridge and get recipes for it.")}</span>
            </span>
            <span className="mt-auto"><HaveChips /></span>
          </Link>

          {/* the meal plan (founder 2026-11-18; app/app/plan; Premium): a week of our recipes for the person's goal and budget, with the shopping list and each meal's price */}
          <Link href="/app/plan" className="glass lift flex min-h-[4.5rem] min-w-0 flex-col gap-2.5 rounded-[1.25rem] p-3 text-start">
            <span className="block [overflow-wrap:anywhere]">
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="text-[1rem] font-[800] leading-[1.25]">{t("Meal plan")}</span>
                {GATING_ENABLED && !pro && <span className="inline-block rounded-full bg-sun px-2 py-0.5 text-[0.75rem] font-bold leading-snug text-[var(--on-accent)]">{t("Premium")}</span>}
              </span>
              <span className="mt-0.5 block text-[0.8125rem] font-semibold leading-snug text-muted">{t("7 days, one list")}</span>
              <span className="sr-only">. {t("A week of meals for your goal, with the shopping list.")}</span>
            </span>
            <span className="mt-auto"><WeekStrip /></span>
          </Link>
        </div>
    </>
  );
}
