"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { SAMPLES_ENABLED } from "@/lib/mm/config";
import { formatPrice } from "@/lib/mm/groceries";
import { formatDate, formatInt } from "@/lib/mm/format";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { isMeatFree, MEAL_TYPES, type MealType, type Recipe } from "@/lib/mm/recipes";
import { possessive } from "@/lib/mm/shopProducts";
import { myRecipesStore } from "@/lib/mm/stores";
import { ALLERGEN_SHORT } from "../_components/DietPicker";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, PotIcon, SearchIcon } from "../_components/icons";
import { Pip, PipSays } from "../_components/Mascot";
import { useGate } from "../_components/Paywall";
import { Button, Chip, EmptyState, ErrorBox, Segmented, Spinner } from "../_components/ui";
import { useIsPro, useSettings, useStore } from "../_lib/hooks";
import { recipeShop, useRecipeCards, useRecipeMakerEnabled, type RecipeCard } from "../_lib/recipes";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";
import { MealPicker } from "./MealPicker";

// Recipes from your shop (founder 2026-10-10): every ingredient is a real product at that supermarket, with its shelf price and the
// nutrition its own page prints. Each recipe is fitted to the person's meal (size and protein) and their diet from Settings; Pip can write a
// new one with AI. Big buttons and plain words throughout, for everyone including older people.

type Sort = "fit" | "price" | "protein";
const PAGE = 24;

