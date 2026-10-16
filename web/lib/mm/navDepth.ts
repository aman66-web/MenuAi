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
