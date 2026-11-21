"use client";

import { useCallback, useMemo, useState } from "react";
import { savedToRecipe, type SavedRecipe } from "@/lib/mm/aiRecipe";
import { homeDiet } from "@/lib/mm/household";
import { dietClashes, recipeForDiet, resolveRecipe, type MealTarget } from "@/lib/mm/recipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeShops, recipeShopsFrom } from "@/lib/mm/shopProducts";
import { mealPlanStore, myRecipesStore, updateSettings } from "@/lib/mm/stores";
import { InfoIcon, TrashIcon } from "../../_components/icons";
import { PageHeader } from "../../_components/PageHeader";
import { Toast } from "../../_components/Toast";
import { Button, ErrorBox, Sheet, Spinner } from "../../_components/ui";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShopSetFor, useRecipeShopSet } from "../../_lib/recipes";
import { useShopManifest } from "../../_lib/shopProducts";
import { RecipeDetail } from "../RecipeDetail";
import { ShopChoice } from "../ShopChoice";

/** How long "Removed … Undo" stays after a made recipe is taken out of My recipes (as My meals' own Undo). */
const UNDO_MS = 10000;

// A recipe page: one of ours (?id=) or one Pip wrote that the person saved (?mine=), made for one shop (founder 2026-11-17: "every single recipe is tailored for a
// specific store"): the one the address asks for only while none of the person's own supermarkets can make recipes (recipeShopSetFor), else their first.
// The shop in the header is a button: it opens "Shopping at" with every shop that can make recipes, those that can't make THIS one greyed; choosing one saves it
// as the person's first supermarket (the sheet says so) and works the whole recipe out again from that shop's products and labels. The other shops are loaded only
// when the Swap sheet or that choice is opened (a plain look at a recipe loads one shop), so one ingredient can be swapped to another shop's product.
// A recipe that doesn't suit the diet (a link, a plan made before the diet changed) still opens, with the amber note saying which ingredient and why (the
// 30-person audit, 20 November 2026: it used to open with no warning, saying it was "chosen for your diet"). Opened from a household's meal plan (&w=1) the diet
// checked is the home's (lib/mm/household.ts homeDiet), as the plan chose it.
// From a meal plan (team 7's link): &kcal and &p are the plan slot's meal size, so the page is fitted exactly as the plan card was; &better=1 uses the shop's
// better products as the plan did; &n (quarters allowed, 5.25) and &w=1 are a household's servings, as written.
export function RecipeScreen({ id, mine, shop: asked, have, servings, asWritten, planTarget, better }: { id: string | null; mine: string | null; shop: string | null; have?: readonly string[]; servings?: number; asWritten?: boolean; planTarget?: MealTarget | null; better?: boolean }) {
  const t = useT();
  const hydrated = useHydrated();
  const settings = useSettings();
  const saved = useStore(myRecipesStore);
  const plan = useStore(mealPlanStore);
  // a made recipe just taken out stays on screen (with Undo) until the person leaves
  const [removed, setRemoved] = useState<{ entry: SavedRecipe; index: number } | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const savedOne = mine ? (saved.find((s) => s.id === mine) ?? (removed?.entry.id === mine ? removed.entry : undefined)) : undefined;
  const manifest = useShopManifest();
  const [ownShops, setOwnShops] = useState(false);
  // a recipe Pip made opens at the shop it was made from (its products), while that shop can make recipes and the person hasn't chosen another here
  const madeFor = savedOne && !ownShops && recipeShops(manifest).some((r) => r.id === savedOne.shop) ? savedOne.shop : null;
  const ownSet = recipeShopSetFor(manifest, ownShops ? null : (asked ?? savedOne?.shop ?? null), settings.shops);
  const shopIds = madeFor ? [madeFor] : ownSet;
  const shop = shopIds[0] ?? null;
  const [retry, setRetry] = useState(0);
  // the other shops are loaded only once the Swap sheet or the shop choice asks for them
  const [wantOthers, setWantOthers] = useState(false);
  const loadIds = useMemo(() => (wantOthers ? recipeShopsFrom(manifest, shop) : shop ? [shop] : []), [wantOthers, manifest, shop]);
  const needOthers = useCallback(() => setWantOthers(true), []);
  const state = useRecipeShopSet(loadIds, retry);
  const [shopsOpen, setShopsOpen] = useState(false);
  // the diet the recipe is checked against: the home's when opened from a household's plan, else the person's own
  const home = asWritten ? plan?.home : undefined;
  const diet = useMemo(
    () => (home ? homeDiet(settings.preferences, { others: home.others.map((o, i) => ({ ...o, id: `p${i}` })), allergies: home.allergies, diets: home.diets }) : settings.preferences),
    [home, settings.preferences],
  );
  const dietKey = JSON.stringify(diet);
  const { recipe, clash } = useMemo(() => {
    const d = JSON.parse(dietKey);
    if (savedOne) return { recipe: savedToRecipe(savedOne, d), clash: [] };
    const base = RECIPES.find((r) => r.id === id);
    if (!base) return { recipe: null, clash: [] };
    const fits = recipeForDiet(base, d);
    // never a silent fall-back: the recipe as written, with what doesn't suit the diet named on the page
    return fits ? { recipe: fits, clash: [] } : { recipe: base, clash: dietClashes(base, d) };
  }, [id, savedOne, dietKey]);

  const ticked = settings.shops ?? [];
  // the person's shops recipes can't use yet (labels not read, or too few of them to make most recipes: recipeShops): the sheet says so
  const readyShops = recipeShops(manifest);
  const notReady = ticked.filter((s) => !readyShops.some((r) => r.id === s)).map((s) => manifest?.retailers.find((r) => r.id === s)?.name ?? s);
  // which shops can make THIS recipe: known once every shop is loaded (the sheet's opening loads them)
  const allLoaded = state.status === "ready" && state.files.length === recipeShopsFrom(manifest, shop).length;
  const canMake = useMemo(() => {
    if (!allLoaded || state.status !== "ready" || !recipe) return null;
    const out = new Map<string, boolean>();
    // each shop's own list as it is, not a tagged copy of it (the second pass, Xena #35: a copy of every product of every shop, made only to say yes or no; a
    // recipe can be made from a list whichever shop's it is, so the answer is the same: tests/secondPassGroceries.test.ts)
    state.files.forEach((f, i) => out.set(f.retailer, resolveRecipe(recipe, state.lists[i]!).complete));
    return out;
  }, [allLoaded, state, recipe]);
  const openShops = () => { setWantOthers(true); setShopsOpen(true); };
  const pickShop = (id: string) => {
    if (id !== shop) updateSettings({ shops: [id, ...ticked.filter((x) => x !== id)] });
    setOwnShops(true);
    setShopsOpen(false);
  };
  const shopsSheet = (
    <Sheet open={shopsOpen} onClose={() => setShopsOpen(false)} title={t("Shopping at")}>
      {/* choosing here moves the shop to the front of the person's supermarkets, so every recipe follows it: said, so it is never a surprise (audit, 20 November) */}
      <p className="text-[0.9375rem] leading-snug text-muted">{t("This recipe is made for one shop. Choose another and every ingredient, price and number changes to that shop's. It also becomes your main shop for recipes.")}</p>
      <div className="mt-3">
        <ShopChoice shops={readyShops.map((r) => ({ id: r.id, name: r.name }))} value={shop} onChange={pickShop} canMake={(id) => (canMake ? !!canMake.get(id) : id === shop)} />
      </div>
      {!canMake && <p role="status" className="mt-3 text-[0.9375rem] text-muted">{t("Checking which shops can make this recipe…")}</p>}
      {notReady.length > 0 && (
        <p role="note" className="mt-3 flex gap-2.5 rounded-[1rem] bg-[var(--fill)] p-3.5 text-[0.9375rem] leading-snug">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <span>{t("Recipes can't use {shops} yet: we haven't read enough of their products' labels.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(notReady) })}</span>
        </p>
      )}
    </Sheet>
  );

  // Remove from My recipes: taken out at once, with Undo for 10 seconds (as My meals does); the recipe stays on screen until the person leaves
  const remove = () => {
    if (!savedOne) return;
    const index = saved.findIndex((s) => s.id === savedOne.id);
    myRecipesStore.update((l) => l.filter((s) => s.id !== savedOne.id));
    setRemoved({ entry: savedOne, index: Math.max(0, index) });
    setUndoOpen(true);
  };
  const undoRemove = () => {
    if (!removed) return;
    const { entry, index } = removed;
    myRecipesStore.update((list) => (list.some((r) => r.id === entry.id) ? list : [...list.slice(0, index), entry, ...list.slice(index)]));
    setRemoved(null);
    setUndoOpen(false);
  };
  const isRemoved = !!removed && !saved.some((s) => s.id === removed.entry.id);

  const backHref = `/app/recipes${shop ? `?r=${shop}` : ""}`;
  // while it loads, the header every page has (colour meeting, 19 November 2026): Back goes to the page before when this one was reached from another page of
  // the app, else the recipes at this shop; the Settings cog far right. The recipe itself puts them on its photo (RecipeDetail).
  const back = <PageHeader back={{ href: backHref, label: t("Back to recipes") }} />;
  let body: React.ReactNode;
  if (mine && !hydrated) body = (<div>{back}<Spinner label={t("Loading recipe")} /></div>);
  else if (!recipe) body = (<div>{back}<div className="mt-4"><ErrorBox message={mine ? t("That recipe isn't saved on this device, or no longer suits your diet.") : t("That recipe isn't in the list.")} /></div></div>);
  else if (!manifest || (shop && state.status === "loading")) body = (<div>{back}<Spinner label={t("Loading recipe")} /></div>);
  else if (!shop || state.status === "error") body = (<div>{back}<div className="mt-4"><ErrorBox message={t("Couldn't load this recipe. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  else if (state.status !== "ready" || state.files[0]?.retailer !== shop) body = (<div>{back}<Spinner label={t("Loading recipe")} /></div>); // also while the shop just chosen loads: never the last shop under the new name
  else body = (
    <RecipeDetail
      key={`${recipe.id}|${shop}`}
      recipe={recipe}
      files={state.files}
      products={state.products}
      backHref={backHref}
      onChangeShops={openShops}
      onNeedOtherShops={needOthers}
      othersLoading={wantOthers && !allLoaded}
      haveKeys={have}
      startServings={servings}
      startAsWritten={asWritten}
      diet={diet === settings.preferences ? undefined : diet}
      dietClash={clash}
      planTarget={planTarget}
      better={better}
      // a recipe Pip wrote, kept in My recipes: Saved at the photo's top right, never the Settings cog (founder 2026-11-20: "Move the save into the top right
      // instead of settings"); a tap does what Remove does (taken out, said, with Undo), and Save then puts it back where it was
      kept={savedOne ? { saved: !isRemoved, onToggle: isRemoved ? undoRemove : remove } : undefined}
      actions={savedOne ? (
        isRemoved
          ? <p role="status" className="px-1 text-center text-[0.9375rem] font-semibold leading-snug">{t("Removed from My recipes.")}</p>
          : <Button full variant="danger" onClick={remove}><TrashIcon aria-hidden className="h-5 w-5" />{t("Remove from My recipes")}</Button>
      ) : undefined}
    />
  );
  return (
    <>
      {body}
      {shopsSheet}
      {undoOpen && isRemoved && removed && (
        <Toast key={removed.entry.id} duration={UNDO_MS} onClose={() => setUndoOpen(false)} onUndo={undoRemove}>
          {t("Removed “{name}” from My recipes.", { name: removed.entry.name })}
        </Toast>
      )}
    </>
  );
}
