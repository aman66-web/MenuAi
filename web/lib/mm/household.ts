import { ALLERGEN_KEYS, type AllergenKey } from "./types";
import type { DietPrefs } from "./pantry";
import { fitDistance, type MealTarget, type MealType } from "./recipes";

// The people a meal plan is cooked for (founder 2026-11-19: "people normally live with people so I want a way people can add their kids and partner etc and
// create a plan for everyone ... needs good personalisation ... but easy to understand"; the 20-agent meeting's conclusion the same day). Kept on this phone
// only, never synced or sent anywhere: for each other person an age group, an optional nickname and a portion size. Allergies and the meat answer belong to
// the home, never to a person. Children and teenagers never get calorie numbers: only a share of a portion.

export type AgeGroup = "adult" | "teen" | "child" | "little";
export type PortionSize = "smaller" | "usual" | "bigger";
export type HomeMeat = "all" | "vegetarian" | "vegan";

export interface HomePerson {
  id: string;
  group: AgeGroup;
  /** Optional, at most NAME_MAX letters: "Sam". Never sent anywhere. */
  name?: string;
  portion: PortionSize;
}

export interface Household {
  /** Everyone else the plan cooks for (the person using the app is always counted, not listed). */
  others: HomePerson[];
  /** Allergies at home: recipes made with any of them are left out for everyone. */
  allergies: AllergenKey[];
  /** Does anyone not eat meat: answered for the whole home (one pot), the strictest wins. */
  meat: HomeMeat;
}

export const NO_HOUSEHOLD: Household = { others: [], allergies: [], meat: "all" };
/** "Just me" to "6 of us". */
export const MAX_PEOPLE = 6;
export const NAME_MAX = 20;
export const AGE_GROUPS: readonly AgeGroup[] = ["adult", "teen", "child", "little"];
export const PORTIONS: readonly PortionSize[] = ["smaller", "usual", "bigger"];

/**
 * How much each age group eats, as a share of a grown-up's portion (the meeting's draft, for the founder's approval: little one 1 to 4 ½, child 5 to 10 ¾,
 * teenager 1¼). A grown-up's portion is sized from the 2,000 kcal a day reference intake printed on UK labels, never from the app user's own target.
 */
export const GROUP_SHARE: Record<AgeGroup, number> = { adult: 1, teen: 1.25, child: 0.75, little: 0.5 };
/** Smaller or Bigger moves a person's share by a quarter. */
export const PORTION_STEP = 0.25;
/** The reference intake on UK labels: a grown-up's day, for sizing other grown-ups' portions. */
export const ADULT_REFERENCE_KCAL = 2000;

/** A person's share of a grown-up's portion: their age group's, a quarter less or more for Smaller or Bigger, never under a quarter. */
export function personShare(p: Pick<HomePerson, "group" | "portion">): number {
  const base = GROUP_SHARE[p.group];
  const step = p.portion === "smaller" ? -PORTION_STEP : p.portion === "bigger" ? PORTION_STEP : 0;
  return Math.max(PORTION_STEP, base + step);
}

/** A new person's card: a grown-up, the usual portion (the meeting: "Person 2 starts as Adult, so a couple taps once"). */
export function newPerson(id: string): HomePerson {
  return { id, group: "adult", portion: "usual" };
}

/** The household with `count` people in all (the person using the app plus count - 1 others): cards kept in order, new ones added as grown-ups. */
export function withCount(h: Household, count: number, nextId: () => string): Household {
  const want = Math.max(0, Math.min(MAX_PEOPLE, Math.round(count)) - 1);
  const others = h.others.slice(0, want);
  while (others.length < want) others.push(newPerson(nextId()));
  return { ...h, others };
}

/** The home's diet for the recipes: the person's own preferences, with the home's allergies added and the home's meat answer (the strictest wins). */
export function homeDiet(own: DietPrefs, h: Household): DietPrefs {
  if (!h.others.length) return own;
  const allergies = [...new Set([...(own.avoidAllergens ?? []), ...h.allergies])];
  return {
    ...own,
    ...(allergies.length ? { avoidAllergens: allergies } : {}),
    ...(h.meat === "vegan" ? { veganOnly: true } : {}),
    ...(h.meat === "vegetarian" ? { vegetarianOnly: true } : {}),
  };
}

/** Plain-word share: 1 -> "1", 1.25 -> "1¼", 0.5 -> "½". */
export function shareWords(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const q = Math.round((n - whole) * 4);
  const frac = ["", "¼", "½", "¾"][q] ?? "";
  if (q === 4) return String(whole + 1);
  return whole === 0 ? frac || "0" : `${whole}${frac}`;
}

export interface Plates {
  /** Each person's amount in the recipe's written servings: the app user first, then the others in order (0 for a meal they don't eat). */
  servings: number[];
  /** Everyone's together: what is cooked and bought. */
  total: number;
}

/**
 * How much of a recipe as written each person eats at one meal. The app user's own portion matches their own meal size (their meal target's calories);
 * each other grown-up's matches the same meal for a 2,000 kcal day (the user's meal split, scaled), times their share. Snacks are just for the user.
 */
export function platesFor(meal: MealType, servingKcal: number, yourMeal: MealTarget, yourDailyKcal: number, others: readonly HomePerson[]): Plates {
  const k = servingKcal > 0 ? servingKcal : 1;
  const you = yourMeal.kcal / k;
  const refMeal = (yourMeal.kcal * ADULT_REFERENCE_KCAL) / (yourDailyKcal > 0 ? yourDailyKcal : ADULT_REFERENCE_KCAL);
  const rest = meal === "snack" ? others.map(() => 0) : others.map((p) => (refMeal * personShare(p)) / k);
  const servings = [you, ...rest];
  return { servings, total: servings.reduce((a, b) => a + b, 0) };
}

/** How far the user's own portion of a recipe as written is from their meal (fitDistance of their share), so recipes that suit them come first. */
export function yourPortionDistance(perServing: { kcal: number; protein: number; carbs: number; fat: number }, yourServings: number, target: MealTarget): number {
  return fitDistance({ kcal: perServing.kcal * yourServings, protein: perServing.protein * yourServings, carbs: perServing.carbs * yourServings, fat: perServing.fat * yourServings }, target);
}

const ID = /^[a-z0-9-]{1,24}$/;

export function sanitizeHousehold(raw: unknown): Household {
  if (!raw || typeof raw !== "object") return NO_HOUSEHOLD;
  const r = raw as Record<string, unknown>;
  const others: HomePerson[] = [];
  for (const p of Array.isArray(r.others) ? r.others : []) {
    if (others.length >= MAX_PEOPLE - 1 || !p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    if (typeof o.id !== "string" || !ID.test(o.id) || others.some((x) => x.id === o.id)) continue;
    const group = AGE_GROUPS.includes(o.group as AgeGroup) ? (o.group as AgeGroup) : "adult";
    const portion = PORTIONS.includes(o.portion as PortionSize) ? (o.portion as PortionSize) : "usual";
    const name = typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
    others.push({ id: o.id, group, portion, ...(name ? { name } : {}) });
  }
  const allergies = Array.isArray(r.allergies) ? [...new Set(r.allergies.filter((a): a is AllergenKey => ALLERGEN_KEYS.includes(a as AllergenKey)))] : [];
  const meat: HomeMeat = r.meat === "vegetarian" || r.meat === "vegan" ? r.meat : "all";
  return { others, allergies, meat };
}
