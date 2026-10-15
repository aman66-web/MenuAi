"use client";

import { useMemo, useState } from "react";
import { mealSlotFor } from "@/lib/mm/budget";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import type { MealType } from "@/lib/mm/recipes";
import { PipSays } from "../_components/Mascot";
import { RecipeTile } from "../recipes/RecipeTile";
import { useNow, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { recipeShop, useRecipeCards, type RecipeCard } from "../_lib/recipes";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";

// The last onboarding screen (founder 2026-10-15: "choose a recipe to start with ... then it will show them the macros, where to buy it and the
// substitutes"): two recipes picked for this person, side by side. Tapping one ends onboarding and opens that recipe's own page (the real one,
// with the nutrition of a serving, the shop's products with prices and Swap for substitutes), so there is nothing new to learn.

/** The other main meal to offer beside the one for the time of day, so the two are different kinds of dish. */
const OTHER_MAIN: Record<MealType, MealType> = { breakfast: "lunch", lunch: "dinner", dinner: "lunch", snack: "lunch" };

/**
 * Two recipes for this person: the one that fits their meal best for the meal of the day (breakfast before 10:30, lunch to 16:00, dinner after:
 * SPEC §6.3), and the best fit for the other main meal. Without a meal target (not normally the case in onboarding) the higher-protein recipes
 * come first. Snacks are never offered. Fewer than two come back when the diet leaves little.
 */
export function pickTwoRecipes(cards: readonly RecipeCard[], slot: MealType, hasTarget: boolean): RecipeCard[] {
  const key = (c: RecipeCard): number => (hasTarget ? c.distance : -c.totals.perServing.protein);
  const sorted = cards.filter((c) => c.recipe.meal !== "snack").sort((a, b) => key(a) - key(b) || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
  const first = sorted.find((c) => c.recipe.meal === slot) ?? sorted[0];
  if (!first) return [];
  const other = OTHER_MAIN[slot];
  const second = sorted.find((c) => c.recipe.id !== first.recipe.id && c.recipe.meal === other) ?? sorted.find((c) => c.recipe.id !== first.recipe.id);
  return second ? [first, second] : [first];
}

export function RecipeChoice({ onPick }: { onPick: (href: string) => void }) {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  const shop = recipeShop(manifest, null, settings.shops);
  const state = useShopProducts(shop);
  const products = state.status === "ready" ? state.products : null;
  const target = mealTargetFor(settings);
  const { cards } = useRecipeCards(null, products, settings.preferences, target);
  const now = useNow();
  const slot = mealSlotFor(now);
  const picks = useMemo(() => pickTwoRecipes(cards, slot, target !== null), [cards, slot, target]);
  const [opened, setOpened] = useState(false);
  // still working out which shop and which recipes: the manifest, then the shop's list
  const loading = manifest === null || (shop !== null && state.status === "loading");
  // only a shop whose products and labels we have read can fill a recipe, so this may not be the shop the person picked: say which it is
  const shopName = manifest?.retailers.find((r) => r.id === shop)?.name;

  if (loading) {
    return (
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={64} mood="think">
          <span className="flex items-center gap-2">{t("Finding two recipes for you…")}<span aria-hidden className="dot-pulse" /></span>
        </PipSays>
      </div>
    );
  }
  if (!shop || picks.length === 0) {
    return (
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={64} mood="wave">{t("I can't show recipes just now. You'll find them any time under Recipes.")}</PipSays>
      </div>
    );
  }
  return (
    <>
      <div aria-live="polite" className="mt-4">
        <PipSays lively size={64} mood="cheer">{shopName ? t("Every ingredient is a real product at {shop}, with its price and the nutrition of each serving.", { shop: shopName }) : t("Every ingredient is a real product at your supermarket, with its price and the nutrition of each serving.")}</PipSays>
      </div>
      <ul className="stagger mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
        {picks.map((c) => {
          const href = `/app/recipes/view?id=${c.recipe.id}&r=${shop}`;
          return (
            <li key={c.recipe.id} className="min-w-0">
              <RecipeTile
                card={c}
                href={href}
                saveable={false}
                onOpen={(e) => {
                  e.preventDefault(); // onboarding ends first, then the recipe opens (the page's own Back goes to Home)
                  if (opened) return;
                  setOpened(true);
                  onPick(href);
                }}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
