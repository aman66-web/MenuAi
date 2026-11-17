"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { retailerName } from "@/lib/mm/groceries";
import { recipeForDiet } from "@/lib/mm/recipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeShops } from "@/lib/mm/shopProducts";
import { myRecipesStore, updateSettings } from "@/lib/mm/stores";
import { ChevronLeftIcon, InfoIcon, TrashIcon } from "../../_components/icons";
import { ShopPicker } from "../../_components/ShopPicker";
import { Button, ErrorBox, Sheet, Spinner } from "../../_components/ui";
import { backName, useBack } from "../../_lib/backNav";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShopSetFor, useRecipeShopSet } from "../../_lib/recipes";
import { useShopManifest } from "../../_lib/shopProducts";
import { RecipeDetail } from "../RecipeDetail";

// A recipe page: one of ours (?id=) or one Pip wrote that the person saved (?mine=), with the ingredients from the person's shops (the one the address asks
// for only while none of theirs can make recipes: recipeShopSetFor).
// Founder 2026-11-17: the "+" after the shops in the header opens "Where to buy the ingredients": the same list as Settings, each tick saved at once to the
// person's supermarkets, and the recipe is worked out again from the shops ticked (lib/mm/recipes.ts: the first ticked is used first, the others fill in what
// it doesn't sell). Once the shops are changed here, the address's ?r= no longer decides which comes first.
export function RecipeScreen({ id, mine, shop: asked }: { id: string | null; mine: string | null; shop: string | null }) {
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
  const state = useRecipeShopSet(shopIds, retry);
  const [shopsOpen, setShopsOpen] = useState(false);
  const dietKey = JSON.stringify(settings.preferences);
  const recipe = useMemo(() => {
    const diet = JSON.parse(dietKey);
    if (savedOne) return savedToRecipe(savedOne, diet);
    const base = RECIPES.find((r) => r.id === id);
    return base ? recipeForDiet(base, diet) ?? base : null;
  }, [id, savedOne, dietKey]);

  const ticked = settings.shops ?? [];
  // the person's shops recipes can't use yet (labels not read, or too few of them to make most recipes: recipeShops): they stay tickable, and the sheet says so
  const notReady = ticked.filter((s) => !recipeShops(manifest).some((r) => r.id === s)).map((s) => manifest?.retailers.find((r) => r.id === s)?.name ?? retailerName(s));
  const pickShops = (shops: string[]) => {
    updateSettings({ shops: shops.length ? shops : undefined });
    setOwnShops(true);
  };
  const shopsSheet = (
    <Sheet open={shopsOpen} onClose={() => setShopsOpen(false)} title={t("Where to buy the ingredients")}>
      <p className="text-[0.9375rem] leading-snug text-muted">{t("Tick the shops you'll buy from. The first one you tick is used first; the others fill in anything it doesn't sell.")}</p>
      <div className="mt-3">
        <ShopPicker value={ticked} onChange={pickShops} />
      </div>
      {notReady.length > 0 && (
        <p role="note" className="mt-3 flex gap-2.5 rounded-[1rem] bg-[var(--fill)] p-3.5 text-[0.9375rem] leading-snug">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <span>{t("Recipes can't use {shops} yet: we haven't read enough of their products' labels.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(notReady) })}</span>
        </p>
      )}
      {/* kept in view while the list scrolls under it, like the Recipes list's supermarkets */}
      <div className="sticky bottom-0 z-10 -mx-5 mt-2 bg-gradient-to-t from-white from-70% to-transparent px-5 pb-1 pt-5">
        <Button size="lg" full onClick={() => setShopsOpen(false)}>{t("Done")}</Button>
      </div>
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
  else if (state.status !== "ready") body = (<div>{back}<Spinner label={t("Loading recipe")} /></div>);
  else body = (
    <RecipeDetail
      key={recipe.id}
      recipe={recipe}
      files={state.files}
      products={state.products}
      backHref={backHref}
      onChangeShops={() => setShopsOpen(true)}
      actions={savedOne ? <Button full variant="ghost" onClick={() => { myRecipesStore.update((l) => l.filter((s) => s.id !== savedOne.id)); router.push(`/app/recipes?r=${shop}`); }}><TrashIcon className="h-5 w-5" />{t("Remove from my recipes")}</Button> : undefined}
    />
  );
  return (<>{body}{shopsSheet}</>);
}
