"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatInt } from "@/lib/mm/format";
import { formatPrice } from "@/lib/mm/groceries";
import { tk } from "@/lib/mm/i18n";
import type { EatingStyle, PlanCandidate, PlanIds } from "@/lib/mm/mealPlan";
import { RECIPES } from "@/lib/mm/recipeBook";
import type { CuisineId } from "@/lib/mm/recipeBook/niches";
import { cuisineOptions, nicheCounts, occasionOptions } from "@/lib/mm/recipeNiche";
import type { MealType } from "@/lib/mm/recipes";
import { matchesRecipeSearch, recipeSearchExtras, type QuickFilter } from "@/lib/mm/recipeSearch";
import { pounds, settleRange, type PriceRange } from "@/lib/mm/servingPrice";
import { filterSwapRows, sortSwapRows, swapCuisines, swapPriceBounds, swapRows, swapSorts, usefulQuickFilters, type SwapSort } from "@/lib/mm/swapPicker";
import { CalendarIcon, PotIcon, SearchIcon } from "../_components/icons";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../_components/SearchDone";
import { Button, EmptyState, Sheet } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { LABEL } from "../groceries/PageBits";
import { FilterTile, QUICK_FILTERS } from "../recipes/FilterTile";
import { FilterChip, NicheField } from "../recipes/NicheFields";
import { RecipeThumb } from "../recipes/RecipeThumb";
import { ServingPriceSheet } from "../recipes/ServingPrice";

// Meal plan's Swap sheet as a small Recipes screen (founder 2026-11-20: "people can swap ... but they also should be able to search ... a version of that which is
// also in the meal plan part, where they can then use that once they've clicked on an item they want to swap out. And they can choose an item that they want to put
// in instead"). The Recipes screen's search (the same words find the same recipes), its quick-filter tiles, its Cuisine and Serving price fields and its three
// sorts, over every recipe the plan priced for that meal at the plan's shops (lib/mm/swapPicker.ts). The meal tiles are left out (the slot is one meal), a quick
// filter that would change nothing is left out, Cuisine only when the meal comes in two cuisines or more, and Serving price only for a plan for one (for several,
// the price shown is everyone's; its range shows without "(default)", which didn't fit). Recipes already in the week say "In your plan" and can still be chosen. A tap puts the recipe in that day's slot (`onChoose`).

const RECIPE_IDS = RECIPES.map((r) => r.id);
const CUISINE_OPTIONS = cuisineOptions(RECIPE_IDS);
const SORT_LABEL: Record<SwapSort, string> = { fit: tk("Closest fit"), price: tk("Lowest price"), protein: tk("Most protein") };
/** Rows shown at first, and added by "Show more". */
const PAGE = 20;

/** The sort as a field with the Cuisine and Serving price fields' look (NicheField), the phone's own list behind a tap. */
function SortField({ value, sorts, onChange }: { value: SwapSort; sorts: readonly SwapSort[]; onChange: (s: SwapSort) => void }) {
  const t = useT();
  return (
    <label className="glass relative block min-w-0 rounded-[1.25rem] transition-colors has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-1 has-[select:focus-visible]:outline-accent">
      <span className={`pointer-events-none absolute start-4 top-2.5 max-w-[calc(100%-3rem)] truncate ${LABEL}`}>{t("Sort by")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as SwapSort)} className="block min-h-[3.75rem] w-full cursor-pointer appearance-none truncate rounded-[1.25rem] bg-transparent pb-2 pe-9 ps-4 pt-[1.6rem] text-base font-semibold leading-snug text-foreground focus-visible:outline-none">
        {sorts.map((s) => <option key={s} value={s}>{t(SORT_LABEL[s])}</option>)}
      </select>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </label>
  );
}

