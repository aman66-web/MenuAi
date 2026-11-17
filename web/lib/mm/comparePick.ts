import { pricePerKgOrLitre, type CompareItem, type CompareNumbers } from "./compare";
import { englishT, type T } from "./i18n";
import type { Goal, Preferences } from "./types";

// Pip's pick on the Compare screen (founder 2026-11-17: "when the person compares two products, you should use the AI to say what you think personally is
// better out of the two ... if someone compares the same two products, you should have saved what the AI thinks, so that we don't have to use the AI API key again").
// This file is the part both sides share (the browser and the server): the request, the cache key, the checks on what the AI says, and the reason lines.
//
// Rules this keeps (CLAUDE.md 1, 3 and 8):
//  - The AI never writes a number. It says WHICH item fits the person's goal, one short sentence with no digits, and up to three reason KEYS from a fixed list. The
//    app turns each key into a line with the numbers worked out here from the figures (reasonFor), and drops any key the figures don't support. A pick with no
//    supported reason is refused, so a line on screen is always true of the figures shown above it.
//  - The sentence is checked before it is kept or shown (validSentence): no digits, no health or medical words, no good/bad/healthy, no positions ("first",
//    "left"), no links, at most 25 words. A bad sentence is refused, never edited.
//  - The same pair of products with the same figures for the same goal always has the same key, whichever one was added first, so an answer is made once and reused
//    (the server keeps it in compare_picks, the phone in mm.v1.comparePicks).

/** Off unless NEXT_PUBLIC_COMPARE_PICK=1 (the live website is unchanged until the founder says). */
export const COMPARE_PICK_ENABLED = process.env.NEXT_PUBLIC_COMPARE_PICK === "1";

export const PICK_GOALS: readonly Goal[] = ["lose", "maintain", "buildMuscle", "glp1", "other"];
/** The diet words sent along (context only), in the order they are always written. */
export const PICK_DIET_WORDS = ["halal", "no beef", "no pork", "pescatarian", "vegan", "vegetarian"] as const;
export type PickDietWord = (typeof PICK_DIET_WORDS)[number];

export const REASON_KEYS = ["moreProteinPerKcal", "fewerKcal", "lessSugar", "lessSatFat", "lessSalt", "moreFibre", "cheaperProtein", "lessFat", "moreProtein"] as const;
export type ReasonKey = (typeof REASON_KEYS)[number];

/** What the AI is told each key means (the prompt) is in lib/comparePickHandler.ts; the lines the app writes are below. */
export const MAX_REASONS = 3;
export const MAX_SENTENCE_WORDS = 25;

/** One item as the pick sees it: what the Compare screen holds, nothing about the person. */
export interface PickItem {
  key: string;
  kind: "food" | "dish";
  name: string;
  from: string;
  basis: "g" | "ml" | "serving";
  note?: string;
  numbers: CompareNumbers;
  /** The shop's own price per kg (per 100 g labels) or per litre (per 100 ml labels), when it matches the label's basis. */
  perKg: number | null;
}

export interface PickInput {
  items: [PickItem, PickItem];
  goal: Goal;
  diet: PickDietWord[];
}

/** 0 or 1 = the item at that position, "tie" = neither. */
export type PickChoice = 0 | 1 | "tie";

/** What is kept and sent back: always in the CANONICAL order of the two items (canonicalize), so one answer serves both orders. */
export interface StoredPick {
  pick: PickChoice;
  sentence: string;
  reasons: ReasonKey[];
}

export function toPickItem(item: CompareItem): PickItem {
  const n = item.numbers;
  return {
    key: item.key,
    kind: item.kind,
    name: item.name,
    from: item.from,
    basis: item.basis,
    ...(item.note ? { note: item.note } : {}),
    numbers: { kcal: n.kcal, protein: n.protein, carbs: n.carbs, sugars: n.sugars, fat: n.fat, saturates: n.saturates, fibre: n.fibre, salt: n.salt },
    perKg: pricePerKgOrLitre(item),
  };
}

