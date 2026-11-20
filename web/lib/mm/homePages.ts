import { dayParam } from "./day";
import { moreDietsOn } from "./foodDiet";
import { isAllHalal } from "./halal";
import { tk } from "./i18n";
import { passesDiet } from "./menu-view";
import type { MenuItem, Preferences } from "./types";

// Home's own state on this device (mm.v1.homePages): never synced, never sent; cleared by Settings › Clear everything and Reset onboarding.
//
// 1. The swipe pages' first-visit hint (the 20-person meeting, 2026-11-19): "Slide the cards sideways, or tap here, to see your week" shows under the dots
//    until page 2 has been seen, and on at most HINT_DAYS different days, then never again. The one demonstration slide plays once per device. Home has two
//    pages since 20 November (Today; Calories and protein this week): the sugar, salt and fibre page is no longer shown (decided overnight under the
//    founder's delegation; lib/mm/labelTotals.ts and HomeLabels.tsx are kept).
// 2. What the end of the welcome screens leaves for Home (the onboarding redesign meeting, 20 November 2026, approved by the founder: "Home, first visit"):
//    the one toast that says what is now true, and the one-time "Start here" card under the numbers (app/app/_components/StartHere.tsx). The welcome
//    flow's finishWelcome() writes it with withArrival(). Home says the toast once and forgets it (dropToast); the card stays on Home, visit after visit, as
//    step 5 promised ("It'll be waiting on Home"), until "Done with this" (dropCard), until every row it showed has been used (the rows used are kept in the
//    note: withStartUsed), or until START_HERE_DAYS days after the welcome screens ended (the 30-person audit, 20 November 2026: it used to vanish for good
//    the moment she left Home). Sign out, Delete my account and Clear everything clear it too (withoutArrival; never synced: nothing here is in SYNC_STORES).

export interface HomePagesState {
  /** Page 2 has been shown (by a swipe, a dot or the hint). */
  seen: boolean;
  /** The one demonstration slide has played (or started). */
  slid: boolean;
  /** How many different days the hint has been shown on. */
  hintDays: number;
  /** The last day the hint was shown (YYYY-MM-DD), so a second visit the same day doesn't count again. */
  lastHintDay: string;
  /** What the welcome screens left for Home's next visit; absent once Home has shown it. */
  arrival?: HomeArrivalNote;
}

export const NO_HOME_PAGES: HomePagesState = { seen: false, slid: false, hintDays: 0, lastHintDay: "" };
/** The hint retires after showing on this many days, even if the pages were never looked at (the dots and Pip's tip still teach them). */
export const HINT_DAYS = 5;

/** How the person came to Home from the welcome screens, which decides the toast's words. */
export type HomeArrival = "signedIn" | "signedInBack" | "notNow" | "saved";

/** The toast on arrival, one sentence each (the meeting's words): a new account, an existing account, optional sign-in after "Not now", a Settings rerun. */
export const ARRIVAL_TOAST: Readonly<Record<HomeArrival, string>> = {
  signedIn: tk("You're signed in. Your goal and daily numbers are saved."),
  signedInBack: tk("Signed in. Your saved settings are back."),
  notNow: tk("You're in. Sign in any time in Settings to keep your goal and numbers safe."),
  saved: tk("Your changes are saved."),
};

/** The dish shown on the welcome screens' Eat out step (step 3). */
export interface StartHereDish {
  chainId: string;
  itemId: string;
}

export interface HomeArrivalNote {
  /** When the welcome screens ended (ISO time). */
  at: string;
  /** The toast Home says once. */
  toast?: HomeArrival;
  /** The Start here card is owed (never after a Settings rerun). */
  card: boolean;
  /** The recipe chosen on step 5 ("Your first recipe"). */
  firstRecipeId?: string;
  /** The dish from step 3 ("Had the {dish} today? Add it"). */
  firstDish?: StartHereDish;
  /** The Start here card's rows used so far (kept with the card, so it goes once every row has been used, on any visit). */
  used?: StartHereUsedNote;
}

/** What the note keeps of the rows used: only what has happened ("Add what you ate" used, the dish's log entry, the recipe opened). */
export interface StartHereUsedNote {
  add?: true;
  /** The id of the log entry the dish row added (an Undo or a delete takes it out of the log, and the row offers the dish again). */
  dishEntry?: string;
  recipe?: true;
}

/** The note is dropped this many days after the welcome screens ended: the toast if Home never said it, the card if it was never done with. */
export const START_HERE_DAYS = 7;

