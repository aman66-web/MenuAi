"use client";

import { useMemo } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, savedRecipesStore } from "@/lib/mm/stores";
import { PotIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { EmptyState, ErrorBox, LinkButton, Spinner } from "../_components/ui";
import { useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { recipeShop, useRecipeCards } from "../_lib/recipes";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";
import { RecipeTile } from "../recipes/RecipeTile";

// "My meals" › Recipes: recipes from our book the person saved, newest first, and the ones Pip made for them.
// Filled at the person's shop and fitted to their meal and diet, like every recipe list.
export function MyRecipes() {
  const t = useT();
  const settings = useSettings();
  const saves = useStore(savedRecipesStore);
  const mine = useStore(myRecipesStore);
  const manifest = useShopManifest();
  const shop = recipeShop(manifest, null, settings.shops);
  const state = useShopProducts(shop);
  const products = state.status === "ready" ? state.products : null;
  const target = mealTargetFor(settings);
  const book = useMemo(() => saves.map((s) => RECIPES.find((r) => r.id === s.id)).filter((r): r is Recipe => !!r), [saves]);
  const dietKey = JSON.stringify(settings.preferences);
  const pip = useMemo(() => mine.filter((m) => m.shop === shop).map((m) => savedToRecipe(m, JSON.parse(dietKey))).filter((r): r is Recipe => !!r), [mine, shop, dietKey]);
  const bookCards = useRecipeCards(book, products, settings.preferences, target);
  const pipCards = useRecipeCards(pip, products, settings.preferences, target).cards;

  if (saves.length === 0 && pip.length === 0) {
    return <EmptyState icon={<Pip mood="point" size={64} />} title={t("No saved recipes yet")} body={t("Open any recipe and tap “Save to My meals”. It will be here next time.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} />;
  }
  if (!manifest || (shop && state.status === "loading")) return <Spinner label={t("Loading recipes")} />;
  if (!shop) return <EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} />;
  if (state.status === "error") return <ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => window.location.reload()} />;

  return (
    <div>
      {(bookCards.cards.length > 0 || pipCards.length > 0) && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {pipCards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} badge={t("Made by Pip")} href={`/app/recipes/view?mine=${c.recipe.id}&r=${shop}`} /></li>))}
          {bookCards.cards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`} /></li>))}
        </ul>
      )}
      {book.length > bookCards.cards.length && (
        <p className="mt-3 px-1 text-base text-muted">{bookCards.leftOut > 0 ? t("Some saved recipes don't suit your diet now, so they're not shown.") : t("Some saved recipes can't be filled at this supermarket right now.")}</p>
      )}
    </div>
  );
}
