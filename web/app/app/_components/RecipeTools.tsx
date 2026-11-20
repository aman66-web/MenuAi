"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FOOD_SCAN_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { useT } from "../_lib/i18n";
import { HaveChips, WeekStrip } from "./FeaturePreviews";
import { CameraIcon, ChevronRightIcon, FlameIcon, PotIcon } from "./icons";
import { useGate } from "./Paywall";
import { PremiumBadge } from "./PremiumBadge";
import { Button } from "./ui";

// The cooking tools, on Home under the day's numbers (founder 2026-11-19: "move from image one, those three things ... in that gap"): Scan your food across the
// width (Premium; its two choices on it: calories and macros, or Make it at home), then the meal plan and Cook with what you already have, each a row of its own
// showing what it does. Recipes starts with its search and the dishes. On the website, where nothing is sold, the scan card is hidden.
// The colours (colour meeting, 19 November 2026, approved by the founder that day): each feature keeps one look everywhere it appears. Scan your food is a white
// card with the 1px line, a page-fill icon well with the accent camera, the one Premium badge, "Calories and macros" as the ink main button and "Make it at
// home" as a white secondary one (the lime button looked like a chosen chip: lime only ever means chosen, today or progress). The meal plan keeps its pale
// green (tint-plan) and Cook with what you have its cream (tint-cook), each with the 1px line, ink words, the secondary grey under the title and an ink chevron;
// nothing lime sits on either tint.

/** The scan card's icon: the camera in the accent green inside a page-fill well, with a scanner's four corners round it, in the same green. */
function ScanWell() {
  const corner = "absolute h-2.5 w-2.5 border-accent";
  return (
    <span aria-hidden className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[0.875rem] bg-fill text-accent">
      <span className={`${corner} start-1 top-1 rounded-ss-md border-s-2 border-t-2`} />
      <span className={`${corner} end-1 top-1 rounded-se-md border-e-2 border-t-2`} />
      <span className={`${corner} bottom-1 start-1 rounded-es-md border-b-2 border-s-2`} />
      <span className={`${corner} bottom-1 end-1 rounded-ee-md border-b-2 border-e-2`} />
      <CameraIcon className="h-6 w-6" />
    </span>
  );
}

/** A feature card on its tint: the 1px line, ink words, the light card shadow, a soft press. */
const TINT_CARD = "mt-3 block rounded-[1.5rem] border border-line p-4 text-start text-foreground shadow-[var(--card-shadow)] transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function RecipeTools() {
  const t = useT();
  const { gate } = useGate();
  const router = useRouter();
  return (
    <>
        {(FOOD_SCAN_ENABLED || PHOTO_RECIPES_ENABLED) && (
          // One card for both photo features (founder 2026-11-19: "scan your food, where it tells you the calories, and scan to recipes, almost the same thing ...
          // they have scan to get the macros or scan to recipe"): the two choices as big buttons on the card itself, so nothing is hidden behind another tap.
          // Both are Premium: each opens the paywall here for someone without it (the 20 November 2026 audit: Scan your food used to skip it).
          // The words pass (20 November 2026): no line under the title, the two buttons say what each does.
          <section data-coach="home-photo" aria-labelledby="scan-h" className="glass relative mt-4 overflow-hidden rounded-[1.5rem] p-3.5">
            <div className="flex items-center gap-3">
              <ScanWell />
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span id="scan-h" className="text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Scan your food")}</span>
                  <PremiumBadge />
                </p>
              </div>
            </div>
            {/* the two choices named for what goes in and what comes out (founder 2026-11-20: "call the top one like photo to macros, and the bottom one like
                photo to recipe ... people might understand it better"; "calories" rather than "macros", a word not everyone knows): "Photo to calories" opens
                Scan your food, "Photo to recipe" opens Make it at home. One above the other, the whole width, so each says its words on one line at any text size (side by side they broke in two) */}
            <div className="mt-3 grid gap-2">
              {FOOD_SCAN_ENABLED && (
                <Button full size="lg" onClick={() => gate("foodScan", () => router.push("/app/scan"))} className="text-center text-[0.9375rem] leading-tight">
                  <FlameIcon aria-hidden className="h-4 w-4 shrink-0" />{t("Photo to calories")}
                </Button>
              )}
              {PHOTO_RECIPES_ENABLED && (
                <Button variant="secondary" full size="lg" onClick={() => gate("photoRecipe", () => router.push("/app/recipes/photo"))} className="text-center text-[0.9375rem] font-bold leading-tight">
                  <PotIcon aria-hidden className="h-4 w-4 shrink-0" />{t("Photo to recipe")}
                </Button>
              )}
            </div>
          </section>
        )}

        {/* the meal plan and Cook with what you already have, each a row of its own (founder 2026-11-19, on the phone: "I feel like these aren't noticed much
            the meal plan is a big thing it should have its own row"); each card says in words what it does, with a small picture of the result (a week of days,
            the foods you'd type) */}
        {/* the meal plan (founder 2026-11-18; app/app/plan; Premium): a week of our recipes for the person's goal and budget, with the shopping list and each meal's price */}
        <Link href="/app/plan" className={`${TINT_CARD} bg-tint-plan`}>
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Meal plan")}</span>
                <PremiumBadge />
              </span>
              <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t("7 days of meals for your goal, with one shopping list.")}</span>
            </span>
            <ChevronRightIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
          </span>
          <span className="mt-3 block"><WeekStrip onTint /></span>
        </Link>

        {/* Cook with what you already have (founder 2026-11-19; app/app/recipes/fridge): our recipes for what's in the fridge, free; Pip's own one is Premium inside */}
        <Link href="/app/recipes/fridge" className={`${TINT_CARD} bg-tint-cook`}>
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Cook with what you already have")}</span>
              <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t("Recipes from what's in your fridge.")}</span>
            </span>
            <ChevronRightIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
          </span>
          <span className="mt-3 block"><HaveChips large /></span>
        </Link>
    </>
  );
}
