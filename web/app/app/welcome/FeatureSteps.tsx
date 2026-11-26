"use client";

import { useSearchParams } from "next/navigation";
import { tk } from "@/lib/mm/i18n";
import { ShopMark } from "../_components/ChainMark";
import { useT } from "../_lib/i18n";
import { Bottom, BottomButton, H1 } from "./Frame";
import { HEADLINE, STEP_TOP } from "./parts";
import { CounterText } from "./QuestionSteps";
import { RecipeChoice, useRecipeShop } from "./RecipeChoice";

// Step 4, "Pick a recipe from {shop}" (the look kept as the founder liked it, 20 November 2026; the headline says what to do since 26 November), and the bottom bar of the two screens that show the app working (step 4 and
// Your plan, PlanStep.tsx). No Pip, no caption, no tag; one full-width ink button each, always enabled, so it is also the skip.

/** What the bottom of a feature screen offers: its one button. */
export interface FeatureBottom {
  next: string;
  onNext: () => void;
}

export function FeatureFoot({ next, onNext }: FeatureBottom) {
  return (
    <Bottom>
      <BottomButton onClick={onNext}>{next}</BottomButton>
    </Bottom>
  );
}

/** Step 4. `chosen`: the recipe chosen as the first one (kept only by the welcome screens, never saved as a recipe). */
export function RecipesStep({ top, counter, chosen, onChoose, bottom }: { top: React.ReactNode; counter: string; chosen: string | null; onChoose: (id: string | null) => void; bottom: FeatureBottom }) {
  const t = useT();
  const { shop, shopName } = useRecipeShop();
  // the headline is what to do (founder 2026-11-26: a headline only, no "Tap one to cook first." under it); in the replay nothing is chosen, so it names the shop
  const params = useSearchParams();
  const replay = params.get("showcase") === "1" || params.get("tour") === "1";
  const heading = replay ? tk("Recipes from {shop}") : tk("Pick a recipe from {shop}");
  return (
    <>
      {top}
      <section className={`${STEP_TOP} flex flex-1 flex-col`}>
        <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>
          {shopName ? (
            <>
              {/* the shop's own small logo just before its name (CLAUDE.md rule 2: to identify it; the name is written), so the heading stays one short line
                  where it fits, and the logo never parts from the name when it wraps */}
              {t(heading, { shop: "\u0000" }).split("\u0000").map((part, i) => (i === 0 ? <span key={i}>{part}</span> : (
                <span key={i}>
                  {/* the name itself may break only where it can't fit on a line of its own (200% text at 360 px cut "Sainsbury's" off) */}
                  <span className="whitespace-nowrap">{shop && <span className="me-2 inline-block align-[-0.2em]"><ShopMark shopId={shop} size="xs" /></span>}<span className="whitespace-normal [overflow-wrap:anywhere]">{shopName}</span></span>{part}
                </span>
              )))}
            </>
          ) : replay ? t("Recipes") : t("Pick a recipe")}
          <CounterText text={counter} />
        </h1>
        <RecipeChoice chosen={chosen} onChoose={onChoose} />
        <div aria-hidden className="h-4 shrink-0" />
        <FeatureFoot {...bottom} />
      </section>
    </>
  );
}