/** The diet choices as words, for the AI as context only (never allergies: those stay on the device). */
export function dietWords(p: Preferences): PickDietWord[] {
  const out: PickDietWord[] = [];
  if (p.halalOnly) out.push("halal");
  if (p.noBeef) out.push("no beef");
  if (p.noPork) out.push("no pork");
  if (p.pescatarianOnly) out.push("pescatarian");
  if (p.veganOnly) out.push("vegan");
  if (p.vegetarianOnly) out.push("vegetarian");
  return out;
}

/** Two items can be picked between only when their figures count the same thing: the same kind, the same basis (per 100 g, per 100 ml, per serving) and, for foods,
 *  both for the food as sold or both with the same note ("cooked"). */
export function comparable(a: PickItem, b: PickItem): boolean {
  return a.kind === b.kind && a.basis === b.basis && (a.note ?? "") === (b.note ?? "");
}

// ----------------------------------------------------------------------------------------------------------------------- the key

/** One item as text for the key: its identity and every figure the pick can see. The same on both sides. */
function signature(i: PickItem): string {
  const n = i.numbers;
  return JSON.stringify([i.key, i.name, i.from, i.basis, i.note ?? null, n.kcal, n.protein, n.carbs, n.sugars, n.fat, n.saturates, n.fibre, n.salt, i.perKg]);
}

/** The two items in their canonical order (by signature), and whether that is the opposite of the order given. */
export function canonicalize(input: PickInput): { items: [PickItem, PickItem]; flipped: boolean } {
  const [a, b] = input.items;
  const flipped = signature(a) > signature(b);
  return { items: flipped ? [b, a] : [a, b], flipped };
}

/** The same answer in the other order of the two items. */
export function flipPick<T extends { pick: PickChoice }>(p: T, flipped: boolean): T {
  if (!flipped || p.pick === "tie") return p;
  return { ...p, pick: p.pick === 0 ? 1 : 0 };
}

