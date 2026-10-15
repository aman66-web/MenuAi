"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { mealSlotFor } from "@/lib/mm/budget";
import { AI_RECIPES_ENABLED, SAMPLES_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import { tk, type T } from "@/lib/mm/i18n";
import { recipesFromList } from "@/lib/mm/listRecipes";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { isMeatFree, isQuick, isVegan, MEAL_TYPES, type MealType, type Recipe } from "@/lib/mm/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { myRecipesStore, savedRecipesStore, shoppingStore } from "@/lib/mm/stores";
import { dietWords } from "../_components/DietPicker";
import { ArrowRightIcon, GridIcon, HeartIcon, LeafIcon, ListIcon, PotIcon, SearchIcon, SproutIcon, TodayIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { useGate } from "../_components/Paywall";
import { Button, EmptyState, ErrorBox, Segmented, Spinner } from "../_components/ui";
import { useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { recipeShop, useRecipeCards, useRecipeMakerEnabled, type RecipeCard } from "../_lib/recipes";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";
import { MealPicker, targetSentence } from "./MealPicker";
import { MEAL_LOOK, RecipeTile } from "./RecipeTile";

// Recipes from your shop (founder 2026-10-10): every ingredient is a real product at that supermarket, with its shelf price and the
// nutrition its own page prints. Each recipe is fitted to the person's meal (size and protein) and their diet from Settings.
// Founder 2026-10-14, from a reference picture ("make the recipes page look exactly more like image 1 ... add whatever would make it better";
// the cards like image 2): Pip and a heart for My meals on top, "What's cooking today?", the search, eight big tiles (the four meals, Quick,
// No meat or fish, Vegan, More), "Picked for you" (the recipes closest to the person's meal size for the meal of the day, side by side), a
// nudge to cook from the shopping list, then every recipe as picture cards with calories and protein under the name. Sorting, the meal size
// and the diet sit under "More"; what recipes are fitted to stays in view above the list.
// Restyled 2026-10-15 to match Home ("the rest of the app should match that elegance too"): the headline compact and heavy on one line, a
// small grey circle for My meals, white tiles with 20 px corners (the chosen one dark, "More" the one lime tile), plain section headings,
// white cards and pills, and the meal of the day as a small spaced-capitals label.

type Sort = "fit" | "price" | "protein";
type Toggle = "quick" | "meatFree" | "vegan";
const PAGE = 24;
const PICKS = 8;

const TOGGLES: ReadonlyArray<{ value: Toggle; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "quick", label: tk("Quick"), Icon: TodayIcon },
  { value: "meatFree", label: tk("No meat or fish"), Icon: LeafIcon },
  { value: "vegan", label: tk("Vegan"), Icon: SproutIcon },
];
const TOGGLE_TEST: Record<Toggle, (r: Recipe) => boolean> = { quick: isQuick, meatFree: isMeatFree, vegan: isVegan };

const HEADING = "text-xl font-[800] tracking-[-0.01em]";
const PILL = "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong";

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

/** One of the eight big tiles: an icon over a word. Pressed = dark; "More" is the one lime tile, as in the reference. */
function Tile({ label, Icon, pressed, onClick, more, expanded }: { label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; pressed?: boolean; onClick: () => void; more?: boolean; expanded?: boolean }) {
  const look = more
    ? expanded ? "bg-foreground text-background" : "bg-sun text-[var(--on-accent)]"
    : pressed ? "bg-foreground text-background" : "glass hover:bg-soft-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      {...(more ? { "aria-expanded": !!expanded, "aria-controls": "recipe-options" } : { "aria-pressed": !!pressed })}
      className={`flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1.25rem] px-1.5 py-2.5 text-center transition active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${look}`}
    >
      <Icon className={`h-6 w-6 ${pressed || more ? "" : "text-accent"}`} />
      <span className="w-full text-sm font-semibold leading-tight [hyphens:auto] [overflow-wrap:break-word]">{label}</span>
    </button>
  );
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
  const shopping = useStore(shoppingStore);
  const dietKey = JSON.stringify(diet);
  const mine = useMemo(() => saved.filter((s) => s.shop === shop).map((s) => savedToRecipe(s, JSON.parse(dietKey))).filter((r): r is Recipe => !!r), [saved, shop, dietKey]);
  const mineCards = useRecipeCards(mine, products, diet, target).cards;
  const [meal, setMeal] = useState<MealType | null>(null);
  const [toggles, setToggles] = useState<ReadonlySet<Toggle>>(new Set());
  const [more, setMore] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<Sort | null>(null);
  const effectiveSort: Sort = sort ?? (target ? "fit" : "protein");
  const shown = useMemo(
    () => sortCards(cards.filter((c) => [...toggles].every((x) => TOGGLE_TEST[x](c.recipe)) && (!meal || c.recipe.meal === meal) && matchesSearch(c.recipe, query, t)), effectiveSort),
    [cards, toggles, meal, query, effectiveSort, t],
  );
  const filtering = toggles.size > 0 || meal !== null || query.trim() !== "";
  const now = useNow();
  const slot: MealType = mealSlotFor(now);
  const picks = useMemo(() => sortCards(cards.filter((c) => c.recipe.meal === slot), target ? "fit" : "protein").slice(0, PICKS), [cards, slot, target]);
  const listRecipes = useMemo(() => (shop && products && shopping.length ? recipesFromList(shopping, cards.map((c) => c.recipe), products, shop).length : 0), [shopping, cards, products, shop]);
  const shopName = manifest?.retailers.find((r) => r.id === shop)?.name ?? "";
  const makerOn = useRecipeMakerEnabled();
  const words = dietWords(t, diet);
  const pro = useIsPro();
  const { gate } = useGate();
  const router = useRouter();
  const makeHref = `/app/recipes/make${shop ? `?r=${shop}` : ""}`;

  const flip = (x: Toggle) => { setToggles((s) => { const n = new Set(s); if (n.has(x)) n.delete(x); else n.add(x); return n; }); setLimit(PAGE); };
  const clearAll = () => { setQuery(""); setMeal(null); setToggles(new Set()); setLimit(PAGE); };
  const href = (c: RecipeCard) => `/app/recipes/view?id=${c.recipe.id}&r=${shop}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-soft-strong">
            <Pip mood="wave" size={34} className="translate-y-0.5" />
          </span>
          <span className="truncate text-base font-semibold">{t("Recipes")}</span>
        </div>
        {/* a small grey circle like Home's calendar button, inside a full 44 px tap area; the count sits on its edge */}
        <Link href="/app/meals?tab=recipes" aria-label={savedCount > 0 ? `${t("My meals")} · ${savedCount}` : t("My meals")} className="group relative -me-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]"><HeartIcon className="h-[18px] w-[18px]" /></span>
          {savedCount > 0 && <span aria-hidden className="app-numbers absolute end-0 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[0.6875rem] font-bold leading-none text-background">{savedCount}</span>}
        </Link>
      </div>

      <h1 className="mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">{t("What's cooking today?")}</h1>
      <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">
        {shopName ? t("Every ingredient is a real product at {shop}, with its price and the nutrition of each serving.", { shop: shopName }) : t("Every ingredient is a real product at your supermarket, with its price and the nutrition of each serving.")}
      </p>

      {/* Which supermarket the ingredients come from: only shops whose full product list, prices and labels we've read can fill a recipe. */}
      {recipeShops(manifest).length > 1 && shop && (
        <div className="mt-4">
          <Segmented label={t("Supermarket")} value={shop} options={recipeShops(manifest).map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setPicked(v)} />
        </div>
      )}

      <label className="relative mt-4 block">
        <span className="sr-only">{t("Search recipes")}</span>
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        {/* 16 px text: smaller text makes iPhone Safari zoom into the field */}
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t("Search recipes, e.g. chicken or curry")} enterKeyHint="search" autoComplete="off" className="glass min-h-[3.25rem] w-full rounded-full ps-12 pe-4 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent" />
      </label>

      {/* Eight big tiles: four columns on a phone, fewer when the text is large (the minimum width is in rem). */}
      <div role="group" aria-label={t("Filters")} className="mt-3.5 grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(min(100%,4.9rem),1fr))] gap-2.5">
        {MEAL_TYPES.map((m) => (
          <Tile key={m.value} label={t(m.label)} Icon={MEAL_LOOK[m.value].Icon} pressed={meal === m.value} onClick={() => { setMeal(meal === m.value ? null : m.value); setLimit(PAGE); }} />
        ))}
        {TOGGLES.map((x) => (
          <Tile key={x.value} label={t(x.label)} Icon={x.Icon} pressed={toggles.has(x.value)} onClick={() => flip(x.value)} />
        ))}
        <Tile label={t("More")} Icon={GridIcon} more expanded={more} onClick={() => setMore((v) => !v)} />
      </div>

      {more && (
        <div id="recipe-options" className="mt-3 space-y-3">
          <div className="glass rounded-[1.25rem] p-4">
            <p className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Sort by")}</p>
            <Segmented
              label={t("Sort recipes")}
              value={effectiveSort}
              options={[...(target ? [{ value: "fit" as const, label: t("Closest fit") }] : []), { value: "price" as const, label: t("Lowest price") }, { value: "protein" as const, label: t("Most protein") }]}
              onChange={setSort}
            />
          </div>
          <MealPicker summary={false} />
          <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[1.25rem] p-4">
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug"><span className="font-bold">{t("Your diet:")}</span> {words.length ? words.join(" · ") : t("nothing left out")}</p>
            <Link href="/app/settings#diet" className={`${PILL} bg-[var(--fill)]`}>{t("Change")}</Link>
          </div>
          <Button full variant="secondary" className="min-h-12" onClick={() => setMore(false)}>{t("Done")}</Button>
        </div>
      )}

      {AI_RECIPES_ENABLED && (makerOn || SAMPLES_ENABLED) && (
        <button type="button" onClick={() => gate("recipeMaker", () => router.push(makeHref))} className="glass lift group mt-4 flex min-h-[5.5rem] w-full items-center gap-3 rounded-[1.25rem] p-3 ps-2 text-start">
          <Pip mood="wave" size={64} />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <span className="block text-[1.0625rem] font-bold leading-snug tracking-[-0.01em]">{t("Ask Pip to make a recipe")}{!pro && <span className="ms-2 inline-block rounded-full bg-accent-soft px-2 py-0.5 align-middle text-sm font-bold text-accent">Pro</span>}</span>
            <span className="block text-[0.9375rem] leading-snug text-muted">{shopName ? t("Say what you fancy and Pip writes one from {shop} products, fitted to your meal and diet.", { shop: poss(shopName) }) : t("Say what you fancy and Pip writes one from your shop's products, fitted to your meal and diet.")}</span>
          </span>
          <span aria-hidden className="icon-bubble-soft h-10 w-10 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
        </button>
      )}

      {!filtering && picks.length > 0 && shop && (
        <section aria-labelledby="picks-heading" className="mt-7">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="picks-heading" className={HEADING}>{t("Picked for you")}</h2>
            <span className="kicker">{t(MEAL_TYPES.find((m) => m.value === slot)?.label ?? "Dinner")}</span>
          </div>
          <ul className="no-scrollbar -mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 scroll-px-5">
            {picks.map((c) => (
              <li key={c.recipe.id} className="w-[78%] max-w-[22rem] shrink-0 snap-start"><RecipeTile card={c} wide href={href(c)} /></li>
            ))}
          </ul>
        </section>
      )}

      {!filtering && listRecipes > 0 && (
        <Link href="/app/groceries/list/recipes" className="glass lift group mt-4 flex min-h-16 items-center gap-3 rounded-[1.25rem] p-3.5">
          <span aria-hidden className="icon-bubble-soft h-11 w-11 shrink-0"><ListIcon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold leading-snug">{t("Cook with what's on your list")}</span>
            <span className="app-numbers block text-[0.8125rem] text-muted">{listRecipes === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: listRecipes })}</span>
          </span>
          <ArrowRightIcon className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {mineCards.length > 0 && shop && (
        <section aria-labelledby="mine-heading" className="mt-7">
          <h2 id="mine-heading" className={HEADING}>{t("Your recipes")}</h2>
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3">
            {mineCards.map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} badge={t("Made by Pip")} href={`/app/recipes/view?mine=${c.recipe.id}&r=${shop}`} /></li>))}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-heading" className="mt-7">
        <h2 id="all-heading" className={HEADING}>{t("All recipes")}{cards.length > 0 && <span className="app-numbers font-semibold text-muted"> · {cards.length}</span>}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="app-numbers min-w-0 flex-1 text-[0.9375rem] leading-snug text-muted">{targetSentence(t, target)}{words.length > 0 && <> {t("Your diet:")} {words.join(" · ")}.</>}</p>
          <button type="button" aria-expanded={more} aria-controls="recipe-options" onClick={() => { setMore(true); requestAnimationFrame(() => document.getElementById("recipe-options")?.scrollIntoView({ behavior: "smooth", block: "start" })); }} className={`glass ${PILL}`}>{t("Adjust")}</button>
        </div>

        {!manifest || (shop && state.status === "loading") ? (
          <Spinner label={t("Loading recipes")} />
        ) : !shop ? (
          <div className="mt-4"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} /></div>
        ) : state.status === "error" ? (
          <div className="mt-4"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
        ) : shown.length === 0 && filtering && cards.length > 0 ? (
          <div className="mt-4">
            <EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipes match.")} body={t("Try another word or meal.")} />
            <div className="mt-3 flex justify-center"><Button variant="secondary" onClick={clearAll}>{t("Show all recipes")}</Button></div>
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-4"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipes here yet.")} body={leftOut ? t("None of our recipes suit your diet at this shop yet.") : t("We haven't read enough of {shop} product pages to fill these recipes yet.", { shop: poss(shopName) })} /></div>
        ) : (
          <>
            {/* the count is said aloud as it changes; on screen it shows only while filtering, next to Clear (the heading already says how many) */}
            <div className={filtering ? "mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-1" : "sr-only"}>
              <p role="status" className="app-numbers text-[0.9375rem] text-muted">{shown.length === 1 ? (filtering ? t("1 recipe match") : t("1 recipe")) : filtering ? t("{n} recipes match", { n: shown.length }) : t("{n} recipes", { n: shown.length })}</p>
              {filtering && <button type="button" onClick={clearAll} className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] font-bold text-accent hover:bg-accent-soft">{t("Clear")}</button>}
            </div>
            <ul className={`stagger grid ${filtering ? "mt-1" : "mt-4"} grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3`}>
              {shown.slice(0, limit).map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={href(c)} showMeal={!meal} /></li>))}
            </ul>
            {shown.length > limit && (
              <div className="mt-4"><Button full variant="secondary" className="min-h-12" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: shown.length - limit })}</Button></div>
            )}
            {leftOut > 0 && <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{leftOut === 1 ? t("1 recipe is left out for your diet.") : t("{n} recipes are left out for your diet.", { n: leftOut })}</p>}
          </>
        )}
      </section>

      {state.status === "ready" && (
        <p className="mt-8 border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-muted">
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
