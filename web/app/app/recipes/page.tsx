"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { savedToRecipe } from "@/lib/mm/aiRecipe";
import { mealSlotFor } from "@/lib/mm/budget";
import { AI_RECIPES_ENABLED, GATING_ENABLED, PHOTO_RECIPES_ENABLED, SAMPLES_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import { RETAILERS } from "@/lib/mm/groceries";
import { tk, type T } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { toggleAllergen } from "@/lib/mm/menu-view";
import { RECIPES } from "@/lib/mm/recipeBook";
import { cuisineOptions, matchesNiche, nicheCounts, nicheSearchWords, occasionOptions, type CuisineOption, type OccasionOption } from "@/lib/mm/recipeNiche";
import { isMeatFree, isQuick, isVegan, MEAL_TYPES, type MealType, type Recipe } from "@/lib/mm/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { myRecipesStore, savedRecipesStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { ShopMark } from "../_components/ChainMark";
import { AllergenTiles, dietWords } from "../_components/DietPicker";
import { ArrowRightIcon, BasketIcon, CalendarIcon, CameraIcon, CheckIcon, ChevronRightIcon, GridIcon, HeartIcon, InfoIcon, LeafIcon, ListIcon, PotIcon, SearchIcon, SproutIcon, TodayIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../_components/SearchDone";
import { ShopChoice } from "./ShopChoice";
import { useGate } from "../_components/Paywall";
import { Button, EmptyState, ErrorBox, Segmented, Sheet, Spinner } from "../_components/ui";
import { useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";
import { usePossessive, useT } from "../_lib/i18n";
import { recipeShopSetFor, useRecipeCards, useRecipeMakerEnabled, useRecipeShopSet, type RecipeCard } from "../_lib/recipes";
import { useListRecipes } from "../_lib/listRecipes";
import { useShopManifest } from "../_lib/shopProducts";
import { MealPicker, targetSentence } from "./MealPicker";
import { FilterChip, NicheFields } from "./NicheFields";
import { MEAL_LOOK, RecipeTile } from "./RecipeTile";
import { RecipeThumbStack, hasRecipePicture } from "./RecipeThumb";
import { useNicheFilter } from "./useNicheFilter";

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
// Founder 2026-10-16: "a way to customise by niche, for example for Christmas, or like Chinese cuisine or Indian": a Cuisine and an Occasion field
// under the tiles (NicheFields; the choice lives in the address, useNicheFilter; the catalogue is lib/mm/recipeBook/niches.ts). They narrow the list like
// the tiles and the search do (both together, and the diet), hide "Picked for you" like a search does, and the search finds a recipe by their words too.
// Nothing about a niche is printed on a recipe card.

type Sort = "fit" | "price" | "protein";
type Toggle = "quick" | "meatFree" | "vegan";
const PAGE = 24;
const PICKS = 8;
// The cuisines on offer are decided by the whole book (not by a person's diet or shop), so a choice never comes and goes; the occasions by the book and today's date.
const RECIPE_IDS = RECIPES.map((r) => r.id);
const CUISINE_OPTIONS = cuisineOptions(RECIPE_IDS);

const TOGGLES: ReadonlyArray<{ value: Toggle; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "quick", label: tk("Quick"), Icon: TodayIcon },
  { value: "meatFree", label: tk("No meat or fish"), Icon: LeafIcon },
  { value: "vegan", label: tk("Vegan"), Icon: SproutIcon },
];
const TOGGLE_TEST: Record<Toggle, (r: Recipe) => boolean> = { quick: isQuick, meatFree: isMeatFree, vegan: isVegan };

const HEADING = "text-xl font-[800] tracking-[-0.01em]";
const PILL = "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong";

/** Search words against a recipe's name, blurb and ingredient names ("chicken", "curry", "oats"), in English and in the reader's language, and the words of its
 *  cuisine and occasions that are on offer ("chinese", "picnic", "bbq"). */
function matchesSearch(r: Recipe, q: string, t: T, offered: { cuisines: readonly CuisineOption[]; occasions: readonly OccasionOption[] }): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const labels = r.ingredients.map((i) => i.label);
  const own = r.ai ? labels.map((x) => t(x)) : [r.name, r.blurb, ...labels].map((x) => t(x));
  const hay = [r.name, r.blurb, ...labels, ...own, ...nicheSearchWords(r.id, t, offered)].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

function sortCards(cards: RecipeCard[], sort: Sort): RecipeCard[] {
  const key = (c: RecipeCard): number => (sort === "fit" ? c.distance : sort === "protein" ? -c.totals.perServing.protein : (c.totals.costPerServing ?? Infinity));
  return [...cards].sort((a, b) => key(a) - key(b) || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
}

/** One of the eight big tiles: an icon over a word. Pressed = dark (any number at once); "More" is the one lime tile, as in the reference, and opens the Filters sheet. */
function Tile({ label, Icon, pressed, onClick, more, expanded }: { label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; pressed?: boolean; onClick: () => void; more?: boolean; expanded?: boolean }) {
  const look = more
    ? expanded ? "bg-foreground text-background" : "bg-sun text-[var(--on-accent)]"
    : pressed ? "bg-foreground text-background" : "glass hover:bg-soft-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      {...(more ? { "aria-haspopup": "dialog" as const } : { "aria-pressed": !!pressed })}
      className={`flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1.25rem] px-1.5 py-2.5 text-center transition active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${look}`}
    >
      <Icon className={`h-6 w-6 ${pressed || more ? "" : "text-accent"}`} />
      <span className="w-full text-sm font-semibold leading-tight [hyphens:auto] [overflow-wrap:break-word]">{label}</span>
    </button>
  );
}

/** Where the person is shopping, beside the search (founder 2026-11-17: one shop at a time): that shop's own logo and name with a small arrow; a tap opens the choice. */
function ShopsButton({ shop, onClick }: { shop: string | null; onClick: () => void }) {
  const t = useT();
  const name = shop ? (RETAILERS.find((r) => r.id === shop)?.name ?? "") : "";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={name ? `${t("Shopping at")}: ${name}` : t("Shopping at")}
      className="glass inline-flex min-h-[3.25rem] max-w-[46%] shrink-0 items-center gap-2 rounded-full ps-2 pe-3 transition hover:bg-soft-strong active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {shop ? <span aria-hidden><ShopMark shopId={shop} size="sm" /></span> : <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-soft-strong"><BasketIcon className="h-5 w-5" /></span>}
      {name && <span aria-hidden className="min-w-0 truncate text-[0.9375rem] font-bold">{name}</span>}
      <span aria-hidden className="text-muted">▾</span>
    </button>
  );
}

