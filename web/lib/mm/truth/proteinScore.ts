// "Protein score": Numbite's own 1 to 5 reading of how much protein an item has for its calories and for its size. It is NOT an official scheme and
// it says nothing about whether a food is good, bad or healthy (CLAUDE.md rule 3): it only reads two published numbers. The bands below are Numbite's,
// pinned by tests/truthProteinScore.test.ts, and every screen that shows the score says how it works (PROTEIN_SCORE_HOW).
//
// 1. Protein share = the calories that protein gives (4 kcal a gram) as a fraction of the item's calories.
// 2. The share sets a starting score: 25%+ gives 5, 20%+ gives 4, 15%+ gives 3, 8%+ gives 2, below that 1.
// 3. A large portion lowers the cap: up to 650 kcal can score 5, up to 800 kcal 4, up to 1,000 kcal 3, above that 2 (and 1 under a 12% share).
// Items under 120 kcal (a sauce, a coffee) or with no published protein are not scored: there is nothing fair to say about them.

import type { Nutrients } from "../types";

export const MIN_SCORED_KCAL = 120;
export const KCAL_PER_GRAM_PROTEIN = 4;

export const SHARE_BANDS: ReadonlyArray<{ min: number; score: ProteinScoreValue }> = [
  { min: 0.25, score: 5 },
  { min: 0.2, score: 4 },
  { min: 0.15, score: 3 },
  { min: 0.08, score: 2 },
];
export const SIZE_CAPS: ReadonlyArray<{ maxKcal: number; cap: ProteinScoreValue }> = [
  { maxKcal: 650, cap: 5 },
  { maxKcal: 800, cap: 4 },
  { maxKcal: 1000, cap: 3 },
];
const OVER_1000_CAP: ProteinScoreValue = 2;
const LOW_SHARE_OVER_1000 = 0.12;

export type ProteinScoreValue = 1 | 2 | 3 | 4 | 5;

export interface ProteinScore {
  score: ProteinScoreValue;
  /** 0 to 1: the fraction of the item's calories that comes from its protein. */
  share: number;
  /** Words for the score, about the numbers only. */
  label: string;
}

export const SCORE_LABELS: Record<ProteinScoreValue, string> = {
  5: "Most protein for its calories",
  4: "A lot of protein for its calories",
  3: "Some protein for its calories",
  2: "A little protein for its calories",
  1: "Very little protein for its calories",
};

/** Shown under the score wherever it appears. */
export const PROTEIN_SCORE_HOW =
  "Numbite's own score from 1 to 5. It compares the calories that come from protein with the item's total calories, and gives a lower top score to larger portions. It says nothing about any other nutrient.";

export function proteinShare(n: Pick<Nutrients, "calories" | "protein">): number | undefined {
  if (n.protein === undefined || !Number.isFinite(n.protein) || n.protein < 0) return undefined;
  if (!Number.isFinite(n.calories) || n.calories <= 0) return undefined;
  return Math.min((n.protein * KCAL_PER_GRAM_PROTEIN) / n.calories, 1);
}

/** The score, or null when the item can't be scored fairly (no published protein, or under MIN_SCORED_KCAL). Pure arithmetic on the published figures. */
export function proteinScore(n: Pick<Nutrients, "calories" | "protein">): ProteinScore | null {
  const share = proteinShare(n);
  if (share === undefined || n.calories < MIN_SCORED_KCAL) return null;

  let base: ProteinScoreValue = 1;
  for (const b of SHARE_BANDS) {
    if (share >= b.min) {
      base = b.score;
      break;
    }
  }
  let cap: ProteinScoreValue = OVER_1000_CAP;
  for (const c of SIZE_CAPS) {
    if (n.calories <= c.maxKcal) {
      cap = c.cap;
      break;
    }
  }
  let score = Math.min(base, cap) as ProteinScoreValue;
  if (n.calories > 1000 && share < LOW_SHARE_OVER_1000) score = 1;
  return { score, share, label: SCORE_LABELS[score] };
}
