"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { SAMPLES_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import type { T } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { isMeatFree, MEAL_TYPES, type MealType, type Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, savedRecipesStore } from "@/lib/mm/stores";
import { dietWords } from "../_components/DietPicker";
import { ArrowRightIcon, BookmarkIcon, PotIcon, SearchIcon } from "../_components/icons";
import { Pip, PipSays } from "../_components/Mascot";
import { useGate } from "../_components/Paywall";
import { Button, Chip, EmptyState, ErrorBox, Segmented, Spinner } from "../_components/ui";
import { useIsPro, useSettings, useStore } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { recipeShop, useRecipeCards, useRecipeMakerEnabled, type RecipeCard } from "../_lib/recipes";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";
import { MealPicker } from "./MealPicker";
import { RecipeTile } from "./RecipeTile";

// Recipes from your shop (founder 2026-10-10): every ingredient is a real product at that supermarket, with its shelf price and the
// nutrition its own page prints. Each recipe is fitted to the person's meal (size and protein) and their diet from Settings; Pip can write a
// new one with AI. Big buttons and plain words throughout, for everyone including older people.

type Sort = "fit" | "price" | "protein";
const PAGE = 24;

/** Search words against a recipe's name, blurb and ingredient names ("chicken", "curry", "oats"), in English and in the reader's language. */
function matchesSearch(r: Recipe, q: string, t: T): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const labels = r.ingredients.map((i) => i.label);
  const own = r.ai ? labels.map((x) => t(x)) : [r.name, r.blurb, ...labels].map((x) => t(x));
  const hay = [r.name, r.blurb, ...labels, ...own].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