// What happens after Continue, said one line at a time (founder 2026-11-16: "a loading animation ... about 2 seconds ... showing that it's working"). Each line
// is something the app really does once the shops are saved: the list below is worked out again for the person's diet and meal size.
const WORKING_LINES = [tk("Saving your shop…"), tk("Matching recipes to your diet…"), tk("Working out each serving's price and nutrition…")];
const WORKING_STEP_MS = 650;

function ShopsWorking({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => (step < WORKING_LINES.length ? setStep(step + 1) : onDone()), step < WORKING_LINES.length ? WORKING_STEP_MS : 300);
    return () => clearTimeout(timer);
  }, [step, onDone]);
  return (
    <div className="pb-2 pt-1">
      <div className="flex justify-center"><Pip mood={step >= WORKING_LINES.length ? "cheer" : "think"} size={88} /></div>
      <p role="status" aria-live="polite" className="sr-only">{t(WORKING_LINES[Math.min(step, WORKING_LINES.length - 1)]!)}</p>
      <ul aria-hidden className="mt-4 space-y-3">
        {WORKING_LINES.map((line, i) => (
          <li key={line} className={`flex items-center gap-3 text-[1.0625rem] font-semibold transition-colors ${i <= step ? "text-foreground" : "text-muted"}`}>
            {i < step ? (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)]"><CheckIcon className="h-4 w-4" /></span>
            ) : i === step ? (
              <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-[rgba(17,24,20,0.1)] border-t-[var(--bar)] motion-reduce:animate-none" />
            ) : (
              <span className="h-7 w-7 shrink-0 rounded-full border-[3px] border-[rgba(17,24,20,0.1)]" />
            )}
            <span>{t(line)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecipesScreen() {
  const t = useT();
  const poss = usePossessive();
  const asked = useSearchParams().get("r");
  const settings = useSettings();
  const manifest = useShopManifest();
  // founder 2026-11-17: the ingredients come from the person's shops whose labels we've read, the first ticked first (a link's ?r= counts only while none of
  // theirs can make recipes, and not once the shops are changed here); every card is worked out from those shops' products together (lib/mm/recipes.ts: another shop fills in only what the first doesn't sell)
  const [ownShops, setOwnShops] = useState(false);
  const shopIds = recipeShopSetFor(manifest, ownShops ? null : asked, settings.shops);
  const shop = shopIds[0] ?? null;
  const [retry, setRetry] = useState(0);
  const state = useRecipeShopSet(shopIds, retry);
  const products = state.status === "ready" ? state.products : null;
  const target = mealTargetFor(settings);
  const diet = settings.preferences;
  const { cards, leftOut, incomplete } = useRecipeCards(null, products, diet, target);
  const saved = useStore(myRecipesStore);
  const savedCount = useStore(savedRecipesStore).length + saved.length;
  const shopping = useStore(shoppingStore);
  const dietKey = JSON.stringify(diet);
  const mine = useMemo(() => saved.filter((s) => s.shop === shop).map((s) => savedToRecipe(s, JSON.parse(dietKey))).filter((r): r is Recipe => !!r), [saved, shop, dietKey]);
  const mineCards = useRecipeCards(mine, products, diet, target).cards;
  // Founder 2026-11-18: several at once ("they shouldn't have to select just one"). The meals are alternatives (Breakfast and Lunch shows breakfasts and
  // lunches); Quick, No meat or fish and Vegan all apply, to every meal chosen ("breakfasts that are no meat or fish and vegan, lunches that are ...").
  const [meals, setMeals] = useState<ReadonlySet<MealType>>(new Set());
  const [toggles, setToggles] = useState<ReadonlySet<Toggle>>(new Set());
  // "More" opens every filter in one sheet (founder 2026-11-18: "it opens all of them including the 7 there"); openAt is the part it opens at
  const [more, setMore] = useState(false);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const openFilters = (at: string | null = null) => { setOpenAt(at); setMore(true); };
  useEffect(() => {
    if (!more || !openAt) return;
    const id = requestAnimationFrame(() => document.getElementById(openAt)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [more, openAt]);
  const [shopsOpen, setShopsOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const chosenShops = settings.shops ?? [];
  const closeShops = useCallback(() => { setShopsOpen(false); setWorking(false); }, []);
  // founder 2026-11-17: one shop at a time. The chosen shop goes first among the person's supermarkets (the others stay ticked for Groceries), and the recipes follow
  // it at once, even when the page was opened for another shop (a link's ?r=); a short "working" moment then closes the sheet.
  const pickShop = (id: string) => {
    if (id !== shop) updateSettings({ shops: [id, ...chosenShops.filter((x) => x !== id)] });
    setOwnShops(true);
    if (id !== shop) setWorking(true); else closeShops();
  };
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<Sort | null>(null);
  const effectiveSort: Sort = sort ?? (target ? "fit" : "protein");
  const now = useNow();
  // The occasions on offer are decided by the date this visit began, not by the clock as it ticks: a season that ends (or starts) while the page is open
  // must not change the list under someone's finger (a chosen Bonfire Night would jump to "Any occasion" at midnight). Opening the screen again picks up the date.
  const [visitDate] = useState(() => new Date());
  const occasionOpts = useMemo(() => occasionOptions(RECIPE_IDS, visitDate), [visitDate]);
  const niche = useNicheFilter(CUISINE_OPTIONS, occasionOpts);
  const offered = useMemo(() => ({ cuisines: CUISINE_OPTIONS, occasions: occasionOpts }), [occasionOpts]);
  // everything but the niche, then the niche: the counts beside each cuisine and occasion are worked out from the first list
  const base = useMemo(
    () => cards.filter((c) => [...toggles].every((x) => TOGGLE_TEST[x](c.recipe)) && (meals.size === 0 || (!!c.recipe.meal && meals.has(c.recipe.meal))) && matchesSearch(c.recipe, query, t, offered)),
    [cards, toggles, meals, query, t, offered],
  );
  const shown = useMemo(() => sortCards(base.filter((c) => matchesNiche(c.recipe.id, niche.cuisines, niche.occasions)), effectiveSort), [base, niche.cuisines, niche.occasions, effectiveSort]);
  const nicheNumbers = useMemo(() => (cards.length ? nicheCounts(base.map((c) => c.recipe.id), niche.cuisines, niche.occasions) : null), [cards.length, base, niche.cuisines, niche.occasions]);
  const nicheOn = niche.cuisines.length > 0 || niche.occasions.length > 0;
  const filtering = toggles.size > 0 || meals.size > 0 || query.trim() !== "" || nicheOn;
  const slot: MealType = mealSlotFor(now);
  const picks = useMemo(() => sortCards(cards.filter((c) => c.recipe.meal === slot), target ? "fit" : "protein").slice(0, PICKS), [cards, slot, target]);
  // how many recipes the shopping list can help make, and the first three (their pictures go on the card)
  // worked out exactly as its page, /app/groceries/list/recipes, works them out (useListRecipes: the person's recipe shops, never this page's ?r=), so the
  // count and the pictures are always what that page lists
  const fromList = useListRecipes(shopping).matches ?? [];
  const listRecipes = fromList.length;
  const nameOf = (id: string) => manifest?.retailers.find((r) => r.id === id)?.name ?? "";
  const shopName = shop ? nameOf(shop) : "";
  const shopNames = shopIds.map(nameOf).filter(Boolean);
  // the person's shops whose product labels we haven't read: recipes can't be made from them yet, so say which shop they come from instead
  const unreadShops = (manifest?.retailers ?? []).filter((r) => chosenShops.includes(r.id) && !recipeShops(manifest).some((x) => x.id === r.id)).map((r) => r.name);
  // none of the person's own shops can make recipes yet, so the recipes come from another shop
  const notMine = chosenShops.length > 0 && !!shop && !shopIds.some((id) => chosenShops.includes(id));
  const otherShopNote = notMine && shopName && unreadShops.length
    ? t("These recipes use {shop} products for now. We haven't read enough of {shops} product labels yet, so their recipes aren't ready.", { shop: shopName, shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(unreadShops.map((n) => poss(n))) })
    : "";
  const makerOn = useRecipeMakerEnabled();
  const words = dietWords(t, diet);
  const pro = useIsPro();
  const { gate } = useGate();
  const router = useRouter();
  const makeHref = `/app/recipes/make${shop ? `?r=${shop}` : ""}`;

  const flip = (x: Toggle) => { setToggles((s) => { const n = new Set(s); if (n.has(x)) n.delete(x); else n.add(x); return n; }); setLimit(PAGE); };
  const flipMeal = (m: MealType) => { setMeals((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; }); setLimit(PAGE); };
  // What a screen reader is told as the list changes: how many recipes there are, or that none match. One live region stays mounted for every state, so the
  // words are read when an empty list fills and when a list empties (a region that appears together with its text is often not read).
  const countLine = shown.length === 1 ? (filtering ? t("1 recipe match") : t("1 recipe")) : filtering ? t("{n} recipes match", { n: shown.length }) : t("{n} recipes", { n: shown.length });
  const liveLine = shown.length > 0 ? countLine : filtering && cards.length > 0 ? t("No recipes match.") : "";
  const clearAll = () => { setQuery(""); setMeals(new Set()); setToggles(new Set()); niche.clear(); setLimit(PAGE); };
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
        {/* My recipes (founder 2026-11-18: "instead of the love heart ... maybe its better having 'my recipes'"): the heart and the words in a grey pill, with
            how many are saved, opening My meals at its Recipes tab (the recipes saved with a card's heart and the ones made for the person) */}
        <Link href="/app/meals?tab=recipes" data-coach="recipes-mine" aria-label={savedCount > 0 ? `${t("My recipes")} · ${savedCount}` : t("My recipes")} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-soft-strong ps-3 pe-3.5 text-[0.9375rem] font-bold transition hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] active:scale-95">
          <HeartIcon aria-hidden className="h-[18px] w-[18px]" />
          <span aria-hidden>{t("My recipes")}</span>
          {savedCount > 0 && <span aria-hidden className="app-numbers grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[0.6875rem] font-bold leading-none text-background">{savedCount}</span>}
        </Link>
      </div>

      <h1 className="mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">{t("What's cooking today?")}</h1>
      <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">
        {/* the two ways to use this tab, first (founder 2026-11-18: "is it clear on this screen that the people can either choose from pre selected meals that we
            crafted or make their own?") */}
        {PHOTO_RECIPES_ENABLED ? t("Pick one of our recipes, or make your own from a photo.") : t("Pick one of our recipes.")}{" "}
        {shopNames.length ? t("Every ingredient is a real product at {shop}, with its price and the nutrition of each serving.", { shop: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(shopNames) }) : t("Every ingredient is a real product at your supermarket, with its price and the nutrition of each serving.")}
      </p>

      {/* Which supermarkets the ingredients come from: only shops whose full product list, prices and labels we've read can fill a recipe, and all of the
          person's that can are used together (the line above names them); a person whose shops can't yet is told which shop the recipes use instead. */}
      {otherShopNote && (
        <p role="note" className="mt-3 flex gap-2.5 rounded-[1rem] bg-[var(--fill)] p-3.5 text-[0.9375rem] leading-snug">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <span>{otherShopNote}</span>
        </p>
      )}

      <div className="mt-4 flex items-center gap-2.5">
        <div className="group/search relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
          {/* 16 px text: smaller text makes iPhone Safari zoom into the field */}
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t("Search recipes")} aria-label={t("Search recipes")} {...DONE_KEY} autoComplete="off" className={`glass min-h-[3.25rem] w-full rounded-full ps-12 pe-4 ${DONE_ROOM} text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent`} />
          <SearchDone />
        </div>
        <ShopsButton shop={shop} onClick={() => { setWorking(false); setShopsOpen(true); }} />
      </div>
      {PHOTO_RECIPES_ENABLED && (
        // Make it at home (Premium; app/app/recipes/photo/page.tsx). Founder 2026-11-17 ("it can be easily missed"): the one dark card on the page, at the top under the
        // search, in the tab bar's near-black, with the scanner's lime corner marks round the camera. It opens the paywall for a free person.
        <button type="button" data-coach="recipes-photo" onClick={() => gate("photoRecipe", () => router.push("/app/recipes/photo"))} className="group relative mt-4 flex min-h-[5.25rem] w-full items-center gap-3 overflow-hidden rounded-[1.5rem] bg-[#1d2320] p-3.5 text-start text-white shadow-[0_18px_40px_-20px_rgba(0,0,0,0.6)] transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span aria-hidden className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[0.875rem] bg-white/10 text-sun">
            <span className="absolute start-1 top-1 h-2.5 w-2.5 rounded-ss-md border-s-2 border-t-2 border-[var(--sun)]" />
            <span className="absolute end-1 top-1 h-2.5 w-2.5 rounded-se-md border-e-2 border-t-2 border-[var(--sun)]" />
            <span className="absolute bottom-1 start-1 h-2.5 w-2.5 rounded-es-md border-b-2 border-s-2 border-[var(--sun)]" />
            <span className="absolute bottom-1 end-1 h-2.5 w-2.5 rounded-ee-md border-b-2 border-e-2 border-[var(--sun)]" />
            <CameraIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Make it at home")}</span>
              {!pro && <span className="inline-block rounded-full bg-sun px-2 py-0.5 text-[0.8125rem] font-bold leading-snug text-[var(--on-accent)]">{t("Premium")}</span>}
            </span>
            <span className="mt-0.5 block text-[0.875rem] leading-snug text-white/80">{t("Snap a dish you've loved and get a recipe from your supermarket.")}</span>
          </span>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)] transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"><ArrowRightIcon className="h-[1.125rem] w-[1.125rem]" /></span>
        </button>
      )}

      {/* the meal plan (founder 2026-11-18; app/app/plan; Premium): a week of our recipes for the person's goal and budget, with the shopping list and each meal's price */}
      <Link href="/app/plan" className="glass lift mt-3 flex min-h-[4.5rem] items-center gap-3.5 rounded-[1.25rem] p-3.5 text-start">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[0.875rem] bg-sun text-[var(--on-accent)]"><CalendarIcon className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[1.0625rem] font-[800] leading-tight">{t("Meal plan")}</span>
            {GATING_ENABLED && !pro && <span className="inline-block rounded-full bg-sun px-2 py-0.5 text-[0.8125rem] font-bold leading-snug text-[var(--on-accent)]">{t("Premium")}</span>}
          </span>
          <span className="mt-0.5 block text-[0.875rem] leading-snug text-muted">{t("A week of meals for your goal and budget, with the shopping list and what each meal costs.")}</span>
        </span>
        <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted rtl:rotate-180" />
      </Link>

      {/* One shop at a time; tapping a shop saves it at once and shows a short "working" moment. */}
      <Sheet open={shopsOpen} onClose={closeShops} title={t("Shopping at")}>
        {working ? (
          <ShopsWorking onDone={closeShops} />
        ) : (
          <>
            <p className="text-[0.9375rem] leading-snug text-muted">{t("Recipes are made for one shop at a time. Choose where you're shopping; you can change it any time.")}</p>
            <div className="mt-3">
              <ShopChoice shops={recipeShops(manifest).map((r) => ({ id: r.id, name: r.name }))} value={shop} onChange={pickShop} />
            </div>
            {unreadShops.length > 0 && (
              <p role="note" className="mt-3 flex gap-2.5 rounded-[1rem] bg-[var(--fill)] p-3.5 text-[0.9375rem] leading-snug">
                <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span>{t("Recipes can't use {shops} yet: we haven't read enough of their products' labels.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(unreadShops) })}</span>
              </p>
            )}
          </>
        )}
      </Sheet>

      {/* Eight big tiles: four columns on a phone, fewer when the text is large (the minimum width is in rem). */}
      <div role="group" aria-label={t("Filters")} data-coach="recipes-tiles" className="mt-3.5 grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(min(100%,4.9rem),1fr))] gap-2.5">
        {MEAL_TYPES.map((m) => (
          <Tile key={m.value} label={t(m.label)} Icon={MEAL_LOOK[m.value].Icon} pressed={meals.has(m.value)} onClick={() => flipMeal(m.value)} />
        ))}
        {TOGGLES.map((x) => (
          <Tile key={x.value} label={t(x.label)} Icon={x.Icon} pressed={toggles.has(x.value)} onClick={() => flip(x.value)} />
        ))}
        <Tile label={t("More")} Icon={GridIcon} more expanded={more} onClick={() => openFilters()} />
      </div>

      {/* Cuisine and Occasion side by side (founder 2026-11-18); each opens the Filters sheet at its own choices, since each can hold several. */}
      <NicheFields
        cuisines={CUISINE_OPTIONS}
        occasions={occasionOpts}
        chosenCuisines={niche.cuisines}
        chosenOccasions={niche.occasions}
        onOpen={(field) => openFilters(field === "cuisine" ? "filter-cuisine" : "filter-occasion")}
      />

      {/* Every filter in one sheet (founder 2026-11-18: "when they select more it opens all of them including the 7 there and they can select more filters
          multiple as many as they want"): the seven tiles' choices, every cuisine and occasion with how many recipes each has, then the sort, the meal size,
          allergies and the diet. Choices apply at once; the button at the bottom says how many recipes match and closes the sheet. */}
      <Sheet open={more} onClose={() => setMore(false)} title={t("Filters")}>
        <div className="space-y-5 pb-2">
          <section aria-labelledby="filter-meal-h">
            <p id="filter-meal-h" className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Meal")}</p>
            <div role="group" aria-labelledby="filter-meal-h" className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((m) => <FilterChip key={m.value} label={t(m.label)} pressed={meals.has(m.value)} onClick={() => flipMeal(m.value)} />)}
            </div>
          </section>
          <section aria-labelledby="filter-only-h">
            <p id="filter-only-h" className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Only show")}</p>
            <div role="group" aria-labelledby="filter-only-h" className="flex flex-wrap gap-2">
              {TOGGLES.map((x) => <FilterChip key={x.value} label={t(x.label)} pressed={toggles.has(x.value)} onClick={() => flip(x.value)} />)}
            </div>
          </section>
          {CUISINE_OPTIONS.length > 0 && (
            <section id="filter-cuisine" aria-labelledby="filter-cuisine-h" className="scroll-mt-24">
              <p id="filter-cuisine-h" className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Cuisine")}</p>
              <div role="group" aria-labelledby="filter-cuisine-h" className="flex flex-wrap gap-2">
                {CUISINE_OPTIONS.map((c) => <FilterChip key={c.id} label={t(c.label)} count={nicheNumbers ? (nicheNumbers.cuisine.get(c.id) ?? 0) : null} pressed={niche.cuisines.includes(c.id)} onClick={() => { niche.toggleCuisine(c.id); setLimit(PAGE); }} />)}
              </div>
            </section>
          )}
          {occasionOpts.length > 0 && (
            <section id="filter-occasion" aria-labelledby="filter-occasion-h" className="scroll-mt-24">
              <p id="filter-occasion-h" className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Occasion")}</p>
              <div role="group" aria-labelledby="filter-occasion-h" className="flex flex-wrap gap-2">
                {occasionOpts.map((o) => <FilterChip key={o.id} label={t(o.label)} count={nicheNumbers ? (nicheNumbers.occasion.get(o.id) ?? 0) : null} pressed={niche.occasions.includes(o.id)} onClick={() => { niche.toggleOccasion(o.id); setLimit(PAGE); }} />)}
              </div>
            </section>
          )}
          <div id="recipe-options" className="scroll-mt-24 space-y-3">
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
            {/* The same choice as Settings' "Allergies to avoid" (one setting for the whole app), here so it can be changed while looking at recipes. */}
            <div className="glass rounded-[1.25rem] p-4">
              <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Allergies to avoid")}</p>
              <AllergenTiles chosen={diet.avoidAllergens ?? []} label={t("Allergies to avoid")} onToggle={(k) => { updateSettings({ preferences: toggleAllergen(diet, k) }); setLimit(PAGE); }} />
              {(diet.avoidAllergens?.length ?? 0) > 0 && (
                <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">
                  {diet.halalOnly
                    ? t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen or halal labels, so check each pack before you buy.")
                    : t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen labels, so check each pack before you buy.")}
                </p>
              )}
            </div>
            <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[1.25rem] p-4">
              <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug"><span className="font-bold">{t("Your diet:")}</span> {words.length ? words.join(" · ") : t("nothing left out")}</p>
              <Link href="/app/settings#diet" className={`${PILL} bg-[var(--fill)]`}>{t("Change")}</Link>
            </div>
          </div>
        </div>
        {/* stays at the bottom while the sheet scrolls */}
        <div className="sticky bottom-[calc(-1*max(1.75rem,env(safe-area-inset-bottom)))] z-10 -mx-5 -mb-[max(1.75rem,env(safe-area-inset-bottom))] flex items-center gap-2.5 bg-white px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_18px_-14px_rgba(17,24,20,0.3)]">
          {filtering && <button type="button" onClick={clearAll} className={`${PILL} bg-[var(--fill)]`}>{t("Clear all")}</button>}
          <Button full className="min-h-12 flex-1" onClick={() => setMore(false)}>
            <span className="app-numbers">{shown.length === 0 && filtering ? t("No recipes match.") : shown.length === 1 ? t("Show 1 recipe") : t("Show {n} recipes", { n: shown.length })}</span>
          </Button>
        </div>
      </Sheet>

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
        <Link href="/app/groceries/list/recipes" className="glass lift group @container mt-4 flex min-h-16 items-center gap-3 rounded-[1.25rem] p-3.5">
          {/* the pictures of the recipes it leads to (founder 2026-11-17: "Use images please when possible"), the same files as the cards below; the list icon when none has one */}
          {fromList.some((m) => hasRecipePicture(m.recipe.id))
            ? <RecipeThumbStack recipes={fromList.slice(0, 3).map((m) => m.recipe)} moreClass="hidden @[18rem]:block" />
            : <span aria-hidden className="icon-bubble-soft h-11 w-11 shrink-0"><ListIcon className="h-5 w-5" /></span>}
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
          <button type="button" aria-haspopup="dialog" onClick={() => openFilters("recipe-options")} className={`glass ${PILL}`}>{t("Adjust")}</button>
        </div>

        <p role="status" className="sr-only">{liveLine}</p>

        {!manifest || (shop && state.status === "loading") ? (
          <Spinner label={t("Loading recipes")} />
        ) : !shop ? (
          <div className="mt-4"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} /></div>
        ) : state.status === "error" ? (
          <div className="mt-4"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
        ) : shown.length === 0 && filtering && cards.length > 0 ? (
          <div className="mt-4">
            <EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipes match.")} body={nicheOn ? t("Try another cuisine, occasion, word or meal.") : t("Try another word or meal.")} />
            <div className="mt-3 flex justify-center"><Button variant="secondary" onClick={clearAll}>{t("Show all recipes")}</Button></div>
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-4"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipes here yet.")} body={leftOut ? t("None of our recipes suit your diet at this shop yet.") : t("We haven't read enough of {shop} product pages to fill these recipes yet.", { shop: poss(shopName) })} /></div>
        ) : (
          <>
            {/* on screen the count shows only while filtering, next to Clear (the heading already says how many); it is said aloud by the one live region above */}
            <div className={filtering ? "mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-1" : "sr-only"}>
              <p aria-hidden className="app-numbers text-[0.9375rem] text-muted">{countLine}</p>
              {filtering && <button type="button" onClick={clearAll} className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] font-bold text-accent hover:bg-accent-soft">{t("Clear")}</button>}
            </div>
            <ul className={`stagger grid ${filtering ? "mt-1" : "mt-4"} grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3`}>
              {shown.slice(0, limit).map((c) => (<li key={c.recipe.id} className="min-w-0"><RecipeTile card={c} href={href(c)} /></li>))}
            </ul>
            {shown.length > limit && (
              <div className="mt-4"><Button full variant="secondary" className="min-h-12" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: shown.length - limit })}</Button></div>
            )}
            {leftOut > 0 && <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{leftOut === 1 ? t("1 recipe is left out for your diet.") : t("{n} recipes are left out for your diet.", { n: leftOut })}</p>}
            {/* founder 2026-11-17: recipes come from the shops the person picks; one they can't fill there isn't shown, and the page says how many */}
            {incomplete > 0 && shopNames.length > 0 && (
              <p className="mt-2 px-1 text-[0.9375rem] leading-snug text-muted">
                {incomplete === 1
                  ? t("1 more recipe needs something we haven't found at {shops} yet. Choose another shop to see it.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(shopNames) })
                  : t("{n} more recipes need something we haven't found at {shops} yet. Choose another shop to see them.", { n: incomplete, shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(shopNames) })}
              </p>
            )}
          </>
        )}
      </section>

      {state.status === "ready" && (
        <p className="mt-8 border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-muted">
          {/* one sentence per shop the recipes use */}
          {state.files.map((f) => (f.nutritionCheckedOn
            ? t("Prices from {shop} website, checked {date}; nutrition from each product's own page, checked {nutritionDate}.", { shop: poss(f.name), date: formatDate(f.checkedOn, t), nutritionDate: formatDate(f.nutritionCheckedOn, t) })
            : t("Prices from {shop} website, checked {date}; nutrition from each product's own page.", { shop: poss(f.name), date: formatDate(f.checkedOn, t) }))).join(" ")}{" "}
          {t("\"Each\" prices only the amounts a serving uses, including the pinch of salt and the spoon of oil. Recipes are chosen for your diet by their ingredients; check each pack.")}{" "}
          {state.files.length > 1 ? t("Not affiliated with {shops}.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(state.files.map((f) => f.name)) }) : t("Not affiliated with {shop}.", { shop: state.files[0]!.name })}
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
