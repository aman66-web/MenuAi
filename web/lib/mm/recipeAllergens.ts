import { PANTRY } from "./pantry";
import { ALLERGEN_KEYS, type AllergenKey, type Allergens } from "./types";

// A recipe's allergens for its "More detail" (founder 2026-11-20: "there'll also be a part where it has allergens ... it'll tell you if there's allergens
// in it"). Worked out only from each ingredient kind's `contains` flags in pantry.ts, which were checked on 19 November 2026 against the allergens the
// shops' own labels declare; nothing is guessed from a name. Kinds carry no "may contain", so a recipe never says anything about traces (the page says so),
// and the 14 allergens are the ones UK law names (ALLERGEN_KEYS), as on every dish and product page.

export interface RecipeAllergens {
  /** `contains` only; `mayContain` is always empty (see above). */
  allergens: Allergens;
  /** For each allergen it contains, the ingredients that bring it, by the ingredient's own label, in the recipe's order and each once. */
  from: Partial<Record<AllergenKey, string[]>>;
}

/** `ingredients`: what the page lists, each with its pantry kind (an ingredient with no kind adds nothing). */
export function recipeAllergens(ingredients: ReadonlyArray<{ label: string; pantry?: string }>): RecipeAllergens {
  const from: Partial<Record<AllergenKey, string[]>> = {};
  for (const ing of ingredients) {
    const kind = ing.pantry ? PANTRY.get(ing.pantry) : undefined;
    for (const a of kind?.contains ?? []) {
      const list = (from[a] ??= []);
      if (!list.includes(ing.label)) list.push(ing.label);
    }
  }
  return { allergens: { contains: ALLERGEN_KEYS.filter((k) => (from[k]?.length ?? 0) > 0), mayContain: [] }, from };
}
