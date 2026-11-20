"use client";

import { previewShop } from "@/lib/mm/planPreview";
import { retailerName } from "@/lib/mm/groceries";
import type { Goal, Preferences } from "@/lib/mm/types";
import type { FirstDish } from "@/lib/mm/welcomeSteps";
import { useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { useShopManifest } from "../_lib/shopProducts";
import { EatOutShowcase } from "./EatOutShowcase";
import { Bottom, BottomButton, H1, QuietLink } from "./Frame";
import { HEADLINE } from "./parts";
import { CounterText } from "./QuestionSteps";
import { RecipeChoice, useRecipeShop } from "./RecipeChoice";
import { WeekShowcase } from "./WeekShowcase";

// The three feature screens of the welcome steps (the onboarding redesign meeting of 20 November 2026, approved by the founder), each straight after the question
// that shapes it, and replayed by Settings › Help › "Show me what Numbite can do" (?showcase=1): 3 Know before you order (Eat out), 5 Recipes from {shop}, 10 Your
// week, planned (Meal plan). No Pip (they carry figures, prices and money); no top-right pill: Next is always enabled, so it is the skip. One full-width ink
// button each, named for where it goes. Headlines at 2rem, so the window starts above the sticky button at 375x667.

/** What the bottom of a feature screen offers: its Next, and step 3's one quiet link ("Skip setup and make my account"). */
export interface FeatureBottom {
  next: string;
  onNext: () => void;
  link?: { label: string; onClick: () => void };
}

function FeatureFoot({ next, onNext, link }: FeatureBottom) {
  return (
    <Bottom>
      <BottomButton onClick={onNext}>{next}</BottomButton>
      {link && <QuietLink onClick={link.onClick}>{link.label}</QuietLink>}
    </Bottom>
  );
}

/** Step 3. `onDish`: the restaurant left showing and its top dish (a navigation hint for Home's Start here card; absent in the replay). */
export function EatOutStep({ top, counter, goal, prefs, onDish, bottom }: { top: React.ReactNode; counter: string; goal: Goal | null; prefs: Preferences; onDish?: (d: FirstDish | null) => void; bottom: FeatureBottom }) {
  const t = useT();
  return (
    <>
      {top}
      <section className="mt-5 flex flex-1 flex-col">
        {/* no sub-line (the onboarding meeting's fit check at 375x667): the window's own source line says the figures are the restaurant's */}
        <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Know before you order")}<CounterText text={counter} /></h1>
        <EatOutShowcase goal={goal} prefs={prefs} onDish={onDish} />
        <div aria-hidden className="h-4 shrink-0" />
        <FeatureFoot {...bottom} />
      </section>
    </>
  );
}

/** Step 5. `chosen`: the recipe chosen as the first one (kept only by the welcome screens, never saved as a recipe). */
export function RecipesStep({ top, counter, chosen, onChoose, bottom }: { top: React.ReactNode; counter: string; chosen: string | null; onChoose: (id: string | null) => void; bottom: FeatureBottom }) {
  const t = useT();
  const { shopName } = useRecipeShop();
  return (
    <>
      {top}
      <section className="mt-5 flex flex-1 flex-col">
        <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{shopName ? t("Recipes from {shop}", { shop: shopName }) : t("Recipes")}<CounterText text={counter} /></h1>
        {shopName && <p className="mt-2 text-base leading-snug text-foreground">{t("Every ingredient is a real {shop} product, with its price.", { shop: shopName })}</p>}
        <RecipeChoice chosen={chosen} onChoose={onChoose} />
        <div aria-hidden className="h-4 shrink-0" />
        <FeatureFoot {...bottom} />
      </section>
    </>
  );
}

/** Step 10. `under18`: nothing is worked out (the words-only form). `planLine`: the replay's line for someone with a plan this week already. */
export function WeekStep({ top, counter, under18, planLine, bottom }: { top: React.ReactNode; counter: string; under18?: boolean; planLine?: boolean; bottom: FeatureBottom }) {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  const { shop } = previewShop(manifest, settings.shops);
  const shopName = shop ? manifest?.retailers.find((r) => r.id === shop)?.name ?? retailerName(shop) : "";
  return (
    <>
      {top}
      <section className="mt-5 flex flex-1 flex-col">
        <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("Your week, planned")}<CounterText text={counter} /></h1>
        {shopName && !under18 && <p className="mt-2 text-base leading-snug text-foreground">{t("Breakfast, lunch and dinner for 7 days from {shop}, sized to your numbers.", { shop: shopName })}</p>}
        <WeekShowcase under18={under18} planLine={planLine} />
        <div aria-hidden className="h-4 shrink-0" />
        <FeatureFoot {...bottom} />
      </section>
    </>
  );
}
