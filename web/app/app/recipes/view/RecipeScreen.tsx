"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addToList, formatPrice } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { RECIPES, candidates, recipeTotals, resolveRecipe, type IngredientPick, type IngredientSpec } from "@/lib/mm/recipes";
import { possessive, shopPhotoUrl, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { BasketIcon, CheckIcon, ChevronLeftIcon, InfoIcon, SwapIcon } from "../../_components/icons";
import { ItemHero } from "../../_components/Nutrition";
import { Button, ErrorBox, Sheet, Spinner } from "../../_components/ui";
import { useSettings } from "../../_lib/hooks";
import { recipeShop } from "../../_lib/recipes";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { PhotoTile } from "../../groceries/ProductPhoto";

// One recipe filled with a shop's own products. The person can swap any ingredient for another product that matches it; every total is
// plain arithmetic on the labels of the products shown, for the amounts written in the recipe (lib/mm/recipes.ts).

const amountText = (s: IngredientSpec) => `${s.amount.toLocaleString("en-GB")} ${s.unit}`;

function PickPhoto({ file, product }: { file: ShopFile; product: ShopProduct }) {
  const src = shopPhotoUrl(file, product);
  return <PhotoTile sources={src ? [{ src, from: "retailer", shop: file.retailer }] : []} />;
}

export function RecipeScreen({ id, shop: asked }: { id: string; shop: string | null }) {
  const recipe = RECIPES.find((r) => r.id === id);
  const settings = useSettings();
  const manifest = useShopManifest();
  const shop = recipeShop(manifest, asked, settings.shops);
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const products = state.status === "ready" ? state.products : null;
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [swapping, setSwapping] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const resolved = useMemo(() => (recipe && products ? resolveRecipe(recipe, products, chosen) : null), [recipe, products, chosen]);
  const totals = resolved ? recipeTotals(resolved) : null;
  const swapSpec = recipe?.ingredients.find((i) => i.key === swapping) ?? null;
  const options = useMemo(() => (swapSpec && products ? candidates(products, swapSpec, recipe?.meatFree) : []), [swapSpec, products, recipe]);

  const back = (<Link href={`/app/recipes${shop ? `?r=${shop}` : ""}`} aria-label="Back to recipes" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>);
  if (!recipe) return (<div>{back}<div className="mt-4"><ErrorBox message="That recipe isn't in the list." /></div></div>);
  if (!manifest || (shop && state.status === "loading")) return (<div>{back}<Spinner label="Loading recipe" /></div>);
  if (!shop || state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message="Couldn't load this recipe. Check your connection." onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  const file = state.status === "ready" ? state.file : null;
  if (!file || !resolved) return (<div>{back}<Spinner label="Loading recipe" /></div>);

  const prefs = settings.preferences;
  const dietNote = (prefs.avoidAllergens?.length ?? 0) > 0 || prefs.halalOnly || prefs.veganOnly;
  const picks = resolved.picks;
  const addAll = () => {
    const ready = picks.filter((p): p is IngredientPick => !!p);
    shoppingStore.update((list) => ready.reduce((l, p) => addToList(l, { gtin: p.product.gtin, shopId: p.product.id, retailer: file.retailer, name: p.product.name, brand: "", size: "", price: p.product.price, checkedOn: file.checkedOn }, new Date(), p.packs), list));
    setAdded(`Added ${ready.length} ${ready.length === 1 ? "product" : "products"} to your ${file.name} list.`);
  };

  return (
    <div>
      {back}
      <div className="mt-5">
        {totals ? (
          <ItemHero name={`${recipe.name}, per serving`} nutrients={{ calories: totals.perServing.kcal, protein: totals.perServing.protein, carbs: totals.perServing.carbs, fat: totals.perServing.fat }}>
            <p className="kicker">Recipe · {file.name}</p>
            <h1 className="text-[1.9rem] font-extrabold leading-[1.08] tracking-tight [overflow-wrap:anywhere]">{recipe.name}</h1>
            <p className="mt-1 text-muted">{recipe.blurb}</p>
            <p className="app-numbers mt-3 flex flex-wrap gap-1.5 text-sm font-semibold">
              <span className="tile rounded-full px-3 py-1">Serves {recipe.servings}</span>
              <span className="tile rounded-full px-3 py-1">{recipe.minutes} min</span>
              {recipe.meatFree && <span className="tile rounded-full px-3 py-1">No meat or fish</span>}
            </p>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-muted">Per serving</p>
          </ItemHero>
        ) : (
          <div className="hero-card rounded-[2rem] p-6">
            <p className="kicker">Recipe · {file.name}</p>
            <h1 className="text-[1.9rem] font-extrabold leading-[1.08] tracking-tight">{recipe.name}</h1>
            <p className="mt-3 text-muted">We couldn&apos;t find every ingredient at {file.name} yet, so there are no totals for this recipe.</p>
          </div>
        )}
      </div>

      {totals && (
        <div className="glass mt-3 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 rounded-3xl p-3 app-numbers">
          <div className="rounded-2xl bg-accent-soft px-4 py-3">
            <p className="text-2xl font-extrabold tracking-tight text-accent">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</p>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">a serving</p>
          </div>
          <div className="tile rounded-2xl px-4 py-3">
            <p className="text-2xl font-extrabold tracking-tight">{formatPrice(totals.basket)}</p>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">to buy it all</p>
          </div>
          <p className="col-span-full px-1 text-xs text-muted">&quot;A serving&quot; prices only what one serving uses. &quot;To buy it all&quot; is the whole packs below, at {possessive(file.name)} shelf prices; you&apos;ll have some left over.</p>
        </div>
      )}

      <section aria-labelledby="ingredients-heading" className="mt-6">
        <h2 id="ingredients-heading" className="text-xl font-extrabold tracking-tight">What to buy</h2>
        <ul className="mt-3 space-y-2.5">
          {recipe.ingredients.map((spec, i) => {
            const p = picks[i];
            return (
              <li key={spec.key} className="glass rounded-3xl p-3">
                <p className="px-1 text-sm font-bold"><span className="app-numbers text-accent">{amountText(spec)}</span> {spec.label}{spec.note ? <span className="font-medium text-muted"> ({spec.note})</span> : null}</p>
                {p ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <PickPhoto file={file} product={p.product} />
                    <Link href={`/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(p.product.id)}`} prefetch={false} className="min-w-[9rem] flex-1">
                      <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{p.product.name}</span>
                      <span className="app-numbers block text-sm text-muted">{formatPrice(p.product.price)}{p.packs > 1 ? ` · buy ${p.packs}` : ""}{p.product.nutrition ? ` · ${Math.round(p.product.nutrition.kcal)} kcal, ${p.product.nutrition.protein}g protein per 100 ${p.product.nutrition.per}${p.product.nutrition.state ? ` ${p.product.nutrition.state}` : ""}` : ""}</span>
                    </Link>
                    <button type="button" onClick={() => setSwapping(spec.key)} aria-label={`Swap ${spec.label}`} className="glass ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition active:scale-95 hover:bg-soft-strong">
                      <SwapIcon className="h-4 w-4" />Swap
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 px-1 text-sm text-muted">Not found at {file.name} yet.</p>
                )}
              </li>
            );
          })}
        </ul>
        {recipe.extras.length > 0 && (
          <p className="mt-3 px-1 text-sm text-muted"><span className="font-semibold text-foreground">Also handy:</span> {recipe.extras.join(", ")}.</p>
        )}
        {resolved.complete && (
          <div className="mt-4">
            <Button full onClick={addAll}><BasketIcon className="h-5 w-5" />Add all to my shopping list</Button>
            <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-sm font-medium text-accent">
              {added && <>{added} <Link href="/app/groceries/list" className="underline underline-offset-2">See list</Link></>}
            </p>
          </div>
        )}
      </section>

      {dietNote && (
        <p className="glass mt-4 flex gap-3 rounded-3xl p-4 text-sm"><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>We haven&apos;t read the allergens{prefs.halalOnly ? " or halal status" : ""} of these products yet. Check each pack before you buy.</span></p>
      )}

      <section aria-labelledby="method-heading" className="mt-6">
        <h2 id="method-heading" className="text-xl font-extrabold tracking-tight">How to make it</h2>
        <ol className="mt-3 space-y-2.5">
          {recipe.method.map((step, i) => (
            <li key={i} className="glass flex gap-3 rounded-3xl p-4">
              <span aria-hidden className="app-numbers grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sun font-extrabold text-on-accent">{i + 1}</span>
              <span className="pt-1 leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
        The numbers add up each product&apos;s own label (per 100 g or ml as sold, or drained where it says so) for the amounts above, before cooking. What you add yourself isn&apos;t counted.
        Prices are {possessive(file.name)} shelf prices, checked {formatDate(file.checkedOn)}, and vary by store. Allergens aren&apos;t shown for these products yet: check each pack. Recipe by Menu Math. Not affiliated with {file.name}.
      </p>

      <Sheet open={!!swapSpec} onClose={() => setSwapping(null)} title={swapSpec ? `Swap ${swapSpec.label.toLowerCase()}` : "Swap"}>
        {swapSpec && (
          <>
            <p className="mb-3 text-sm text-muted">Products at {file.name} that fit this recipe, cheapest to buy first. The recipe uses {amountText(swapSpec)}.</p>
            <ul className="space-y-2">
              {options.map((o) => {
                const selected = picks[recipe.ingredients.indexOf(swapSpec)]?.product.id === o.product.id;
                return (
                  <li key={o.product.id}>
                    <button type="button" aria-pressed={selected} onClick={() => { setChosen((c) => ({ ...c, [swapSpec.key]: o.product.id })); setSwapping(null); setAdded(null); }} className={`flex w-full items-center gap-3 rounded-3xl p-3 text-left transition active:scale-[0.99] ${selected ? "bg-accent-soft ring-2 ring-inset ring-accent" : "glass hover:bg-soft-strong"}`}>
                      <PickPhoto file={file} product={o.product} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{o.product.name}</span>
                        <span className="app-numbers block text-sm text-muted">{formatPrice(o.basketCost)}{o.packs > 1 ? ` for ${o.packs}` : ""}{o.usedCost !== null ? ` · ${formatPrice(o.usedCost / recipe.servings)} a serving` : ""}</span>
                        {o.product.nutrition && <span className="app-numbers block text-sm text-muted">{Math.round(o.product.nutrition.kcal)} kcal · {o.product.nutrition.protein}g protein per 100 {o.product.nutrition.per}</span>}
                      </span>
                      {selected && <CheckIcon className="h-5 w-5 shrink-0 text-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Sheet>
    </div>
  );
}
