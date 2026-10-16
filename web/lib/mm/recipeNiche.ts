import type { T } from "./i18n";
import { CUISINES, OCCASIONS, nicheOf, type CuisineId, type CuisineEntry, type OccasionEntry, type OccasionId, type Season, type SeasonDay } from "./recipeBook/niches";

// Cuisine and occasion choices on the Recipes screen (founder 2026-10-16): which choices are offered, whether a recipe matches them, how many recipes each
// would show, and the words the search box adds. Pure and unit-tested; the catalogue and each recipe's niche are in recipeBook/niches.ts.

/** A cuisine or occasion is offered only when at least this many recipes belong to it, so a choice never leads to an almost empty list. */
export const MIN_NICHE_RECIPES = 3;

export type CuisineOption = { readonly id: CuisineId; readonly label: string };
export type OccasionOption = { readonly id: OccasionId; readonly label: string };

/** Whether a month and day fall inside a season, both ends included; a season that starts later in the year than it ends runs over New Year. */
export function inSeason(season: Season | undefined, now: Date): boolean {
  if (!season) return true;
  const key = (d: SeasonDay) => d.month * 100 + d.day;
  const today = key({ month: now.getMonth() + 1, day: now.getDate() });
  const from = key(season.from);
  const to = key(season.to);
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

function count(recipeIds: readonly string[], has: (id: string) => boolean): number {
  let n = 0;
  for (const id of recipeIds) if (has(id)) n++;
  return n;
}

/** The cuisines to offer for these recipes (the whole book, so a choice never comes and goes with a person's diet): in the catalogue's order, only those with enough recipes. */
export function cuisineOptions(recipeIds: readonly string[]): CuisineOption[] {
  return CUISINES.filter((c) => count(recipeIds, (id) => nicheOf(id).cuisine === c.id) >= MIN_NICHE_RECIPES).map((c) => ({ id: c.id, label: c.label }));
}

/** The occasions to offer today: enough recipes, and inside their dates (an occasion with no dates is always offered). */
export function occasionOptions(recipeIds: readonly string[], now: Date): OccasionOption[] {
  return OCCASIONS.filter((o) => ("season" in o ? inSeason(o.season, now) : true) && count(recipeIds, (id) => nicheOf(id).occasions?.includes(o.id) === true) >= MIN_NICHE_RECIPES).map((o) => ({ id: o.id, label: o.label }));
}

/** An address value as one of the offered choices: anything else (missing, a list, an unknown or hidden or out-of-season name, another case) is no choice at all. */
function parse<Id extends string>(value: unknown, options: ReadonlyArray<{ readonly id: Id }>): Id | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return options.find((o) => o.id === v)?.id ?? null;
}
export const parseCuisine = (value: unknown, options: readonly CuisineOption[]): CuisineId | null => parse(value, options);
export const parseOccasion = (value: unknown, options: readonly OccasionOption[]): OccasionId | null => parse(value, options);

/** Whether a recipe is in the chosen cuisine and occasion (a choice of null means any). */
export function matchesNiche(recipeId: string, cuisine: CuisineId | null, occasion: OccasionId | null): boolean {
  const n = nicheOf(recipeId);
  return (cuisine === null || n.cuisine === cuisine) && (occasion === null || n.occasions?.includes(occasion) === true);
}

export interface NicheCounts {
  cuisine: ReadonlyMap<CuisineId, number>;
  occasion: ReadonlyMap<OccasionId, number>;
}

/**
 * How many of these recipes (already narrowed by everything else: the meal, the toggles, the search and the diet) each choice would show. A cuisine's count
 * honours the chosen occasion and an occasion's count honours the chosen cuisine, but neither honours its own field, so the numbers say what choosing
 * that option would give.
 */
export function nicheCounts(recipeIds: readonly string[], cuisine: CuisineId | null, occasion: OccasionId | null): NicheCounts {
  const cuisines = new Map<CuisineId, number>();
  const occasions = new Map<OccasionId, number>();
  for (const id of recipeIds) {
    const n = nicheOf(id);
    if (n.cuisine && (occasion === null || n.occasions?.includes(occasion))) cuisines.set(n.cuisine, (cuisines.get(n.cuisine) ?? 0) + 1);
    if (cuisine === null || n.cuisine === cuisine) for (const o of n.occasions ?? []) occasions.set(o, (occasions.get(o) ?? 0) + 1);
  }
  return { cuisine: cuisines, occasion: occasions };
}

/**
 * The words that find a recipe by its cuisine or occasion in the search box: the English name, the name in the reader's language and the extra English
 * words (lower case), only for the choices on offer (so "bonfire" finds nothing in January, when the occasion is not offered). Nothing is added to what
 * the recipe's own card shows.
 */
export function nicheSearchWords(recipeId: string, t: T, offered: { cuisines: readonly CuisineOption[]; occasions: readonly OccasionOption[] }): string[] {
  const n = nicheOf(recipeId);
  const out: string[] = [];
  const add = (entry: CuisineEntry | OccasionEntry) => out.push(entry.label.toLowerCase(), t(entry.label).toLowerCase(), ...entry.words);
  const cuisine = n.cuisine && offered.cuisines.some((c) => c.id === n.cuisine) ? CUISINES.find((c) => c.id === n.cuisine) : undefined;
  if (cuisine) add(cuisine);
  for (const id of n.occasions ?? []) {
    if (!offered.occasions.some((o) => o.id === id)) continue;
    const entry = OCCASIONS.find((o) => o.id === id);
    if (entry) add(entry);
  }
  return out;
}
