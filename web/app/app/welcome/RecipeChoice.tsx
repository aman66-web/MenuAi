"use client";

import { useMemo, useState } from "react";
import { mealSlotFor } from "@/lib/mm/budget";
import { retailerName } from "@/lib/mm/groceries";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import type { MealType } from "@/lib/mm/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { PipSays } from "../_components/Mascot";
import { RecipeTile } from "../recipes/RecipeTile";
import { useNow, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { recipeShopSetFor, useRecipeCards, useRecipeShopSet, type RecipeCard } from "../_lib/recipes";
import { useShopManifest } from "../_lib/shopProducts";

// The last onboarding screen's first recipe (founder 2026-10-15: "choose a recipe to start with ... then it will show them the macros, where to buy it and the
// substitutes"; since the onboarding meeting of 19 November it sits on "You're all set!" itself): two recipes picked for this person, side by side. Tapping one
// ends onboarding and opens that recipe's own page (the real one, with the nutrition of a serving, the shop's products with prices and Swap for substitutes),
// so there is nothing new to learn.

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

/**
 * Two recipes for this person, with a line saying which supermarket they use. `bare` (the last onboarding screen, where Pip has already spoken above): no Pip of
 * its own, so the loading and error states and the shop line are plain text. Without it the same words are in Pip's bubble.
 */
export function RecipeChoice({ onPick, bare = false }: { onPick: (href: string) => void; bare?: boolean }) {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  // the same shops, together, as the recipe page this opens, so the card and the page agree
  const shopIds = recipeShopSetFor(manifest, null, settings.shops);
  const shop = shopIds[0] ?? null;
  const state = useRecipeShopSet(shopIds);
  const products = state.status === "ready" ? state.products : null;
  const target = mealTargetFor(settings);
  const { cards } = useRecipeCards(null, products, settings.preferences, target);
  const now = useNow();
  const slot = mealSlotFor(now);
  const picks = useMemo(() => pickTwoRecipes(cards, slot, target !== null), [cards, slot, target]);
  const [opened, setOpened] = useState(false);
  // still working out which shop and which recipes: the manifest, then the shop's list
  const loading = manifest === null || (shop !== null && state.status === "loading");
  const nameOf = (id: string) => manifest?.retailers.find((r) => r.id === id)?.name ?? retailerName(id);
  const list = (names: readonly string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
  // only shops whose products and labels we have read can fill a recipe, so these may not be the shops the person picked: say which they are, and why (usability
  // test 2026-11-19: Tesco picked, Sainsbury's shown, no word why; the onboarding meeting: "the supermarket we have the most labels for" told nobody which one)
  const shopName = list(shopIds.map(nameOf));
  const picked = settings.shops ?? [];
  // a picked shop recipes can't use yet (not a second shop that can: recipes use one shop, the first usable one they ticked)
  const usable = new Set(recipeShops(manifest).map((r) => r.id));
  const left = picked.filter((id) => !usable.has(id)).map(nameOf);
  // a GLP-1 meal size caps each meal's calories (mealTargetFor), so the amounts in these recipes are fitted to it
  const glp1 = settings.goal === "glp1" ? ` ${t("Amounts are fitted to your meal size.")}` : "";

  const ready = !loading && shop !== null && picks.length > 0;
  const why = !ready ? ""
    : left.length > 1 ? t("{left} aren't in recipes yet, so these use {shop}: every ingredient is a real product there, with its price.", { left: list(left), shop: shopName })
    : left.length === 1 ? t("{left} isn't in recipes yet, so these use {shop}: every ingredient is a real product there, with its price.", { left: left[0]!, shop: shopName })
    : picked.length === 0 ? t("You didn't pick a shop, so these use {shop}: every ingredient is a real product there, with its price.", { shop: shopName })
    : t("These use {shop}: every ingredient is a real product there, with its price.", { shop: shopName });
  const [mood, words] = loading
    ? (["think", <span key="finding" className="flex items-center gap-2">{t("Finding two recipes for you…")}<span aria-hidden className="dot-pulse" /></span>] as const)
    : !ready
      ? (["wave", t("I can't show recipes just now. You'll find them any time under Recipes.")] as const)
      : (["cheer", why + glp1] as const);

  // one live region for every state, there from the start, so the change from "Finding…" to the shop line is read out. Bare, it comes under the cards (the
  // loading and error lines have no cards, so they still sit under the heading): the first card's title then starts above the last screen's sticky Go to Home at
  // 390x844, on a build that shows the free and Premium line too (the onboarding meeting's fold check).
  const said = (
    <div aria-live="polite">
      {bare ? (
        <p className={`${ready ? "mt-2.5" : "mt-1.5"} text-[0.9375rem] leading-snug`}>{words}</p>
      ) : (
        <div className="mt-4">
          <PipSays lively size={64} mood={mood}>{words}</PipSays>
        </div>
      )}
    </div>
  );

  return (
    <>
      {!bare && said}
      {ready && (
        <ul className={`stagger grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3 ${bare ? "mt-3" : "mt-5"}`}>
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
      )}
      {bare && said}
    </>
  );
}
