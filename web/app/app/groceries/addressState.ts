// Relative imports (not "@/"), so the unit tests can load this file (tests/groceriesUndoAddress.test.ts).
import { GROCERY_SORTS, RETAILERS, type GrocerySort } from "../../../lib/mm/groceries";
import { SHOP_SORTS, type ShopSort } from "../../../lib/mm/shopProducts";

// What a grocery list screen keeps so that Back from a product finds it as it was left (code audit 2026-10-29: a shop's list and "Search every shop" came
// back unfiltered). The choices (aisle or type, sort, the filter chips, the shop) live in the address, like the Recipes screen's cuisine and occasion; the
// words in the search box and how many rows "Show more" had opened live in the history entry (history.state), like useEntryQuery's words. Nothing is kept in
// any storage or sent anywhere. Pure (no DOM, no React), so it is unit-tested; the window half is useAddress.ts.

type Get = (key: string) => string | null;

/** A shop's own list (/app/groceries/shop?r=…): the aisle, the sort and the three filter chips. */
export interface ShopListChoice {
  aisle: string | null;
  sort: ShopSort;
  card: boolean;
  nutrition: boolean;
  /** "Fits my diet" (on unless the person turned it off). */
  dietOn: boolean;
}

/** "Search every shop" (/app/groceries/search): the shop (undefined: not chosen, so the person's own shop; null: "All"), the type, the sort and "Fits my diet". */
export interface SearchChoice {
  shop: string | null | undefined;
  type: string | null;
  sort: GrocerySort;
  dietOn: boolean;
}

const SHOP_LIST_SORT: ShopSort = "name";
const SEARCH_SORT: GrocerySort = "density";
/** The address's word for "All" shops, so an explicit All is told apart from not having chosen (no ?r= at all). */
export const ALL_SHOPS = "all";
const MAX_AISLE = 120;

const isShopSort = (v: string | null): v is ShopSort => SHOP_SORTS.some((o) => o.value === v);
const isGrocerySort = (v: string | null): v is GrocerySort => GROCERY_SORTS.some((o) => o.value === v);
/** An aisle as a shop names it ("Fruit & Vegetables"): plain words, no control characters. The screen checks it against the shop's own aisles once its list is in. */
const cleanAisle = (v: string | null): string | null => {
  const s = (v ?? "").trim();
  return s && s.length <= MAX_AISLE && !/[\u0000-\u001f\u007f]/.test(s) ? s : null;
};

export function readShopListChoice(get: Get): ShopListChoice {
  const sort = get("sort");
  return {
    aisle: cleanAisle(get("aisle")),
    sort: isShopSort(sort) ? sort : SHOP_LIST_SORT,
    card: get("card") === "1",
    nutrition: get("nutrition") === "1",
    dietOn: get("diet") !== "off",
  };
}

/** The address changes for a new shop-list choice: a default leaves its key out, so an untouched list keeps a plain address. */
export function shopListChanges(c: Partial<ShopListChoice>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if ("aisle" in c) out.aisle = cleanAisle(c.aisle ?? null);
  if (c.sort !== undefined) out.sort = c.sort === SHOP_LIST_SORT ? null : c.sort;
  if (c.card !== undefined) out.card = c.card ? "1" : null;
  if (c.nutrition !== undefined) out.nutrition = c.nutrition ? "1" : null;
  if (c.dietOn !== undefined) out.diet = c.dietOn ? null : "off";
  return out;
}

export function readSearchChoice(get: Get): SearchChoice {
  const r = get("r");
  const type = get("type");
  const sort = get("sort");
  return {
    shop: r === ALL_SHOPS ? null : r && RETAILERS.some((x) => x.id === r) ? r : undefined,
    type: type && /^[a-z0-9-]{1,60}$/.test(type) ? type : null,
    sort: isGrocerySort(sort) ? sort : SEARCH_SORT,
    dietOn: get("diet") !== "off",
  };
}

export function searchChanges(c: Partial<SearchChoice>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if ("shop" in c) out.r = c.shop === undefined ? null : c.shop === null ? ALL_SHOPS : c.shop;
  if ("type" in c) out.type = c.type ?? null;
  if (c.sort !== undefined) out.sort = c.sort === SEARCH_SORT ? null : c.sort;
  if (c.dietOn !== undefined) out.diet = c.dietOn ? null : "off";
  return out;
}

/** `search` (the address's "?…" part) with `changes` applied (null removes a key); everything else in it (the shop, ?r=) is kept. "" when nothing is left. */
export function withParams(search: string, changes: Record<string, string | null>): string {
  const q = new URLSearchParams(search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * The state to hand window.history.replaceState when only the address changes: the entry's own keys (the saved words, the depth, the shown count) without
 * Next.js's. Next.js treats a state that carries its own marker as one of its internal writes and then doesn't tell the page that the address changed, so
 * the marker is left out here and Next.js copies its keys back in itself (its documented "native history API" support).
 */
export function stateForAddress(state: unknown): Record<string, unknown> {
  if (typeof state !== "object" || state === null) return {};
  const { __NA: _na, _N: _n, __PRIVATE_NEXTJS_INTERNALS_TREE: _tree, ...rest } = state as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

/** The key the number of rows "Show more" had opened is kept under in history.state. */
export const SHOWN_KEY = "mmShown";
const MAX_SHOWN = 100_000;

/** How many rows were shown when this history entry was left: a whole number from `page` up; `page` when nothing (or nonsense) is saved. */
export function shownOf(state: unknown, page: number): number {
  if (typeof state !== "object" || state === null) return page;
  const n = (state as Record<string, unknown>)[SHOWN_KEY];
  return typeof n === "number" && Number.isInteger(n) && n > page && n <= MAX_SHOWN ? n : page;
}

/** The current entry's state with the shown count saved in it (removed when it is back to the first page); every other key is kept. */
export function withShown(state: unknown, n: number, page: number): Record<string, unknown> {
  const { [SHOWN_KEY]: _old, ...rest } = (typeof state === "object" && state !== null ? state : {}) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
  return Number.isInteger(n) && n > page && n <= MAX_SHOWN ? { ...rest, [SHOWN_KEY]: n } : rest;
}
