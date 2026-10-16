"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { recipeForDiet } from "@/lib/mm/recipes";
import { RECIPES } from "@/lib/mm/recipeBook";
import { myRecipesStore } from "@/lib/mm/stores";
import { ChevronLeftIcon, TrashIcon } from "../../_components/icons";
import { Button, ErrorBox, Spinner } from "../../_components/ui";
import { backName, useBack } from "../../_lib/backNav";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShop } from "../../_lib/recipes";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { RecipeDetail } from "../RecipeDetail";

// A recipe page: one of ours (?id=) or one Pip wrote that the person saved (?mine=), at the shop asked for or their own.
export function RecipeScreen({ id, mine, shop: asked }: { id: string | null; mine: string | null; shop: string | null }) {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const settings = useSettings();
  const saved = useStore(myRecipesStore);
  const savedOne = mine ? saved.find((s) => s.id === mine) : undefined;
  const manifest = useShopManifest();
  const shop = recipeShop(manifest, asked ?? savedOne?.shop ?? null, settings.shops);
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const dietKey = JSON.stringify(settings.preferences);
  const recipe = useMemo(() => {
    const diet = JSON.parse(dietKey);
    if (savedOne) return savedToRecipe(savedOne, diet);
    const base = RECIPES.find((r) => r.id === id);
    return base ? recipeForDiet(base, diet) ?? base : null;
  }, [id, savedOne, dietKey]);

  const backHref = `/app/recipes${shop ? `?r=${shop}` : ""}`;
  const nav = useBack(backHref); // the page before when this one was reached from another page of the app, else the recipes at this shop
  const back = (<Link href={nav.href} onClick={nav.onClick} aria-label={backName(t("Back"), t("Back to recipes"), nav.cameFromApp)} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>);
  if (mine && !hydrated) return (<div>{back}<Spinner label={t("Loading recipe")} /></div>);
  if (!recipe) return (<div>{back}<div className="mt-4"><ErrorBox message={mine ? t("That recipe isn't saved on this device, or no longer suits your diet.") : t("That recipe isn't in the list.")} /></div></div>);
  if (!manifest || (shop && state.status === "loading")) return (<div>{back}<Spinner label={t("Loading recipe")} /></div>);
  if (!shop || state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message={t("Couldn't load this recipe. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  if (state.status !== "ready") return (<div>{back}<Spinner label={t("Loading recipe")} /></div>);
  return (
    <RecipeDetail
      key={recipe.id}
      recipe={recipe}
      file={state.file}
      products={state.products}
      backHref={backHref}
      actions={savedOne ? <Button full variant="ghost" onClick={() => { myRecipesStore.update((l) => l.filter((s) => s.id !== savedOne.id)); router.push(`/app/recipes?r=${shop}`); }}><TrashIcon className="h-5 w-5" />{t("Remove from my recipes")}</Button> : undefined}
    />
  );
}
