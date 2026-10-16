"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addToList, formatPrice, withPhoto } from "@/lib/mm/groceries";
import { formatDate, formatInt, nutrientAriaLabel } from "@/lib/mm/format";
import { tk, type T } from "@/lib/mm/i18n";
import { MEAL_TYPES, candidates, fitRecipe, isMeatFree, recipeTotals, resolveRecipe, scaleServings, subSpec, withSubstitutes, type IngredientPick, type IngredientSpec, type Recipe } from "@/lib/mm/recipes";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { PANTRY } from "@/lib/mm/pantry";
import { cupboardStore, savedRecipesStore, shoppingStore, toggleCupboard, toggleSavedRecipe } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, HeartIcon, InfoIcon, LeafIcon, MinusIcon, PlusIcon, SwapIcon, TodayIcon } from "../_components/icons";
import { Button, Sheet, radioKeyNav } from "../_components/ui";
import { backName, useBack } from "../_lib/backNav";
import { useSettings, useStore } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { PhotoTile } from "../groceries/ProductPhoto";
import { targetSentence } from "./MealPicker";
import { MEAL_LOOK, RecipeHeroArt } from "./RecipeTile";

// One recipe filled with a shop's own products, fitted to the person's meal (Recipes › Your meal) unless they ask to see it as written.
// They can swap any ingredient for another product that matches, or for one of the recipe's substitutes (also used on its own when the
// shop doesn't sell an ingredient); every figure is arithmetic on the labels of the products shown, for the amounts shown (lib/mm/recipes.ts). Used for our recipes, Pip's saved recipes and a recipe Pip has just written.
// Laid out like the founder's reference picture (2026-10-14): the dish big at the top with Back and a heart, a sheet with the name in the
// middle, "− Serves 4 +", then Ingredients and Method as two tabs and "Add all to my shopping list" kept in reach.
// Restyled 2026-10-15 to match Home: the serving's numbers as Home's pair of cards (the calories big beside protein, carbs and fat as
// spaced-capital rows), white cards with 20 px corners everywhere, grey circles for − and +, one card for the method, and
// the main action a black pill with its words (and a plain plus, no circle).

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
  "stock cube": [tk("about 1 stock cube"), tk("about {n} stock cubes")], biscuit: [tk("about 1 biscuit"), tk("about {n} biscuits")],
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