export function SwapPicker({
  candidates, ids, day, mealIndex, slots, style, fits, people, several, shopName, priceNote, dayName, mealName, cuisinesChosen, onChoose, onNewPlan,
}: {
  /** The recipes the week is built from, for each meal (the plan's style and diet, sized for its people). */
  candidates: ReadonlyMap<MealType, readonly PlanCandidate[]>;
  ids: PlanIds;
  day: number;
  mealIndex: number;
  slots: readonly MealType[];
  style: EatingStyle;
  /** Whether a recipe suits the diet now (when it changed since the plan was made); one that doesn't is left out. */
  fits?: (recipeId: string) => boolean;
  people: number;
  /** The plan uses several shops: each row names its shop. */
  several: boolean;
  shopName: (id: string) => string;
  /** Under a price: "for 3", "Just for you". */
  priceNote: (meal: MealType) => ReactNode;
  dayName: string;
  /** "dinner", "snack 2": for the help when there is nothing else to choose. */
  mealName: string;
  /** The plan was made for some kinds of food only (the help says so). */
  cuisinesChosen: boolean;
  onChoose: (recipeId: string) => void;
  onNewPlan: () => void;
}) {
  const t = useT();
  const meal = slots[mealIndex];
  const list = meal ? candidates.get(meal) : undefined;
  const pool = useMemo(() => swapRows(ids, day, mealIndex, candidates, slots, style, fits), [ids, day, mealIndex, candidates, slots, style, fits]);
  // the search words of each recipe of this meal (worked out once a list), and the occasions on offer the day the sheet opened
  const extras = useMemo(() => new Map((list ?? []).map((c) => [c.recipe.id, recipeSearchExtras(c.recipe, c.perServing, t)])), [list, t]);
  const [offered] = useState(() => ({ cuisines: CUISINE_OPTIONS, occasions: occasionOptions(RECIPE_IDS, new Date()) }));
  const quickOffered = useMemo(() => usefulQuickFilters(pool, QUICK_FILTERS.map((q) => q.value)), [pool]);
  const cuisineOffered = useMemo(() => swapCuisines(pool, CUISINE_OPTIONS), [pool]);
  const priceBounds = useMemo(() => (people === 1 ? swapPriceBounds(pool) : null), [pool, people]);
  const sorts = useMemo(() => swapSorts(pool), [pool]);

  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<ReadonlySet<QuickFilter>>(() => new Set());
  const [cuisines, setCuisines] = useState<readonly CuisineId[]>([]);
  const [priceSel, setPriceSel] = useState<PriceRange | null>(null);
  const [sortSel, setSortSel] = useState<SwapSort | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [cuisineOpen, setCuisineOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const sort: SwapSort = sortSel && sorts.includes(sortSel) ? sortSel : sorts[0]!;
  const priceRange = priceSel && priceBounds ? settleRange(priceSel, priceBounds) : null;

  // everything but the cuisine and the price, then those: the cuisine counts and the price sheet's count are worked out from the first list
  const matches = (c: PlanCandidate) => matchesRecipeSearch(c.recipe, query, t, offered, extras.get(c.recipe.id));
  const base = filterSwapRows(pool, { quick, matches: query.trim() ? matches : undefined });
  const withCuisine = filterSwapRows(base, { cuisines });
  const shown = sortSwapRows(filterSwapRows(withCuisine, { price: priceRange }), sort);
  const cuisineCounts = nicheCounts(base.map((r) => r.candidate.recipe.id), [], []).cuisine;
  const filtering = query.trim() !== "" || quick.size > 0 || cuisines.length > 0 || !!priceRange;

  const flip = (q: QuickFilter) => { const n = new Set(quick); if (n.has(q)) n.delete(q); else n.add(q); setQuick(n); setLimit(PAGE); };
  const flipCuisine = (id: CuisineId) => { setCuisines(cuisines.includes(id) ? cuisines.filter((x) => x !== id) : CUISINE_OPTIONS.filter((c) => c.id === id || cuisines.includes(c.id)).map((c) => c.id)); setLimit(PAGE); };
  const clearAll = () => { setQuery(""); setQuick(new Set()); setCuisines([]); setPriceSel(null); setLimit(PAGE); };
  const count = (n: number) => (n === 0 ? t("No recipes match.") : n === 1 ? t("Show 1 recipe") : t("Show {n} recipes", { n }));
  const countLine = shown.length === 1 ? (filtering ? t("1 recipe match") : t("1 recipe")) : filtering ? t("{n} recipes match", { n: shown.length }) : t("{n} recipes", { n: shown.length });

  // nothing else for this meal at all (usability test 2026-11-19: Raj's Indian dinners were all in the plan already, and the sheet just said no): why, and the way on
  if (!pool.length) {
    return (
      <div className="glass rounded-[1.25rem] p-4 text-[0.9375rem] leading-snug">
        <p className="font-semibold">{cuisinesChosen
          ? t("Every {meal} of the kinds of food you chose that fits your diet is in your plan already.", { meal: mealName })
          : t("Every {meal} that fits your diet and your choices is in your plan already.", { meal: mealName })}</p>
        <p className="mt-1">{cuisinesChosen ? t("For more choice, make a new plan with more kinds of food, or Any.") : t("For more choice, make a new plan leaving out fewer foods.")}</p>
        <Button variant="secondary" className="mt-3 min-h-12" onClick={onNewPlan}>{t("Make a new plan")}</Button>
      </div>
    );
  }

  const fields: ReactNode[] = [];
  if (cuisineOffered.length) {
    fields.push(<NicheField key="cuisine" label={t("Cuisine")} value={cuisineOffered.filter((c) => cuisines.includes(c.id)).map((c) => t(c.label)).join(", ") || t("Any cuisine")} chosen={cuisines.length > 0} onClick={() => setCuisineOpen(true)} />);
  }
  if (priceBounds) {
    fields.push(<NicheField key="price" label={t("Serving price")} value={`${pounds((priceRange ?? priceBounds).min)} – ${pounds((priceRange ?? priceBounds).max)}`} chosen={!!priceRange} onClick={() => setPriceOpen(true)} />);
  }
  fields.push(<SortField key="sort" value={sort} sorts={sorts} onChange={(s) => { setSortSel(s); setLimit(PAGE); }} />);

  return (
    <div>
      {/* the Recipes screen's search: 16 px text (smaller makes iPhone Safari zoom in), Done while it is in use, the browser's own clear cross hidden */}
      <div className="group/search relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-ink" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t("Search recipes")} aria-label={t("Search recipes")} {...DONE_KEY} autoComplete="off"
          className={`min-h-[3.25rem] w-full rounded-full border-[1.5px] border-edge bg-card ps-12 pe-4 ${DONE_ROOM} text-base text-foreground placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:appearance-none`} />
        <SearchDone />
      </div>

      {/* the quick-filter tiles that would change the list, side by side (fewer to a row with large text: the minimum width is in rem) */}
      {quickOffered.length > 0 && (
        <div role="group" aria-label={t("Filters")} className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,5.5rem),1fr))] gap-2">
          {QUICK_FILTERS.filter((q) => quickOffered.includes(q.value)).map((q) => (
            <FilterTile key={q.value} label={t(q.label)} Icon={q.Icon} pressed={quick.has(q.value)} onClick={() => flip(q.value)} />
          ))}
        </div>
      )}

      {/* Cuisine, Serving price and the sort, two to a row (one under the other with large text); one left on its own takes the row */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2.5 [&>*:last-child:nth-child(odd)]:col-span-full">{fields}</div>

      {/* how many, said aloud as the list changes; on screen only while something narrows it, next to Clear */}
      <p role="status" className="sr-only">{shown.length ? countLine : t("No recipes match.")}</p>
      {filtering && (
        <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-1">
          <p aria-hidden className="app-numbers text-[0.9375rem] text-muted">{shown.length ? countLine : t("No recipes match.")}</p>
          <button type="button" onClick={clearAll} className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] font-bold text-accent underline underline-offset-2 hover:bg-fill">{t("Clear")}</button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipes match.")} action={<Button variant="secondary" onClick={clearAll}>{t("Show all recipes")}</Button>} />
        </div>
      ) : (
        <>
          <p className={`${filtering ? "mt-1" : "mt-4"} px-1 text-[0.9375rem] leading-snug text-muted`}>{t("Tap one to have it on {day}.", { day: dayName })}</p>
          <ul className="mt-2 space-y-2">
            {shown.slice(0, limit).map(({ candidate: c, inPlan }) => (
              <li key={c.recipe.id}>
                <button type="button" onClick={() => onChoose(c.recipe.id)} className="glass flex min-h-[4.5rem] w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[1.25rem] p-3 text-start transition hover:bg-background active:scale-[0.99]">
                  <RecipeThumb id={c.recipe.id} name={c.recipe.name} meal={c.meal} size="sm" />
                  <span className="min-w-0 flex-1 basis-[min(100%,8rem)]">
                    <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(c.recipe.name)}</span>
                    <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(c.perServing.kcal)} kcal · {formatInt(c.perServing.protein)} g {t("protein")}{several ? ` · ${shopName(c.shop)}` : ""}</span>
                    {inPlan && <span className="mt-1.5 flex"><span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.8125rem] font-semibold"><CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent" />{t("In your plan")}</span></span>}
                  </span>
                  <span className="app-numbers ms-auto shrink-0 text-end font-[800]">{formatPrice(c.cost)}{priceNote(c.meal)}</span>
                </button>
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <div className="mt-3"><Button full variant="secondary" className="min-h-12" onClick={() => setLimit(limit + PAGE)}>{t("Show {n} more recipes", { n: shown.length - limit })}</Button></div>
          )}
        </>
      )}

      {/* the Cuisine field's choices, with how many recipes each has with everything else as it is (Recipes' Filters sheet does the same) */}
      <Sheet open={cuisineOpen} onClose={() => setCuisineOpen(false)} title={t("Cuisine")}>
        <div role="group" aria-label={t("Cuisine")} className="flex flex-wrap gap-2">
          {cuisineOffered.map((c) => <FilterChip key={c.id} label={t(c.label)} count={cuisineCounts.get(c.id) ?? 0} pressed={cuisines.includes(c.id)} onClick={() => flipCuisine(c.id)} />)}
        </div>
        <div className="mt-5 grid gap-2 pb-2">
          <Button full size="lg" onClick={() => setCuisineOpen(false)}><span className="app-numbers">{count(shown.length)}</span></Button>
          {cuisines.length > 0 && <Button variant="secondary" full onClick={() => { setCuisines([]); setLimit(PAGE); }}>{t("Any cuisine")}</Button>}
        </div>
      </Sheet>
      {priceBounds && (
        <ServingPriceSheet
          open={priceOpen}
          onClose={() => setPriceOpen(false)}
          bounds={priceBounds}
          chosen={priceRange}
          onChange={(r) => { setPriceSel(r); setLimit(PAGE); }}
          count={(r) => filterSwapRows(withCuisine, { price: r }).length}
        />
      )}
    </div>
  );
}
