"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addToList, formatPrice } from "@/lib/mm/groceries";
import { formatDate, formatInt } from "@/lib/mm/format";
import { tk, type T } from "@/lib/mm/i18n";
import { candidates, fitRecipe, isMeatFree, recipeTotals, resolveRecipe, subSpec, withSubstitutes, type IngredientPick, type IngredientSpec, type Recipe } from "@/lib/mm/recipes";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { shopPhotoUrl, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { BasketIcon, CheckIcon, InfoIcon, SwapIcon } from "../_components/icons";
import { ItemHero } from "../_components/Nutrition";
import { Button, Sheet } from "../_components/ui";
import { useSettings } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { PhotoTile } from "../groceries/ProductPhoto";
import { targetSentence } from "./MealPicker";

// One recipe filled with a shop's own products, fitted to the person's meal (Recipes › Your meal) unless they ask to see it as written.
// They can swap any ingredient for another product that matches, or for one of the recipe's substitutes (also used on its own when the
// shop doesn't sell an ingredient); every figure is arithmetic on the labels of the products shown, for the amounts shown (lib/mm/recipes.ts). Used for our recipes, Pip's saved recipes and a recipe Pip has just written.

const amountText = (s: IngredientSpec) => `${formatInt(s.amount)} ${s.unit}`;

function PickPhoto({ file, product }: { file: ShopFile; product: ShopProduct }) {
  const src = shopPhotoUrl(file, product);
  return <PhotoTile sources={src ? [{ src, from: "retailer", shop: file.retailer }] : []} />;
}

const NOT_ON_LABEL = tk("not on every label");

/** An ingredient's note in the reader's language: the counted ones ("about 2 eggs", made when a recipe is fitted) with their number as a value. */
function noteText(t: T, note: string): string {
  const m = /^about (\d+) (egg|eggs|wrap|wraps)$/.exec(note);
  if (!m) return t(note);
  const n = Number(m[1]);
  switch (m[2]) {
    case "egg": return t("about 1 egg");
    case "eggs": return t("about {n} eggs", { n });
    case "wrap": return t("about 1 wrap");
    default: return t("about {n} wraps", { n });
  }
}

export function RecipeDetail({ recipe, file, products, actions }: { recipe: Recipe; file: ShopFile; products: readonly ShopProduct[]; actions?: React.ReactNode }) {
  const t = useT();
  const poss = usePossessive();
  // our recipe book's words are translated; what Pip wrote with AI is shown as it wrote it. Ingredient labels and notes come from our pantry either way.
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const settings = useSettings();
  // snacks are shown as written: a meal-sized target would double them
  const targetKey = JSON.stringify(recipe.meal === "snack" ? null : mealTargetFor(settings));
  const target = useMemo(() => JSON.parse(targetKey) as ReturnType<typeof mealTargetFor>, [targetKey]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Record<string, string>>({});
  const [asWritten, setAsWritten] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const meatFree = isMeatFree(recipe);
  const withSubs = useMemo(() => withSubstitutes(recipe, subs), [recipe, subs]);

  const view = useMemo(() => {
    const fitted = target && !asWritten ? fitRecipe(withSubs, products, chosen, target) : null;
    if (fitted) return { recipe: fitted.recipe, resolved: fitted.resolved, totals: fitted.totals, fitted: fitted.changed };
    const resolved = resolveRecipe(withSubs, products, chosen);
    return { recipe: withSubs, resolved, totals: recipeTotals(resolved), fitted: false };
  }, [withSubs, products, chosen, target, asWritten]);
  const { totals } = view;
  const picks = view.resolved.picks;
  const swapIndex = view.recipe.ingredients.findIndex((i) => i.key === swapping);
  // what the row shows: the pick's own spec when the shop lacked the ingredient and a substitute stands in
  const swapSpec = swapIndex >= 0 ? (picks[swapIndex]?.spec ?? view.recipe.ingredients[swapIndex]!) : null;
  const options = useMemo(() => (swapSpec ? candidates(products, swapSpec, meatFree) : []), [swapSpec, products, meatFree]);
  // the other things the recipe can use instead (the ingredient as written first, when something else is in its place), only those this shop sells
  const insteadOptions = useMemo(() => {
    if (!swapSpec) return [];
    const written = recipe.ingredients.find((x) => x.key === swapSpec.key);
    if (!written) return [];
    const out: Array<{ subKey: string | null; spec: IngredientSpec }> = [];
    if (swapSpec.subFor) out.push({ subKey: null, spec: written });
    for (const sub of written.subs ?? []) {
      if (sub.key === swapSpec.pantry) continue;
      const s2 = subSpec(written, sub, recipe.halal);
      if (s2) out.push({ subKey: sub.key, spec: s2 });
    }
    return out.filter((o) => candidates(products, o.spec, meatFree).length > 0);
  }, [swapSpec, recipe, products, meatFree]);
  const chooseInstead = (key: string, subKey: string | null) => {
    setSubs((c) => { const n = { ...c }; if (subKey) n[key] = subKey; else delete n[key]; return n; });
    setChosen((c) => { const n = { ...c }; delete n[key]; return n; });
    setSwapping(null);
    setAdded(null);
  };

  const prefs = settings.preferences;
  const dietNote = (prefs.avoidAllergens?.length ?? 0) > 0 || prefs.halalOnly || prefs.veganOnly || prefs.vegetarianOnly;
  const addAll = () => {
    const ready = picks.filter((p): p is IngredientPick => !!p);
    shoppingStore.update((list) => ready.reduce((l, p) => addToList(l, { gtin: p.product.gtin, shopId: p.product.id, retailer: file.retailer, name: p.product.name, brand: "", size: "", price: p.product.price, checkedOn: file.checkedOn }, new Date(), p.packs), list));
    setAdded(ready.length === 1 ? t("Added 1 product to your {shop} list.", { shop: file.name }) : t("Added {n} products to your {shop} list.", { n: ready.length, shop: file.name }));
  };
  const notOnLabel = t(NOT_ON_LABEL);
  const rows: Array<[string, string, boolean?]> = totals
    ? [
        [t("Energy"), `${formatInt(totals.perServing.kcal)} kcal${totals.label.kj !== null ? ` · ${formatInt(totals.label.kj)} kJ` : ""}`],
        [t("Fat"), `${totals.perServing.fat} g`],
        [t("of which saturates"), totals.label.saturates !== null ? `${totals.label.saturates} g` : notOnLabel, true],
        [t("Carbohydrate"), `${totals.perServing.carbs} g`],
        [t("of which sugars"), totals.label.sugars !== null ? `${totals.label.sugars} g` : notOnLabel, true],
        [t("Fibre"), totals.label.fibre !== null ? `${totals.label.fibre} g` : notOnLabel],
        [t("Protein"), `${totals.perServing.protein} g`],
        [t("Salt"), totals.label.salt !== null ? `${totals.label.salt} g` : notOnLabel],
      ]
    : [];

  const image = RECIPE_IMAGES[recipe.id];
  return (
    <div>
      {image && (
        <figure className="mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it */}
          <img src={image} alt={t("An illustration of {name}", { name: rt(recipe.name).toLowerCase() })} width={800} height={600} decoding="async" className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-sm" />
          <figcaption className="mt-1.5 px-2 text-xs text-muted">{t("Illustration made with AI, not a photo of the products below.")}</figcaption>
        </figure>
      )}
      <div className="mt-5">
        {totals ? (
          <ItemHero name={t("{name}, per serving", { name: rt(recipe.name) })} nutrients={{ calories: totals.perServing.kcal, protein: totals.perServing.protein, carbs: totals.perServing.carbs, fat: totals.perServing.fat }}>
            <p className="kicker">{recipe.ai ? t("Made by Pip") : t("Recipe")} · {file.name}</p>
            <h1 className="text-[1.9rem] font-extrabold leading-[1.08] tracking-tight [overflow-wrap:anywhere]">{rt(recipe.name)}</h1>
            {recipe.blurb && <p className="mt-1 text-muted">{rt(recipe.blurb)}</p>}
            <p className="app-numbers mt-3 flex flex-wrap gap-1.5 text-sm font-semibold">
              <span className="tile rounded-full px-3 py-1">{t("Serves {n}", { n: recipe.servings })}</span>
              <span className="tile rounded-full px-3 py-1">{t("{n} min", { n: recipe.minutes })}</span>
              {meatFree && <span className="tile rounded-full px-3 py-1">{t("No meat or fish")}</span>}
            </p>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-muted">{t("Per serving")}</p>
          </ItemHero>
        ) : (
          <div className="hero-card rounded-[2rem] p-6">
            <p className="kicker">{recipe.ai ? t("Made by Pip") : t("Recipe")} · {file.name}</p>
            <h1 className="text-[1.9rem] font-extrabold leading-[1.08] tracking-tight">{rt(recipe.name)}</h1>
            <p className="mt-3 text-muted">{t("We couldn't find every ingredient at {shop} yet, so there are no totals for this recipe.", { shop: file.name })}</p>
          </div>
        )}
      </div>

      {totals && !target && recipe.meal === "snack" && mealTargetFor(settings) && (
        <p className="glass mt-3 rounded-3xl p-4 text-sm font-semibold">{t("Snacks are shown as written, not fitted to your meal size.")}</p>
      )}

      {totals && target && (
        <div className="glass mt-3 rounded-3xl p-4">
          <p className="app-numbers text-sm font-semibold">{asWritten ? t("Showing the recipe as written.") : view.fitted ? `${targetSentence(t, target, "this")} ${t("The amounts below are changed to fit.")}` : t("This recipe already fits your meal, so nothing is changed.")}</p>
          <button type="button" onClick={() => setAsWritten((v) => !v)} className="mt-1 min-h-11 text-sm font-bold text-accent underline underline-offset-4">{asWritten ? t("Fit it to my meal") : t("Show it as written")}</button>
        </div>
      )}

      {totals && (
        <div className="glass mt-3 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 rounded-3xl p-3 app-numbers">
          <div className="rounded-2xl bg-accent-soft px-4 py-3">
            <p className="text-2xl font-extrabold tracking-tight text-accent">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</p>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{t("a serving")}</p>
          </div>
          <div className="tile rounded-2xl px-4 py-3">
            <p className="text-2xl font-extrabold tracking-tight">{formatPrice(totals.basket)}</p>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{t("to buy it all")}</p>
          </div>
          <p className="col-span-full px-1 text-xs text-muted">{t("\"A serving\" prices only what one serving uses. \"To buy it all\" is the whole packs below, at {shop} shelf prices; you'll have some left over.", { shop: poss(file.name) })}</p>
        </div>
      )}

      {totals && (
        <section aria-labelledby="label-heading" className="glass mt-3 rounded-3xl p-4">
          <h2 id="label-heading" className="text-lg font-extrabold tracking-tight">{t("Full nutrition per serving")}</h2>
          <dl className="app-numbers mt-2 divide-y divide-line">
            {rows.map(([label, value, sub]) => (
              <div key={label} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
                <dt className={`min-w-0 ${sub ? "ps-4 text-muted" : "font-semibold"}`}>{label}</dt>
                <dd className={`ms-auto text-end ${value === notOnLabel ? "text-sm italic text-muted" : "font-bold"}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">{t("Added up from each product's own label for the amounts below, before cooking. \"Not on every label\" means one of the products doesn't print that figure, so we don't give a total for it.")}</p>
        </section>
      )}

      <section aria-labelledby="ingredients-heading" className="mt-6">
        <h2 id="ingredients-heading" className="text-xl font-extrabold tracking-tight">{t("What to buy")}</h2>
        <ul className="mt-3 space-y-2.5">
          {view.recipe.ingredients.map((written, i) => {
            const p = picks[i];
            const spec = p?.spec ?? written;
            return (
              <li key={spec.key} className="glass rounded-3xl p-3">
                <p className="px-1 text-[15px] font-bold"><span className="app-numbers text-accent">{amountText(spec)}</span> {t(spec.label)}{spec.note ? <span className="font-medium text-muted"> ({noteText(t, spec.note)})</span> : null}</p>
                {spec.subFor && (
                  <p className="mt-0.5 px-1 text-sm text-muted">{written.original || written.subFor ? t("Instead of {name}.", { name: t(spec.subFor).toLowerCase() }) : t("{shop} doesn't sell {name} that fits, so this uses {sub} instead.", { shop: file.name, name: t(spec.subFor).toLowerCase(), sub: t(spec.label).toLowerCase() })}</p>
                )}
                {p ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <PickPhoto file={file} product={p.product} />
                    <Link href={`/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(p.product.id)}`} prefetch={false} className="min-w-[9rem] flex-1">
                      <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{p.product.name}</span>
                      <span className="app-numbers block text-sm text-muted">{formatPrice(p.product.price)}{p.packs > 1 ? ` · ${t("buy {n}", { n: p.packs })}` : ""}</span>
                    </Link>
                    <button type="button" onClick={() => setSwapping(spec.key)} aria-label={t("Swap {name}", { name: t(spec.label) })} className="glass ms-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95 hover:bg-soft-strong">
                      <SwapIcon className="h-4 w-4" />{t("Swap")}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 px-1 text-sm text-muted">{t("Not found at {shop} yet.", { shop: file.name })}</p>
                )}
              </li>
            );
          })}
        </ul>
        {recipe.extras.length > 0 && (
          <p className="mt-3 px-1 text-sm text-muted"><span className="font-semibold text-foreground">{t("Also handy (not counted):")}</span> {recipe.extras.map(rt).join(", ")}.</p>
        )}
        {view.resolved.complete && (
          <div className="mt-4">
            <Button full className="min-h-14 text-base" onClick={addAll}><BasketIcon className="h-5 w-5" />{t("Add all to my shopping list")}</Button>
            <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-sm font-medium text-accent">
              {added && <>{added} <Link href="/app/groceries/list" className="underline underline-offset-2">{t("See list")}</Link></>}
            </p>
          </div>
        )}
      </section>

      {dietNote && (
        <p className="glass mt-4 flex gap-3 rounded-3xl p-4 text-sm"><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{prefs.halalOnly ? t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen or halal labels, so check each pack before you buy.") : t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen labels, so check each pack before you buy.")}</span></p>
      )}

      <section aria-labelledby="method-heading" className="mt-6">
        <h2 id="method-heading" className="text-xl font-extrabold tracking-tight">{t("How to make it")}</h2>
        <ol className="mt-3 space-y-2.5">
          {recipe.method.map((step, i) => (
            <li key={i} className="glass flex gap-3 rounded-3xl p-4">
              <span aria-hidden className="app-numbers grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sun font-extrabold text-on-accent">{i + 1}</span>
              <span className="pt-1 text-[17px] leading-snug">{rt(step)}</span>
            </li>
          ))}
        </ol>
      </section>

      {recipe.ai && (
        <p className="glass mt-4 flex gap-3 rounded-3xl p-4 text-sm"><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{t("Pip wrote this recipe with AI from real products at {shop}; the numbers come from the products' labels. Read the steps before you cook, and cook meat and fish until piping hot.", { shop: file.name })}</span></p>
      )}

      {actions && <div className="mt-5 space-y-2">{actions}</div>}

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
        {t("Prices are {shop} shelf prices, checked {date}, and vary by store.", { shop: poss(file.name), date: formatDate(file.checkedOn, t) })} {recipe.ai ? t("Recipe written by Pip with AI.") : t("Recipe by {app}.", { app: site.name })} {t("Not affiliated with {shop}.", { shop: file.name })}
      </p>

      <Sheet open={!!swapSpec} onClose={() => setSwapping(null)} title={swapSpec ? t("Swap {name}", { name: t(swapSpec.label).toLowerCase() }) : t("Swap")}>
        {swapSpec && (
          <>
            {insteadOptions.length > 0 && (
              <section aria-labelledby="instead-heading" className="mb-5">
                <h3 id="instead-heading" className="text-base font-extrabold">{t("Use something else instead")}</h3>
                <ul className="mt-2 space-y-2">
                  {insteadOptions.map((o) => (
                    <li key={o.subKey ?? "written"}>
                      <button type="button" onClick={() => chooseInstead(swapSpec.key, o.subKey)} className="glass flex min-h-14 w-full items-center gap-3 rounded-3xl p-3 text-start transition active:scale-[0.99] hover:bg-soft-strong">
                        <SwapIcon className="h-5 w-5 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{t(o.spec.label)}</span>
                          <span className="app-numbers block text-sm text-muted">{o.subKey ? t("{amount} in the recipe", { amount: amountText(o.spec) }) : t("As the recipe has it, {amount}", { amount: amountText(o.spec) })}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <h3 className="text-base font-extrabold">{insteadOptions.length > 0 ? t("Or pick a different product") : t("Pick a different product")}</h3>
            <p className="mb-3 mt-1 text-sm text-muted">{t("Products at {shop} that fit this recipe, cheapest to buy first. It uses {amount}.", { shop: file.name, amount: amountText(swapSpec) })}</p>
            <ul className="space-y-2">
              {options.map((o) => {
                const selected = picks[swapIndex]?.product.id === o.product.id;
                return (
                  <li key={o.product.id}>
                    <button type="button" aria-pressed={selected} onClick={() => { setChosen((c) => ({ ...c, [swapSpec.key]: o.product.id })); setSwapping(null); setAdded(null); }} className={`flex w-full items-center gap-3 rounded-3xl p-3 text-start transition active:scale-[0.99] ${selected ? "bg-accent-soft ring-2 ring-inset ring-accent" : "glass hover:bg-soft-strong"}`}>
                      <PickPhoto file={file} product={o.product} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{o.product.name}</span>
                        <span className="app-numbers block text-sm text-muted">{formatPrice(o.basketCost)}{o.packs > 1 ? ` ${t("for {n}", { n: o.packs })}` : ""}{o.usedCost !== null ? ` · ${t("{price} a serving", { price: formatPrice(o.usedCost / recipe.servings) })}` : ""}</span>
                        {o.product.nutrition && <span className="app-numbers block text-sm text-muted">{Math.round(o.product.nutrition.kcal)} kcal · {t("{n} g protein per 100 {unit}", { n: o.product.nutrition.protein, unit: o.product.nutrition.per })}</span>}
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
