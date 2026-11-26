import { beforeEach, describe, expect, it } from "vitest";
import { finishWelcome, type WelcomeEnding } from "../app/app/welcome/finish";
import { coachRoundFor, NO_COACH } from "../lib/mm/coach";
import { arrivalDue, NO_HOME_PAGES } from "../lib/mm/homePages";
import { coachStore, homePagesStore, settingsStore, tourStore } from "../lib/mm/stores";
import { OWN_DATA_KEYS, TOUR_VERSION, trialOfferDue } from "../lib/mm/tour";
import { DEFAULT_SETTINGS } from "../lib/mm/user-data";
import { progressNote, welcomeProgressStore } from "../lib/mm/welcomeSteps";

// The welcome screens' one finish (the onboarding redesign meeting of 20 November 2026, build list 8): every ending leaves trialOfferDue's inputs right (set up,
// the welcome screens finished on this phone, the offer held for this visit), Home its toast and, for a first setup only, the Start here card with the two hints,
// and forgets the progress note.

const NOW = new Date("2026-11-21T09:00:00Z");
const DISH = { chainId: "greggs", itemId: "greggs-chicken-bake" };

function fresh() {
  settingsStore.set({ ...DEFAULT_SETTINGS });
  tourStore.set(0);
  coachStore.set(NO_COACH);
  homePagesStore.set(NO_HOME_PAGES);
  welcomeProgressStore.set(progressNote({ step: "save", firstRecipeId: "chicken-tikka-traybake", firstDish: DISH }, "2026-11-21"));
}

function end(ending: WelcomeEnding) {
  let held = false;
  finishWelcome(ending, { firstRecipeId: "chicken-tikka-traybake", firstDish: DISH }, { holdTrialOffer: () => { held = true; }, now: NOW });
  return held;
}

/** trialOfferDue for the iPhone app on Home, nothing shown or bought, first used here the day before. */
const offerDue = (setUpThisVisit: boolean) =>
  trialOfferDue({
    native: true,
    onboarded: settingsStore.get().hasCompletedOnboarding,
    tourSeen: tourStore.get() >= TOUR_VERSION,
    shown: false,
    paid: false,
    pathname: "/app",
    firstDay: "2026-11-20",
    today: "2026-11-21",
    paywallSeen: false,
    setUpThisVisit,
  });

describe("finishWelcome", () => {
  beforeEach(fresh);

  it.each(["signedIn", "signedInBack", "returning", "notNow", "saved"] as const)("%s: set up, the screens finished, the offer held this visit only", (ending) => {
    expect(offerDue(false), "before: not set up, screens not finished").toBe(false);
    const held = end(ending);
    expect(held).toBe(true);
    expect(settingsStore.get().hasCompletedOnboarding).toBe(true);
    expect(tourStore.get()).toBe(TOUR_VERSION);
    // never straight after setup, but on a later visit (a new page load clears setUpThisVisit) the one-time offer can come
    expect(offerDue(true)).toBe(false);
    expect(offerDue(false)).toBe(true);
    expect(welcomeProgressStore.get()).toBeNull();
  });

  it.each(["signedIn", "signedInBack", "notNow"] as const)("%s: the Start here card with both hints, and no button tips (founder 2026-11-26: they never start by themselves)", (ending) => {
    end(ending);
    const note = arrivalDue(homePagesStore.get(), NOW);
    expect(note).toMatchObject({ card: true, firstRecipeId: "chicken-tikka-traybake", firstDish: DISH });
    expect(note?.toast).toBe(ending === "notNow" ? "notNow" : ending);
    const coach = coachStore.get();
    expect(coach).toEqual(NO_COACH);
    expect(coachRoundFor(coach, "home")).toBeNull();
  });

  it("a Settings rerun gets the toast only: no card, no hints, no tips", () => {
    end("saved");
    expect(arrivalDue(homePagesStore.get(), NOW)).toEqual({ at: NOW.toISOString(), toast: "saved", card: false });
    expect(coachStore.get()).toEqual(NO_COACH);
  });

  it("a returning account set up elsewhere gets 'Signed in. Your saved settings are back.' and no card or tips", () => {
    end("returning");
    expect(arrivalDue(homePagesStore.get(), NOW)).toEqual({ at: NOW.toISOString(), toast: "signedInBack", card: false });
    expect(coachStore.get()).toEqual(NO_COACH);
  });

  it("tips the person stopped stay stopped", () => {
    coachStore.set({ armed: false, seen: ["home", "eatOut", "groceries", "recipes"] });
    end("signedIn");
    expect(coachStore.get().armed).toBe(false);
  });

  it("the progress note and Home's note are local only: neither is one of the person's own stores", () => {
    expect(OWN_DATA_KEYS).not.toContain("mm.v1.homePages");
    expect(OWN_DATA_KEYS).not.toContain("mm.v1.welcomeProgress");
  });
});
