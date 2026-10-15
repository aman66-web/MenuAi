"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addToList, formatPrice } from "@/lib/mm/groceries";
import { formatDate, formatInt, nutrientAriaLabel } from "@/lib/mm/format";
import { tk, type T } from "@/lib/mm/i18n";
import { candidates, fitRecipe, isMeatFree, recipeTotals, resolveRecipe, scaleServings, subSpec, withSubstitutes, type IngredientPick, type IngredientSpec, type Recipe } from "@/lib/mm/recipes";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { PANTRY } from "@/lib/mm/pantry";
import { cupboardStore, savedRecipesStore, shoppingStore, toggleCupboard, toggleSavedRecipe } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, HeartIcon, InfoIcon, LeafIcon, MinusIcon, PlusIcon, SwapIcon, TodayIcon } from "../_components/icons";
import { Button, Sheet, radioKeyNav } from "../_components/ui";
import { useSettings, useStore } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { PhotoTile } from "../groceries/ProductPhoto";
import { targetSentence } from "./MealPicker";
import { RecipeHeroArt } from "./RecipeTile";

// One recipe filled with a shop's own products, fitted to the person's meal (Recipes › Your meal) unless they ask to see it as written.
// They can swap any ingredient for another product that matches, or for one of the recipe's substitutes (also used on its own when the
// shop doesn't sell an ingredient); every figure is arithmetic on the labels of the products shown, for the amounts shown (lib/mm/recipes.ts). Used for our recipes, Pip's saved recipes and a recipe Pip has just written.
// Laid out like the founder's reference picture (2026-10-14): the dish big at the top with Back and a heart, a sheet with the name in the
// middle, "− Serves 4 +", the numbers as chips, then Ingredients and Method as two tabs and "Add all to my shopping list" kept in reach.

const amountText = (s: IngredientSpec) => `${formatInt(s.amount)} ${s.unit}`;

function PickPhoto({ file, product }: { file: ShopFile; product: ShopProduct }) {
  return <PhotoTile sources={shopPhotoSources(file, product)} />;
}

const NOT_ON_LABEL = tk("not on every label");
const MAX_SERVINGS = 12; // scaleServings keeps a recipe between 1 and 12 people

type RecipeTab = "ingredients" | "method";
const TABS: ReadonlyArray<{ value: RecipeTab; label: string }> = [
  { value: "ingredients", label: tk("Ingredients") },
  { value: "method", label: tk("Method") },
];

// Counted notes ("about 2 eggs", "about 1 pepper"), one pair per pantry kind sold or used by the piece, so each language can say them properly.
const PIECE_NOTES: Record<string, [string, string]> = {
  egg: [tk("about 1 egg"), tk("about {n} eggs")], wrap: [tk("about 1 wrap"), tk("about {n} wraps")], onion: [tk("about 1 onion"), tk("about {n} onions")],
  "red onion": [tk("about 1 red onion"), tk("about {n} red onions")], pepper: [tk("about 1 pepper"), tk("about {n} peppers")],
  carrot: [tk("about 1 carrot"), tk("about {n} carrots")], cucumber: [tk("about 1 cucumber"), tk("about {n} cucumbers")],
  banana: [tk("about 1 banana"), tk("about {n} bananas")], apple: [tk("about 1 apple"), tk("about {n} apples")], clove: [tk("about 1 clove"), tk("about {n} cloves")],
};
const PIECE_WORD = new Map<string, string>([...PANTRY.values()].flatMap((k) => (k.pieceName ? [[k.pieceName[0], k.pieceName[0]], [k.pieceName[1], k.pieceName[0]]] as Array<[string, string]> : [])));

/** An ingredient's note in the reader's language: the counted ones ("about 2 eggs", "about 1 pepper") with their number as a value. */
function noteText(t: T, note: string): string {
  const m = /^about (\d+) ([a-z ]+)$/.exec(note);
  const pair = m ? PIECE_NOTES[PIECE_WORD.get(m[2]!) ?? ""] : undefined;
  if (!m || !pair) return t(note);
  const n = Number(m[1]);
  return n === 1 ? t(pair[0]) : t(pair[1], { n });
}

