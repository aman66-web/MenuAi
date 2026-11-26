import type { Recipe } from "../recipes";
import type { CuisineId, OccasionId } from "./niches";
import { WAVE2_BIG_MEALS, WAVE2_BIG_MEALS_CUISINES, WAVE2_BIG_MEALS_LOOKS, WAVE2_BIG_MEALS_OCCASIONS } from "./wave2BigMeals";
import { WAVE2_BREAKFASTS, WAVE2_BREAKFASTS_CUISINES, WAVE2_BREAKFASTS_LOOKS, WAVE2_BREAKFASTS_OCCASIONS } from "./wave2Breakfasts";
import { WAVE2_PLANT_PROTEIN, WAVE2_PLANT_PROTEIN_CUISINES, WAVE2_PLANT_PROTEIN_LOOKS, WAVE2_PLANT_PROTEIN_OCCASIONS } from "./wave2PlantProtein";
import { WAVE2_QUICK_BATCH, WAVE2_QUICK_BATCH_CUISINES, WAVE2_QUICK_BATCH_LOOKS, WAVE2_QUICK_BATCH_OCCASIONS } from "./wave2QuickBatch";
import { WAVE2_SNACKS, WAVE2_SNACKS_CUISINES, WAVE2_SNACKS_LOOKS, WAVE2_SNACKS_OCCASIONS } from "./wave2Snacks";
import { WAVE2_SOFT_SMALL, WAVE2_SOFT_SMALL_CUISINES, WAVE2_SOFT_SMALL_LOOKS, WAVE2_SOFT_SMALL_OCCASIONS } from "./wave2SoftSmall";

// The second wave of recipes (founder 2026-11-26: "it needs to suit literally everyone. Like, someone could be a professional footballer ... someone who does
// rugby might need more, like, different stuff ... So it's important to have as many recipes as possible that cater to different things"). Written for the
// personas in docs/RECIPE_PERSONAS_2026-11-26.md, where the persona audit (tests/recipePersonas.check.test.ts) found Meal plan thin: big breakfasts and meals
// for athletes' days, snacks for every diet, vegan and Jain protein, soft and small meals, 15-minute dinners and cheap batch-cooks. Each file keeps its own
// looks and niche lines; this file gathers them, so the book, looks.ts and niches.ts each take one line.

export const WAVE2: readonly Recipe[] = [...WAVE2_BREAKFASTS, ...WAVE2_SNACKS, ...WAVE2_BIG_MEALS, ...WAVE2_PLANT_PROTEIN, ...WAVE2_SOFT_SMALL, ...WAVE2_QUICK_BATCH];

export const WAVE2_LOOKS: Readonly<Record<string, string>> = {
  ...WAVE2_BREAKFASTS_LOOKS, ...WAVE2_SNACKS_LOOKS, ...WAVE2_BIG_MEALS_LOOKS, ...WAVE2_PLANT_PROTEIN_LOOKS, ...WAVE2_SOFT_SMALL_LOOKS, ...WAVE2_QUICK_BATCH_LOOKS,
};

export const WAVE2_CUISINE_LINES: ReadonlyArray<readonly [string, CuisineId]> = [
  ...WAVE2_BREAKFASTS_CUISINES, ...WAVE2_SNACKS_CUISINES, ...WAVE2_BIG_MEALS_CUISINES, ...WAVE2_PLANT_PROTEIN_CUISINES, ...WAVE2_SOFT_SMALL_CUISINES, ...WAVE2_QUICK_BATCH_CUISINES,
];

export const WAVE2_OCCASION_LINES: ReadonlyArray<readonly [string, OccasionId]> = [
  ...WAVE2_BREAKFASTS_OCCASIONS, ...WAVE2_SNACKS_OCCASIONS, ...WAVE2_BIG_MEALS_OCCASIONS, ...WAVE2_PLANT_PROTEIN_OCCASIONS, ...WAVE2_SOFT_SMALL_OCCASIONS, ...WAVE2_QUICK_BATCH_OCCASIONS,
];
