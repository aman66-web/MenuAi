"use client";

import { useMemo, useState } from "react";
import { assetUrl, GATING_ENABLED } from "@/lib/mm/config";
import { EXAMPLE_MEALS, exampleWeek, type ExampleMeal } from "@/lib/mm/exampleWeek";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { BasketIcon, ListIcon } from "../_components/icons";
import { PremiumBadge } from "../_components/PremiumBadge";
import { MEAL_LOOK } from "../recipes/RecipeTile";
import { useIsPro, useSettings } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { ShowcaseWindow } from "./ShowcaseWindow";

// Your plan's week as a picture timetable: Monday to Sunday as rows, breakfast, lunch and dinner as columns of our own recipes' pictures (CLAUDE.md rule 2).
// It is an EXAMPLE of Meal plan, never a week worked out for the person (founder, 20 November 2026: "We shouldn't calculate the meal plan. This should just be
// an example of their meal plan, showing ... how it works ... because it depends if you want to make it a premium feature"; until then it was the real week
// from their shop, sized to their numbers and priced, which gave Meal plan away). So: no shop, no calories a day, no prices, nothing saved; only recipes that
// suit their diet and allergies (lib/mm/exampleWeek.ts). Headed "Meal plan" with the one Premium badge where Premium is sold, and "An example week." under it;
// then two small cards for what Meal plan does with it: one shopping list, the shop's own prices.

const COLUMN: Readonly<Record<ExampleMeal, string>> = { breakfast: tk("Breakfast"), lunch: tk("Lunch"), dinner: tk("Dinner") };

/** One picture of the timetable: our recipe's illustration, or its meal's drawing on the page fill. */
function Thumb({ recipeId, meal }: { recipeId: string; meal: ExampleMeal }) {
  const [failed, setFailed] = useState(false);
  const src = RECIPE_IMAGES[recipeId];
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- our own recipe's illustration, a static file named by its hash
    return <img src={assetUrl(src)} alt="" width={160} height={160} loading="lazy" decoding="async" onError={() => setFailed(true)} className="aspect-square w-full rounded-xl bg-fill object-cover" />;
  }
  const Icon = (MEAL_LOOK[meal] ?? MEAL_LOOK.dinner).Icon;
  return <span className="grid aspect-square w-full place-items-center rounded-xl bg-fill text-muted"><Icon className="h-6 w-6" /></span>;
}

const GRID = "grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] items-center gap-x-1.5";

/** Your plan's example week. `under18`: no week (the words-only line). `planLine`: the replay's line for someone who already has a plan this week. */
export function WeekShowcase({ under18 = false, planLine = false }: { under18?: boolean; planLine?: boolean }) {
  const t = useT();
  const settings = useSettings();
  const isPro = useIsPro();
  const premium = GATING_ENABLED && !isPro;
  const language = useLanguage();
  const week = useMemo(() => exampleWeek(settings.preferences), [settings.preferences]);
  const dayName = (i: number, weekday: "short" | "long") => new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday }).format(new Date(2026, 10, 16 + i, 12)); // 16 November 2026 was a Monday
  const empty = week.every((d) => d.meals.length === 0);

  return (
    <>
      <ShowcaseWindow kind="week">
        {under18 || empty ? (
          <p className="text-[0.9375rem] leading-snug text-foreground">{t("Meal plan makes your week from your shop, with one shopping list.")}</p>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[1.125rem] font-bold leading-tight">{t("Meal plan")}</h2>
                <p className="mt-0.5 text-[0.9375rem] leading-snug text-muted">{t("An example week.")}</p>
              </div>
              {premium && <PremiumBadge />}
            </div>
            {/* for a screen reader, the week in words; the picture grid below is for the eye */}
            <ul className="sr-only">
              {week.map((d, i) => (
                <li key={i}>{t("{day}: {meals}.", { day: dayName(i, "long"), meals: d.meals.map((m) => t(m.name)).join(", ") })}</li>
              ))}
            </ul>
            <div aria-hidden>
              <div className={`${GRID} pb-1.5 text-[0.8125rem] font-semibold leading-tight text-muted`}>
                <span />
                {EXAMPLE_MEALS.map((c) => <span key={c} className="truncate text-center">{t(COLUMN[c])}</span>)}
              </div>
              <div className="space-y-1.5">
                {week.map((d, i) => (
                  <div key={i} className={GRID}>
                    <span className="text-[0.9375rem] font-bold">{dayName(i, "short")}</span>
                    {EXAMPLE_MEALS.map((c) => {
                      const m = d.meals.find((x) => x.meal === c);
                      return m ? <Thumb key={c} recipeId={m.recipeId} meal={c} /> : <span key={c} className="aspect-square w-full rounded-xl bg-background" />;
                    })}
                  </div>
                ))}
              </div>
            </div>
            {/* what Meal plan does with a week, as two small cards (one a row at the largest text sizes) */}
            <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3">
              <li className="flex min-h-14 items-center gap-2.5 rounded-[1.25rem] border border-line bg-card px-3.5 py-2.5 text-[1rem] font-bold leading-snug">
                <ListIcon aria-hidden className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0">{t("1 shopping list")}</span>
              </li>
              <li className="flex min-h-14 items-center gap-2.5 rounded-[1.25rem] border border-line bg-card px-3.5 py-2.5 text-[1rem] font-bold leading-snug">
                <BasketIcon aria-hidden className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0">{t("Your shop's prices")}</span>
              </li>
            </ul>
          </>
        )}
      </ShowcaseWindow>
      {planLine && <p className="mt-3 text-[0.9375rem] font-semibold leading-snug text-foreground">{t("You already have a plan for this week. Open Meal plan on Home.")}</p>}
    </>
  );
}
