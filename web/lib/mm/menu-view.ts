import { NEW_ITEM_DAYS } from "./config";
import { proteinPer100Cal } from "./nutrients";
import { passesPreferences } from "./ranking";
import { normalizeForSearch } from "./search";
import type { Chain, MenuItem, Preferences } from "./types";

// SPEC §7.4: sort, filter and tags on the chain page.

export type SortKind = "menu" | "protein" | "calories" | "density";

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKind; label: string }> = [
  { value: "menu", label: "Menu order" },
  { value: "protein", label: "Most protein" },
  { value: "calories", label: "Fewest calories" },
  { value: "density", label: "Most protein per 100 kcal" },
];

const byName = (a: MenuItem, b: MenuItem) => a.name.localeCompare(b.name, "en-US");

/** Sorting flattens categories. Ties always break by name so the order is stable. "menu" keeps data order. */
export function sortItems(items: readonly MenuItem[], kind: SortKind): MenuItem[] {
  const list = [...items];
  switch (kind) {
    case "menu":
      return list;
    case "protein":
      return list.sort((a, b) => (b.nutrients.protein ?? 0) - (a.nutrients.protein ?? 0) || byName(a, b));
    case "calories":
      return list.sort((a, b) => a.nutrients.calories - b.nutrients.calories || byName(a, b));
    case "density":
      return list.sort((a, b) => proteinPer100Cal(b.nutrients) - proteinPer100Cal(a.nutrients) || byName(a, b));
  }
}

export function filterItems(items: readonly MenuItem[], prefs: Preferences): MenuItem[] {
  return items.filter((i) => passesPreferences(i.tags, prefs));
}

/** "New" for 30 days after addedOn (a date, interpreted at local midnight). */
export function isNewItem(item: Pick<MenuItem, "addedOn">, now: Date, days = NEW_ITEM_DAYS): boolean {
  if (!item.addedOn) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.addedOn);
  if (!m) return false;
  const added = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const ageDays = (now.getTime() - added.getTime()) / 86_400_000;
  return ageDays >= 0 && ageDays <= days;
}

export interface MenuSection {
  category: string;
  items: MenuItem[];
}

/** Items grouped by category in the chain's category order (empty categories dropped). */
export function groupByCategory(chain: Pick<Chain, "categories">, items: readonly MenuItem[]): MenuSection[] {
  return chain.categories
    .map((category) => ({ category, items: items.filter((i) => i.category === category) }))
    .filter((s) => s.items.length > 0);
}

/**
 * Search within one menu: every word of the query must start a word of the item's name or category ("chick wrap" finds
 * "Chicken Wrap"; "latte" finds "Iced Latte"). Same normalising as the app-wide search. Keeps the given order.
 */
export function searchItems(items: readonly MenuItem[], query: string): MenuItem[] {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const hay = ` ${normalizeForSearch(`${item.name} ${item.category}`)}`;
    return words.every((w) => hay.includes(` ${w}`));
  });
}

/** Menus longer than this open with each section trimmed to its first few items (tap to show the rest). */
export const LARGE_MENU_ITEMS = 120;
export const SECTION_PREVIEW_ITEMS = 6;

/**
 * The one calm line shown wherever a diet filter is on: the filters only know what each restaurant's guide states, so
 * they can't promise anything (matters for halal and vegetarian users). Null when no filter is on.
 */
export function filterCaution(prefs: Preferences): string | null {
  const promises = [prefs.vegetarianOnly && "vegetarian", prefs.noPork && "pork-free", prefs.noBeef && "beef-free"].filter((p): p is string => Boolean(p));
  if (promises.length === 0) return null;
  return `We only know what each restaurant publishes, so this can't promise a dish is ${promises.join(" or ")}.`;
}
