// Relative imports (not "@/"), so the unit tests can load this file (tests/groceriesUndoAddress.test.ts).
import { itemCode, MAX_SHOPPING_ITEMS, type ShoppingItem } from "../../../../lib/mm/groceries";

// Undo on the Shopping list (code audit 2026-10-29: one tap on "Clear" wiped the whole synced list, and "−" at 1 removed an item without a word). The screen
// keeps what was there and an Undo pill puts it back exactly: the same items, in the same order, with their ticks, quantities, prices and pictures. Pure, so
// it is unit-tested.

const key = (i: ShoppingItem) => `${i.retailer}\u0000${itemCode(i)}`;

/**
 * The list as it was before "Clear", with anything added since then kept after it (the Undo pill stays a few seconds, and something typed in meanwhile must
 * not be lost). An item that was on the old list and was added again meanwhile comes back as it was before the clear.
 */
export function undoClear(current: readonly ShoppingItem[], before: readonly ShoppingItem[]): ShoppingItem[] {
  const had = new Set(before.map(key));
  return [...before, ...current.filter((i) => !had.has(key(i)))].slice(0, MAX_SHOPPING_ITEMS);
}

/**
 * An item that "−" took off at quantity 1, put back where it was (`index` in the list it was removed from). When it is already back on the list (added again
 * meanwhile) the list is left as it is; when the list has since been shortened it goes at the end; a full list is left as it is.
 */
export function undoRemove(current: readonly ShoppingItem[], item: ShoppingItem, index: number): ShoppingItem[] {
  if (current.some((i) => key(i) === key(item)) || current.length >= MAX_SHOPPING_ITEMS) return [...current];
  const at = Math.max(0, Math.min(Number.isInteger(index) ? index : current.length, current.length));
  return [...current.slice(0, at), item, ...current.slice(at)];
}