/** Search words against a recipe's name, blurb and ingredient names ("chicken", "curry", "oats"). */
function matchesSearch(r: Recipe, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [r.name, r.blurb, ...r.ingredients.map((i) => i.label)].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

function sortCards(cards: RecipeCard[], sort: Sort): RecipeCard[] {
  const key = (c: RecipeCard): number => (sort === "fit" ? c.distance : sort === "protein" ? -c.totals.perServing.protein : (c.totals.costPerServing ?? Infinity));
  return [...cards].sort((a, b) => key(a) - key(b) || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
}

/** The person's diet in a few words, from Settings. */
function dietWords(p: ReturnType<typeof useSettings>["preferences"]): string[] {
  return [p.vegetarianOnly && "Vegetarian", p.veganOnly && "Vegan", p.halalOnly && "Halal", p.noPork && "No pork", p.noBeef && "No beef", ...(p.avoidAllergens ?? []).map((a) => `No ${ALLERGEN_SHORT[a].toLowerCase()}`)].filter((x): x is string => Boolean(x));
}

function RecipeTile({ card, href, badge }: { card: RecipeCard; href: string; badge?: string }) {
  const { recipe, totals } = card;
  const image = RECIPE_IMAGES[recipe.id];
  return (
    <Link href={href} prefetch={false} className="glass lift flex h-full min-w-0 flex-col rounded-3xl p-4">
      {image && (
        <span className="relative -mx-1 -mt-1 mb-3 block overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; the service worker caches it */}
          <img src={image} alt="" loading="lazy" decoding="async" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
          <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">AI illustration</span>
        </span>
      )}
      <span className="flex items-start gap-3">
        {!image && <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 rounded-2xl"><PotIcon className="h-6 w-6" /></span>}
        <span className="min-w-0 flex-1">
          {badge && <span className="mb-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">{badge}</span>}
          <span className="block text-[17px] font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere]">{recipe.name}</span>
          {recipe.blurb && <span className="mt-0.5 block text-sm text-muted">{recipe.blurb}</span>}
        </span>
        <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-muted" />
      </span>
      <span className="app-numbers mt-3 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 text-center">
        <span className="inset-card rounded-2xl px-2 py-2"><span className="block text-lg font-extrabold leading-tight">{formatInt(totals.perServing.kcal)}</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">kcal</span></span>
        <span className="rounded-2xl bg-accent-soft px-2 py-2"><span className="block text-lg font-extrabold leading-tight text-accent">{Math.round(totals.perServing.protein)}g</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">protein</span></span>
        <span className="inset-card rounded-2xl px-2 py-2"><span className="block text-lg font-extrabold leading-tight">{totals.costPerServing !== null ? formatPrice(totals.costPerServing) : "–"}</span><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted">each</span></span>
      </span>
      <span className="app-numbers mt-2 block text-xs text-muted">Per serving · {Math.round(totals.perServing.carbs)}g carbs · {Math.round(totals.perServing.fat)}g fat · serves {recipe.servings} · {recipe.minutes} min{isMeatFree(recipe) ? " · no meat or fish" : ""}</span>
    </Link>
  );
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
  const target = mealTargetFor(settings);
  const diet = settings.preferences;
  const { cards, leftOut } = useRecipeCards(null, products, diet, target);
  const saved = useStore(myRecipesStore);
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
    () => sortCards(cards.filter((c) => (!meatFree || isMeatFree(c.recipe)) && (!meal || c.recipe.meal === meal) && matchesSearch(c.recipe, query)), effectiveSort),
    [cards, meatFree, meal, query, effectiveSort],
  );
  const filtering = meatFree || meal !== null || query.trim() !== "";
  const shopName = manifest?.retailers.find((r) => r.id === shop)?.name ?? "";
  const makerOn = useRecipeMakerEnabled();
  const words = dietWords(diet);
  const pro = useIsPro();
  const { gate } = useGate();
  const router = useRouter();
  const makeHref = `/app/recipes/make${shop ? `?r=${shop}` : ""}`;

  return (
    <div>
      <Link href="/app/groceries" aria-label="Back to groceries" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">Recipes <span className="serif-em sun-text pr-0.5">from your shop</span></h1>
      <div className="mt-4">
        <PipSays mood="point" size={76}>
          {shopName ? <>Every ingredient is a real product at {shopName}. Tell me how big a meal you&apos;d like and I&apos;ll fit each recipe to it.</> : <>Every ingredient is a real product at your supermarket. Tell me how big a meal you&apos;d like and I&apos;ll fit each recipe to it.</>}
        </PipSays>
      </div>

      {manifest && manifest.retailers.length > 1 && shop && (
        <div className="mt-4">
          <Segmented label="Supermarket" value={shop} options={manifest.retailers.map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setPicked(v)} />
        </div>
      )}

      <div className="mt-4"><MealPicker /></div>

      <p className="mt-3 px-1 text-sm">
        <span className="font-bold">Your diet:</span> {words.length ? words.join(" · ") : "nothing left out"}{" "}
        <Link href="/app/settings" className="inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-4">Change</Link>
      </p>

      {(makerOn || SAMPLES_ENABLED) && (
        <button type="button" onClick={() => gate("recipeMaker", () => router.push(makeHref))} className="hero-card lift group mt-4 flex min-h-[5.5rem] w-full items-center gap-3 rounded-[1.75rem] p-3 pl-2 text-left">
          <Pip mood="wave" size={72} />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <span className="block text-[17px] font-extrabold leading-snug tracking-tight">Ask Pip to make a recipe{!pro && <span className="ml-2 inline-block rounded-full bg-accent-soft px-2 py-0.5 align-middle text-xs font-bold text-accent">Pro</span>}</span>
            <span className="block text-sm text-muted">Say what you fancy and Pip writes one from {shopName ? possessive(shopName) : "your shop's"} products, fitted to your meal and diet.</span>
          </span>
          <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
        </button>
      )}

      {mineCards.length > 0 && shop && (
        <section aria-labelledby="mine-heading" className="mt-6">
          <h2 id="mine-heading" className="text-xl font-extrabold tracking-tight">Your recipes</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {mineCards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} badge="Made by Pip" href={`/app/recipes/view?mine=${c.recipe.id}&r=${shop}`} /></li>))}
          </ul>
        </section>
      )}

      <h2 className="mt-6 text-xl font-extrabold tracking-tight">All recipes{cards.length > 0 && <span className="app-numbers font-semibold text-muted"> · {cards.length}</span>}</h2>
      <label className="relative mt-3 block">
        <span className="sr-only">Search recipes</span>
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Search recipes, e.g. chicken or curry" enterKeyHint="search" autoComplete="off" className="glass min-h-12 w-full rounded-full pl-11 pr-4 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent" />
      </label>
      <div role="group" aria-label="Which meal" className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        <Chip selected={meal === null} onClick={() => { setMeal(null); setLimit(PAGE); }}>Any meal</Chip>
        {MEAL_TYPES.map((m) => (<Chip key={m.value} selected={meal === m.value} onClick={() => { setMeal(meal === m.value ? null : m.value); setLimit(PAGE); }}>{m.label}</Chip>))}
      </div>
      <div role="group" aria-label="Filters" className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
        <Chip selected={!meatFree} onClick={() => { setMeatFree(false); setLimit(PAGE); }}>All recipes</Chip>
        <Chip selected={meatFree} onClick={() => { setMeatFree(true); setLimit(PAGE); }}>No meat or fish</Chip>
      </div>
      <div className="mt-3">
        <Segmented
          label="Sort recipes"
          value={effectiveSort}
          options={[...(target ? [{ value: "fit" as const, label: "Closest fit" }] : []), { value: "price" as const, label: "Lowest price" }, { value: "protein" as const, label: "Most protein" }]}
          onChange={setSort}
        />
      </div>

      {!manifest || (shop && state.status === "loading") ? (
        <Spinner label="Loading recipes" />
      ) : !shop ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title="No supermarket list yet." body="Recipes appear once we've read a supermarket's products and prices." /></div>
      ) : state.status === "error" ? (
        <div className="mt-5"><ErrorBox message="Couldn't load the recipes. Check your connection." onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : shown.length === 0 && filtering && cards.length > 0 ? (
        <div className="mt-5">
          <EmptyState icon={<PotIcon className="h-7 w-7" />} title="No recipes match." body="Try another word or meal." />
          <div className="mt-3 flex justify-center"><Button variant="secondary" onClick={() => { setQuery(""); setMeal(null); setMeatFree(false); }}>Show all recipes</Button></div>
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title="No recipes here yet." body={leftOut ? "None of our recipes suit your diet at this shop yet." : `We haven't read enough of ${possessive(shopName)} product pages to fill these recipes yet.`} /></div>
      ) : (
        <>
          <p role="status" className="app-numbers mt-3 px-1 text-sm text-muted">{shown.length === 1 ? "1 recipe" : `${shown.length} recipes`}{filtering ? " match" : ""}</p>
          <ul className="stagger mt-2 grid gap-3 sm:grid-cols-2">
            {shown.slice(0, limit).map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}`} /></li>))}
          </ul>
          {shown.length > limit && (
            <div className="mt-4"><Button full variant="secondary" className="min-h-14 text-base" onClick={() => setLimit((n) => n + PAGE)}>Show more recipes ({shown.length - limit} more)</Button></div>
          )}
          {leftOut > 0 && <p className="mt-3 px-1 text-sm text-muted">{leftOut} {leftOut === 1 ? "recipe is" : "recipes are"} left out for your diet.</p>}
        </>
      )}

      {state.status === "ready" && (
        <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
          Prices from {possessive(state.file.name)} website, checked {formatDate(state.file.checkedOn)}; nutrition from each product&apos;s own page{state.file.nutritionCheckedOn ? `, checked ${formatDate(state.file.nutritionCheckedOn)}` : ""}.
          &quot;Each&quot; prices only the amounts a serving uses. Vegetables, oil and seasoning you add aren&apos;t counted. Recipes are chosen for your diet by their ingredients; check each pack. Not affiliated with {state.file.name}.
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