const ARRIVALS: readonly HomeArrival[] = ["signedIn", "signedInBack", "notNow", "saved"];
const RECIPE_ID = /^[a-z0-9-]{2,60}$/;
const CHAIN_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,199}$/;
/** A log entry's id (a UUID, or the time-and-random fallback of stores.ts newId). */
const ENTRY_ID = /^[A-Za-z0-9-]{1,80}$/;

function sanitizeUsed(raw: unknown): StartHereUsedNote | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const used: StartHereUsedNote = {
    ...(r.add === true ? { add: true as const } : {}),
    ...(typeof r.dishEntry === "string" && ENTRY_ID.test(r.dishEntry) ? { dishEntry: r.dishEntry } : {}),
    ...(r.recipe === true ? { recipe: true as const } : {}),
  };
  return Object.keys(used).length > 0 ? used : undefined;
}

function sanitizeArrival(raw: unknown): HomeArrivalNote | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at))) return undefined;
  const toast = ARRIVALS.find((a) => a === r.toast);
  const card = r.card === true;
  const recipe = typeof r.firstRecipeId === "string" && RECIPE_ID.test(r.firstRecipeId) ? r.firstRecipeId : undefined;
  const d = r.firstDish as Record<string, unknown> | null | undefined;
  const dish = d && typeof d === "object" && typeof d.chainId === "string" && CHAIN_ID.test(d.chainId) && typeof d.itemId === "string" && ITEM_ID.test(d.itemId)
    ? { chainId: d.chainId, itemId: d.itemId }
    : undefined;
  const used = card ? sanitizeUsed(r.used) : undefined;
  if (!toast && !card) return undefined;
  return {
    at: new Date(r.at).toISOString(), ...(toast ? { toast } : {}), card, ...(card && recipe ? { firstRecipeId: recipe } : {}), ...(card && dish ? { firstDish: dish } : {}),
    ...(used ? { used } : {}),
  };
}

export function sanitizeHomePages(raw: unknown): HomePagesState {
  if (!raw || typeof raw !== "object") return NO_HOME_PAGES;
  const r = raw as Record<string, unknown>;
  const days = typeof r.hintDays === "number" && Number.isInteger(r.hintDays) && r.hintDays >= 0 && r.hintDays <= 99 ? r.hintDays : 0;
  const last = typeof r.lastHintDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.lastHintDay) ? r.lastHintDay : "";
  const arrival = sanitizeArrival(r.arrival);
  return { seen: r.seen === true, slid: r.slid === true, hintDays: days, lastHintDay: last, ...(arrival ? { arrival } : {}) };
}

/** Whether the hint shows today: page 2 not seen yet, and fewer than HINT_DAYS days used (today's visit counts as one already used). */
export function hintShows(s: HomePagesState, now: Date): boolean {
  if (s.seen) return false;
  return s.lastHintDay === dayParam(now) ? s.hintDays <= HINT_DAYS : s.hintDays < HINT_DAYS;
}

/** The state after the hint was shown today: one more day, unless today was already counted. */
export function withHintShown(s: HomePagesState, now: Date): HomePagesState {
  const today = dayParam(now);
  return s.lastHintDay === today ? s : { ...s, hintDays: s.hintDays + 1, lastHintDay: today };
}

/**
 * The end of the welcome screens (finishWelcome): what Home shows on its next visit. A new account, an existing one or "Not now" gets its toast and the
 * Start here card; a Settings rerun (`toast: "saved"`) gets the toast only, never the card. Replaces any older note.
 *   homePagesStore.set(withArrival(homePagesStore.get(), { toast: "signedIn", card: true, firstRecipeId, firstDish }))
 */
