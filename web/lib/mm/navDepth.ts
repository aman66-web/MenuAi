// "Back goes to the page before" (founder 2026-10-16: pressing the heart on Recipes opened My meals, and Back there went to Home, not to Recipes). Every Back
// button used to be a link to one fixed page, so a page reached from somewhere else sent the person to the wrong place. Now Back uses the browser's own history
// when this page was reached from another page of the app, and the fixed page only when there is nothing earlier (a page opened by address, a shared link,
// a reload that lost its history). To know which, each history entry carries its depth: the first entry the app sees is 0 and every pushed entry is one more than the
// entry it was pushed from; a replaced entry keeps its depth. history.state travels with the entry itself, so it survives a reload and follows Back and Forward
// exactly, with no stack of our own to drift out of step. Pure (no DOM), so it is unit-tested; the window part is app/app/_lib/backNav.ts.

/** The key our depth is stored under inside history.state (Next.js keeps its own keys there too: ours is added to whatever it writes). */
export const DEPTH_KEY = "mmDepth";

/** The depth of a history entry from its state: a whole number from 0 up, anything else (no state, someone else's state) is 0. */
export function depthOf(state: unknown): number {
  if (typeof state !== "object" || state === null) return 0;
  const d = (state as Record<string, unknown>)[DEPTH_KEY];
  return typeof d === "number" && Number.isInteger(d) && d > 0 && d < 1_000_000 ? d : 0;
}

/**
 * The state to write for a history entry about to be pushed or replaced. `data` is what the caller (or Next.js) passes, `current` is the state of the entry the
 * browser is on now. A push is one deeper than the current entry; a replace keeps the current entry's depth. Non-object data (the history API allows any value,
 * Next.js only ever passes an object or nothing) is returned untouched, so nobody else's value is changed.
 */
export function stateFor(kind: "push" | "replace", data: unknown, current: unknown): unknown {
  if (data !== null && data !== undefined && typeof data !== "object") return data;
  const depth = kind === "push" ? depthOf(current) + 1 : depthOf(current);
  const base = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return { ...base, [DEPTH_KEY]: depth };
}

/** True when the current entry was reached from another page of the app, so the browser's Back stays inside the app. */
export const canGoBack = (state: unknown): boolean => depthOf(state) > 0;

/**
 * The spoken name of a Back control. After an in-app arrival it is the plain visible word (the destination may be anywhere); otherwise it names the fixed page
 * it goes to ("Back to home"). In a language where that phrase does not contain the visible word (Spanish "Volver al inicio" under "Atrás"), the word comes first
 * ("Atrás: Volver al inicio"), so a Voice Control user who says what they see ("tap Atrás") can reach it (WCAG 2.5.3, Label in Name). English is unchanged.
 */
export function backName(plain: string, fallbackLabel: string, cameFromApp: boolean): string {
  if (cameFromApp) return plain;
  return fallbackLabel.toLowerCase().includes(plain.toLowerCase()) ? fallbackLabel : `${plain}: ${fallbackLabel}`;
}

// The words in a search box travel with the history entry too (a person who opens a result and comes Back finds the search as they left it, not an empty box).
// Like the depth they live in history.state, so they follow Back and Forward exactly, survive a reload and need no storage of their own.

/** The key a search box's words are stored under inside history.state. */
export const QUERY_KEY = "mmQuery";
const MAX_QUERY = 200;

/** The words saved in a history entry's state: "" when there are none (no state, someone else's state, not text). */
export function queryOf(state: unknown): string {
  if (typeof state !== "object" || state === null) return "";
  const q = (state as Record<string, unknown>)[QUERY_KEY];
  return typeof q === "string" ? q.slice(0, MAX_QUERY) : "";
}

/** The state of the current entry with `query` saved in it (removed when empty); everything else in the state, the depth and Next.js's own keys included, is kept. */
export function withQuery(state: unknown, query: string): Record<string, unknown> {
  const { [QUERY_KEY]: _old, ...rest } = (typeof state === "object" && state !== null ? state : {}) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
  return query ? { ...rest, [QUERY_KEY]: query.slice(0, MAX_QUERY) } : rest;
}
