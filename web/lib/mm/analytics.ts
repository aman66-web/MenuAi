// SPEC §14: anonymous events, no location, no health values, no free text.
// Two parts:
//   * `analytics.track` (the SPEC's event list): an interface only. Events print to the console in development and go nowhere, ever, until the founder picks
//     what to do with them; nothing below sends them.
//   * `reportSetupScreen` (the onboarding meeting of 19 November 2026, question 10, approved by the founder that day): one anonymous count each time the
//     welcome screens reach a screen for the first time on this page load, sent to TelemetryDeck (CLAUDE.md rule 6: pre-approved) by a plain fetch, no SDK.
//     BUILT SWITCHED OFF: with NEXT_PUBLIC_TELEMETRY_APP_ID unset (lib/mm/config.ts TELEMETRY_ENABLED) it does nothing at all: no request, and no id is made
//     or stored. Switched on, each signal is exactly { appID, clientUser, type: "setupScreen", payload: { "Setup.screen": <the screen's name> } } (plus
//     isTestMode outside production builds): clientUser is a SHA-256 hash of a random number made on this device (mm.v1.installId, never synced, removed by
//     Settings › Clear data), so TelemetryDeck can tell one phone's counts from another's without anyone knowing whose they are. No account, email, answers,
//     settings, location, page address or referrer ever goes with it. While it is on, the cover, the sign-in screen and the privacy page say so.

import { TELEMETRY_APP_ID } from "./config";
import type { KeyValueStorage } from "./persist";

export type AnalyticsEvent =
  | { name: "onboardingCompleted"; goal: string }
  | { name: "onboardingSkipped"; step: number }
  | { name: "chainOpened"; chainId: string; source: "search" | "favorite" | "popular" | "saved" }
  | { name: "itemOpened"; chainId: string }
  | { name: "menuSorted"; kind: string }
  | { name: "menuFiltered"; kind: string }
  | { name: "bestForYouViewed"; chainId: string; mode: string }
  | { name: "bestForYouPickOpened"; rank: number }
  | { name: "builderOpened"; origin: "item" | "pick" | "saved" }
  | { name: "builderChanged"; kind: "add" | "remove" | "double" | "swap" | "modifier" }
  | { name: "orderSaved" }
  | { name: "mealLogged" }
  | { name: "shareCardCreated" }
  | { name: "paywallShown"; trigger: string }
  | { name: "paywallDismissed"; trigger: string }
  | { name: "numberReported"; chainId: string }
  | { name: "chainRequested" };

export interface Analytics {
  track(event: AnalyticsEvent): void;
}

export const consoleAnalytics: Analytics = {
  track(event) {
    if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event);
  },
};

export const analytics: Analytics = consoleAnalytics;

// ---- The setup screen counts (TelemetryDeck) ----

/** Every name a setup screen count can carry: a fixed list, so no typed word, answer or number can ever be sent. Anything else is dropped. */
export const SETUP_SCREENS = [
  "cover",
  "arrival",
  "textSize",
  "tour.home",
  "tour.eatOut",
  "tour.groceries",
  "tour.recipes",
  "tour.community",
  "fork",
  "goal",
  "avoid",
  "aboutYou",
  "yourSize",
  "activity",
  "targets",
  "signIn.setup",
  "signIn.look",
  "signIn.returning",
  "shops",
  "allSet",
] as const;
export type SetupScreen = (typeof SETUP_SCREENS)[number];
const KNOWN = new Set<string>(SETUP_SCREENS);

/** The one signal type sent. */
export const SETUP_SCREEN_SIGNAL = "setupScreen";
/** TelemetryDeck's ingest endpoint (v2: a JSON array of signals; https://telemetrydeck.com/docs/ingest/v2/). */
export const TELEMETRY_URL = "https://nom.telemetrydeck.com/v2/";
/** The random number made on this device for the counts: never synced (not in lib/mm/syncStores.ts), never sent as it is (only its hash), cleared by Clear data. */
export const INSTALL_ID_KEY = "mm.v1.installId";
const INSTALL_ID = /^[0-9a-f]{32}$/;

export interface SetupScreenReporterDeps {
  /** TelemetryDeck's app ID; empty = switched off (nothing is ever sent or stored). */
  appId: string;
  fetch: typeof fetch;
  storage: () => KeyValueStorage | null;
  /** 32 random hex characters. */
  randomId: () => string;
  /** Hex SHA-256 of the text, or null where the platform can't (then nothing is sent: the raw number never leaves the device). */
  sha256: (text: string) => Promise<string | null>;
  /** Marks the signals as test signals (outside production builds), so TelemetryDeck leaves them out of the real counts. */
  testMode: boolean;
}

export interface SetupScreenReporter {
  /** Counts `screen` once per page load. Never throws, never waits. */
  report(screen: SetupScreen): void;
  /** Settings › Clear data: the random number goes, and the next screens count again (as a new phone). */
  forget(): void;
}

/** This device's random number, made and kept the first time a count is sent (only ever called while switched on). */
function installId(deps: SetupScreenReporterDeps): string {
  let storage: KeyValueStorage | null = null;
  try {
    storage = deps.storage();
    const kept = storage?.getItem(INSTALL_ID_KEY) ?? null;
    if (kept && INSTALL_ID.test(kept)) return kept;
  } catch {
    /* storage blocked: a number for this page load only */
  }
  const made = deps.randomId();
  try {
    storage?.setItem(INSTALL_ID_KEY, made);
  } catch {
    /* storage full or blocked */
  }
  return made;
}

export function createSetupScreenReporter(deps: SetupScreenReporterDeps): SetupScreenReporter {
  const sent = new Set<SetupScreen>();
  const on = deps.appId.trim() !== "";
  return {
    report(screen) {
      if (!on || !KNOWN.has(screen) || sent.has(screen)) return;
      sent.add(screen);
      void (async () => {
        try {
          const clientUser = await deps.sha256(installId(deps));
          if (!clientUser) return;
          const signal = { appID: deps.appId.trim(), clientUser, type: SETUP_SCREEN_SIGNAL, payload: { "Setup.screen": screen }, ...(deps.testMode ? { isTestMode: true } : {}) };
          await deps.fetch(TELEMETRY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify([signal]),
            credentials: "omit",
            referrerPolicy: "no-referrer",
            cache: "no-store",
            keepalive: true,
          });
        } catch {
          /* offline or refused: that count is simply not made (no retry, nothing queued) */
        }
      })();
    },
    forget() {
      sent.clear();
      try {
        deps.storage()?.removeItem(INSTALL_ID_KEY);
      } catch {
        /* storage blocked */
      }
    },
  };
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function randomHex(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const setupScreens = createSetupScreenReporter({
  appId: TELEMETRY_APP_ID,
  fetch: (...args) => globalThis.fetch(...args),
  storage: browserStorage,
  randomId: randomHex,
  sha256: sha256Hex,
  testMode: process.env.NODE_ENV !== "production",
});

/** The welcome screens reached `screen` (app/app/welcome/page.tsx). Does nothing unless NEXT_PUBLIC_TELEMETRY_APP_ID was set when the app was built. */
export function reportSetupScreen(screen: SetupScreen): void {
  setupScreens.report(screen);
}

/** Settings › Clear data: removes this device's random number (mm.v1.installId). Safe whether the counts are on or off. */
export function forgetInstallId(): void {
  setupScreens.forget();
}
