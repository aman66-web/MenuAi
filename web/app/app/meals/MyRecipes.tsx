"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { retailerName } from "@/lib/mm/groceries";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { DietPrefs } from "@/lib/mm/pantry";
import type { MealTarget, Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, savedRecipesStore } from "@/lib/mm/stores";
import type { SavedRecipe } from "@/lib/mm/aiRecipe";
import type { RecipeSave } from "@/lib/mm/user-data";
import { PotIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { Toast } from "../_components/Toast";
import { EmptyState, ErrorBox, LinkButton, Spinner } from "../_components/ui";
import { useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { recipeShopSetFor, useRecipeCards, useRecipeShopSet } from "../_lib/recipes";
import { useShopManifest } from "../_lib/shopProducts";
import { RecipeTile } from "../recipes/RecipeTile";

/** How long "Removed … Undo" stays (the same 10 seconds as Restaurant meals beside it). */
const UNDO_MS = 10000;

// "My meals" › Recipes (called My recipes when opened from the Recipes tab): recipes from our book the person saved, newest first, and the ones Pip made for them.
// Filled from the person's shops (as on Recipes) and fitted to their meal and diet, like every recipe list; the same two-column grid of cards as Recipes.
// A recipe Pip made for another shop is listed too, under "Made for {shop}", worked out from that shop's own products and opened at it (audit, 20 November 2026:
// they were counted, then hidden behind "No saved recipes yet").
// Taking a recipe out (a saved one's heart, a made one's remove button) offers an Undo for 10 seconds (like Restaurant meals beside it), in the one toast at the
// top of the screen, so it never sits under the next heart or the tab bar; Undo puts it back where it was, with its date.
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
  // the made recipes for every other shop, by shop, in the order they were made
  const elsewhere = useMemo(() => {
    const by = new Map<string, SavedRecipe[]>();
    for (const m of mine) if (m.shop !== shop) by.set(m.shop, [...(by.get(m.shop) ?? []), m]);
    return [...by.entries()];
  }, [mine, shop]);
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
  }

  function removeMine(id: string, name: string) {
    const index = mine.findIndex((m) => m.id === id);
    if (index < 0) return;
    const entry = mine[index]!;
    myRecipesStore.update((list) => list.filter((m) => m.id !== id));
    setUndo({ kind: "mine", entry, index, name });
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
    setUndo(null);
  }

  // outside the branches below: taking out the last recipe empties the list, and the Undo must still be there
  const bar = undo && (
    <Toast key={`${undo.kind}:${undo.entry.id}`} duration={UNDO_MS} onClose={() => setUndo(null)} onUndo={restore}>
      {t("Removed “{name}” from My recipes.", { name: undo.name })}
    </Toast>
  );

  let body: React.ReactNode;
  if (saves.length === 0 && mine.length === 0) body = <EmptyState icon={<Pip mood="point" size={64} />} title={t("No saved recipes yet")} body={t("Tap the heart on any recipe to keep it here.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} />;
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
      {mine.filter((m) => m.shop === shop).length > pipCards.length && (
        <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("Some recipes Pip made don't suit your diet now, or can't be filled at this supermarket, so they're not shown.")}</p>
      )}
      {elsewhere.map(([other, entries]) => (
        <MadeAtShop key={other} shop={other} entries={entries} diet={settings.preferences} target={target} onRemove={removeMine} />
      ))}
    </div>
  );

  return (
    <>
      {body}
      {bar}
    </>
  );
}

/** The recipes Pip made for another shop: worked out from that shop's own products (loaded for this), and opened at that shop. */
function MadeAtShop({ shop, entries, diet, target, onRemove }: { shop: string; entries: readonly SavedRecipe[]; diet: DietPrefs; target: MealTarget | null; onRemove: (id: string, name: string) => void }) {
  const t = useT();
  const manifest = useShopManifest();
  const name = manifest?.retailers.find((r) => r.id === shop)?.name ?? retailerName(shop);
  const ids = useMemo(() => [shop], [shop]);
  const state = useRecipeShopSet(ids);
  const dietKey = JSON.stringify(diet);
  const recipes = useMemo(() => entries.map((m) => savedToRecipe(m, JSON.parse(dietKey))).filter((r): r is Recipe => !!r), [entries, dietKey]);
  const { cards } = useRecipeCards(recipes, state.status === "ready" ? state.products : null, diet, target);
  const hidden = entries.length - cards.length;
  return (
    <section aria-labelledby={`made-${shop}`} className="mt-7">
      <h3 id={`made-${shop}`} className="text-xl font-[800] tracking-[-0.01em]">{t("Made for {shop}", { shop: name })}</h3>
      {state.status === "loading" ? (
        <Spinner label={t("Loading recipes")} />
      ) : state.status === "error" ? (
        <p className="mt-2 px-1 text-[0.9375rem] leading-snug text-muted">{t("Couldn't load the recipes. Check your connection.")}</p>
      ) : (
        <>
          {cards.length > 0 && (
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3">
              {cards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} badge={t("Made by Pip")} href={`/app/recipes/view?mine=${c.recipe.id}&r=${shop}`} onRemoveMine={(id) => onRemove(id, c.recipe.name)} /></li>))}
            </ul>
          )}
          {hidden > 0 && (
            <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("Some recipes Pip made don't suit your diet now, or can't be filled at this supermarket, so they're not shown.")}</p>
          )}
        </>
      )}
    </section>
  );
}