export function withArrival(s: HomePagesState, note: Omit<HomeArrivalNote, "at">, now: Date = new Date()): HomePagesState {
  const clean = sanitizeArrival({ ...note, card: note.toast === "saved" ? false : note.card, at: now.toISOString() });
  const { arrival: _old, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars -- replaced
  return clean ? { ...rest, arrival: clean } : rest;
}

/** Without the note: on Sign out, Delete my account and Clear everything (the toast and the card both belong to the account just left). */
export function withoutArrival(s: HomePagesState): HomePagesState {
  if (!s.arrival) return s;
  const { arrival: _gone, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars -- dropped
  return rest;
}

/** The state with this note; the whole note goes once neither the toast nor the card is left in it. */
function withNote(s: HomePagesState, note: HomeArrivalNote): HomePagesState {
  return note.toast || note.card ? { ...s, arrival: note } : withoutArrival(s);
}

/** Once Home has said the arrival toast: it is forgotten (never said twice), and the Start here card stays. */
export function dropToast(s: HomePagesState): HomePagesState {
  if (!s.arrival?.toast) return s;
  const { toast: _said, ...note } = s.arrival; // eslint-disable-line @typescript-eslint/no-unused-vars -- said once
  return withNote(s, note);
}

/** "Done with this" on the Start here card: the card goes for good (an unsaid toast stays). */
export function dropCard(s: HomePagesState): HomePagesState {
  if (!s.arrival?.card) return s;
  return withNote(s, { at: s.arrival.at, ...(s.arrival.toast ? { toast: s.arrival.toast } : {}), card: false });
}

/** A row of the Start here card used: kept in the note, so the card remembers it on the next visit and after a reload. `dishEntry: null` forgets the dish. */
export function withStartUsed(s: HomePagesState, patch: { add?: true; recipe?: true; dishEntry?: string | null }): HomePagesState {
  const a = s.arrival;
  if (!a?.card) return s;
  const { dishEntry: _old, ...kept } = a.used ?? {}; // eslint-disable-line @typescript-eslint/no-unused-vars -- replaced below when the patch says
  const dishEntry = patch.dishEntry === undefined ? a.used?.dishEntry : patch.dishEntry ?? undefined;
  const used = sanitizeUsed({ ...kept, ...(patch.add ? { add: true } : {}), ...(patch.recipe ? { recipe: true } : {}), ...(dishEntry ? { dishEntry } : {}) });
  const { used: _was, ...rest } = a; // eslint-disable-line @typescript-eslint/no-unused-vars -- replaced
  return { ...s, arrival: used ? { ...rest, used } : rest };
}

/** The note Home should show now, or null: none was left, or it is START_HERE_DAYS days old. */
export function arrivalDue(s: HomePagesState, now: Date): HomeArrivalNote | null {
  const a = s.arrival;
  if (!a) return null;
  const age = now.getTime() - Date.parse(a.at);
  // an hour's grace before `at`, for a phone clock put back a little
  return age > -60 * 60 * 1000 && age < START_HERE_DAYS * 24 * 60 * 60 * 1000 ? a : null;
}

/**
 * The step 3 dish is offered again on Home only if it still suits the account's own choices (checked against the settings as they are now, so after sync
 * too): every diet and allergy the restaurant's own data can check (menu-view.ts passesDiet), halal only at a restaurant that says all its food is halal, not
 * a limited-time dish, and none of the diets a restaurant menu can't be checked for (Jain, no onion or garlic, kosher style, no red meat, no alcohol, no
 * halal or kosher meat: menus list no ingredients). When in doubt it is left out: nothing is ever suggested that might not suit.
 */
export function startHereDishFits(item: MenuItem, chainId: string, prefs: Preferences): boolean {
  if (item.limitedTime) return false;
  if (moreDietsOn(prefs).length > 0) return false;
  if (prefs.halalOnly && !isAllHalal(chainId)) return false;
  return passesDiet(item, prefs);
}

/** Which of the Start here card's rows show. */
export interface StartHereRows {
  /** "Add what you ate", which opens the + sheet: only where adding a meal is free for this person. */
  add: boolean;
  /** "Had the {dish} today? Add it": where adding is free and the step 3 dish still suits. */
  dish: boolean;
  /** "Your first recipe: {recipe} · Open": a recipe was chosen on step 5 and still suits. */
  recipe: boolean;
}

export function startHereRows(note: HomeArrivalNote | null, opts: { logFree: boolean; dishFits: boolean; recipeFits: boolean }): StartHereRows {
  if (!note?.card) return { add: false, dish: false, recipe: false };
  return { add: opts.logFree, dish: opts.logFree && !!note.firstDish && opts.dishFits, recipe: !!note.firstRecipeId && opts.recipeFits };
}

/** The card shows while any row does: with adding paid and no recipe chosen there is no card. */
export const startHereShows = (rows: StartHereRows): boolean => rows.add || rows.dish || rows.recipe;

/**
 * The card goes once every row it showed has been used (`used`: added through "Add what you ate", the dish added and still in the log, the recipe opened),
 * except that a dish added on this visit keeps the card so its Undo stays (`undo`, true unless said otherwise; on a later visit Home passes false); "Done with
 * this" closes it at once.
 */
export function startHereDone(rows: StartHereRows, used: { add: boolean; dish: boolean; recipe: boolean; undo?: boolean }): boolean {
  const pending = (rows.add && !used.add) || (rows.recipe && !used.recipe) || (rows.dish && !used.dish);
  return !pending && !(rows.dish && used.dish && used.undo !== false);
}
