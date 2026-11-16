import { PANTRY, type PantryKind } from "./pantry";
import { normalizeForSearch } from "./search";

// "Cook from my cupboard" (founder 2026-11-16: "the person can put what stuff they have in the cupboard and a rough amount of what they have and it will
// craft a really good recipe"). The person says what they have, with a rough amount, and the recipe book is ranked by how much of each recipe that
// covers. Version 1 is plain arithmetic on the device: no AI, nothing sent anywhere, no number invented (every figure on a recipe still comes from the
// shop's own labels through the recipe arithmetic; the amounts here only decide how many servings the cupboard allows).
//
// How an amount is read:
//  - A number in the kind's own unit (grams, millilitres, or whole eggs, wraps, onions where the kind comes in pieces) is compared with the amounts
//    the recipe needs for 1 to 12 people (the very same scaling the recipe page uses, scaleSpec).
//  - "A little", "Some" and "Plenty" are about people, not grams: a little of an ingredient covers 1 serving of whatever recipe, some covers 2, plenty covers
//    any number. That needs no per-ingredient figure, so nothing is guessed.
//  - Store-cupboard kinds (salt, oil, spices) have no amount: a jar lasts for many meals, so having it is enough (as "I have this" on a recipe page).
// This file is only the list itself (what is kept on the device, how it changes, what to offer); the matching is in cupboard.ts. It imports no recipe, so the
// store that keeps the list (stores.ts, loaded by every screen) stays light. Pure and unit-tested.

export const LEVELS = ["little", "some", "plenty"] as const;
export type Level = (typeof LEVELS)[number];
/** How many servings of a recipe each level covers. */
export const LEVEL_SERVINGS: Readonly<Record<Level, number>> = { little: 1, some: 2, plenty: Infinity };

export interface CupboardItem {
  /** "k:<pantry kind>" or "w:<typed words>": one item per kind or per words. */
  id: string;
  /** The pantry kind, or "" for words the person typed that match no kind (matched by name only). */
  kind: string;
  /** The kind's name, or the typed words. */
  name: string;
  /** A rough amount... */
  level?: Level;
  /** ...or an exact one: whole pieces when `pieces` (eggs, wraps), else grams or millilitres. Exactly one of `level` and `qty` is set. */
  qty?: number;
  pieces?: true;
}

export const MAX_CUPBOARD_ITEMS = 60;
export const MAX_QTY = 5000;
export const MAX_PIECES = 60;
const WORDS = /^[\p{L}\p{N}][\p{L}\p{N} '’&.,-]{0,38}[\p{L}\p{N}]$/u;

export const kindOf = (item: Pick<CupboardItem, "kind">): PantryKind | undefined => (item.kind ? PANTRY.get(item.kind) : undefined);
/** A store-cupboard kind (salt, oil, spices): no amount. */
export const isStaple = (kind: PantryKind | undefined): boolean => !!kind?.cupboard;
/** Whether this kind can be counted in whole pieces ("4 eggs"). */
export const hasPieces = (kind: PantryKind | undefined): boolean => !!kind?.pieceGrams && !!kind.pieceName;

const tidyWords = (s: string): string => s.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** One saved item, checked when it is read back (it comes from this phone's storage): null when it isn't one. */
export function sanitizeItem(raw: unknown): CupboardItem | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Record<string, unknown>;
  let kind = "";
  let name = "";
  if (typeof x.kind === "string" && x.kind !== "") {
    const k = PANTRY.get(x.kind);
    if (!k) return null; // a kind that no longer exists
    kind = k.key;
    name = k.label;
  } else {
    if (typeof x.name !== "string") return null;
    name = tidyWords(x.name);
    if (!WORDS.test(name)) return null;
  }
  const k = kind ? PANTRY.get(kind) : undefined;
  const id = kind ? `k:${kind}` : `w:${normalizeForSearch(name)}`;
  if (isStaple(k)) return { id, kind, name, level: "plenty" };
  const pieces = x.pieces === true && hasPieces(k);
  const qty = typeof x.qty === "number" && Number.isFinite(x.qty) ? Math.round(x.qty) : null;
  if (qty !== null && !!kind && qty >= 1 && qty <= (pieces ? MAX_PIECES : MAX_QTY)) return { id, kind, name, qty, ...(pieces ? { pieces: true as const } : {}) };
  const level = LEVELS.find((l) => l === x.level) ?? "some";
  return { id, kind, name, level };
}

export function sanitizeCupboard(raw: unknown): CupboardItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CupboardItem[] = [];
  for (const r of raw) {
    const item = sanitizeItem(r);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= MAX_CUPBOARD_ITEMS) break;
  }
  return out;
}

