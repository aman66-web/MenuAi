// Where the Undo toast goes and when its Undo may act (app/app/_components/UndoToast.tsx). Pure, so it is unit-tested (tests/toastPlace.test.ts).
//
// The toast is a fixed pill over the page, so whatever sits under it can't be tapped while it shows. The review of the improvement pass (findings 16-18)
// found three ways that goes wrong: a second tap on the control that made the toast lands on Undo and takes the first action back (My meals' Log, a
// recipe's "Log a serving"); a tap on a control near the top (a recipe picture's Save) lands on Undo; and a keyboard or switch user whose control
// disappeared (the "−" at quantity 1, Clear, Delete) has to tab through the whole page to reach Undo before it goes. So: the toast goes to the other end
// of the screen when the control that was used sits where the toast would be; an Undo pressed within a moment of the toast appearing, at the spot of the
// tap that made it (or by a key held on it), does nothing; and when the control that had the keyboard focus is gone, the focus moves to Undo.

export type ToastPlace = "top" | "bottom";

/** A vertical stretch of the screen, in CSS pixels from the top of the window. */
export interface Band {
  top: number;
  bottom: number;
}

/** What the person last did with a pointer and with the keyboard (performance.now() times, clientX/Y). */
export interface LastInput {
  x: number;
  y: number;
  pointerAt: number;
  keyAt: number;
}

/** How long after a tap it still counts as what made the toast appear. */
export const RECENT_TAP_MS = 1500;
/** For this long after the toast appears, an Undo pressed at the spot of the tap that made it, or by a key held on it, is an accident. */
export const UNDO_GUARD_MS = 700;
/** "The same spot" as that tap: a finger's width. */
export const SAME_SPOT_PX = 32;

export const otherPlace = (p: ToastPlace): ToastPlace => (p === "top" ? "bottom" : "top");

export const overlaps = (a: Band, b: Band): boolean => a.top < b.bottom && b.top < a.bottom;

/** The tap that just happened, if the last thing the person did was a tap (not a key press since). */
export function recentTap(input: LastInput, now: number): { x: number; y: number } | null {
  if (input.pointerAt < input.keyAt || now - input.pointerAt > RECENT_TAP_MS) return null;
  return { x: input.x, y: input.y };
}

/**
 * Where on the screen the control that made the toast was: around the recent tap, else the element that has the keyboard focus (its box), else unknown.
 * A tap counts as a finger's width either side of where it landed.
 */
export function triggerBand(input: LastInput, now: number, focused: Band | null): Band | null {
  const tap = recentTap(input, now);
  if (tap) return { top: tap.y - SAME_SPOT_PX, bottom: tap.y + SAME_SPOT_PX };
  return focused;
}

/** The place asked for, unless the control that was used sits under the pill there: then the other end of the screen. */
export function placeToast(preferred: ToastPlace, trigger: Band | null, pill: Band | null): ToastPlace {
  if (!trigger || !pill) return preferred;
  return overlaps(trigger, pill) ? otherPlace(preferred) : preferred;
}

/**
 * Whether the focus should move to Undo when the toast appears: only when the control that had the keyboard focus is gone (the focus fell to the page)
 * and the action was not a tap (a tap leaves no focus behind on a phone, and a sighted person tapping doesn't need it moved).
 */
export function shouldFocusUndo(focusLost: boolean, input: LastInput, now: number): boolean {
  return focusLost && recentTap(input, now) === null;
}

/**
 * Whether an Undo press is an accident: within UNDO_GUARD_MS of the toast appearing, either a tap at the spot of the tap that made it (a double tap on Log
 * that would otherwise land on Undo), or a key press when the toast itself moved the focus to Undo (Enter pressed twice on the "−" at quantity 1).
 */
export function undoIsAccident(
  shownAt: number,
  now: number,
  press: { x: number; y: number } | null,
  madeBy: { x: number; y: number } | null,
  focusMovedToUndo: boolean,
): boolean {
  if (now - shownAt >= UNDO_GUARD_MS) return false;
  if (press && madeBy) return Math.abs(press.x - madeBy.x) <= SAME_SPOT_PX && Math.abs(press.y - madeBy.y) <= SAME_SPOT_PX;
  return !press && focusMovedToUndo;
}
