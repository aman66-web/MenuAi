// Full screen for the Nearby map: the small state machine behind the button, Escape and the phone's Back gesture. Pure (no DOM), so it is
// unit-tested. The map itself never moves: only a class changes. One same-URL history entry is pushed per visit, so the Back gesture (an
// edge swipe in the iPhone app, Android Back) closes full screen instead of leaving Near me.

/** false: never touch the browser history (Back then leaves the page, as before this feature). Nothing else depends on it. */
export const PUSH_FULLSCREEN_ENTRY = true;
/** A history.back() whose popstate never arrives is forgotten after this long. */
export const SETTLE_MS = 600;
/** The toggle ignores taps this long after the frame mounts: the page-entrance animation (.rise, 450 ms) leaves a transform on an ancestor, which would trap position:fixed. */
export const ARM_MS = 500;

export interface FsState {
  readonly full: boolean;
  /** The browser's current history entry is the one we pushed (kept here, never in history.state: Next rewrites that). */
  readonly ownEntry: boolean;
  /** We called history.back() and its popstate has not arrived yet. */
  readonly awaitingPop: boolean;
}
export type FsEvent = "enter" | "leave" | "pop" | "settled" | "pushFailed";
export type FsEffect = "push" | "back";
export interface FsResult {
  readonly state: FsState;
  readonly effects: readonly FsEffect[];
}
export const FS_IDLE: FsState = { full: false, ownEntry: false, awaitingPop: false };

export function fsStep(s: FsState, e: FsEvent, canPush: boolean = PUSH_FULLSCREEN_ENTRY): FsResult {
  const same: FsResult = { state: s, effects: [] };
  switch (e) {
    case "enter": // ignored while full, or while our own history.back() is still in flight (no double push)
      if (s.full || s.awaitingPop) return same;
      return canPush
        ? { state: { full: true, ownEntry: true, awaitingPop: false }, effects: ["push"] }
        : { state: { full: true, ownEntry: false, awaitingPop: false }, effects: [] };
    case "leave": // button, Escape, map failed: the UI closes at once; our entry is popped behind it
      if (!s.full) return same;
      return s.ownEntry
        ? { state: { full: false, ownEntry: false, awaitingPop: true }, effects: ["back"] }
        : { state: { ...s, full: false }, effects: [] };
    case "pop": // popstate
      if (s.awaitingPop) return { state: { ...s, awaitingPop: false }, effects: [] }; // the pop WE asked for
      if (s.full && s.ownEntry) return { state: FS_IDLE, effects: [] }; //               the person pressed Back / swiped: our entry is already gone
      return same; //                                                                    Forward onto a dead entry, or an ordinary Back away from the page
    case "settled":
      return s.awaitingPop ? { state: { ...s, awaitingPop: false }, effects: [] } : same;
    case "pushFailed": // pushState threw (sandboxed context)
      return s.ownEntry ? { state: { ...s, ownEntry: false }, effects: [] } : same;
  }
}

// Where the page was scrolled to is bookkeeping about the VISIT, not about the history entry, so it must not hang off the "push" effect:
// with PUSH_FULLSCREEN_ENTRY off (or a failed push) no effect runs, yet leaving still has to land the person back where they were.

/** True when this step took the map from the page into full screen (by whatever route): the moment the page's scroll position is recorded. */
export function enteredFull(before: FsState, after: FsState): boolean {
  return !before.full && after.full;
}

/**
 * Whether a popstate should put the page's scroll position back: the pop of our own history.back() (the button or Escape), or a Back that
 * closed full screen by popping our entry. A Back that merely leaves the page (full screen without an entry of our own) must not scroll it.
 */
export function popRestoresScroll(before: FsState): boolean {
  return before.awaitingPop || (before.full && before.ownEntry);
}
