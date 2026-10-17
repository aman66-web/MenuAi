import { PANTRY } from "./pantry";
import { parseProductKey, productKey } from "./recipes";

// What a person chose on a recipe page, remembered per recipe on this device (founder 2026-10-16, "swap an ingredient for a product from another supermarket"): the
// products they swapped in (a product of the recipe's own shop, or of another supermarket) and the ingredients they swapped for another kind. The recipe screen puts
// these back when the recipe is opened again. This is the person's own choice and stays on the device: it is not one of the synced stores (a new synced store would need
// a migration, CLAUDE.md rule 4), it is not sent anywhere, and "Clear data" removes it. Everything read back from storage goes through sanitizeRecipeChoices.

export interface RecipeChoice {
  /** The recipe's own shop when the choices were made (a product key without a shop means this shop's product): the choices are used only while this is still the recipe shop. */
  home: string;
  /** Ingredient key → product key (see productKey). */
  products: Record<string, string>;
  /** Ingredient key → the substitute kind chosen for it. */
  subs: Record<string, string>;
  /** When the person last changed anything for this recipe (ISO 8601): the oldest recipes' choices are let go first when there are too many. */
  at: string;
}

/** Recipe id → the choices made on it. */
export type RecipeChoices = Record<string, RecipeChoice>;

export const MAX_CHOICE_RECIPES = 100;
export const MAX_CHOICE_ENTRIES = 40;

const RECIPE_ID = /^[a-z0-9-]{1,60}$/;
const KEY = /^[a-z0-9-]{1,40}$/;
const SHOP = /^[a-z][a-z0-9-]{1,30}$/;
// "constructor", "toString" and the like are valid ingredient keys by their letters but must never find (or become) a property of every object
const plainKey = (k: string): boolean => KEY.test(k) && !(k in Object.prototype);

const entriesOf = (x: unknown): Array<[string, unknown]> => (x !== null && typeof x === "object" && !Array.isArray(x) ? Object.entries(x as Record<string, unknown>) : []);

/** A well-formed choice, or null: the shop an id, the keys the shape of ingredient keys, every product key one that parses (and written back in its canonical form),
 *  every substitute a kind of the pantry, at most MAX_CHOICE_ENTRIES of each, and a real date. A choice that holds nothing is null. Nothing else survives. */
export function sanitizeRecipeChoice(x: unknown): RecipeChoice | null {
  if (x === null || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  if (typeof r.home !== "string" || !SHOP.test(r.home) || typeof r.at !== "string" || Number.isNaN(Date.parse(r.at))) return null;
  const products: Array<[string, string]> = [];
  for (const [k, v] of entriesOf(r.products)) {
    const p = parseProductKey(v);
    if (plainKey(k) && p) products.push([k, productKey(p.shop, p.id)]);
    if (products.length >= MAX_CHOICE_ENTRIES) break;
  }
  const subs: Array<[string, string]> = [];
  for (const [k, v] of entriesOf(r.subs)) {
    if (plainKey(k) && typeof v === "string" && PANTRY.has(v)) subs.push([k, v]);
    if (subs.length >= MAX_CHOICE_ENTRIES) break;
  }
  if (!products.length && !subs.length) return null;
  return { home: r.home, products: Object.fromEntries(products), subs: Object.fromEntries(subs), at: new Date(r.at).toISOString() };
}

/** Everything read back from storage: valid recipes' choices only, the most recently changed MAX_CHOICE_RECIPES of them. */
export function sanitizeRecipeChoices(x: unknown): RecipeChoices {
  const kept: Array<[string, RecipeChoice]> = [];
  for (const [id, v] of entriesOf(x)) {
    if (!RECIPE_ID.test(id) || id in Object.prototype) continue;
    const c = sanitizeRecipeChoice(v);
    if (c) kept.push([id, c]);
  }
  kept.sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at));
  return Object.fromEntries(kept.slice(0, MAX_CHOICE_RECIPES));
}

/** The choices to use for a recipe opened on this shop: none when nothing is kept or they were made on another shop's recipe (a plain product id means this shop's). */
export function choiceFor(all: RecipeChoices, recipeId: string, home: string): RecipeChoice | null {
  const c = Object.hasOwn(all, recipeId) ? all[recipeId] : undefined;
  return c && c.home === home ? c : null;
}

/** The other supermarkets whose products a recipe's choices name (so the recipe screen can load just their lists before showing the recipe). */
export function choiceShops(choice: Pick<RecipeChoice, "products"> | null): string[] {
  if (!choice) return [];
  return [...new Set(Object.values(choice.products).flatMap((k) => parseProductKey(k)?.shop ?? []))];
}

/** The choices with this recipe's set to `products` and `subs` as the recipe screen now has them (an empty pair forgets the recipe), made on `home` at `now`. Pure. */
export function withRecipeChoice(all: RecipeChoices, recipeId: string, home: string, state: { products: Readonly<Record<string, string>>; subs: Readonly<Record<string, string>> }, now: Date): RecipeChoices {
  if (!RECIPE_ID.test(recipeId) || recipeId in Object.prototype) return all;
  const rest = Object.fromEntries(Object.entries(all).filter(([id]) => id !== recipeId));
  const entry = sanitizeRecipeChoice({ home, products: state.products, subs: state.subs, at: now.toISOString() });
  return sanitizeRecipeChoices(entry ? { ...rest, [recipeId]: entry } : rest);
}

/** The choices without this recipe's. */
export function withoutRecipeChoice(all: RecipeChoices, recipeId: string): RecipeChoices {
  return Object.fromEntries(Object.entries(all).filter(([id]) => id !== recipeId));
}
