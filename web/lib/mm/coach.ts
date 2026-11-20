// Pip's tips on the real screens (founder 2026-11-18: "i want a guided tour of what everything does"): the first time each tab opens after the welcome
// screens, Pip dims the page, lights up one real button at a time and says what it does (app/app/_components/CoachMarks.tsx). This file is the plain logic:
// which tab a page is, whether its tips are still due, and what is kept on the phone (only which tabs' tips have been seen, and whether the tour was walked; nothing is sent anywhere).

export type CoachScreen = "home" | "eatOut" | "groceries" | "recipes";

/**
 * `armed`: the tips are switched on (the welcome screens' end, or Settings › "Show me the buttons"); `seen`: the tabs whose tips have been shown;
 * `afterTour`: set only when the welcome screens ended after Pip's walk round the tabs, so a tip the walk already taught (the tab bar) isn't said twice
 * (onboarding meeting, 19 November: "teach each button once"). Settings' COACH_ARMED leaves it out, so every tip shows.
 */
export interface CoachState {
  armed: boolean;
  seen: CoachScreen[];
  afterTour?: boolean;
}

export const COACH_SCREENS: readonly CoachScreen[] = ["home", "eatOut", "groceries", "recipes"];

/** Nothing switched on: what a phone starts with, and what someone who was set up before the tips existed keeps (they can start them from Settings). */
export const NO_COACH: CoachState = { armed: false, seen: [] };

/** Every tab's tips due: written when the welcome screens end, and by Settings › "Show me the buttons". */
export const COACH_ARMED: CoachState = { armed: true, seen: [] };

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

/**
 * The end of the welcome screens switches the tips on, unless this phone has already been through all of them or stopped them ("Stop the tips" means stop:
 * setting up again doesn't bring them back; Settings › "Show me the buttons on each screen" always does, with COACH_ARMED). `walkedTour`: the person walked
 * the tour to its end (not "Skip tour"), so the tips the tour covered are left out. The end of the questions and "Look around first" both pass it (false after
 * "Skip tour"); only the replay's Done passes no options, and then nothing is left out.
 */
export function coachAfterWelcome(state: CoachState, opts?: { walkedTour?: boolean }): CoachState {
  if (!state.armed && COACH_SCREENS.every((s) => state.seen.includes(s))) return state;
  return opts?.walkedTour === true ? { ...COACH_ARMED, afterTour: true } : COACH_ARMED;
}

/** True when this tab's tips should show now. */
export function coachDue(state: CoachState, screen: CoachScreen | null): screen is CoachScreen {
  return !!screen && state.armed && !state.seen.includes(screen);
}

/** After a tab's tips: that tab is seen; once every tab is, the tips switch themselves off. */
export function coachSeen(state: CoachState, screen: CoachScreen): CoachState {
  const seen = state.seen.includes(screen) ? state.seen : [...state.seen, screen];
  return { ...state, armed: state.armed && COACH_SCREENS.some((s) => !seen.includes(s)), seen };
}

export function sanitizeCoach(raw: unknown): CoachState {
  if (!raw || typeof raw !== "object") return NO_COACH;
  const r = raw as { armed?: unknown; seen?: unknown; afterTour?: unknown };
  const seen = Array.isArray(r.seen) ? COACH_SCREENS.filter((s) => (r.seen as unknown[]).includes(s)) : [];
  return r.afterTour === true ? { armed: r.armed === true, seen, afterTour: true } : { armed: r.armed === true, seen };
}
