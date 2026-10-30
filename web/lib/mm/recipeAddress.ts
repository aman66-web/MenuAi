import { MEAL_TYPES, type MealType } from "./recipes";

// The Recipes screen keeps what the person chose in its address (/app/recipes?r=sainsburys&meal=dinner&only=quick,vegan&cuisine=indian), so the browser's
// Back from a recipe, a reload or a link finds the list as it was left (founder's list, A15). Pure helpers: what is read from the address, and how one change is
// written into it without losing the rest. Anything the address holds that isn't on offer is read as no choice.

export type RecipeToggle = "quick" | "meatFree" | "vegan";
/** The three toggle tiles, in the order they are written into the address. */
export const RECIPE_TOGGLES: readonly RecipeToggle[] = ["quick", "meatFree", "vegan"];

/** `search` (with or without its "?") with each key in `patch` set, or removed when its value is null or empty; every other key is kept where it was. */
export function mergeQuery(search: string, patch: Readonly<Record<string, string | null>>): string {
  const q = new URLSearchParams(search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  return q.toString();
}

const NEXT_KEYS = new Set(["__NA", "_N", "__PRIVATE_NEXTJS_INTERNALS_TREE"]);

/**
 * The history entry's state without Next.js's own keys, for a native history.replaceState: Next.js copies its keys back itself, and it only brings
 * useSearchParams up to date when the state passed in doesn't already carry them. Everything else (Back's depth, a search box's words) is kept.
 */
export function ownHistoryState(state: unknown): Record<string, unknown> {
  if (typeof state !== "object" || state === null) return {};
  return Object.fromEntries(Object.entries(state as Record<string, unknown>).filter(([k]) => !NEXT_KEYS.has(k)));
}

/** The meal tile the address asks for, if it is one of the four. */
export function parseMealParam(raw: string | null): MealType | null {
  return MEAL_TYPES.find((m) => m.value === raw)?.value ?? null;
}

/** The toggle tiles the address asks for ("quick,vegan"), unknown words left out. */
export function parseOnlyParam(raw: string | null): ReadonlySet<RecipeToggle> {
  const words = new Set((raw ?? "").split(","));
  return new Set(RECIPE_TOGGLES.filter((x) => words.has(x)));
}

/** The toggles as the address writes them, or null for none. */
export function onlyParam(toggles: ReadonlySet<RecipeToggle>): string | null {
  const on = RECIPE_TOGGLES.filter((x) => toggles.has(x));
  return on.length ? on.join(",") : null;
}
