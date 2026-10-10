import type { ChainIndex } from "./chain-index";
import { englishT, tk, type T } from "./i18n";
import type { OrderLine } from "./order";
import { ALLERGEN_KEYS, type AllergenKey, type Allergens } from "./types";

// Allergens as the chain's own guide prints them (docs/DATA.md "Allergens"). Pure, so it is unit-tested. Nothing here
// infers an allergen: an order's list is only ever the union of what the guide says about its parts.

export const ALLERGEN_LABEL: Record<AllergenKey, string> = {
  celery: tk("Celery"),
  gluten: tk("Cereals containing gluten"),
  crustaceans: tk("Crustaceans"),
  eggs: tk("Eggs"),
  fish: tk("Fish"),
  lupin: tk("Lupin"),
  milk: tk("Milk"),
  molluscs: tk("Molluscs"),
  mustard: tk("Mustard"),
  nuts: tk("Tree nuts"),
  peanuts: tk("Peanuts"),
  sesame: tk("Sesame"),
  soya: tk("Soya"),
  sulphites: tk("Sulphur dioxide and sulphites"),
};

/**
 * "Cereals containing gluten (wheat, barley)", "Tree nuts (almond)", "Milk": specifics only where the guide names them. The allergen
 * names are ours (translated with `t`); the specifics are the guide's own words, shown as printed.
 */
export function allergenPhrases(a: Allergens, which: "contains" | "mayContain", t: T = englishT): string[] {
  return a[which].map((k) => {
    const detail = which === "contains" ? (k === "gluten" ? a.cereals : k === "nuts" ? a.nuts : undefined) : undefined;
    return detail?.length ? `${t(ALLERGEN_LABEL[k])} (${detail.join(", ")})` : t(ALLERGEN_LABEL[k]);
  });
}

const order = (keys: Iterable<AllergenKey>) => [...new Set(keys)].sort((x, y) => ALLERGEN_KEYS.indexOf(x) - ALLERGEN_KEYS.indexOf(y));
const uniq = (xs: Iterable<string>) => [...new Set(xs)];

/** Several parts together contain whatever any part contains; "may contain" never repeats a "contains". */
export function unionAllergens(parts: readonly Allergens[]): Allergens {
  const contains = order(parts.flatMap((p) => p.contains));
  const mayContain = order(parts.flatMap((p) => p.mayContain)).filter((k) => !contains.includes(k));
  const cereals = uniq(parts.flatMap((p) => p.cereals ?? []));
  const nuts = uniq(parts.flatMap((p) => p.nuts ?? []));
  return { contains, mayContain, ...(cereals.length ? { cereals } : {}), ...(nuts.length ? { nuts } : {}) };
}

export interface OrderAllergens {
  allergens: Allergens;
  /** The order has published extras ("add bacon") or removals whose allergens the guide doesn't list separately. */
  changesNotCovered: boolean;
}

/**
 * Allergens for a built order, or null when any part has none published (then the app only links to the guide).
 * Item lines keep the standard item's allergens even when something is removed: removing an ingredient never removes an
 * allergen here, because the guide only lists the whole item.
 */
export function orderAllergens(ix: ChainIndex, lines: readonly OrderLine[]): OrderAllergens | null {
  if (lines.length === 0) return null;
  const parts: Allergens[] = [];
  let changesNotCovered = false;
  for (const line of lines) {
    if (line.kind === "components") {
      for (const ref of line.components) {
        const a = ix.components.get(ref.id)?.allergens;
        if (!a) return null;
        parts.push(a);
      }
    } else {
      const a = ix.items.get(line.itemId)?.allergens;
      if (!a) return null;
      parts.push(a);
      if (line.modifierIds.length > 0) changesNotCovered = true;
    }
  }
  return { allergens: unionAllergens(parts), changesNotCovered };
}
