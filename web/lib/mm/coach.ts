// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"): Pip dims the page, lights up one real button at a time
// and says what it does (app/app/_components/CoachMarks.tsx), the first time each tab opens once they are switched on. This file is the plain logic: which tab a
// page is, which tab's tips are still due, where the tip's card may sit, and what is kept on the phone (only whether the tips are on and which tabs have shown
// them; nothing is sent anywhere).
//
// They never start by themselves (founder 2026-11-26, after "the onboarding of like once they like this button does this, that button does that, like it's very
// tacky and also very confusing and also like too much": "you can turn whatever you think best regarding the tips that pop up"): not after the welcome screens,
// and not on anyone's first visit to a tab. Only Settings › Help › "Show me the buttons on each screen" switches them on (COACH_ARMED: every tab's tips, Home's
// all on one visit), and "Stop the tips" ends them. Tips the welcome screens switched on before 26 November (stored with `afterShowcase`) are read as off, so
// someone who already has the app and hasn't seen every tab yet gets no more of them. The card keeps clear of Home's numbers and the Start here card wherever
// the screen has room for it whole (COACH_KEEP_CLEAR, placeTip); on a small phone it may cover them, but never shrinks below its own Next and "Stop the tips"
// (TIP_CARD_MIN; the 30-person audit, 20 November 2026).

export type CoachScreen = "home" | "eatOut" | "groceries" | "recipes";
/** One showing of tips: a tab's own. */
export type CoachRound = CoachScreen;

/** `armed`: the tips are switched on (Settings › "Show me the buttons on each screen"); `seen`: the tabs whose tips have been shown. */
export interface CoachState {
  armed: boolean;
  seen: CoachRound[];
}

export const COACH_SCREENS: readonly CoachScreen[] = ["home", "eatOut", "groceries", "recipes"];
/** Every round there can be, in the order they come. */
export const COACH_ROUNDS: readonly CoachRound[] = COACH_SCREENS;

/** Nothing switched on: what every phone starts with and keeps until Settings switches the tips on. */
export const NO_COACH: CoachState = { armed: false, seen: [] };

/** Every tab's tips due, all of Home's on one visit: Settings › "Show me the buttons on each screen". */
export const COACH_ARMED: CoachState = { armed: true, seen: [] };

/** "Stop the tips": every round counts as seen, so none shows again until Settings starts them. */
export const COACH_STOPPED: CoachState = { armed: false, seen: [...COACH_ROUNDS] };

const PAGES: ReadonlyArray<readonly [string, CoachScreen]> = [
  ["/app", "home"],
  ["/app/eat-out", "eatOut"],
  ["/app/groceries", "groceries"],
  ["/app/recipes", "recipes"],
];

/** The tab a page is the first page of (only a tab's own first page has tips; "/app/" and "/app/index.html" from the iPhone app's files count as Home). */
export function coachScreenFor(pathname: string): CoachScreen | null {
  const p = pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
  return PAGES.find(([path]) => path === p)?.[1] ?? null;
}

/** The tips due on this tab now, or null: only while they are switched on, and once per tab. */
export function coachRoundFor(state: CoachState, screen: CoachScreen | null): CoachRound | null {
  if (!screen || !state.armed) return null;
  return state.seen.includes(screen) ? null : screen;
}

/** True when this tab has tips still to show. */
export function coachDue(state: CoachState, screen: CoachScreen | null): screen is CoachScreen {
  return coachRoundFor(state, screen) !== null;
}

/** After a tab's tips: it is seen; once every tab's are, the tips switch themselves off. */
export function coachSeen(state: CoachState, round: CoachRound): CoachState {
  const seen = state.seen.includes(round) ? state.seen : [...state.seen, round];
  return { armed: state.armed && COACH_ROUNDS.some((r) => !seen.includes(r)), seen };
}

/**
 * The tips as stored, checked. Tips the welcome screens switched on (stored with `afterShowcase`, before 26 November 2026) are off: they never start by
 * themselves now. Anything else (an old "homeLater" or afterTour among it) is dropped.
 */
export function sanitizeCoach(raw: unknown): CoachState {
  if (!raw || typeof raw !== "object") return NO_COACH;
  const r = raw as { armed?: unknown; seen?: unknown; afterShowcase?: unknown };
  const seen = Array.isArray(r.seen) ? COACH_ROUNDS.filter((s) => (r.seen as unknown[]).includes(s)) : [];
  return { armed: r.armed === true && r.afterShowcase !== true, seen };
}

/** What a tip's card must never cover on each tab (the meeting: "the bubble never covers the Start here card or the numbers card"). The lit control itself, and
 *  anything inside it or round it, is never among them (CoachMarks.tsx keepClear): the card goes next to the lit control, not away from it. */
export const COACH_KEEP_CLEAR: Readonly<Partial<Record<CoachScreen, readonly string[]>>> = {
  home: ['[data-coach="home-numbers"]', '[data-coach="home-start"]'],
};

/**
 * The tip's card is never drawn shorter than this (px): its title, a line of its tip (which scrolls inside the card) and the Next and Stop row, whole. Below
 * it the buttons were cut off on small phones (a modal with no way out: the 30-person audit, 20 November 2026).
 */
export const TIP_CARD_MIN = 168;