/** SHA-256 of the two items (their keys, names and figures, in canonical order), the goal and the diet words. Bump VERSION when the prompt or the rules change so old answers are not reused. */
const VERSION = 1;
export async function pickKey(input: PickInput): Promise<string> {
  const { items } = canonicalize(input);
  const text = JSON.stringify(["numbite-pick", VERSION, signature(items[0]), signature(items[1]), input.goal, [...input.diet].sort()]);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const PICK_KEY = /^[0-9a-f]{64}$/;

// ------------------------------------------------------------------------------------------------------------- the sentence

/** Words Pip's sentence may never use: rule 3 (no good, bad or healthy), medical or health words, medicines, and anything that points at a position. */
const BANNED_WORD = new RegExp(
  "\\b(?:" + [
    "healthy", "unhealthy", "healthier", "healthiest", "health\\w*", "wellness", "good", "bad", "worse", "worst", "clean", "junk", "guilt\\w*", "superfoods?", "detox\\w*",
    "cures?", "cured", "disease\\w*", "diabet\\w*", "cholesterol", "heart", "obes\\w*", "cancer", "illness\\w*", "medic\\w*", "medicine\\w*", "nutritious", "wholesome", "toxic",
    "poison\\w*", "fattening", "sinful", "naughty", "cheat\\w*", "glp\\w*", "ozempic", "wegovy", "mounjaro", "doctors?", "dietitians?", "prescri\\w*", "symptom\\w*", "blood", "insulin",
    "first", "second", "left", "right", "former", "latter",
  ].join("|") + ")\\b",
  "i",
);
/** "No numbers in it": digits are caught by the allowed characters; these are the spelled-out ones. */
const NUMBER_WORD = /\b(?:two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|percent|twice|double|triple|half|dozen)\b/i;
const LINKISH = /\b(?:https?|www)\b|\.(?:com|co|uk|org|net|io|app|me)\b/i;
/** Letters (any language: a product's name may be in the sentence), spaces and plain punctuation. No digits, symbols, links or markup. */
const ALLOWED_TEXT = /^\p{L}[\p{L}\p{M} ,.'’!?;:\-–—"“”()&]*$/u;

/** The sentence trimmed, or null when it breaks any rule above or is too long or short. */
export function validSentence(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 8 || s.length > 220) return null;
  const words = s.split(" ").length;
  if (words < 3 || words > MAX_SENTENCE_WORDS) return null;
  if (!ALLOWED_TEXT.test(s)) return null;
  if (BANNED_WORD.test(s) || NUMBER_WORD.test(s) || LINKISH.test(s)) return null;
  return s;
}

// ------------------------------------------------------------------------------------------------------------- the reasons

/** What a reason says, with the number worked out from the figures (the AI never supplies one). */
export interface Reason {
  key: ReasonKey;
  /** Already rounded as shown: kcal whole, grams to 1 decimal from 1 g (2 below), £ to the penny. Always above 0. */
  n: number;
  per: "100kcal" | "100g" | "100ml" | "serving" | "100gProtein";
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
const grams = (v: number) => (v >= 1 ? round(v, 1) : round(v, 2));
const perOf = (i: PickItem): Reason["per"] => (i.basis === "g" ? "100g" : i.basis === "ml" ? "100ml" : "serving");

const proteinPer100kcal = (i: PickItem): number | null => (i.numbers.protein !== null && i.numbers.kcal > 0 ? (i.numbers.protein / i.numbers.kcal) * 100 : null);
/** Pounds for 100 g of protein: the price per kg (or litre) over the protein in 1 kg (or litre). */
const poundsPer100gProtein = (i: PickItem): number | null => (i.perKg !== null && i.perKg > 0 && i.numbers.protein !== null && i.numbers.protein > 0 ? (i.perKg * 10) / i.numbers.protein : null);

/** The reason for `key` when `a` really is ahead of `b` on it (after rounding to what would be shown); otherwise null. Needs both figures. */
export function reasonFor(key: ReasonKey, a: PickItem, b: PickItem): Reason | null {
  const per = perOf(a);
  const gap = (higher: number | null, lower: number | null, digits: "kcal" | "g" | "gbp" | "ppk") => {
    if (higher === null || lower === null) return null;
    const d = higher - lower;
    const shown = digits === "kcal" ? Math.round(d) : digits === "gbp" ? round(d, 2) : digits === "ppk" ? round(d, 1) : grams(d);
    return shown > 0 ? shown : null;
  };
  let n: number | null = null;
  let unit: Reason["per"] = per;
  switch (key) {
    case "moreProteinPerKcal": n = gap(proteinPer100kcal(a), proteinPer100kcal(b), "ppk"); unit = "100kcal"; break;
    case "fewerKcal": n = gap(b.numbers.kcal, a.numbers.kcal, "kcal"); break;
    case "lessSugar": n = gap(b.numbers.sugars, a.numbers.sugars, "g"); break;
    case "lessSatFat": n = gap(b.numbers.saturates, a.numbers.saturates, "g"); break;
    case "lessSalt": n = gap(b.numbers.salt, a.numbers.salt, "g"); break;
    case "moreFibre": n = gap(a.numbers.fibre, b.numbers.fibre, "g"); break;
    case "cheaperProtein": n = gap(poundsPer100gProtein(b), poundsPer100gProtein(a), "gbp"); unit = "100gProtein"; break;
    case "lessFat": n = gap(b.numbers.fat, a.numbers.fat, "g"); break;
    case "moreProtein": n = gap(a.numbers.protein, b.numbers.protein, "g"); break;
  }
  return n === null ? null : { key, n, per: unit };
}

/** A reason as the line on the card: "4.2 g more protein per 100 kcal". `t` is the screen's translator (English by default). */
export function reasonLine(r: Reason, t: T = englishT): string {
  const per = r.per === "100g" ? t("per 100 g") : r.per === "100ml" ? t("per 100 ml") : t("per serving");
  switch (r.key) {
    case "moreProteinPerKcal": return t("{n} g more protein per 100 kcal", { n: r.n });
    case "fewerKcal": return t("{n} fewer kcal {per}", { n: r.n, per });
    case "lessSugar": return t("{n} g less sugar {per}", { n: r.n, per });
    case "lessSatFat": return t("{n} g less saturated fat {per}", { n: r.n, per });
    case "lessSalt": return t("{n} g less salt {per}", { n: r.n, per });
    case "moreFibre": return t("{n} g more fibre {per}", { n: r.n, per });
    case "cheaperProtein": return t("£{n} less per 100 g of protein", { n: r.n.toFixed(2) });
    case "lessFat": return t("{n} g less fat {per}", { n: r.n, per });
    case "moreProtein": return t("{n} g more protein {per}", { n: r.n, per });
  }
}

// ------------------------------------------------------------------------------------------- checking what the AI (or a cache) says

const isKey = (v: unknown): v is ReasonKey => typeof v === "string" && (REASON_KEYS as readonly string[]).includes(v);

/**
 * An answer in the canonical order of `items`, checked: a real pick, a sentence that passes validSentence, and only the reason keys the figures support for the
 * picked item (at most three, once each, in the order given). A pick with no supported reason is refused. A tie keeps no reasons. Anything else is null.
 * The same check is used on what the AI says, on what the server's cache holds and on what the phone remembers.
 */
export function checkPick(raw: unknown, items: readonly [PickItem, PickItem]): StoredPick | null {
  const r = raw as { pick?: unknown; sentence?: unknown; reasons?: unknown } | null;
  if (!r || typeof r !== "object") return null;
  const pick = r.pick;
  if (pick !== 0 && pick !== 1 && pick !== "tie") return null;
  const sentence = validSentence(r.sentence);
  if (!sentence) return null;
  if (pick === "tie") return { pick, sentence, reasons: [] };
  if (!Array.isArray(r.reasons)) return null;
  const ahead = items[pick];
  const other = items[pick === 0 ? 1 : 0];
  const reasons: ReasonKey[] = [];
  for (const k of r.reasons) if (isKey(k) && !reasons.includes(k) && reasonFor(k, ahead, other) && reasons.length < MAX_REASONS) reasons.push(k);
  return reasons.length ? { pick, sentence, reasons } : null;
}

/** What the card shows for a stored answer, in the order the person added the two items: the item picked (null for a tie), the sentence and the reason lines' facts. Null if the figures no longer support it. */
export function resolvePick(stored: StoredPick, input: PickInput): { chosen: PickItem | null; sentence: string; reasons: Reason[] } | null {
  const { items, flipped } = canonicalize(input);
  const checked = checkPick(stored, items);
  if (!checked) return null;
  const shown = flipPick(checked, flipped);
  if (shown.pick === "tie") return { chosen: null, sentence: shown.sentence, reasons: [] };
  const ahead = input.items[shown.pick];
  const other = input.items[shown.pick === 0 ? 1 : 0];
  const reasons = shown.reasons.map((k) => reasonFor(k, ahead, other)).filter((x): x is Reason => x !== null);
  return { chosen: ahead, sentence: shown.sentence, reasons };
}

// ------------------------------------------------------------------------------------------------------ what the phone remembers

export const MAX_DEVICE_PICKS = 200;

/** One remembered answer on this phone (mm.v1.comparePicks), newest first. Not synced, never sent anywhere except as the cache lookup the pick request itself is. */
export interface PickEntry extends StoredPick {
  key: string;
  at: number;
}

/** What was stored, checked field by field; anything malformed is dropped, never repaired. The figures aren't here, so the reasons are checked again when shown (resolvePick). */
export function sanitizeComparePicks(raw: unknown): PickEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PickEntry[] = [];
  for (const e of raw) {
    const r = e as Partial<PickEntry> | null;
    if (!r || typeof r !== "object" || typeof r.key !== "string" || !PICK_KEY.test(r.key) || out.some((x) => x.key === r.key)) continue;
    if (r.pick !== 0 && r.pick !== 1 && r.pick !== "tie") continue;
    const sentence = validSentence(r.sentence);
    const reasons = Array.isArray(r.reasons) ? [...new Set(r.reasons.filter(isKey))].slice(0, MAX_REASONS) : null;
    if (!sentence || !reasons || (r.pick !== "tie" && reasons.length === 0) || typeof r.at !== "number" || !Number.isFinite(r.at)) continue;
    out.push({ key: r.key, pick: r.pick, sentence, reasons: r.pick === "tie" ? [] : reasons, at: r.at });
    if (out.length >= MAX_DEVICE_PICKS) break;
  }
  return out;
}

/** Remember an answer (newest first; an older copy of it is replaced); the oldest go when there are more than MAX_DEVICE_PICKS. */
export function rememberPick(list: readonly PickEntry[], key: string, pick: StoredPick, at: number): PickEntry[] {
  return [{ key, ...pick, at }, ...list.filter((x) => x.key !== key)].slice(0, MAX_DEVICE_PICKS);
}