// The white buttons that sit on the picture (Back, Save), the same in light and dark like the reference's.
const ON_PICTURE = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white/92 text-base font-bold text-[#0b1a12] shadow-[0_8px_20px_-10px_rgba(0,0,0,0.55)] backdrop-blur transition active:scale-95 hover:bg-white";

export function RecipeDetail({ recipe, file, products, backHref, actions }: { recipe: Recipe; file: ShopFile; products: readonly ShopProduct[]; backHref: string; actions?: React.ReactNode }) {
  const t = useT();
  const poss = usePossessive();
  // our recipe book's words are translated; what Pip wrote with AI is shown as it wrote it. Ingredient labels and notes come from our pantry either way.
  const rt = (s: string) => (recipe.ai ? s : t(s));
  const settings = useSettings();
  // snacks are shown as written: a meal-sized target would double them
  const targetKey = JSON.stringify(recipe.meal === "snack" ? null : mealTargetFor(settings));
  const target = useMemo(() => JSON.parse(targetKey) as ReturnType<typeof mealTargetFor>, [targetKey]);
  const [servings, setServings] = useState(recipe.servings);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [subs, setSubs] = useState<Record<string, string>>({});
  const [asWritten, setAsWritten] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [tab, setTab] = useState<RecipeTab>("ingredients");
  const [detail, setDetail] = useState(false);
  const haveList = useStore(cupboardStore);
  const have = useMemo(() => new Set(haveList), [haveList]);
  const meatFree = isMeatFree(recipe);
  // cooking for more or fewer people scales every amount with them (eggs, peppers and cloves stay whole), so a serving stays the same
  const scaled = useMemo(() => scaleServings(recipe, servings), [recipe, servings]);
  const withSubs = useMemo(() => withSubstitutes(scaled, subs), [scaled, subs]);

  const view = useMemo(() => {
    const fitted = target && !asWritten ? fitRecipe(withSubs, products, chosen, target) : null;
    if (fitted) return { recipe: fitted.recipe, resolved: fitted.resolved, totals: fitted.totals, fitted: fitted.changed };
    const resolved = resolveRecipe(withSubs, products, chosen);
    return { recipe: withSubs, resolved, totals: recipeTotals(resolved), fitted: false };
  }, [withSubs, products, chosen, target, asWritten]);
  // the basket leaves out the cupboard items the person has ticked; a serving's price and numbers never do
  const totals = useMemo(() => (view.totals ? recipeTotals(view.resolved, have) : null), [view, have]);
  const picks = view.resolved.picks;
  const hasIt = (spec: IngredientSpec) => !!spec.cupboard && !!spec.pantry && have.has(spec.pantry);
  const swapIndex = view.recipe.ingredients.findIndex((i) => i.key === swapping);
  // what the row shows: the pick's own spec when the shop lacked the ingredient and a substitute stands in
  const swapSpec = swapIndex >= 0 ? (picks[swapIndex]?.spec ?? view.recipe.ingredients[swapIndex]!) : null;
  const options = useMemo(() => (swapSpec ? candidates(products, swapSpec, meatFree) : []), [swapSpec, products, meatFree]);
  // the other things the recipe can use instead (the ingredient as written first, when something else is in its place), only those this shop sells
  const insteadOptions = useMemo(() => {
    if (!swapSpec) return [];
    const written = scaled.ingredients.find((x) => x.key === swapSpec.key);
    if (!written) return [];
    const out: Array<{ subKey: string | null; spec: IngredientSpec }> = [];
    if (swapSpec.subFor) out.push({ subKey: null, spec: written });
    for (const sub of written.subs ?? []) {
      if (sub.key === swapSpec.pantry) continue;
      const s2 = subSpec(written, sub, scaled.halal);
      if (s2) out.push({ subKey: sub.key, spec: s2 });
    }
    return out.filter((o) => candidates(products, o.spec, meatFree).length > 0);
  }, [swapSpec, scaled, products, meatFree]);
  const chooseInstead = (key: string, subKey: string | null) => {
    setSubs((c) => { const n = { ...c }; if (subKey) n[key] = subKey; else delete n[key]; return n; });
    setChosen((c) => { const n = { ...c }; delete n[key]; return n; });
    setSwapping(null);
    setAdded(null);
  };
  const changeServings = (by: number) => {
    setServings((n) => Math.max(1, Math.min(MAX_SERVINGS, n + by)));
    setAdded(null);
  };

  const prefs = settings.preferences;
  const dietNote = (prefs.avoidAllergens?.length ?? 0) > 0 || prefs.halalOnly || prefs.veganOnly || prefs.vegetarianOnly;
  const addAll = () => {
    const ready = picks.filter((p): p is IngredientPick => !!p && !hasIt(p.spec));
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
  // the three published weights side by side, as in the dish pages' bar (grams as worked out from the labels, nothing converted)
  const grams = totals ? [totals.perServing.protein, totals.perServing.carbs, totals.perServing.fat] : null;
  const gramTotal = grams ? grams[0]! + grams[1]! + grams[2]! : 0;
  const kicker = `${recipe.ai ? t("Made by Pip") : t("Recipe")} · ${file.name}`;

  return (
    <div>
      {/* the picture runs to the edges and under the status bar, like the reference */}
      <div className="relative -mx-5" style={{ marginTop: "calc(-1 * max(1.25rem, env(safe-area-inset-top)))" }}>
        <RecipeHeroArt id={recipe.id} name={recipe.name} label={rt(recipe.name)} meal={recipe.meal} />
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href={backHref} aria-label={t("Back to recipes")} className={`${ON_PICTURE} ps-2.5 pe-4`}><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
          {!recipe.ai && <SaveRecipeButton id={recipe.id} />}
        </div>
      </div>

      <div className="relative -mx-5 -mt-9 rounded-t-[2.25rem] bg-background px-5 pt-3 shadow-[0_-14px_30px_-24px_rgba(0,0,0,0.55)]">
        <span aria-hidden className="mx-auto block h-1.5 w-12 rounded-full bg-[var(--ring-track)]" />
        <div className="mt-4 text-center">
          <p className="kicker">{kicker}</p>
          <h1 className="mt-1 text-[1.9rem] font-extrabold leading-[1.08] tracking-tight [overflow-wrap:anywhere]">{rt(recipe.name)}</h1>
          {recipe.blurb && <p className="mx-auto mt-2 max-w-[30rem] text-base text-muted">{rt(recipe.blurb)}</p>}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <div className="tile inline-flex max-w-full items-center gap-1 rounded-full p-1">
            <button type="button" aria-label={t("Fewer servings")} disabled={servings <= 1} onClick={() => changeServings(-1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-background text-foreground shadow-[0_2px_8px_-4px_rgba(0,0,0,0.35)] transition active:scale-90 disabled:opacity-40 disabled:active:scale-100">
              <MinusIcon className="h-5 w-5" />
            </button>
            <span aria-live="polite" className="app-numbers min-w-0 px-2 text-center text-base font-extrabold [overflow-wrap:anywhere]">{t("Serves {n}", { n: view.recipe.servings })}</span>
            <button type="button" aria-label={t("More servings")} disabled={servings >= MAX_SERVINGS} onClick={() => changeServings(1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-background text-foreground shadow-[0_2px_8px_-4px_rgba(0,0,0,0.35)] transition active:scale-90 disabled:opacity-40 disabled:active:scale-100">
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
          <span className="tile app-numbers inline-flex min-h-[3.25rem] items-center gap-1.5 rounded-full px-4 text-base font-bold"><TodayIcon className="h-5 w-5 text-accent" />{t("{n} min", { n: recipe.minutes })}</span>
          {meatFree && <span className="tile inline-flex min-h-[3.25rem] items-center gap-1.5 rounded-full px-4 text-base font-bold"><LeafIcon className="h-5 w-5 text-accent" />{t("No meat or fish")}</span>}
        </div>

        {totals ? (
          <div className="@container mt-5">
            <p className="text-center text-sm font-bold text-muted">{t("Per serving")}</p>
            <div role="group" aria-label={nutrientAriaLabel(t("{name}, per serving", { name: rt(recipe.name) }), { calories: totals.perServing.kcal, protein: totals.perServing.protein, carbs: totals.perServing.carbs, fat: totals.perServing.fat }, t)} className="app-numbers mt-2 grid grid-cols-2 gap-2 @[19rem]:grid-cols-4">
              <Chip value={formatInt(totals.perServing.kcal)} label="kcal" tone="bg-accent-soft ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]" lead />
              <Chip value={`${Math.round(totals.perServing.protein)} g`} label={t("protein")} tone="bg-[color-mix(in_srgb,var(--protein)_11%,transparent)]" dot="bg-protein" />
              <Chip value={`${Math.round(totals.perServing.carbs)} g`} label={t("carbs")} tone="bg-[color-mix(in_srgb,var(--carbs)_11%,transparent)]" dot="bg-carbs" />
              <Chip value={`${Math.round(totals.perServing.fat)} g`} label={t("fat")} tone="bg-[color-mix(in_srgb,var(--fat)_11%,transparent)]" dot="bg-fat" />
            </div>
            {grams && gramTotal > 0 && (
              <div aria-hidden className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--ring-track)]">
                {grams.map((g, i) => (g > 0 ? <span key={i} className={`${["bg-protein", "bg-carbs", "bg-fat"][i]} h-full first:rounded-s-full last:rounded-e-full`} style={{ width: `${(g / gramTotal) * 100}%` }} /> : null))}
              </div>
            )}
            {totals.notCounted.length > 0 && (
              <p className="mt-3 text-center text-sm font-semibold text-muted">{totals.notCounted.length === 1 ? t("We haven't read the label for {name} yet, so it isn't counted in these numbers.", { name: t(totals.notCounted[0]!).toLowerCase() }) : t("We haven't read the labels for {names} yet, so they aren't counted in these numbers.", { names: totals.notCounted.map((n) => t(n).toLowerCase()).join(", ") })}</p>
            )}
            <div className="mt-3">
              <button type="button" aria-expanded={detail} aria-controls="recipe-label" onClick={() => setDetail((d) => !d)} className="glass flex min-h-16 w-full items-center gap-3 rounded-[1.75rem] px-5 py-3 text-start transition active:scale-[0.99] hover:bg-soft-strong">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{t("More detail")}</span>
                  <span className="block text-base text-muted">{t("Saturated fat, salt, sugar and fibre")}</span>
                </span>
                <ChevronRightIcon className={`h-5 w-5 shrink-0 text-muted transition-transform ${detail ? "-rotate-90" : "rotate-90"}`} />
              </button>
              {detail && (
                <section id="recipe-label" aria-labelledby="label-heading" className="glass mt-2 rounded-3xl p-4">
                  <h2 id="label-heading" className="text-lg font-extrabold tracking-tight">{t("Full nutrition per serving")}</h2>
                  <dl className="app-numbers mt-2 divide-y divide-line">
                    {rows.map(([label, value, sub]) => (
                      <div key={label} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
                        <dt className={`min-w-0 ${sub ? "ps-4 text-muted" : "font-semibold"}`}>{label}</dt>
                        <dd className={`ms-auto text-end ${value === notOnLabel ? "text-sm italic text-muted" : "font-bold"}`}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-sm text-muted">{t("Added up from each product's own label for the amounts below, before cooking. \"Not on every label\" means one of the products doesn't print that figure, so we don't give a total for it.")}</p>
                </section>
              )}
            </div>
          </div>
        ) : (
          <p className="glass mt-5 rounded-3xl p-4 text-center text-base">{t("We couldn't find every ingredient at {shop} yet, so there are no totals for this recipe.", { shop: file.name })}</p>
        )}

        {totals && !target && recipe.meal === "snack" && mealTargetFor(settings) && (
          <p className="glass mt-3 rounded-3xl p-4 text-base font-semibold">{t("Snacks are shown as written, not fitted to your meal size.")}</p>
        )}

        {totals && target && (
          <div className="glass mt-3 rounded-3xl p-4">
            <p className="app-numbers text-base font-semibold">{asWritten ? t("Showing the recipe as written.") : view.fitted ? `${targetSentence(t, target, "this")} ${t("The amounts below are changed to fit.")}` : t("This recipe already fits your meal, so nothing is changed.")}</p>
            <button type="button" onClick={() => setAsWritten((v) => !v)} className="mt-1 min-h-11 text-base font-bold text-accent underline underline-offset-4">{asWritten ? t("Fit it to my meal") : t("Show it as written")}</button>
          </div>
        )}

        <div role="tablist" aria-label={t("Recipe")} className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 rounded-full bg-soft-strong p-1 ring-1 ring-inset ring-line">
          {TABS.map((o, i) => {
            const on = o.value === tab;
            return (
              <button
                key={o.value}
                type="button"
                role="tab"
                id={`recipe-tab-${o.value}`}
                aria-selected={on}
                aria-controls={`recipe-panel-${o.value}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(o.value)}
                onKeyDown={(e) => radioKeyNav(e, i, TABS.length, (n) => setTab(TABS[n]!.value))}
                className={`min-h-14 min-w-0 rounded-full px-3 text-[17px] font-bold leading-tight hyphens-auto [overflow-wrap:anywhere] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-foreground text-background shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {t(o.label)}
              </button>
            );
          })}
        </div>

        <section id="recipe-panel-ingredients" role="tabpanel" aria-labelledby="recipe-tab-ingredients" hidden={tab !== "ingredients"} className="mt-5">
          {totals && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 app-numbers">
              <div className="rounded-[1.4rem] bg-accent-soft px-4 py-3">
                <p className="text-2xl font-extrabold tracking-tight text-accent">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</p>
                <p className="text-sm font-bold text-muted">{t("a serving")}</p>
              </div>
              <div className="tile rounded-[1.4rem] px-4 py-3">
                <p className="text-2xl font-extrabold tracking-tight">{formatPrice(totals.basket)}</p>
                <p className="text-sm font-bold text-muted">{t("to buy it all")}</p>
              </div>
              <p className="col-span-full px-1 text-sm text-muted">{t("\"A serving\" prices only what one serving uses. \"To buy it all\" is the whole packs below, at {shop} shelf prices; you'll have some left over.", { shop: poss(file.name) })}</p>
            </div>
          )}
          <h2 id="ingredients-heading" className="mt-5 px-1 text-xl font-extrabold tracking-tight">{t("What to buy")}</h2>
          <ul className="glass mt-3 divide-y divide-line rounded-[1.75rem] px-4">
            {view.recipe.ingredients.map((written, i) => {
              const p = picks[i];
              const spec = p?.spec ?? written;
              return (
                <li key={spec.key} className="@container py-4">
                  <div className="flex flex-col gap-3 @[12rem]:flex-row @[12rem]:items-start">
                    {p ? <PickPhoto file={file} product={p.product} /> : <span aria-hidden className="tile h-16 w-16 shrink-0 rounded-2xl" />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="min-w-0 text-[17px] font-bold leading-snug [overflow-wrap:anywhere]">{t(spec.label)}</span>
                        <span className="app-numbers ms-auto shrink-0 text-[17px] font-extrabold text-accent">{amountText(spec)}</span>
                      </p>
                      {spec.note && <p className="text-sm font-medium text-muted">{noteText(t, spec.note)}</p>}
                      {spec.subFor && (
                        <p className="mt-0.5 text-sm text-muted">{written.original || written.subFor ? t("Instead of {name}.", { name: t(spec.subFor).toLowerCase() }) : t("{shop} doesn't sell {name} that fits, so this uses {sub} instead.", { shop: file.name, name: t(spec.subFor).toLowerCase(), sub: t(spec.label).toLowerCase() })}</p>
                      )}
                      {p ? (
                        <>
                          <Link href={`/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(p.product.id)}`} prefetch={false} className="mt-1 block rounded-lg text-[15px] leading-snug text-muted [overflow-wrap:anywhere] hover:underline">{p.product.name}</Link>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <span className="app-numbers text-[15px] font-bold">{formatPrice(p.product.price)}{p.packs > 1 ? ` · ${t("buy {n}", { n: p.packs })}` : ""}</span>
                            <button type="button" onClick={() => setSwapping(spec.key)} aria-label={t("Swap {name}", { name: t(spec.label) })} className="tile ms-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-base font-semibold transition active:scale-95 hover:bg-soft-strong">
                              <SwapIcon className="h-4 w-4" />{t("Swap")}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-muted">{t("Not found at {shop} yet.", { shop: file.name })}</p>
                      )}
                    </div>
                  </div>
                  {p && spec.cupboard && spec.pantry && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-2xl bg-soft-strong py-1.5 pe-1.5 ps-3.5">
                      <span className="min-w-0 flex-1 basis-32 text-[15px] leading-snug text-muted">{hasIt(spec) ? t("Left off your list and the price to buy it all.") : t("You may have this already.")}</span>
                      <button type="button" aria-pressed={hasIt(spec)} onClick={() => { toggleCupboard(spec.pantry!); setAdded(null); }} className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-4 text-base font-bold transition active:scale-95 ${hasIt(spec) ? "bg-accent-soft text-accent" : "bg-background shadow-[0_2px_8px_-4px_rgba(0,0,0,0.35)] hover:bg-soft"}`}>
                        {hasIt(spec) && <CheckIcon className="h-4 w-4" />}{t("I have this")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {(recipe.extras?.length ?? 0) > 0 && (
            <p className="mt-3 px-1 text-sm text-muted"><span className="font-semibold text-foreground">{t("Also handy (not counted):")}</span> {recipe.extras!.map(rt).join(", ")}.</p>
          )}
          {dietNote && (
            <p className="glass mt-4 flex gap-3 rounded-3xl p-4 text-base"><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{prefs.halalOnly ? t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen or halal labels, so check each pack before you buy.") : t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen labels, so check each pack before you buy.")}</span></p>
          )}
        </section>

        <section id="recipe-panel-method" role="tabpanel" aria-labelledby="recipe-tab-method" hidden={tab !== "method"} className="mt-5">
          <h2 id="method-heading" className="px-1 text-xl font-extrabold tracking-tight">{t("How to make it")}</h2>
          <ol className="mt-3 space-y-2.5">
            {recipe.method.map((step, i) => (
              <li key={i} className="glass flex gap-3.5 rounded-[1.75rem] p-4">
                <span aria-hidden className="app-numbers grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground text-lg font-extrabold text-background">{i + 1}</span>
                <span className="pt-1.5 text-[17px] leading-snug">{rt(step)}</span>
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
        {view.resolved.complete && (
          // Kept in reach at the foot of the screen, just above the tab bar, with the page fading out behind it (like the reference's
          // "Add to list" bar). Last in the page and pulled down over main's own bottom padding (pb-32), so at the very end it sits under the footer.
          <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-gradient-to-t from-background from-70% to-transparent px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-8">
            <Button full className="min-h-14 text-base" onClick={addAll}>
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#052e16]/12"><PlusIcon className="h-5 w-5" /></span>
              {t("Add all to my shopping list")}
            </Button>
            <p role="status" aria-live="polite" className="px-2 text-center text-sm font-semibold text-accent">
              {added && <span className="mt-2 block">{added} <Link href="/app/groceries/list" className="underline underline-offset-2">{t("See list")}</Link></span>}
            </p>
          </div>
        )}
      </div>

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
                        <span className="app-numbers block text-sm text-muted">{formatPrice(o.basketCost)}{o.packs > 1 ? ` ${t("for {n}", { n: o.packs })}` : ""}{o.usedCost !== null ? ` · ${t("{price} a serving", { price: formatPrice(o.usedCost / view.recipe.servings) })}` : ""}</span>
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

/** One of the four numbers a serving has, as a soft chip: the value large, what it is under it. */
function Chip({ value, label, tone, dot, lead }: { value: string; label: string; tone: string; dot?: string; lead?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col items-center justify-center rounded-[1.4rem] px-2 py-3 text-center ${tone}`}>
      <span className={`text-[1.4rem] font-extrabold leading-none tracking-tight ${lead ? "sun-text" : ""}`}>{value}</span>
      <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm font-bold leading-tight text-muted hyphens-auto [overflow-wrap:anywhere]">{dot && <span aria-hidden className={`dot ${dot}`} />}{label}</span>
    </div>
  );
}

/** Save a recipe from our book to "My meals" (on this device), or take it off: a heart on the picture, with its word so it's plain. */
function SaveRecipeButton({ id }: { id: string }) {
  const t = useT();
  const saved = useStore(savedRecipesStore).some((r) => r.id === id);
  return (
    <button type="button" aria-pressed={saved} aria-label={saved ? t("Saved to My meals") : t("Save to My meals")} onClick={() => toggleSavedRecipe(id)} className={`${ON_PICTURE} ms-auto ps-3.5 pe-4`}>
      <HeartIcon filled={saved} className={`h-5 w-5 ${saved ? "text-[#e11d48]" : ""}`} />{saved ? t("Saved") : t("Save")}
    </button>
  );
}
