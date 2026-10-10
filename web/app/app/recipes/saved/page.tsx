"use client";

import Link from "next/link";
import { useMemo } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, savedRecipesStore } from "@/lib/mm/stores";
import { ChevronLeftIcon, PotIcon } from "../../_components/icons";
import { Pip } from "../../_components/Mascot";
import { EmptyState, ErrorBox, LinkButton, Spinner } from "../../_components/ui";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";
import { recipeShop, useRecipeCards } from "../../_lib/recipes";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { RecipeTile } from "../RecipeTile";

// "My recipes" (from Home; founder 2026-10-10): recipes from our book the person saved, newest first, and the ones Pip made for them.
// Filled at the person's shop and fitted to their meal and diet, like every recipe list.

export default function SavedRecipesPage() {
  const t = useT();
  const hydrated = useHydrated();
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
  const nothing = saves.length === 0 && pip.length === 0;

  return (
    <div>
      <Link href="/app" aria-label={t("Back to home")} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("My {recipes}")} values={{ recipes: <span className="serif-em sun-text pe-0.5">{t("recipes")}</span> }} /></h1>

      {!hydrated ? null : nothing ? (
        <div className="mt-6"><EmptyState icon={<Pip mood="point" size={64} />} title={t("No saved recipes yet")} body={t("Open any recipe and tap “Save to My recipes”. It will be here next time.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} /></div>
      ) : !manifest || (shop && state.status === "loading") ? (
        <Spinner label={t("Loading recipes")} />
      ) : !shop ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} /></div>
      ) : state.status === "error" ? (
        <div className="mt-5"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => window.location.reload()} /></div>
      ) : (
        <>
          {book.length > 0 && (
            <section aria-labelledby="saved-heading" className="mt-6">
              <h2 id="saved-heading" className="text-xl font-extrabold tracking-tight">{t("Saved recipes")}</h2>
              {bookCards.cards.length > 0 ? (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {bookCards.cards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`} /></li>))}
                </ul>
              ) : null}
              {book.length > bookCards.cards.length && (
                <p className="mt-3 px-1 text-sm text-muted">{bookCards.leftOut > 0 ? t("Some saved recipes don't suit your diet now, so they're not shown.") : t("Some saved recipes can't be filled at this supermarket right now.")}</p>
              )}
            </section>
          )}
          {pipCards.length > 0 && (
            <section aria-labelledby="pip-heading" className="mt-6">
              <h2 id="pip-heading" className="text-xl font-extrabold tracking-tight">{t("Made by Pip")}</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {pipCards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} badge={t("Made by Pip")} href={`/app/recipes/view?mine=${c.recipe.id}&r=${shop}`} /></li>))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