/** A stretch of the screen, top to bottom, in px from the top of the viewport. */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * Where the tip's card goes (px from the top of the screen), or how far to scroll the page first. `hole`: the lit control as drawn (with its padding);
 * `clear`: what the card should not cover; `card`: the card's full height; `fixed`: the control stays put when the page scrolls (the tab bar); `min`: the
 * shortest the card may be (TIP_CARD_MIN); `edgeTop` and `edgeBottom` (default `edge`): how far the card keeps from the top and the foot of the screen, at
 * least 16 px and clear of the status bar and the home indicator (CoachMarks.tsx measures the safe-area insets: Quinn, the 30-person meeting, 21 November 2026).
 * - Free stretches are the screen minus the hole and the keep-clear parts (each with `gap` round it). The card goes in the one right under the hole, else
 *   the one right over it, else (not for a fixed control, which first tries the scroll below) the nearest other that holds it whole.
 * - None holds it and something is to be kept clear: scroll (once; `scrolled` says it was done) so there is room: under the hole and what it keeps clear
 *   below it, or, for a fixed control, over it. The lit control always stays wholly on the screen: the page never scrolls it past the top edge.
 * - Still none: the keep-clear parts give way (the card may cover them; never the lit control while there is room beside it), and the card goes on the
 *   side of the hole with more room at its full height, kept on the screen. Its height is never less than `min`, so Next and "Stop the tips" always show.
 */
export function placeTip({ hole, clear, card, vh, fixed = false, scrolled = false, edge = 16, edgeTop = edge, edgeBottom = edge, gap = 12, min = TIP_CARD_MIN }: {
  hole: Span;
  clear: readonly Span[];
  card: number;
  vh: number;
  fixed?: boolean;
  scrolled?: boolean;
  edge?: number;
  edgeTop?: number;
  edgeBottom?: number;
  gap?: number;
  min?: number;
}): { top: number; maxHeight: number; below: boolean } | { scroll: number } {
  const lo = edgeTop;
  const hi = vh - edgeBottom;
  const want = Math.max(card, min); // the card's whole height, never less than its minimum
  const taken = [hole, ...clear].map((s) => ({ top: s.top - gap, bottom: s.bottom + gap })).sort((a, b) => a.top - b.top);
  const free: Span[] = [];
  let at = lo;
  for (const s of taken) {
    if (s.top > at) free.push({ top: at, bottom: Math.min(s.top, hi) });
    at = Math.max(at, s.bottom);
    if (at >= hi) break;
  }
  if (at < hi) free.push({ top: at, bottom: hi });
  const room = (s: Span) => s.bottom - s.top;
  const under = free.find((s) => Math.abs(s.top - (hole.bottom + gap)) < 0.5);
  const over = free.find((s) => Math.abs(s.bottom - (hole.top - gap)) < 0.5);
  const below = (s: Span) => s.top >= hole.bottom;
  const put = (s: Span) => (below(s) ? { top: s.top, maxHeight: room(s), below: true } : { top: Math.max(s.top, s.bottom - want), maxHeight: room(s), below: false });
  if (under && room(under) >= want) return put(under);
  if (over && room(over) >= want) return put(over);
  const fits = free.filter((s) => room(s) >= want).sort((a, b) => Math.min(Math.abs(a.top - hole.bottom), Math.abs(a.bottom - hole.top)) - Math.min(Math.abs(b.top - hole.bottom), Math.abs(b.bottom - hole.top)));
  // a fixed control (the tab bar) keeps its card next to it: the page scrolls first rather than the card sitting far off at the top
  const scrollFirst = fixed && clear.length > 0 && !scrolled;
  if (fits.length > 0 && !scrollFirst) return put(fits[0]!);
  if (clear.length > 0 && !scrolled) {
    if (fixed) {
      // room over the fixed control: scroll down until whatever is kept clear sits above the card
      const need = hole.top - gap - want - gap;
      const blocking = clear.filter((c) => c.bottom > need && c.top < hole.top);
      const scroll = Math.max(0, ...blocking.map((c) => c.bottom - need));
      if (scroll > 0) return { scroll: Math.ceil(scroll) };
    } else {
      // room under the control and what it keeps clear right below it; never so far that the control's top goes off the screen
      const block = Math.max(hole.bottom, ...clear.filter((c) => c.top < hole.bottom + gap + want + gap && c.bottom > hole.top).map((c) => c.bottom));
      const scroll = Math.min(Math.ceil(block + gap + want + edgeBottom - vh), Math.floor(hole.top - edgeTop));
      if (scroll > 0) return { scroll };
    }
  }
  if (fits.length > 0) return put(fits[0]!);
  // Nothing holds the card whole: what is kept clear gives way. The side of the lit control with more room, the card at its full height (or the whole screen
  // if it is taller), kept on the screen; it covers the lit control only when the control leaves no room for it at all.
  const tall = Math.min(want, hi - lo);
  const down = hi - (hole.bottom + gap);
  const up = hole.top - gap - lo;
  if (down >= up) {
    const top = Math.max(lo, Math.min(hole.bottom + gap, hi - tall));
    return { top, maxHeight: Math.max(hi - top, min), below: true };
  }
  const end = Math.min(hi, Math.max(lo + tall, hole.top - gap)); // the card's bottom edge
  const top = Math.max(lo, end - want);
  return { top, maxHeight: Math.max(end - top, min), below: false };
}
