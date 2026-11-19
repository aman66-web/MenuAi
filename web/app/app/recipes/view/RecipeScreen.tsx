"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { recipeForDiet, resolveRecipe } from "@/lib/mm/recipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeShops, recipeShopsFrom, tagShopProducts } from "@/lib/mm/shopProducts";
import { myRecipesStore, updateSettings } from "@/lib/mm/stores";
import { ChevronLeftIcon, InfoIcon, TrashIcon } from "../../_components/icons";
import { Button, ErrorBox, Sheet, Spinner } from "../../_components/ui";
import { backName, useBack } from "../../_lib/backNav";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShopSetFor, useRecipeShopSet } from "../../_lib/recipes";
import { useShopManifest } from "../../_lib/shopProducts";
import { RecipeDetail } from "../RecipeDetail";
import { ShopChoice } from "../ShopChoice";

// A recipe page: one of ours (?id=) or one Pip wrote that the person saved (?mine=), made for one shop (founder 2026-11-17: "every single recipe is tailored for a
// specific store"): the one the address asks for only while none of the person's own supermarkets can make recipes (recipeShopSetFor), else their first.
// The shop in the header is a button: it opens "Shopping at" with every shop that can make recipes, those that can't make THIS one greyed; choosing one saves it
// as the person's first supermarket and works the whole recipe out again from that shop's products and labels. The other shops are loaded only when the Swap
// sheet or that choice is opened (a plain look at a recipe loads one shop), so one ingredient can be swapped to another shop's product.
export function RecipeScreen({ id, mine, shop: asked, have }: { id: string | null; mine: string | null; shop: string | null; have?: readonly string[] }) {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const settings = useSettings();
  const saved = useStore(myRecipesStore);
  const savedOne = mine ? saved.find((s) => s.id === mine) : undefined;
  const manifest = useShopManifest();
  const [ownShops, setOwnShops] = useState(false);
  const shopIds = recipeShopSetFor(manifest, ownShops ? null : (asked ?? savedOne?.shop ?? null), settings.shops);
  const shop = shopIds[0] ?? null;
  const [retry, setRetry] = useState(0);
  // the other shops are loaded only once the Swap sheet or the shop choice asks for them
  const [wantOthers, setWantOthers] = useState(false);
  const loadIds = useMemo(() => (wantOthers ? recipeShopsFrom(manifest, shop) : shop ? [shop] : []), [wantOthers, manifest, shop]);
  const needOthers = useCallback(() => setWantOthers(true), []);
  const state = useRecipeShopSet(loadIds, retry);
  const [shopsOpen, setShopsOpen] = useState(false);
  const dietKey = JSON.stringify(settings.preferences);
  const recipe = useMemo(() => {
    const diet = JSON.parse(dietKey);
    if (savedOne) return savedToRecipe(savedOne, diet);
    const base = RECIPES.find((r) => r.id === id);
    return base ? recipeForDiet(base, diet) ?? base : null;
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
    state.files.forEach((f, i) => out.set(f.retailer, resolveRecipe(recipe, tagShopProducts([{ shop: f.retailer, products: state.lists[i]! }])).complete));
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
      <p className="text-[0.9375rem] leading-snug text-muted">{t("This recipe is made for one shop. Choose another and every ingredient, price and number changes to that shop's.")}</p>
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

  const backHref = `/app/recipes${shop ? `?r=${shop}` : ""}`;
  const nav = useBack(backHref); // the page before when this one was reached from another page of the app, else the recipes at this shop
  const back = (<Link href={nav.href} onClick={nav.onClick} aria-label={backName(t("Back"), t("Back to recipes"), nav.cameFromApp)} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>);
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
      actions={savedOne ? <Button full variant="ghost" onClick={() => { myRecipesStore.update((l) => l.filter((s) => s.id !== savedOne.id)); router.push(`/app/recipes?r=${shop}`); }}><TrashIcon className="h-5 w-5" />{t("Remove from my recipes")}</Button> : undefined}
    />
  );
  return (<>{body}{shopsSheet}</>);
}