// The white pills that sit on the picture (Back, Save), like the reference's.
const ON_PICTURE = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white text-[0.9375rem] font-bold text-[#0b1a12] shadow-[0_6px_16px_-10px_rgba(0,0,0,0.45)] transition active:scale-95 hover:bg-white";
/** Two cards side by side, stacked when the text is large (the minimum width is in rem, so it grows with the text size), as on Home. */
const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3";
const CARD = "glass rounded-[1.25rem]";
const LABEL = "text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted";
const HEADING = "text-xl font-[800] tracking-[-0.01em]";
/** A small grey circle inside a 44 px tap area, like Home's calendar button. */
const ROUND_BUTTON = "group grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-90 disabled:opacity-40 disabled:active:scale-100";
const ROUND_FACE = "grid h-9 w-9 place-items-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]";
/** A fact about the recipe beside the servings stepper (minutes, meal, no meat or fish): a white pill as tall as the stepper. */
const INFO_CHIP = "glass inline-flex min-h-[3.25rem] items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-bold";
/** A secondary action inside a white card: a light grey pill. */
const SOFT_PILL = "inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong";

/** A figure from the full label ("56.1 g", "688 kcal · 2,880 kJ"): the numbers in DM Mono like Home's rows, each unit in the text face, so the
 *  mono font's wide space doesn't open a gap before the "g". */
function Amount({ text }: { text: string }) {
  return (
    <>
      {text.split(" · ").map((part, i) => {
        const m = /^(\S+) (.+)$/.exec(part);
        return (
          <span key={i} className="whitespace-nowrap">
            {i > 0 && <span className="text-muted"> · </span>}
            {m ? <><span className="font-mono text-[0.8125rem]">{m[1]}</span> {m[2]}</> : part}
          </span>
        );
      })}
    </>
  );
}

/** One macro of a serving, like Home's rows: a small dot to tell the three apart (a label, never good or bad), the name in small spaced
 *  capitals and the grams in DM Mono. No bar: on Home a bar means progress toward a day's target, and a serving has none. */
function MacroRow({ label, grams, dot }: { label: string; grams: number; dot: string }) {
  return (
    <p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-muted">
      <span className="inline-flex min-w-0 items-center gap-2"><span aria-hidden className={`dot ${dot}`} /><span className={LABEL}>{label}</span></span>
      <span className="app-numbers whitespace-nowrap font-mono text-[0.8125rem] font-normal">{Math.round(grams)}g</span>
    </p>
  );
}

export function RecipeDetail({ recipe, file, products, backHref, actions }: { recipe: Recipe; file: ShopFile; products: readonly ShopProduct[]; backHref: string; actions?: React.ReactNode }) {
  const t = useT();
  const poss = usePossessive();
  // Back goes to the page before when this one was reached from another page of the app; `backHref` (the recipes, at the right shop) is the fallback
  const back = useBack(backHref);
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
  const dietNote = (prefs.avoidAllergens?.length ?? 0) > 0 || prefs.halalOnly || prefs.veganOnly || prefs.vegetarianOnly || prefs.pescatarianOnly;
  const addAll = () => {
    const ready = picks.filter((p): p is IngredientPick => !!p && !hasIt(p.spec));
    shoppingStore.update((list) => ready.reduce((l, p) => addToList(l, { gtin: p.product.gtin, shopId: p.product.id, retailer: file.retailer, name: p.product.name, brand: "", size: "", price: p.product.price, checkedOn: file.checkedOn, ...withPhoto(shopPhotoSources(file, p.product)) }, new Date(), p.packs), list));
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
  const kicker = `${recipe.ai ? t("Made by Pip") : t("Recipe")} · ${file.name}`;
  const mealLabel = recipe.meal ? MEAL_TYPES.find((m) => m.value === recipe.meal)?.label : undefined;
  const MealIcon = MEAL_LOOK[recipe.meal ?? "dinner"]?.Icon ?? MEAL_LOOK.dinner.Icon;

  const stepper = (
    <div className="glass inline-flex max-w-full items-center rounded-full p-1">
      <button type="button" aria-label={t("Fewer servings")} disabled={servings <= 1} onClick={() => changeServings(-1)} className={ROUND_BUTTON}>
        <span className={ROUND_FACE}><MinusIcon className="h-[18px] w-[18px]" /></span>
      </button>
      <span aria-live="polite" className="app-numbers min-w-0 px-2.5 text-center text-[0.9375rem] font-bold [overflow-wrap:anywhere]">{t("Serves {n}", { n: view.recipe.servings })}</span>
      <button type="button" aria-label={t("More servings")} disabled={servings >= MAX_SERVINGS} onClick={() => changeServings(1)} className={ROUND_BUTTON}>
        <span className={ROUND_FACE}><PlusIcon className="h-[18px] w-[18px]" /></span>
      </button>
    </div>
  );
  const timeChip = <span className={`${INFO_CHIP} app-numbers`}><TodayIcon className="h-[18px] w-[18px] text-muted" />{t("{n} min", { n: recipe.minutes })}</span>;
  const mealChip = mealLabel ? <span className={INFO_CHIP}><MealIcon className="h-[18px] w-[18px] text-muted" />{t(mealLabel)}</span> : null;
  const meatChip = meatFree ? <span className={INFO_CHIP}><LeafIcon className="h-[18px] w-[18px] text-accent" />{t("No meat or fish")}</span> : null;

  return (
    <div>
      {/* the picture runs to the edges and under the status bar, like the reference */}
      <div className="relative -mx-5" style={{ marginTop: "calc(-1 * max(1.25rem, env(safe-area-inset-top)))" }}>
        <RecipeHeroArt id={recipe.id} name={recipe.name} label={rt(recipe.name)} meal={recipe.meal} />
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href={back.href} onClick={back.onClick} aria-label={backName(t("Back"), t("Back to recipes"), back.cameFromApp)} className={`${ON_PICTURE} ps-2.5 pe-4`}><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
          {!recipe.ai && <SaveRecipeButton id={recipe.id} />}
        </div>
      </div>

      <div className="relative -mx-5 -mt-9 rounded-t-[2rem] bg-background px-5 pt-3 shadow-[0_-12px_28px_-24px_rgba(0,0,0,0.45)]">
        <span aria-hidden className="mx-auto block h-1.5 w-12 rounded-full bg-[var(--ring-track)]" />
        <div className="mt-4 text-center">
          <p className="kicker">{kicker}</p>
          <h1 className="mt-1.5 text-[2rem] font-[800] leading-[1.08] tracking-[-0.02em] [overflow-wrap:anywhere]">{rt(recipe.name)}</h1>
          {recipe.blurb && <p className="mx-auto mt-2 max-w-[30rem] text-[0.9375rem] leading-snug text-muted">{rt(recipe.blurb)}</p>}
        </div>

        {/* "Serves · time · meal", like the reference's chip row. Laid out so no chip is left alone on a line: with three chips the stepper sits
            on its own above the other two; with four, two and two (at large text they wrap as they fit). Reading order is unchanged. */}
        {meatFree ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{stepper}{timeChip}{mealChip}{meatChip}</div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-2">
            {stepper}
            <div className="flex flex-wrap items-center justify-center gap-2">{timeChip}{mealChip}</div>
          </div>
        )}

        {totals ? (
          <div className="mt-5">
            {/* Home's pair: the calories big on the left, protein, carbs and fat as spaced-capital rows on the right */}
            <div role="group" aria-label={nutrientAriaLabel(t("{name}, per serving", { name: rt(recipe.name) }), { calories: totals.perServing.kcal, protein: totals.perServing.protein, carbs: totals.perServing.carbs, fat: totals.perServing.fat }, t)} className={`app-numbers ${PAIR}`}>
              <div className={`${CARD} flex min-w-0 flex-col gap-3 p-4`}>
                {/* The figure comes first in reading order ("688 kcal, per serving"; the e2e test reads the group's text from its first number);
                    the label is drawn above it, top left like Home's "CALORIES", and the figure sits centred in the rest of the card. */}
                <p className="flex flex-1 flex-col items-center justify-center text-center [overflow-wrap:anywhere]">
                  <span className="text-[2.75rem] font-medium leading-none tracking-[-0.03em] text-accent">{formatInt(totals.perServing.kcal)}</span>
                  <span className="mt-1.5 text-[1.0625rem] font-normal leading-tight">kcal</span>
                </p>
                <p className={`order-first ${LABEL}`}>{t("Per serving")}</p>
              </div>
              <div className={`${CARD} flex min-w-0 flex-col justify-center gap-3.5 px-4 py-4`}>
                <MacroRow label={t("protein")} grams={totals.perServing.protein} dot="bg-protein" />
                <MacroRow label={t("carbs")} grams={totals.perServing.carbs} dot="bg-carbs" />
                <MacroRow label={t("fat")} grams={totals.perServing.fat} dot="bg-fat" />
              </div>
            </div>
            {totals.notCounted.length > 0 && (
              <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted">{totals.notCounted.length === 1 ? t("We haven't read the label for {name} yet, so it isn't counted in these numbers.", { name: t(totals.notCounted[0]!).toLowerCase() }) : t("We haven't read the labels for {names} yet, so they aren't counted in these numbers.", { names: totals.notCounted.map((n) => t(n).toLowerCase()).join(", ") })}</p>
            )}
            <div className="mt-3">
              <button type="button" aria-expanded={detail} aria-controls="recipe-label" onClick={() => setDetail((d) => !d)} className={`${CARD} flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start transition active:scale-[0.99] hover:bg-soft-strong`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-bold">{t("More detail")}</span>
                  <span className="block text-[0.8125rem] leading-snug text-muted">{t("Saturated fat, salt, sugar and fibre")}</span>
                </span>
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--fill)]"><ChevronRightIcon className={`h-[18px] w-[18px] transition-transform ${detail ? "-rotate-90" : "rotate-90"}`} /></span>
              </button>
              {detail && (
                <section id="recipe-label" aria-labelledby="label-heading" className={`${CARD} mt-2 p-4`}>
                  <h2 id="label-heading" className="text-[1.0625rem] font-bold tracking-[-0.01em]">{t("Full nutrition per serving")}</h2>
                  <dl className="app-numbers mt-2 divide-y divide-line">
                    {rows.map(([label, value, sub]) => (
                      <div key={label} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
                        <dt className={`min-w-0 text-[0.9375rem] ${sub ? "ps-4 text-muted" : "font-semibold"}`}>{label}</dt>
                        <dd className={`ms-auto text-end ${value === notOnLabel ? "text-[0.8125rem] italic text-muted" : "text-[0.875rem]"}`}>{value === notOnLabel ? value : <Amount text={value} />}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2.5 text-[0.8125rem] leading-snug text-muted">{t("Added up from each product's own label for the amounts below, before cooking. \"Not on every label\" means one of the products doesn't print that figure, so we don't give a total for it.")}</p>
                </section>
              )}
            </div>
          </div>
        ) : (
          <p className={`${CARD} mt-5 p-4 text-center text-[0.9375rem] leading-snug`}>{t("We couldn't find every ingredient at {shop} yet, so there are no totals for this recipe.", { shop: file.name })}</p>
        )}

        {totals && !target && recipe.meal === "snack" && mealTargetFor(settings) && (
          <p className={`${CARD} mt-3 p-4 text-[0.9375rem] font-semibold leading-snug`}>{t("Snacks are shown as written, not fitted to your meal size.")}</p>
        )}

        {totals && target && (
          <div className={`${CARD} mt-3 p-4`}>
            <p className="app-numbers text-[0.9375rem] leading-snug">{asWritten ? t("Showing the recipe as written.") : view.fitted ? `${targetSentence(t, target, "this")} ${t("The amounts below are changed to fit.")}` : t("This recipe already fits your meal, so nothing is changed.")}</p>
            <button type="button" onClick={() => setAsWritten((v) => !v)} className={`mt-3 ${SOFT_PILL}`}>{asWritten ? t("Fit it to my meal") : t("Show it as written")}</button>
          </div>
        )}

        <div role="tablist" aria-label={t("Recipe")} className="glass mt-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 rounded-full p-1">
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
                className={`min-h-12 min-w-0 rounded-full px-3 text-[0.9375rem] font-bold leading-tight hyphens-auto [overflow-wrap:anywhere] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
              >
                {t(o.label)}
              </button>
            );
          })}
        </div>

        <section id="recipe-panel-ingredients" role="tabpanel" aria-labelledby="recipe-tab-ingredients" hidden={tab !== "ingredients"} className="mt-5">
          {totals && (
            <div className="app-numbers">
              <div className={PAIR}>
                <div className={`${CARD} p-4`}>
                  <p className={LABEL}>{t("a serving")}</p>
                  <p className="mt-2.5 text-[1.75rem] font-medium leading-none tracking-[-0.02em] text-accent">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</p>
                </div>
                <div className={`${CARD} p-4`}>
                  <p className={LABEL}>{t("to buy it all")}</p>
                  <p className="mt-2.5 text-[1.75rem] font-medium leading-none tracking-[-0.02em]">{formatPrice(totals.basket)}</p>
                </div>
              </div>
              <p className="mt-2.5 px-1 text-[0.8125rem] leading-snug text-muted">{t("\"A serving\" prices only what one serving uses. \"To buy it all\" is the whole packs below, at {shop} shelf prices; you'll have some left over.", { shop: poss(file.name) })}</p>
            </div>
          )}
          <h2 id="ingredients-heading" className={`mt-6 ${HEADING}`}>{t("What to buy")}</h2>
          <ul className={`${CARD} mt-3 divide-y divide-line px-4`}>
            {view.recipe.ingredients.map((written, i) => {
              const p = picks[i];
              const spec = p?.spec ?? written;
              return (
                <li key={spec.key} className="@container py-4">
                  <div className="flex flex-col gap-3 @[12rem]:flex-row @[12rem]:items-start">
                    {p ? <PickPhoto file={file} product={p.product} /> : <span aria-hidden className="h-16 w-16 shrink-0 rounded-2xl bg-[var(--fill)]" />}
                    <div className="min-w-0 flex-1">
                      {/* the name wraps beside a fixed amount, so the amount never drops onto a line of its own */}
                      <p className="flex items-start gap-3">
                        <span className="min-w-0 flex-1 text-base font-bold leading-snug [overflow-wrap:anywhere]">{t(spec.label)}</span>
                        <span className="app-numbers shrink-0 whitespace-nowrap text-[0.9375rem] font-semibold leading-snug">{amountText(spec)}</span>
                      </p>
                      {spec.note && <p className="text-[0.8125rem] text-muted">{noteText(t, spec.note)}</p>}
                      {spec.subFor && (
                        <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{written.original || written.subFor ? t("Instead of {name}.", { name: t(spec.subFor).toLowerCase() }) : t("{shop} doesn't sell {name} that fits, so this uses {sub} instead.", { shop: file.name, name: t(spec.subFor).toLowerCase(), sub: t(spec.label).toLowerCase() })}</p>
                      )}
                      {p ? (
                        <>
                          <Link href={`/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(p.product.id)}`} prefetch={false} className="mt-1 block rounded-lg text-[0.875rem] leading-snug text-muted [overflow-wrap:anywhere] hover:underline">{p.product.name}</Link>
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <span className="app-numbers text-[0.9375rem] font-semibold">{formatPrice(p.product.price)}{p.packs > 1 ? ` · ${t("buy {n}", { n: p.packs })}` : ""}</span>
                            <button type="button" onClick={() => setSwapping(spec.key)} aria-label={t("Swap {name}", { name: t(spec.label) })} className="ms-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-semibold transition active:scale-95 hover:bg-soft-strong">
                              <SwapIcon className="h-4 w-4" />{t("Swap")}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 text-[0.8125rem] text-muted">{t("Not found at {shop} yet.", { shop: file.name })}</p>
                      )}
                    </div>
                  </div>
                  {p && spec.cupboard && spec.pantry && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-[1rem] bg-[var(--fill)] py-1.5 pe-1.5 ps-3.5">
                      <span className="min-w-0 flex-1 basis-32 text-[0.875rem] leading-snug text-muted">{hasIt(spec) ? t("Left off your list and the price to buy it all.") : t("You may have this already.")}</span>
                      <button type="button" aria-pressed={hasIt(spec)} onClick={() => { toggleCupboard(spec.pantry!); setAdded(null); }} className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-bold transition active:scale-95 ${hasIt(spec) ? "bg-sun text-on-accent" : "bg-white hover:bg-soft-strong"}`}>
                        {hasIt(spec) && <CheckIcon className="h-4 w-4" />}{t("I have this")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {(recipe.extras?.length ?? 0) > 0 && (
            <p className="mt-3 px-1 text-[0.8125rem] leading-snug text-muted"><span className="font-semibold text-foreground">{t("Also handy (not counted):")}</span> {recipe.extras!.map(rt).join(", ")}.</p>
          )}
          {dietNote && (
            <p className={`${CARD} mt-4 flex gap-3 p-4 text-[0.9375rem] leading-snug`}><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{prefs.halalOnly ? t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen or halal labels, so check each pack before you buy.") : t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen labels, so check each pack before you buy.")}</span></p>
          )}
        </section>

        <section id="recipe-panel-method" role="tabpanel" aria-labelledby="recipe-tab-method" hidden={tab !== "method"} className="mt-5">
          <h2 id="method-heading" className={HEADING}>{t("How to make it")}</h2>
          <ol className={`${CARD} mt-3 divide-y divide-line px-4`}>
            {recipe.method.map((step, i) => (
              <li key={i} className="flex gap-3.5 py-4">
                <span aria-hidden className="app-numbers grid h-8 w-8 shrink-0 place-items-center rounded-full bg-soft-strong text-[0.875rem] font-bold">{i + 1}</span>
                <span className="pt-1 text-base leading-snug">{rt(step)}</span>
              </li>
            ))}
          </ol>
        </section>

        {recipe.ai && (
          <p className={`${CARD} mt-4 flex gap-3 p-4 text-[0.875rem] leading-snug`}><InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>{t("Pip wrote this recipe with AI from real products at {shop}; the numbers come from the products' labels. Read the steps before you cook, and cook meat and fish until piping hot.", { shop: file.name })}</span></p>
        )}

        {actions && <div className="mt-5 space-y-2">{actions}</div>}

        <p className="mt-8 border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-muted">
          {t("Prices are {shop} shelf prices, checked {date}, and vary by store.", { shop: poss(file.name), date: formatDate(file.checkedOn, t) })} {recipe.ai ? t("Recipe written by Pip with AI.") : t("Recipe by {app}.", { app: site.name })} {t("Not affiliated with {shop}.", { shop: file.name })}
        </p>
        {view.resolved.complete && (
          // Kept in reach at the foot of the screen, just above the tab bar, on a flat strip of the page's grey that the page slides under
          // (like the reference's "Add to list" bar; no fade). Last in the page and pulled down over main's own bottom padding (pb-32), so at the
          // very end it sits under the footer.
          <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
            <Button full className="min-h-[3.25rem]" onClick={addAll}>
              <PlusIcon aria-hidden className="h-5 w-5 shrink-0" />
              {t("Add all to my shopping list")}
            </Button>
            <p role="status" aria-live="polite" className="px-2 text-center text-[0.875rem] font-semibold text-accent">
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
                <h3 id="instead-heading" className="text-base font-bold">{t("Use something else instead")}</h3>
                <ul className="mt-2 space-y-2">
                  {insteadOptions.map((o) => (
                    <li key={o.subKey ?? "written"}>
                      <button type="button" onClick={() => chooseInstead(swapSpec.key, o.subKey)} className={`${CARD} flex min-h-14 w-full items-center gap-3 p-3 text-start transition active:scale-[0.99] hover:bg-soft-strong`}>
                        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft-strong"><SwapIcon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.9375rem] font-semibold leading-snug [overflow-wrap:anywhere]">{t(o.spec.label)}</span>
                          <span className="app-numbers block text-[0.8125rem] text-muted">{o.subKey ? t("{amount} in the recipe", { amount: amountText(o.spec) }) : t("As the recipe has it, {amount}", { amount: amountText(o.spec) })}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <h3 className="text-base font-bold">{insteadOptions.length > 0 ? t("Or pick a different product") : t("Pick a different product")}</h3>
            <p className="mb-3 mt-1 text-[0.8125rem] leading-snug text-muted">{t("Products at {shop} that fit this recipe, cheapest to buy first. It uses {amount}.", { shop: file.name, amount: amountText(swapSpec) })}</p>
            <ul className="space-y-2">
              {options.map((o) => {
                const selected = picks[swapIndex]?.product.id === o.product.id;
                return (
                  <li key={o.product.id}>
                    {/* the current pick is the one lime row, with a dark tick; the rest are white */}
                    <button type="button" aria-pressed={selected} onClick={() => { setChosen((c) => ({ ...c, [swapSpec.key]: o.product.id })); setSwapping(null); setAdded(null); }} className={`flex w-full items-center gap-3 rounded-[1.25rem] p-3 text-start transition active:scale-[0.99] ${selected ? "bg-sun text-on-accent" : `${CARD} hover:bg-soft-strong`}`}>
                      <PickPhoto file={file} product={o.product} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-semibold leading-snug [overflow-wrap:anywhere]">{o.product.name}</span>
                        <span className={`app-numbers block text-[0.8125rem] ${selected ? "" : "text-muted"}`}>{formatPrice(o.basketCost)}{o.packs > 1 ? ` ${t("for {n}", { n: o.packs })}` : ""}{o.usedCost !== null ? ` · ${t("{price} a serving", { price: formatPrice(o.usedCost / view.recipe.servings) })}` : ""}</span>
                        {o.product.nutrition && <span className={`app-numbers block text-[0.8125rem] ${selected ? "" : "text-muted"}`}>{Math.round(o.product.nutrition.kcal)} kcal · {t("{n} g protein per 100 {unit}", { n: o.product.nutrition.protein, unit: o.product.nutrition.per })}</span>}
                      </span>
                      {selected && <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-background"><CheckIcon className="h-4 w-4" /></span>}
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