function sortCards(cards: RecipeCard[], sort: Sort): RecipeCard[] {
  const key = (c: RecipeCard): number => (sort === "fit" ? c.distance : sort === "protein" ? -c.totals.perServing.protein : (c.totals.costPerServing ?? Infinity));
  return [...cards].sort((a, b) => key(a) - key(b) || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
}

function RecipesScreen() {
  const t = useT();
  const poss = usePossessive();
  const asked = useSearchParams().get("r");
  const settings = useSettings();
  const manifest = useShopManifest();
  const [picked, setPicked] = useState<string | null>(null);
  const shop = recipeShop(manifest, picked ?? asked, settings.shops);
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const products = state.status === "ready" ? state.products : null;
  const target = mealTargetFor(settings);
  const diet = settings.preferences;
  const { cards, leftOut } = useRecipeCards(null, products, diet, target);
  const saved = useStore(myRecipesStore);
  const savedCount = useStore(savedRecipesStore).length + saved.length;
  const dietKey = JSON.stringify(diet);
  const mine = useMemo(() => saved.filter((s) => s.shop === shop).map((s) => savedToRecipe(s, JSON.parse(dietKey))).filter((r): r is Recipe => !!r), [saved, shop, dietKey]);
  const mineCards = useRecipeCards(mine, products, diet, target).cards;
  const [meatFree, setMeatFree] = useState(false);
  const [meal, setMeal] = useState<MealType | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<Sort | null>(null);
  const effectiveSort: Sort = sort ?? (target ? "fit" : "protein");
  const shown = useMemo(
    () => sortCards(cards.filter((c) => (!meatFree || isMeatFree(c.recipe)) && (!meal || c.recipe.meal === meal) && matchesSearch(c.recipe, query, t)), effectiveSort),
    [cards, meatFree, meal, query, effectiveSort, t],
  );
  const filtering = meatFree || meal !== null || query.trim() !== "";
  const shopName = manifest?.retailers.find((r) => r.id === shop)?.name ?? "";
  const makerOn = useRecipeMakerEnabled();
  const words = dietWords(t, diet);
  const pro = useIsPro();
  const { gate } = useGate();
  const router = useRouter();
  const makeHref = `/app/recipes/make${shop ? `?r=${shop}` : ""}`;

  return (
    <div>
      <h1 className="text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Recipes {em}")} values={{ em: <span className="serif-em sun-text pe-0.5">{t("from your shop")}</span> }} /></h1>
      <div className="mt-4">
        <PipSays mood="point" size={76}>
          {shopName ? t("Every ingredient is a real product at {shop}. Tell me how big a meal you'd like and I'll fit each recipe to it.", { shop: shopName }) : t("Every ingredient is a real product at your supermarket. Tell me how big a meal you'd like and I'll fit each recipe to it.")}
        </PipSays>
      </div>

      {/* Which supermarket the ingredients come from (founder 2026-10-10: "filter by what supermarkets they wanna use"). Only shops whose full
          product list, prices and labels we've read can fill a recipe, so the choice grows as more lists are read. */}
      {manifest && manifest.retailers.length > 1 && shop && (
        <div className="mt-4">
          <Segmented label={t("Supermarket")} value={shop} options={manifest.retailers.map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setPicked(v)} />
        </div>
      )}
      {manifest && manifest.retailers.length === 1 && shopName && (
        <p className="mt-3 px-1 text-sm leading-snug">
          <Rich text={t("Ingredients from {shop}.")} values={{ shop: <span className="font-bold">{shopName}</span> }} /> <span className="text-muted">{t("More supermarkets will appear here as we read their products and prices.")}</span>
        </p>
      )}

      <div className="mt-4"><MealPicker /></div>

      <p className="mt-3 px-1 text-sm">
        <span className="font-bold">{t("Your diet:")}</span> {words.length ? words.join(" · ") : t("nothing left out")}{" "}
        <Link href="/app/settings" className="inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-4">{t("Change")}</Link>
      </p>

      {(makerOn || SAMPLES_ENABLED) && (
        <button type="button" onClick={() => gate("recipeMaker", () => router.push(makeHref))} className="hero-card lift group mt-4 flex min-h-[5.5rem] w-full items-center gap-3 rounded-[1.75rem] p-3 ps-2 text-start">
          <Pip mood="wave" size={72} />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <span className="block text-[17px] font-extrabold leading-snug tracking-tight">{t("Ask Pip to make a recipe")}{!pro && <span className="ms-2 inline-block rounded-full bg-accent-soft px-2 py-0.5 align-middle text-xs font-bold text-accent">Pro</span>}</span>
            <span className="block text-sm text-muted">{shopName ? t("Say what you fancy and Pip writes one from {shop} products, fitted to your meal and diet.", { shop: poss(shopName) }) : t("Say what you fancy and Pip writes one from your shop's products, fitted to your meal and diet.")}</span>
          </span>
          <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
        </button>
      )}

      <Link href="/app/recipes/saved" className="glass lift group mt-3 flex min-h-14 items-center gap-3 rounded-full py-1.5 ps-4 pe-1.5 hover:bg-soft-strong">
        <BookmarkIcon className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 font-bold">{t("My recipes")}{savedCount > 0 && <span className="app-numbers font-semibold text-muted"> · {savedCount}</span>}</span>
        <span aria-hidden className="icon-bubble-soft h-11 w-11 shrink-0"><ArrowRightIcon className="h-5 w-5" /></span>
      </Link>

      {mineCards.length > 0 && shop && (
        <section aria-labelledby="mine-heading" className="mt-6">
          <h2 id="mine-heading" className="text-xl font-extrabold tracking-tight">{t("Your recipes")}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {mineCards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} badge={t("Made by Pip")} href={`/app/recipes/view?mine=${c.recipe.id}&r=${shop}`} /></li>))}
          </ul>
        </section>
      )}

      <h2 className="mt-6 text-xl font-extrabold tracking-tight">{t("All recipes")}{cards.length > 0 && <span className="app-numbers font-semibold text-muted"> · {cards.length}</span>}</h2>
      <label className="relative mt-3 block">
        <span className="sr-only">{t("Search recipes")}</span>
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t("Search recipes, e.g. chicken or curry")} enterKeyHint="search" autoComplete="off" className="glass min-h-12 w-full rounded-full ps-11 pe-4 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent" />
      </label>
      <div role="group" aria-label={t("Which meal")} className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        <Chip selected={meal === null} onClick={() => { setMeal(null); setLimit(PAGE); }}>{t("Any meal")}</Chip>
        {MEAL_TYPES.map((m) => (<Chip key={m.value} selected={meal === m.value} onClick={() => { setMeal(meal === m.value ? null : m.value); setLimit(PAGE); }}>{t(m.label)}</Chip>))}
      </div>
      <div role="group" aria-label={t("Filters")} className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
        <Chip selected={!meatFree} onClick={() => { setMeatFree(false); setLimit(PAGE); }}>{t("All recipes")}</Chip>
        <Chip selected={meatFree} onClick={() => { setMeatFree(true); setLimit(PAGE); }}>{t("No meat or fish")}</Chip>
      </div>
      <div className="mt-3">
        <Segmented
          label={t("Sort recipes")}
          value={effectiveSort}
          options={[...(target ? [{ value: "fit" as const, label: t("Closest fit") }] : []), { value: "price" as const, label: t("Lowest price") }, { value: "protein" as const, label: t("Most protein") }]}
          onChange={setSort}
        />
      </div>

      {!manifest || (shop && state.status === "loading") ? (
        <Spinner label={t("Loading recipes")} />
      ) : !shop ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} /></div>
      ) : state.status === "error" ? (
        <div className="mt-5"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : shown.length === 0 && filtering && cards.length > 0 ? (
        <div className="mt-5">
          <EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipes match.")} body={t("Try another word or meal.")} />
          <div className="mt-3 flex justify-center"><Button variant="secondary" onClick={() => { setQuery(""); setMeal(null); setMeatFree(false); }}>{t("Show all recipes")}</Button></div>
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipes here yet.")} body={leftOut ? t("None of our recipes suit your diet at this shop yet.") : t("We haven't read enough of {shop} product pages to fill these recipes yet.", { shop: poss(shopName) })} /></div>
      ) : (
        <>
          <p role="status" className="app-numbers mt-3 px-1 text-sm text-muted">{shown.length === 1 ? (filtering ? t("1 recipe match") : t("1 recipe")) : filtering ? t("{n} recipes match", { n: shown.length }) : t("{n} recipes", { n: shown.length })}</p>
          <ul className="stagger mt-2 grid gap-3 sm:grid-cols-2">
            {shown.slice(0, limit).map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`} /></li>))}
          </ul>
          {shown.length > limit && (
            <div className="mt-4"><Button full variant="secondary" className="min-h-14 text-base" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: shown.length - limit })}</Button></div>
          )}
          {leftOut > 0 && <p className="mt-3 px-1 text-sm text-muted">{leftOut === 1 ? t("1 recipe is left out for your diet.") : t("{n} recipes are left out for your diet.", { n: leftOut })}</p>}
        </>
      )}

      {state.status === "ready" && (
        <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
          {state.file.nutritionCheckedOn
            ? t("Prices from {shop} website, checked {date}; nutrition from each product's own page, checked {nutritionDate}.", { shop: poss(state.file.name), date: formatDate(state.file.checkedOn, t), nutritionDate: formatDate(state.file.nutritionCheckedOn, t) })
            : t("Prices from {shop} website, checked {date}; nutrition from each product's own page.", { shop: poss(state.file.name), date: formatDate(state.file.checkedOn, t) })}{" "}
          {t("\"Each\" prices only the amounts a serving uses. Vegetables, oil and seasoning you add aren't counted. Recipes are chosen for your diet by their ingredients; check each pack.")} {t("Not affiliated with {shop}.", { shop: state.file.name })}
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
