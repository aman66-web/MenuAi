"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { AI_RECIPES_ENABLED, SAMPLES_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import type { T } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { isMeatFree, MEAL_TYPES, type MealType, type Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, savedRecipesStore } from "@/lib/mm/stores";
import { dietWords } from "../_components/DietPicker";
import { ArrowRightIcon, BookmarkIcon, ChevronRightIcon, PotIcon, SearchIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { useGate } from "../_components/Paywall";
import { Button, Chip, EmptyState, ErrorBox, Segmented, Spinner } from "../_components/ui";
import { useIsPro, useSettings, useStore } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { recipeShop, useRecipeCards, useRecipeMakerEnabled, type RecipeCard } from "../_lib/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";
import { MealPicker, targetSentence } from "./MealPicker";
import { MEAL_LOOK, RecipeTile } from "./RecipeTile";

// Recipes from your shop (founder 2026-10-10): every ingredient is a real product at that supermarket, with its shelf price and the
// nutrition its own page prints. Each recipe is fitted to the person's meal (size and protein) and their diet from Settings; Pip can write a
// new one with AI. Big buttons and plain words throughout, for everyone including older people.
// Kept plain (founder 2026-10-11): the first question is which meal (big buttons), then search; the meal size the recipes are fitted to is
// one line with an "Adjust" button that opens the size choices.

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
  const [adjusting, setAdjusting] = useState(false);
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
      <div className="hero-card relative overflow-hidden rounded-[2rem] p-5 pe-24">
        <h1 className="text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Recipes {em}")} values={{ em: <span className="serif-em sun-text pe-0.5">{t("from your shop")}</span> }} /></h1>
        <p className="mt-2 text-base leading-snug text-muted">
          {shopName ? t("Every ingredient is a real product at {shop}, with its price and the nutrition of each serving.", { shop: shopName }) : t("Every ingredient is a real product at your supermarket, with its price and the nutrition of each serving.")}
        </p>
        <span className="absolute -bottom-1 end-1"><Pip mood="point" size={84} /></span>
      </div>

      {/* Which supermarket the ingredients come from (founder 2026-10-10: "filter by what supermarkets they wanna use"). Only shops whose full
          product list, prices and labels we've read can fill a recipe, so the choice grows as more lists are read. */}
      {recipeShops(manifest).length > 1 && shop && (
        <div className="mt-4">
          <Segmented label={t("Supermarket")} value={shop} options={recipeShops(manifest).map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setPicked(v)} />
        </div>
      )}

      <label className="relative mt-4 block">
        <span className="sr-only">{t("Search recipes")}</span>
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t("Search recipes, e.g. chicken or curry")} enterKeyHint="search" autoComplete="off" className="glass min-h-14 w-full rounded-full ps-11 pe-4 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent" />
      </label>

      <h2 className="mt-6 text-xl font-extrabold tracking-tight">{t("Which meal?")}</h2>
      <div role="group" aria-label={t("Which meal")} className="mt-3 grid grid-cols-2 gap-2">
        {MEAL_TYPES.map((m) => {
          const on = meal === m.value;
          const { Icon, band } = MEAL_LOOK[m.value];
          return (
            <button key={m.value} type="button" aria-pressed={on} onClick={() => { setMeal(on ? null : m.value); setLimit(PAGE); }} className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 text-start text-lg font-bold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)]" : "border-line bg-soft hover:bg-soft-strong"}`}>
              <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? "bg-background/15" : band}`}><Icon className="h-6 w-6" /></span>
              <span className="min-w-0">{t(m.label)}</span>
            </button>
          );
        })}
        <button type="button" aria-pressed={meal === null} onClick={() => { setMeal(null); setLimit(PAGE); }} className={`col-span-2 inline-flex min-h-12 items-center justify-center rounded-2xl border px-3 text-base font-bold transition active:scale-[0.97] ${meal === null ? "border-transparent bg-foreground text-background" : "border-line bg-soft hover:bg-soft-strong"}`}>{t("Any meal")}</button>
      </div>
      <div role="group" aria-label={t("Filters")} className="mt-3 flex flex-wrap gap-2">
        <Chip selected={meatFree} onClick={() => { setMeatFree(!meatFree); setLimit(PAGE); }}>{t("No meat or fish")}</Chip>
      </div>

      {/* What every recipe is fitted to, and the diet it follows: one card, each line with its own button. */}
      <div className="glass mt-5 divide-y divide-line rounded-[1.5rem]">
        <div className="p-3 ps-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p role="status" aria-live="polite" className="app-numbers min-w-0 flex-1 text-base font-semibold">{targetSentence(t, target)}</p>
            <button type="button" aria-expanded={adjusting} aria-controls="meal-size" onClick={() => setAdjusting((v) => !v)} className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-line bg-soft px-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong">
              {t("Adjust")}<ChevronRightIcon className={`h-4 w-4 transition-transform ${adjusting ? "-rotate-90" : "rotate-90"}`} />
            </button>
          </div>
          {adjusting && <div id="meal-size" className="-ms-2 mt-2"><MealPicker summary={false} /></div>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 ps-4">
          <p className="min-w-0 flex-1 text-base"><span className="font-bold">{t("Your diet:")}</span> {words.length ? words.join(" · ") : t("nothing left out")}</p>
          <Link href="/app/settings#diet" className="inline-flex min-h-12 shrink-0 items-center rounded-full border border-line bg-soft px-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong">{t("Change")}</Link>
        </div>
      </div>

      {AI_RECIPES_ENABLED && (makerOn || SAMPLES_ENABLED) && (
        <button type="button" onClick={() => gate("recipeMaker", () => router.push(makeHref))} className="hero-card lift group mt-4 flex min-h-[5.5rem] w-full items-center gap-3 rounded-[1.75rem] p-3 ps-2 text-start">
          <Pip mood="wave" size={64} />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <span className="block text-lg font-extrabold leading-snug tracking-tight">{t("Ask Pip to make a recipe")}{!pro && <span className="ms-2 inline-block rounded-full bg-accent-soft px-2 py-0.5 align-middle text-sm font-bold text-accent">Pro</span>}</span>
            <span className="block text-base text-muted">{shopName ? t("Say what you fancy and Pip writes one from {shop} products, fitted to your meal and diet.", { shop: poss(shopName) }) : t("Say what you fancy and Pip writes one from your shop's products, fitted to your meal and diet.")}</span>
          </span>
          <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
        </button>
      )}

      <Link href="/app/meals?tab=recipes" className="glass lift group mt-3 flex min-h-14 items-center gap-3 rounded-full py-1.5 ps-4 pe-1.5 hover:bg-soft-strong">
        <BookmarkIcon className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-base font-bold">{t("My meals")}{savedCount > 0 && <span className="app-numbers font-semibold text-muted"> · {savedCount}</span>}</span>
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

      <h2 className="mt-8 flex items-center gap-2.5 text-xl font-extrabold tracking-tight"><span aria-hidden className="bg-sun h-5 w-1.5 shrink-0 rounded-full" />{t("All recipes")}{cards.length > 0 && <span className="app-numbers font-semibold text-muted"> · {cards.length}</span>}</h2>
      <p className="mb-1.5 mt-3 text-base font-bold">{t("Sort by")}</p>
      <div>
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
          <p role="status" className="app-numbers mt-3 px-1 text-base text-muted">{shown.length === 1 ? (filtering ? t("1 recipe match") : t("1 recipe")) : filtering ? t("{n} recipes match", { n: shown.length }) : t("{n} recipes", { n: shown.length })}</p>
          <ul className="stagger mt-2 grid gap-3 sm:grid-cols-2">
            {shown.slice(0, limit).map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`} /></li>))}
          </ul>
          {shown.length > limit && (
            <div className="mt-4"><Button full variant="secondary" className="min-h-14 text-base" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: shown.length - limit })}</Button></div>
          )}
          {leftOut > 0 && <p className="mt-3 px-1 text-base text-muted">{leftOut === 1 ? t("1 recipe is left out for your diet.") : t("{n} recipes are left out for your diet.", { n: leftOut })}</p>}
        </>
      )}

      {state.status === "ready" && (
        <p className="mt-8 border-t border-line pt-4 text-sm text-muted">
          {state.file.nutritionCheckedOn
            ? t("Prices from {shop} website, checked {date}; nutrition from each product's own page, checked {nutritionDate}.", { shop: poss(state.file.name), date: formatDate(state.file.checkedOn, t), nutritionDate: formatDate(state.file.nutritionCheckedOn, t) })
            : t("Prices from {shop} website, checked {date}; nutrition from each product's own page.", { shop: poss(state.file.name), date: formatDate(state.file.checkedOn, t) })}{" "}
          {t("\"Each\" prices only the amounts a serving uses, including the pinch of salt and the spoon of oil. Recipes are chosen for your diet by their ingredients; check each pack.")} {t("Not affiliated with {shop}.", { shop: state.file.name })}
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
