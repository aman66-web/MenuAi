"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { myRecipesStore, savedRecipesStore, savedStore } from "@/lib/mm/stores";
import { ChevronLeftIcon } from "../_components/icons";
import { radioKeyNav } from "../_components/ui";
import { useHydrated, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { MyRecipes } from "./MyRecipes";
import { RestaurantMeals } from "./RestaurantMeals";

// "My meals" (founder 2026-10-11: one tile on Home instead of "My recipes" and "My saved meals"; "two tabs ... your recipes ... and your
// favourite restaurant meals ... very dead simple page"). The tab is kept in the address (?tab=restaurant), so coming back from a meal
// opens the same tab.

export type MealsTab = "recipes" | "restaurant";

export function MealsScreen({ tab: asked }: { tab: MealsTab | null }) {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const recipes = useStore(savedRecipesStore).length + useStore(myRecipesStore).length;
  const orders = useStore(savedStore).length;
  const [picked, setPicked] = useState<MealsTab | null>(null);
  // with no tab asked for, open on recipes unless there are none and there are restaurant meals
  const tab: MealsTab = picked ?? asked ?? (recipes === 0 && orders > 0 ? "restaurant" : "recipes");
  const tabs: ReadonlyArray<{ value: MealsTab; label: string; count: number }> = [
    { value: "recipes", label: t("Recipes"), count: recipes },
    { value: "restaurant", label: t("Restaurant meals"), count: orders },
  ];
  const choose = (v: MealsTab) => {
    setPicked(v);
    router.replace(`/app/meals?tab=${v}`, { scroll: false });
  };

  return (
    <div>
      <Link href="/app" aria-label={t("Back to home")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">{t("My meals")}</h1>

      <div role="tablist" aria-label={t("My meals")} className="glass mt-5 grid grid-cols-2 gap-1 rounded-3xl p-1">
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
              className={`min-h-14 rounded-[1.25rem] px-2 text-base font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-foreground text-background shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {o.label}{hydrated && o.count > 0 && <span className="app-numbers whitespace-nowrap font-semibold opacity-70"> · {o.count}</span>}
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
