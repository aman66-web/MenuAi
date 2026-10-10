"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { formatPrice } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { possessive } from "@/lib/mm/shopProducts";
import { ChevronLeftIcon, ChevronRightIcon, PotIcon } from "../_components/icons";
import { PipSays } from "../_components/Mascot";
import { Chip, EmptyState, ErrorBox, Segmented, Spinner } from "../_components/ui";
import { useSettings } from "../_lib/hooks";
import { recipeShop, useRecipeCards, type RecipeCard } from "../_lib/recipes";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";

// Recipes from your shop (founder 2026-10-10: "craft recipes based on where you shop"): every ingredient is a real product at that supermarket,
// with its shelf price and the nutrition its own page prints. Totals are plain arithmetic on those labels (lib/mm/recipes.ts).

type Sort = "protein" | "price" | "kcal";
const SORTS: ReadonlyArray<{ value: Sort; label: string }> = [
  { value: "protein", label: "Most protein" },
  { value: "price", label: "Lowest price" },
  { value: "kcal", label: "Fewest kcal" },
];

function sortCards(cards: RecipeCard[], sort: Sort): RecipeCard[] {
  const key = (c: RecipeCard): number => {
    const t = c.totals!;
    return sort === "protein" ? -t.perServing.protein : sort === "kcal" ? t.perServing.kcal : (t.costPerServing ?? Infinity);
  };
  return [...cards].sort((a, b) => key(a) - key(b) || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
}

function RecipesScreen() {
  const asked = useSearchParams().get("r");
  const settings = useSettings();
  const manifest = useShopManifest();
  const [picked, setPicked] = useState<string | null>(null);
  const shop = recipeShop(manifest, picked ?? asked, settings.shops);
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const products = state.status === "ready" ? state.products : null;
  const cards = useRecipeCards(products);
  const [meatFree, setMeatFree] = useState(false);
  const [sort, setSort] = useState<Sort>("protein");
  const shown = useMemo(() => sortCards(cards.filter((c) => c.totals && (!meatFree || c.recipe.meatFree)), sort), [cards, meatFree, sort]);
  const shopName = manifest?.retailers.find((r) => r.id === shop)?.name ?? "";

  return (
    <div>
      <Link href="/app/groceries" aria-label="Back to groceries" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">Recipes <span className="serif-em sun-text pr-0.5">from your shop</span></h1>
      <div className="mt-4">
        <PipSays mood="point" size={76}>
          {shopName ? <>Every ingredient is a real product at {shopName}, with its price and the numbers from its label.</> : <>Every ingredient is a real product at your supermarket, with its price and the numbers from its label.</>}
        </PipSays>
      </div>

      {manifest && manifest.retailers.length > 1 && shop && (
        <div className="mt-4">
          <Segmented label="Supermarket" value={shop} options={manifest.retailers.map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setPicked(v)} />
        </div>
      )}

      <div role="group" aria-label="Filters" className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        <Chip selected={!meatFree} onClick={() => setMeatFree(false)}>All recipes</Chip>
        <Chip selected={meatFree} onClick={() => setMeatFree(true)}>No meat or fish</Chip>
      </div>
      <div className="mt-3">
        <Segmented label="Sort recipes" value={sort} options={SORTS} onChange={setSort} />
      </div>

      {!manifest || (shop && state.status === "loading") ? (
        <Spinner label="Loading recipes" />
      ) : !shop ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title="No supermarket list yet." body="Recipes appear once we've read a supermarket's products and prices." /></div>
      ) : state.status === "error" ? (
        <div className="mt-5"><ErrorBox message="Couldn't load the recipes. Check your connection." onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : shown.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title="No recipes here yet." body={`We haven't read enough of ${possessive(shopName)} product pages to fill these recipes yet.`} /></div>
      ) : (
        <ul className="stagger mt-5 grid gap-3 sm:grid-cols-2">
          {shown.map(({ recipe, totals }) => (
            <li key={recipe.id} className="min-w-0">
              <Link href={`/app/recipes/view?id=${recipe.id}&r=${shop}`} prefetch={false} className="glass lift flex h-full min-w-0 flex-col rounded-3xl p-4">
                <span className="flex items-start gap-3">
                  <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 rounded-2xl"><PotIcon className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere]">{recipe.name}</span>
                    <span className="mt-0.5 block text-sm text-muted">{recipe.blurb}</span>
                  </span>
                  <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-muted" />
                </span>
                {totals && (
                  <span className="app-numbers mt-3 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 text-center">
                    <span className="inset-card rounded-2xl px-2 py-2"><span className="block text-lg font-extrabold leading-tight">{totals.perServing.kcal}</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">kcal</span></span>
                    <span className="rounded-2xl bg-accent-soft px-2 py-2"><span className="block text-lg font-extrabold leading-tight text-accent">{Math.round(totals.perServing.protein)}g</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">protein</span></span>
                    <span className="inset-card rounded-2xl px-2 py-2"><span className="block text-lg font-extrabold leading-tight">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">each</span></span>
                  </span>
                )}
                <span className="app-numbers mt-2 block text-xs text-muted">Per serving · serves {recipe.servings} · {recipe.minutes} min{recipe.meatFree ? " · no meat or fish" : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {state.status === "ready" && (
        <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
          Prices from {possessive(state.file.name)} website, checked {formatDate(state.file.checkedOn)}; nutrition from each product&apos;s own page{state.file.nutritionCheckedOn ? `, checked ${formatDate(state.file.nutritionCheckedOn)}` : ""}.
          &quot;Each&quot; prices only the amounts a serving uses. Vegetables, oil and seasoning you add aren&apos;t counted. Not affiliated with {state.file.name}.
        </p>
      )}
    </div>
  );
}

export default function RecipesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecipesScreen />
    </Suspense>
  );
}
