"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, savedRecipesStore } from "@/lib/mm/stores";
import type { SavedRecipe } from "@/lib/mm/aiRecipe";
import type { RecipeSave } from "@/lib/mm/user-data";
import { PotIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { EmptyState, ErrorBox, LinkButton, Spinner } from "../_components/ui";
import { useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { recipeShopSetFor, useRecipeCards, useRecipeShopSet } from "../_lib/recipes";
import { useShopManifest } from "../_lib/shopProducts";
import { RecipeTile } from "../recipes/RecipeTile";

// "My meals" › Recipes: recipes from our book the person saved, newest first, and the ones Pip made for them.
// Filled from the person's shops (as on Recipes) and fitted to their meal and diet, like every recipe list; the same two-column grid of cards as Recipes.
// Taking a saved recipe out with its heart offers an Undo for 6 seconds (like Restaurant meals beside it), in Home's "Added" bar at the top of the
// screen, so it never sits under the next heart or the tab bar; Undo puts the save back where it was, with its date.
export function MyRecipes() {
  const t = useT();
  const settings = useSettings();
  const saves = useStore(savedRecipesStore);
  const mine = useStore(myRecipesStore);
  const manifest = useShopManifest();
  // the same shops, together, as the Recipes page: a recipe saved there is filled here the same way, with the same figures
  const shopIds = recipeShopSetFor(manifest, null, settings.shops);
  const shop = shopIds[0] ?? null;
  const state = useRecipeShopSet(shopIds);
  const products = state.status === "ready" ? state.products : null;
  const target = mealTargetFor(settings);
  const book = useMemo(() => saves.map((s) => RECIPES.find((r) => r.id === s.id)).filter((r): r is Recipe => !!r), [saves]);
  const dietKey = JSON.stringify(settings.preferences);
  const pip = useMemo(() => mine.filter((m) => m.shop === shop).map((m) => savedToRecipe(m, JSON.parse(dietKey))).filter((r): r is Recipe => !!r), [mine, shop, dietKey]);
  const bookCards = useRecipeCards(book, products, settings.preferences, target);
  const pipCards = useRecipeCards(pip, products, settings.preferences, target).cards;
  // the last one taken out, for Undo: a saved book recipe, or one Pip made (founder 2026-11-18: made recipes are saved as they're made, and come out here)
  const [undo, setUndo] = useState<{ kind: "book"; entry: RecipeSave; index: number; name: string } | { kind: "mine"; entry: SavedRecipe; index: number; name: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function unsaved(id: string, name: string) {
    const index = saves.findIndex((s) => s.id === id);
    if (index < 0) return;
    setUndo({ kind: "book", entry: saves[index]!, index, name });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 10000);
  }

  function removeMine(id: string, name: string) {
    const index = mine.findIndex((m) => m.id === id);
    if (index < 0) return;
    const entry = mine[index]!;
    myRecipesStore.update((list) => list.filter((m) => m.id !== id));
    setUndo({ kind: "mine", entry, index, name });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 10000);
  }

  function restore() {
    if (!undo) return;
    if (undo.kind === "mine") {
      const { entry, index } = undo;
      myRecipesStore.update((list) => (list.some((r) => r.id === entry.id) ? list : [...list.slice(0, index), entry, ...list.slice(index)]));
    } else {
      const { entry, index } = undo;
      savedRecipesStore.update((list) => (list.some((r) => r.id === entry.id) ? list : [...list.slice(0, index), entry, ...list.slice(index)]));
    }
    if (timer.current) clearTimeout(timer.current);
    setUndo(null);
  }

  // outside the branches below: taking out the last recipe empties the list, and the Undo must still be there
  const bar = undo && (
    <div role="status" className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-[1.75rem] bg-foreground py-1.5 ps-5 pe-2 text-background shadow-lg">
      <span className="min-w-0 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{t("Removed “{name}” from My meals.", { name: undo.name })}</span>
      <button type="button" className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-[var(--sun)] transition hover:bg-white/10" onClick={restore}>{t("Undo")}</button>
    </div>
  );

  let body: React.ReactNode;
  if (saves.length === 0 && pip.length === 0) body = <EmptyState icon={<Pip mood="point" size={64} />} title={t("No saved recipes yet")} body={t("Tap the heart on any recipe, or Save at the top of a recipe, and it will be here next time.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} />;
  else if (!manifest || (shop && state.status === "loading")) body = <Spinner label={t("Loading recipes")} />;
  else if (!shop) body = <EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} />;
  else if (state.status === "error") body = <ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => window.location.reload()} />;
  else body = (
    <div>
      {(bookCards.cards.length > 0 || pipCards.length > 0) && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3">
          {pipCards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} badge={t("Made by Pip")} href={`/app/recipes/view?mine=${c.recipe.id}&r=${shop}`} onRemoveMine={(id) => removeMine(id, c.recipe.name)} /></li>))}
          {bookCards.cards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`} onUnsave={(id) => unsaved(id, t(c.recipe.name))} /></li>))}
        </ul>
      )}
      {book.length > bookCards.cards.length && (
        <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{bookCards.leftOut > 0 ? t("Some saved recipes don't suit your diet now, so they're not shown.") : t("Some saved recipes can't be filled at this supermarket right now.")}</p>
      )}
    </div>
  );

  return (
    <>
      {body}
      {bar}
    </>
  );
}
