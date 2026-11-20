import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ARRIVAL_TOAST, NO_HOME_PAGES, START_HERE_DAYS, arrivalDue, sanitizeHomePages, startHereDishFits, startHereDone, startHereRows, startHereShows, withArrival, withoutArrival,
  type HomeArrivalNote,
} from "../lib/mm/homePages";
import { OWN_DATA_KEYS } from "../lib/mm/tour";
import type { MenuItem, Preferences } from "../lib/mm/types";

// Home's first visit after the welcome screens (the onboarding redesign meeting, 20 November 2026): the arrival toast and the one-time Start here card,
// from the note the welcome screens leave (lib/mm/homePages.ts), when the card shows, which rows it has, and when it goes for good.

const END = new Date(2026, 10, 20, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
const later = (ms: number) => new Date(END.getTime() + ms);
const NONE: Preferences = { vegetarianOnly: false, noPork: false, noBeef: false };
const dish = (patch: Partial<MenuItem> = {}): MenuItem => ({
  id: "chicken-wrap", name: "Chicken Wrap", category: "Wraps", serving: "1 wrap", nutrients: { calories: 420, protein: 30, carbs: 40, fat: 12 }, tags: [],
  limitedTime: false, rankable: true, components: [], modifiers: [], allergens: { contains: ["gluten", "milk"], mayContain: [] }, ...patch,
});

describe("the note the welcome screens leave for Home", () => {
  it("a new account, an existing one and 'Not now' each get their toast and the card; a Settings rerun the toast only", () => {
    for (const toast of ["signedIn", "signedInBack", "notNow"] as const) {
      const note = arrivalDue(withArrival(NO_HOME_PAGES, { toast, card: true, firstRecipeId: "overnight-oats", firstDish: { chainId: "pret", itemId: "chicken-wrap" } }, END), END);
      expect(note).toMatchObject({ toast, card: true, firstRecipeId: "overnight-oats", firstDish: { chainId: "pret", itemId: "chicken-wrap" } });
    }
    const rerun = arrivalDue(withArrival(NO_HOME_PAGES, { toast: "saved", card: true, firstRecipeId: "overnight-oats" }, END), END)!;
    expect(rerun.toast).toBe("saved");
    expect(rerun.card).toBe(false);
    expect("firstRecipeId" in rerun).toBe(false);
    expect(startHereShows(startHereRows(rerun, { logFree: true, dishFits: true, recipeFits: true }))).toBe(false);
  });

  it("says the meeting's words", () => {
    expect(ARRIVAL_TOAST).toEqual({
      signedIn: "You're signed in. Your goal and daily numbers are saved.",
      signedInBack: "Signed in. Your saved settings are back.",
      notNow: "You're in. Sign in any time in Settings to keep your goal and numbers safe.",
      saved: "Your changes are saved.",
    });
  });

  it("is shown once: gone after Home has shown it, and on sign out, Delete my account and Clear everything", () => {
    const s = withArrival({ ...NO_HOME_PAGES, seen: true, hintDays: 2, lastHintDay: "2026-11-19" }, { toast: "signedIn", card: true }, END);
    expect(arrivalDue(s, END)).not.toBeNull();
    const after = withoutArrival(s);
    expect(arrivalDue(after, END)).toBeNull();
    expect(after).toEqual({ seen: true, slid: false, hintDays: 2, lastHintDay: "2026-11-19" }); // the hint's own state is kept
    expect(withoutArrival(NO_HOME_PAGES)).toBe(NO_HOME_PAGES);
    // Clear everything resets the whole store
    expect(sanitizeHomePages(undefined)).toEqual(NO_HOME_PAGES);
  });

  it(`is dropped ${START_HERE_DAYS} days after the welcome screens ended if Home never showed it`, () => {
    const s = withArrival(NO_HOME_PAGES, { toast: "signedIn", card: true }, END);
    expect(arrivalDue(s, later(START_HERE_DAYS * DAY - 60_000))).not.toBeNull();
    expect(arrivalDue(s, later(START_HERE_DAYS * DAY))).toBeNull();
    expect(arrivalDue(s, later(30 * DAY))).toBeNull();
    // a phone clock put back a little still shows it; one put back by days doesn't
    expect(arrivalDue(s, later(-30 * 60_000))).not.toBeNull();
    expect(arrivalDue(s, later(-2 * DAY))).toBeNull();
  });

  it("a newer ending replaces an older note", () => {
    const first = withArrival(NO_HOME_PAGES, { toast: "signedIn", card: true, firstRecipeId: "overnight-oats" }, END);
    const second = withArrival(first, { toast: "saved", card: false }, later(DAY));
    expect(arrivalDue(second, later(DAY))).toEqual({ at: later(DAY).toISOString(), toast: "saved", card: false });
  });

  it("survives storage, keeps only what it should and drops anything malformed", () => {
    const s = withArrival(NO_HOME_PAGES, { toast: "notNow", card: true, firstRecipeId: "overnight-oats", firstDish: { chainId: "pret", itemId: "chicken-wrap" } }, END);
    expect(sanitizeHomePages(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const odd = sanitizeHomePages({ ...NO_HOME_PAGES, arrival: { at: END.toISOString(), toast: "party", card: "yes", firstRecipeId: "../etc", firstDish: { chainId: "Pret A", itemId: 3 }, email: "x@y.z" } });
    expect("arrival" in odd).toBe(false); // no toast and no card: nothing left to show
    const partly = sanitizeHomePages({ ...NO_HOME_PAGES, arrival: { at: END.toISOString(), toast: "signedIn", card: true, firstRecipeId: "BAD ID", firstDish: { chainId: "pret" }, goal: "glp1" } });
    expect(partly.arrival).toEqual({ at: END.toISOString(), toast: "signedIn", card: true });
    expect(sanitizeHomePages({ ...NO_HOME_PAGES, arrival: { at: "yesterday", toast: "signedIn", card: true } })).toEqual(NO_HOME_PAGES);
    // without a note the stored state is exactly the four hint fields, as before
    expect(Object.keys(sanitizeHomePages({ seen: true, slid: true, hintDays: 1, lastHintDay: "2026-11-19" }))).toEqual(["seen", "slid", "hintDays", "lastHintDay"]);
  });

  it("stays on this device: never synced, and never counted as the person's own data", () => {
    expect(readFileSync("lib/mm/syncStores.ts", "utf8")).not.toMatch(/homePages/);
    expect(OWN_DATA_KEYS).not.toContain("mm.v1.homePages");
  });
});

describe("the Start here card", () => {
  const note = (patch: Partial<HomeArrivalNote> = {}): HomeArrivalNote => ({ at: END.toISOString(), toast: "signedIn", card: true, ...patch });

  it("shows 'Add what you ate' only where adding a meal is free; with adding paid and no recipe there is no card", () => {
    expect(startHereRows(note(), { logFree: true, dishFits: false, recipeFits: false })).toEqual({ add: true, dish: false, recipe: false });
    const paid = startHereRows(note(), { logFree: false, dishFits: true, recipeFits: false });
    expect(paid).toEqual({ add: false, dish: false, recipe: false });
    expect(startHereShows(paid)).toBe(false);
    // the dish row is also an add, so it is free-only too; the recipe row isn't
    const paidRecipe = startHereRows(note({ firstRecipeId: "overnight-oats", firstDish: { chainId: "pret", itemId: "chicken-wrap" } }), { logFree: false, dishFits: true, recipeFits: true });
    expect(paidRecipe).toEqual({ add: false, dish: false, recipe: true });
    expect(startHereShows(paidRecipe)).toBe(true);
  });

  it("offers the step 3 dish and the first recipe only while they still suit", () => {
    const n = note({ firstRecipeId: "overnight-oats", firstDish: { chainId: "pret", itemId: "chicken-wrap" } });
    expect(startHereRows(n, { logFree: true, dishFits: true, recipeFits: true })).toEqual({ add: true, dish: true, recipe: true });
    expect(startHereRows(n, { logFree: true, dishFits: false, recipeFits: false })).toEqual({ add: true, dish: false, recipe: false });
    // nothing chosen: nothing offered, whatever the checks say
    expect(startHereRows(note(), { logFree: true, dishFits: true, recipeFits: true })).toEqual({ add: true, dish: false, recipe: false });
    expect(startHereRows(null, { logFree: true, dishFits: true, recipeFits: true })).toEqual({ add: false, dish: false, recipe: false });
  });

  it("goes for good once every row has been used, but keeps a just-added dish's Undo", () => {
    const all = { add: true, dish: true, recipe: true };
    expect(startHereDone(all, { add: false, dish: false, recipe: false })).toBe(false);
    expect(startHereDone(all, { add: true, dish: false, recipe: true })).toBe(false); // the dish is still offered
    expect(startHereDone(all, { add: true, dish: true, recipe: true })).toBe(false); // the dish's Undo stays
    expect(startHereDone({ add: true, dish: false, recipe: true }, { add: true, dish: false, recipe: true })).toBe(true);
    expect(startHereDone({ add: true, dish: false, recipe: false }, { add: true, dish: false, recipe: false })).toBe(true);
    expect(startHereDone({ add: false, dish: false, recipe: true }, { add: false, dish: false, recipe: true })).toBe(true);
  });

  it("rechecks the dish against the account's own diet and allergens: limited-time dishes, unchecked diets and halal at a restaurant that doesn't say so are left out", () => {
    expect(startHereDishFits(dish(), "pret", NONE)).toBe(true);
    expect(startHereDishFits(dish({ limitedTime: true }), "pret", NONE)).toBe(false);
    expect(startHereDishFits(dish(), "pret", { ...NONE, vegetarianOnly: true })).toBe(false);
    expect(startHereDishFits(dish({ tags: ["vegetarian"], name: "Falafel Wrap" }), "pret", { ...NONE, vegetarianOnly: true })).toBe(true);
    expect(startHereDishFits(dish(), "pret", { ...NONE, avoidAllergens: ["milk"] })).toBe(false);
    expect(startHereDishFits(dish({ allergens: undefined }), "pret", { ...NONE, avoidAllergens: ["eggs"] })).toBe(false); // no allergy information: can't say
    expect(startHereDishFits(dish(), "pret", { ...NONE, avoidAllergens: ["eggs"] })).toBe(true);
    expect(startHereDishFits(dish({ tags: ["contains_pork"] }), "pret", { ...NONE, noPork: true })).toBe(false);
    expect(startHereDishFits(dish(), "pret", { ...NONE, veganOnly: true })).toBe(false);
    for (const k of ["jain", "noOnionGarlic", "kosherStyle", "noRedMeat", "noAlcohol", "noHalalKosherMeat"] as const) {
      expect(startHereDishFits(dish(), "pret", { ...NONE, [k]: true }), k).toBe(false); // menus list no ingredients: can't be checked
    }
    expect(startHereDishFits(dish(), "pret", { ...NONE, halalOnly: true })).toBe(false);
    expect(startHereDishFits(dish(), "afrikana", { ...NONE, halalOnly: true })).toBe(true); // says all its food is halal
  });

  it("its words are tk() keys in StartHere.tsx, with no figure and no good/bad word", () => {
    const src = readFileSync("app/app/_components/StartHere.tsx", "utf8");
    for (const line of ["Start here", "Had something today? Add it and see what's left.", "Add what you ate", "Had the {dish} today? Add it", "Your first recipe: {recipe}", "Open", "Done with this"]) {
      expect(src, line).toContain(`t(${JSON.stringify(line)}`);
      expect(/\b(healthy|unhealthy|good|bad|junk)\b/i.test(line), line).toBe(false);
    }
    expect(src).toContain('data-coach="home-start"');
  });
});
