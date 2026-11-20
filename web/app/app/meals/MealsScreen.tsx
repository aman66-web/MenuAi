"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { myRecipesStore, savedRecipesStore, savedStore } from "@/lib/mm/stores";
import { PageHeader } from "../_components/PageHeader";
import { ChoiceMark, radioKeyNav } from "../_components/ui";
import { useHydrated, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { MyRecipes } from "./MyRecipes";
import { RestaurantMeals } from "./RestaurantMeals";

// "My meals" (founder 2026-10-11: one tile on Home instead of "My recipes" and "My saved meals"; "two tabs ... your recipes ... and your
// favourite restaurant meals ... very dead simple page"). The tab is kept in the address (?tab=restaurant), so coming back from a meal
// opens the same tab. Styled like Home (2026-10-15): the compact heavy title and the two tabs in one pill; since the colour meeting (19 November 2026)
// the open one is lime with its edge and tick. Opened from the Recipes tab's "My recipes" (&from=recipes) the page is called My recipes and Back goes to Recipes
// (audit, 20 November 2026: one place had four names).

export type MealsTab = "recipes" | "restaurant";

export function MealsScreen({ tab: asked }: { tab: MealsTab | null }) {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const recipes = useStore(savedRecipesStore).length + useStore(myRecipesStore).length;
  const orders = useStore(savedStore).length;
  const [picked, setPicked] = useState<MealsTab | null>(null);
  const fromRecipes = useSearchParams().get("from") === "recipes";
  // with no tab asked for, open on recipes unless there are none and there are restaurant meals
  const tab: MealsTab = picked ?? asked ?? (recipes === 0 && orders > 0 ? "restaurant" : "recipes");
  const tabs: ReadonlyArray<{ value: MealsTab; label: string; count: number }> = [
    { value: "recipes", label: t("Recipes"), count: recipes },
    { value: "restaurant", label: t("Restaurant meals"), count: orders },
  ];
  const choose = (v: MealsTab) => {
    setPicked(v);
    router.replace(`/app/meals?tab=${v}${fromRecipes ? "&from=recipes" : ""}`, { scroll: false });
  };

  return (
    <div>
      {/* the header every page has (colour meeting, 19 November 2026): Back (the page before, else Home), the title under it, the Settings cog far right */}
      <PageHeader back={fromRecipes ? { href: "/app/recipes", label: t("Back to recipes") } : { href: "/app", label: t("Back to home") }} title={fromRecipes ? t("My recipes") : t("My meals")} />

      <div role="tablist" aria-label={fromRecipes ? t("My recipes") : t("My meals")} className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 rounded-full border-[1.5px] border-edge bg-background p-1">
        {tabs.map((o, i) => {
          const on = o.value === tab;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              id={`tab-${o.value}`}
              aria-selected={on}
              aria-controls="meals-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => choose(o.value)}
              onKeyDown={(e) => radioKeyNav(e, i, tabs.length, (n) => choose(tabs[n]!.value))}
              className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] px-2 text-[0.9375rem] leading-tight hyphens-auto [overflow-wrap:anywhere] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-transparent font-semibold text-foreground hover:bg-card"}`}
            >
              {/* the open tab is lime with the dark green edge and a tick, like every chosen thing (colour meeting, 19 November 2026), never ink */}
              {on && <ChoiceMark on />}
              <span className="min-w-0">{o.label}{hydrated && o.count > 0 && <span className="app-numbers whitespace-nowrap font-semibold"> · {o.count}</span>}</span>
            </button>
          );
        })}
      </div>

      <div id="meals-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
        <h2 className="sr-only">{tab === "recipes" ? t("Recipes") : t("Restaurant meals")}</h2>
        {!hydrated ? null : tab === "recipes" ? <MyRecipes /> : <RestaurantMeals />}
      </div>
    </div>
  );
}
