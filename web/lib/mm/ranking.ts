import { mealBudget, MEAL_SHARE } from "./budget";
import { englishT, tk, type T } from "./i18n";
import { halfUp, proteinPer100Cal } from "./nutrients";
import { reasonLine } from "./format";
import type { Chain, Meal, Nutrients, Preferences, Profile, Tag } from "./types";

// SPEC §6.4 "Best for you". tools/reference_ranking.py is the oracle: every case in
// data/fixtures/ranking-golden.json must pass (tests/ranking.test.ts).

export const RANKING_CONFIG = {
  mealShare: MEAL_SHARE,
  underBudgetBonus: 2.0, // lose + glp1: up to +2 for being further under budget
  totalProteinBonus: 0.05, // buildMuscle: +0.05 per gram of protein
  glp1ProteinFirst: 25, // glp1: picks with >= 25 g protein are listed first
  outOfBudgetThreshold: 200, // remaining kcal below this -> "lowest-calorie options" mode
  outOfBudgetMinProtein: 10,
  maxPerBaseItem: 2,
  resultCount: 5,
} as const;

export type RankingConfig = typeof RANKING_CONFIG;
export type RankingMode = "ranked" | "outOfBudget" | "nothingFits" | "noMatches";

export interface Candidate {
  id: string;
  name: string;
  nutrients: Nutrients;
  tags: Tag[];
  baseKey: string;
  itemCount: number;
  /** Where to look the pick up again: a menu item, or a pre-built combination. */
  source: "item" | "combination";
}

export interface Pick extends Candidate {
  reason: string;
  /** nothingFits only: calories over the meal budget ("Over by N kcal"). */
  overBy?: number;
}

export interface RankingResult {
  mode: RankingMode;
  remaining: number;
  budget: number;
  picks: Pick[];
}

export interface RankInput {
  chain: Chain;
  profile: Profile;
  loggedCalories: number;
  meal: Meal;
  preferences: Preferences;
  config?: RankingConfig;
}

export function candidatesFor(chain: Chain): Candidate[] {
  const out: Candidate[] = [];
  for (const it of chain.items) {
    if (it.rankable) {
      out.push({ id: it.id, name: it.name, nutrients: it.nutrients, tags: it.tags, baseKey: it.id, itemCount: 1, source: "item" });
    }
  }
  for (const c of chain.combinations) {
    out.push({
      id: c.id,
      name: c.name,
      nutrients: c.nutrients,
      tags: c.tags,
      baseKey: c.baseItemId ?? c.id,
      itemCount: c.itemCount,
      source: "combination",
    });
  }
  return out;
}

export function passesPreferences(tags: readonly Tag[], prefs: Preferences): boolean {
  if (prefs.vegetarianOnly && !tags.includes("vegetarian")) return false;
  if (prefs.noPork && tags.includes("contains_pork")) return false;
  if (prefs.noBeef && tags.includes("contains_beef")) return false;
  return true;
}

function score(n: Nutrients, goal: Profile["goal"], budget: number, config: RankingConfig): number {
  const d = proteinPer100Cal(n);
  if (goal === "lose" || goal === "glp1") return d + config.underBudgetBonus * (1 - n.calories / budget);
  if (goal === "buildMuscle") return d + config.totalProteinBonus * (n.protein ?? 0);
  return d; // maintain, and "other" (ranked like maintain)
}

// Plain code-unit comparison, like the Python oracle and Swift's String < (never a localized compare).
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `t` translates the reason line's words (English by default). */
export function rank({ chain, profile, loggedCalories, meal, preferences, config = RANKING_CONFIG }: RankInput, t: T = englishT): RankingResult {
  const withReason = (c: Candidate, extra: Partial<Pick> = {}): Pick => ({ ...c, reason: reasonLine(c.nutrients, t), ...extra });
  const { remaining, budget } = mealBudget(profile, loggedCalories, meal, config.mealShare);
  const pool = candidatesFor(chain).filter((c) => c.nutrients.calories > 0 && passesPreferences(c.tags, preferences));
  if (pool.length === 0) return { mode: "noMatches", remaining, budget, picks: [] };

  if (remaining < config.outOfBudgetThreshold) {
    const picks = pool
      .filter((c) => (c.nutrients.protein ?? 0) >= config.outOfBudgetMinProtein)
      .sort(
        (a, b) =>
          a.nutrients.calories - b.nutrients.calories ||
          (b.nutrients.protein ?? 0) - (a.nutrients.protein ?? 0) ||
          compareStrings(a.name, b.name),
      )
      .slice(0, config.resultCount)
      .map((c) => withReason(c));
    return { mode: "outOfBudget", remaining, budget, picks };
  }

  const fits = pool.filter((c) => c.nutrients.calories <= budget);
  if (fits.length === 0) {
    const closest = [...pool]
      .sort((a, b) => a.nutrients.calories - b.nutrients.calories || compareStrings(a.name, b.name))
      .slice(0, 3)
      .map((c) => withReason(c, { overBy: c.nutrients.calories - budget }));
    return { mode: "nothingFits", remaining, budget, picks: closest };
  }

  const sortKey = (c: Candidate) => {
    const primary = profile.goal === "glp1" ? ((c.nutrients.protein ?? 0) >= config.glp1ProteinFirst ? 0 : 1) : 0;
    return { primary, score: halfUp(score(c.nutrients, profile.goal, budget, config), 6) };
  };
  const ordered = fits
    .map((c) => ({ c, k: sortKey(c) }))
    .sort(
      (x, y) =>
        x.k.primary - y.k.primary ||
        y.k.score - x.k.score ||
        budget - x.c.nutrients.calories - (budget - y.c.nutrients.calories) ||
        x.c.itemCount - y.c.itemCount ||
        compareStrings(x.c.name, y.c.name),
    )
    .map((x) => x.c);

  const picks: Pick[] = [];
  const perBase = new Map<string, number>();
  for (const c of ordered) {
    const used = perBase.get(c.baseKey) ?? 0;
    if (used >= config.maxPerBaseItem) continue;
    perBase.set(c.baseKey, used + 1);
    picks.push(withReason(c));
    if (picks.length === config.resultCount) break;
  }
  return { mode: "ranked", remaining, budget, picks };
}

export const NO_MATCHES_COPY = tk("Nothing here matches your filters.");
export const OUT_OF_BUDGET_BANNER = tk("You've used today's calories. Lowest-calorie options:");
export const OUT_OF_BUDGET_EMPTY = tk("You've used today's calories, and nothing here has 10g+ protein.");
