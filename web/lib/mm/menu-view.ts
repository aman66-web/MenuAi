import { NEW_ITEM_DAYS } from "./config";
import { proteinPer100Cal } from "./nutrients";
import { passesPreferences } from "./ranking";
import type { Chain, MenuItem, Preferences } from "./types";

// SPEC §7.4: sort, filter and tags on the chain page.

export type SortKind = "menu" | "protein" | "calories" | "density";

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKind; label: string }> = [
  { value: "menu", label: "Menu order" },
  { value: "protein", label: "Most protein" },
  { value: "calories", label: "Fewest calories" },
  { value: "density", label: "Most protein per 100 cal" },
];

const byName = (a: MenuItem, b: MenuItem) => a.name.localeCompare(b.name, "en-US");

/** Sorting flattens categories. Ties always break by name so the order is stable. "menu" keeps data order. */
export function sortItems(items: readonly MenuItem[], kind: SortKind): MenuItem[] {
  const list = [...items];
  switch (kind) {
    case "menu":
      return list;
    case "protein":
      return list.sort((a, b) => b.nutrients.protein - a.nutrients.protein || byName(a, b));
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