// ---- changing the list (pure: each takes the list and returns the new one)

/** Put a pantry kind in the cupboard (a staple as "plenty", anything else as "some" until the person says more). Already there: unchanged. */
export function addKind(list: readonly CupboardItem[], key: string): CupboardItem[] {
  const k = PANTRY.get(key);
  if (!k || list.some((i) => i.id === `k:${key}`) || list.length >= MAX_CUPBOARD_ITEMS) return [...list];
  return [...list, { id: `k:${key}`, kind: key, name: k.label, level: isStaple(k) ? "plenty" : "some" }];
}

/** Put words the person typed in the cupboard (matched by name only). Returns the list unchanged when they aren't usable words. */
export function addWords(list: readonly CupboardItem[], words: string): CupboardItem[] {
  const item = sanitizeItem({ kind: "", name: words, level: "some" });
  if (!item || list.some((i) => i.id === item.id) || list.length >= MAX_CUPBOARD_ITEMS) return [...list];
  return [...list, item];
}

export function removeItem(list: readonly CupboardItem[], id: string): CupboardItem[] {
  return list.filter((i) => i.id !== id);
}

/** A rough amount for an item. */
export function setLevel(list: readonly CupboardItem[], id: string, level: Level): CupboardItem[] {
  return list.map((i) => (i.id === id && !isStaple(kindOf(i)) ? { id: i.id, kind: i.kind, name: i.name, level } : i));
}

/** An exact amount (grams or millilitres, or whole pieces when `pieces`). Clamped; ignored for a staple or for words without a kind. */
export function setQty(list: readonly CupboardItem[], id: string, qty: number, pieces = false): CupboardItem[] {
  return list.map((i) => {
    const k = kindOf(i);
    if (i.id !== id || !k || isStaple(k)) return i;
    const usePieces = pieces && hasPieces(k);
    const n = Math.max(1, Math.min(usePieces ? MAX_PIECES : MAX_QTY, Math.round(qty)));
    return { id: i.id, kind: i.kind, name: i.name, qty: n, ...(usePieces ? { pieces: true as const } : {}) };
  });
}

/** The unit of an exact amount, in words ("g", "ml", "eggs"). */
export function unitWord(kind: PantryKind, pieces: boolean): string {
  return pieces && hasPieces(kind) ? kind.pieceName![1] : kind.unit;
}

/** The step of the − and + buttons for an exact amount, and where it starts when the person first types one. */
export function qtyStep(kind: PantryKind, pieces: boolean): number {
  return pieces && hasPieces(kind) ? 1 : 50;
}
export function qtyStart(kind: PantryKind, pieces: boolean): number {
  return pieces && hasPieces(kind) ? 4 : 250;
}

/** An exact amount in grams or millilitres (whole pieces times what one weighs); null for an item with a rough amount. */
export function itemAmount(item: CupboardItem): number | null {
  if (item.qty === undefined) return null;
  if (!item.pieces) return item.qty;
  const k = kindOf(item);
  return k?.pieceGrams ? item.qty * k.pieceGrams : null;
}

// ---- what to offer

/** Things most kitchens have, in the order they are shown first. */
export const COMMON_KINDS: readonly string[] = [
  "chicken", "eggs", "beef-mince", "salmon", "tuna", "bacon", "rice", "pasta-shapes", "wraps", "oats", "new-potatoes", "onion", "carrots", "peppers", "mushrooms",
  "spinach", "peas", "chopped-tomatoes", "baked-beans", "kidney-beans", "chickpeas", "milk", "cheddar", "greek-yogurt", "olive-oil",
];
/** Store-cupboard things shown as one-tap chips (each is a `cupboard` kind: salt, oil, spices). */
export const STAPLE_KINDS: readonly string[] = ["salt", "black-pepper", "vegetable-oil", "oil-spray", "garlic", "cumin", "paprika", "mixed-herbs", "curry-powder", "chilli-powder", "lemon-juice"];

/** Kinds that match the words typed (every word starts a word of the kind's name or of the words its products are found by), common ones first. */
export function searchKinds(query: string, kinds: readonly PantryKind[]): PantryKind[] {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const startsWord = (hay: string, w: string) => hay.includes(` ${w}`);
  return kinds.filter((k) => {
    const hay = ` ${normalizeForSearch([k.label, ...k.match.all, ...(k.match.any ?? [])].join(" "))} `;
    return words.every((w) => startsWord(hay, w));
  });
}

