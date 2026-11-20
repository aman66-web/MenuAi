import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPlainLaunch, OWN_DATA_KEYS, SIGNED_IN_KEYS, storedData, TOUR_GATE_SCRIPT, TOUR_VERSION, tourDue, tourGateScript, trialOfferDue } from "../lib/mm/tour";
import { progressNote, resumeAt, startRun, stepCounter, WELCOME_PROGRESS_KEY, WELCOME_STEPS, type WelcomeStepId } from "../lib/mm/welcomeSteps";
import { afterSignInGate } from "../lib/mm/premiumFeatures";

// The welcome screens' gate (lib/mm/tour.ts): where a first plain launch goes, the iPhone app's trial offer after it, and (the onboarding redesign meeting of
// 20 November 2026, build list 7) TOUR_VERSION 2, the tab tour gone, the welcome screens writing nothing of the person's own, and someone who quits at any step
// coming back through the cover.

type Stored = Record<string, unknown>;
interface FakeStorage { getItem: (key: string) => string | null }

/** A localStorage holding each value in the app's { v, data } envelope; `raw` keys hold text as given; `throws` is storage that refuses (a private window). */
function storage(items: Stored = {}, opts: { raw?: Record<string, string>; throws?: boolean } = {}): FakeStorage {
  return {
    getItem(key: string) {
      if (opts.throws) throw new Error("storage is blocked");
      if (opts.raw && key in opts.raw) return opts.raw[key]!;
      return key in items ? JSON.stringify({ v: 1, data: items[key] }) : null;
    },
  };
}

/** Runs the layout's inline script against a pretend page; returns where it sent the page (none = stayed). `script`: this build's, or one built for a build where everyone signs in. */
function runGate(address: string, store: FakeStorage, script = TOUR_GATE_SCRIPT): string[] {
  const url = new URL(address, "https://numbite.com");
  const replaced: string[] = [];
  const location = { pathname: url.pathname, search: url.search, hash: url.hash, replace: (to: string) => replaced.push(to) };
  new Function("location", "localStorage", script)(location, store);
  return replaced;
}

/** What isPlainLaunch and tourDue say for the same page (anything that throws, like text that isn't JSON, means no tour). */
function expected(address: string, store: FakeStorage, signInRequired = false): boolean {
  const url = new URL(address, "https://numbite.com");
  try {
    return isPlainLaunch(url.pathname, url.search, url.hash) && tourDue(storedData((key) => store.getItem(key)), signInRequired);
  } catch {
    return false;
  }
}

const settings = (patch: Stored) => ({ goal: "maintain", dailyCalories: 2000, preferences: {}, ...patch });

describe("the gate on a first plain launch", () => {
  const redirects: Array<[string, string, FakeStorage]> = [
    ["/app with nothing stored", "/app", storage()],
    ["/app/ with nothing stored", "/app/", storage()],
    ["the exported /app/index.html", "/app/index.html", storage()],
    ["settings stored, neither flag set", "/app", storage({ "mm.v1.settings": settings({ hasCompletedOnboarding: false, dismissedTargetsCard: false, textSize: "xlarge" }) })],
    ["an older tour version", "/app", storage({ "mm.v1.tour": 0 })],
    ["own stores that are empty", "/app", storage(Object.fromEntries(OWN_DATA_KEYS.map((k) => [k, []])))],
  ];
  const stays: Array<[string, string, FakeStorage]> = [
    ["a creator's ?ref= link", "/app?ref=x", storage()],
    ["a # on the start page", "/app#x", storage()],
    ["a restaurant", "/app/chain?id=kfc", storage()],
    ["a dish", "/app/item?c=x&i=y", storage()],
    ["a shared list", "/app/groceries/list/shared#1abcdef", storage()],
    ["a friend's invite", "/app/community/friends#ABCDEFGH", storage()],
    ["the welcome screens themselves", "/app/welcome", storage()],
    ["the offline page", "/app/offline", storage()],
    ["someone set up", "/app", storage({ "mm.v1.settings": settings({ hasCompletedOnboarding: true }) })],
    ["someone who said Not now", "/app", storage({ "mm.v1.settings": settings({ dismissedTargetsCard: true }) })],
    ["the tour seen", "/app", storage({ "mm.v1.tour": TOUR_VERSION })],
    ["a non-empty log", "/app", storage({ "mm.v1.log": [{ id: "l1" }] })],
    ["a non-empty shopping list", "/app", storage({ "mm.v1.shopping": [{ name: "Milk" }] })],
    ["water added", "/app", storage({ "mm.v1.water": [{ id: "w1", ml: 250 }] })],
    ["settings that aren't JSON", "/app", storage({}, { raw: { "mm.v1.settings": "{not json" } })],
    ["storage that throws", "/app", storage({}, { throws: true })],
  ];

  it.each(redirects)("sends %s to the welcome screens", (_, address, store) => {
    expect(runGate(address, store)).toEqual(["/app/welcome"]);
    expect(expected(address, store)).toBe(true);
  });

  it.each(stays)("leaves %s where it is", (_, address, store) => {
    expect(runGate(address, store)).toEqual([]);
    expect(expected(address, store)).toBe(false);
  });

  it("counts anything in any of the person's own stores", () => {
    for (const key of OWN_DATA_KEYS) {
      const store = storage({ [key]: [{ id: "x" }] });
      expect(runGate("/app", store), key).toEqual([]);
      expect(expected("/app", store), key).toBe(false);
    }
  });

  it("is built from the same constants, never from a function's source", () => {
    for (const script of [TOUR_GATE_SCRIPT, tourGateScript(true), tourGateScript(false)]) {
      expect(script).toContain(JSON.stringify(OWN_DATA_KEYS));
      expect(script).toContain(`>=${TOUR_VERSION}`);
      expect(script.startsWith("try{")).toBe(true);
      expect(script.endsWith("catch(e){}")).toBe(true);
    }
    expect(tourGateScript(true)).toContain(JSON.stringify(SIGNED_IN_KEYS));
  });
});

// The onboarding meeting of 19 November (question 1, approved that day): where everyone signs in, sign-in comes after "Your daily targets", so the tour can be seen
// by someone who then leaves during the questions or at the sign-in screen. Their next plain start goes back to the welcome screens, not to a bare sign-in screen.
describe("the gate where everyone signs in", () => {
  const REQUIRED = tourGateScript(true);
  const seen = { "mm.v1.tour": TOUR_VERSION };
  const back: Array<[string, FakeStorage]> = [
    ["the tour seen, setup not finished, nobody signed in", storage(seen)],
    ["the goal and targets typed, then left at the sign-in screen", storage({ ...seen, "mm.v1.settings": settings({ hasSetTargets: true, hasCompletedOnboarding: false }) })],
    ["signed out (the account's record emptied)", storage({ ...seen, "mm.v1.account": null, "mm.v1.session": null })],
    ["the switches file read, sign-in still required", storage({ ...seen, "mm.v1.appSwitches": { signInOptional: false } })],
    ["nothing stored at all (a first launch, as before)", storage()],
  ];
  const stay: Array<[string, FakeStorage]> = [
    ["signed in here (the account's record)", storage({ ...seen, "mm.v1.account": { id: "u1", email: "a@example.com" } })],
    ["the iPhone app holds a session", storage({ ...seen, "mm.v1.session": { access: "x", refresh: "y" } })],
    ["sign-in made optional by the switches file", storage({ ...seen, "mm.v1.appSwitches": { signInOptional: true } })],
    ["set up", storage({ ...seen, "mm.v1.settings": settings({ hasCompletedOnboarding: true }) })],
    ["said Not now", storage({ ...seen, "mm.v1.settings": settings({ dismissedTargetsCard: true }) })],
    ["something of their own stored", storage({ ...seen, "mm.v1.saved": [{ id: "o1" }] })],
    ["a link (a shared list)", storage(seen)],
  ];
  const address = (label: string) => (label.startsWith("a link") ? "/app/groceries/list/shared#1abcdef" : "/app");

  it.each(back)("sends %s to the welcome screens", (label, store) => {
    expect(runGate(address(label), store, REQUIRED)).toEqual(["/app/welcome"]);
    expect(expected(address(label), store, true)).toBe(true);
  });
  it.each(stay)("leaves %s where it is", (label, store) => {
    expect(runGate(address(label), store, REQUIRED)).toEqual([]);
    expect(expected(address(label), store, true)).toBe(false);
  });
  it("changes nothing where sign-in is optional: the tour seen stays seen", () => {
    expect(runGate("/app", storage(seen), tourGateScript(false))).toEqual([]);
    expect(expected("/app", storage(seen), false)).toBe(false);
  });
});

// The onboarding meeting of 19 November (question 5, approved that day): never straight after setup; the first Premium feature tapped shows the paywall's own
// free-trial banner, so the sheet follows no paywall; otherwise once, on a later day than the first.
describe("the iPhone app's free-trial offer", () => {
  const base = { native: true, onboarded: true, tourSeen: false, shown: false, paid: false, pathname: "/app", firstDay: "2026-11-19", today: "2026-11-20", paywallSeen: false, setUpThisVisit: false };
  it.each([
    ["on Home, on a later day than the first", base, true],
    ["on the first day the app was used (straight after setup)", { ...base, today: "2026-11-19" }, false],
    ["in the visit where setup just finished, even on a later day", { ...base, setUpThisVisit: true }, false],
    // every 1.0 user updating to 1.1 meets the sign-in screen once: that visit is held too (AppShell, lib/mm/premiumFeatures.ts afterSignInGate)
    ["in a visit that came through the sign-in screen, even on a later day", { ...base, setUpThisVisit: afterSignInGate(afterSignInGate(false, "signIn").sawSignIn, "open").holdTrialOffer }, false],
    ["a signed-in launch (a moment of wait, then the app) is not held", { ...base, setUpThisVisit: afterSignInGate(afterSignInGate(false, "wait").sawSignIn, "open").holdTrialOffer }, true],
    ["before any day was counted", { ...base, firstDay: null }, false],
    ["after a Premium feature's paywall (it already offered the trial)", { ...base, paywallSeen: true }, false],
    ["after the welcome screens were finished on this phone (tourSeen), a later day", { ...base, onboarded: false, tourSeen: true }, true],
    ["neither set up nor finished the welcome screens", { ...base, onboarded: false, tourSeen: false }, false],
    ["shown already", { ...base, shown: true }, false],
    ["paid access on", { ...base, paid: true }, false],
    ["on the website", { ...base, native: false }, false],
    ["on Home with a slash", { ...base, pathname: "/app/" }, true],
    ["on the welcome screens", { ...base, pathname: "/app/welcome" }, false],
    ["on Eat out", { ...base, pathname: "/app/eat-out" }, false],
    ["on a shared list", { ...base, pathname: "/app/groceries/list/shared" }, false],
  ])("%s", (_, input, want) => {
    expect(trialOfferDue(input)).toBe(want);
  });
});

describe("the redesign of 20 November (TOUR_VERSION 2)", () => {
  it("shows the new welcome screens once to someone who only saw the old tour and has neither set up nor stored anything", () => {
    expect(TOUR_VERSION).toBe(2);
    const oldTour = storage({ "mm.v1.tour": 1 });
    expect(runGate("/app", oldTour)).toEqual(["/app/welcome"]);
    expect(runGate("/app", oldTour, tourGateScript(true))).toEqual(["/app/welcome"]);
    // signed in (an earlier "Look around first" person) too: they get the signed-in run of 10
    expect(runGate("/app", storage({ "mm.v1.tour": 1, "mm.v1.account": { id: "u1" } }), tourGateScript(true))).toEqual(["/app/welcome"]);
  });

  it("leaves everyone who finished onboarding on 1.0 or 1.1 untouched, and anyone with something of their own", () => {
    expect(runGate("/app", storage({ "mm.v1.tour": 1, "mm.v1.settings": settings({ hasCompletedOnboarding: true }) }))).toEqual([]);
    expect(runGate("/app", storage({ "mm.v1.tour": 1, "mm.v1.favorites": [{ chainId: "kfc" }] }))).toEqual([]);
    expect(runGate("/app", storage({ "mm.v1.tour": 1, "mm.v1.settings": settings({ dismissedTargetsCard: true }) }))).toEqual([]);
  });

  it("is still checked against tourDue: the layout's script and the function agree", () => {
    for (const store of [storage({ "mm.v1.tour": 1 }), storage({ "mm.v1.tour": 2 }), storage({ "mm.v1.tour": 2, "mm.v1.account": { id: "u1" } })]) {
      for (const required of [false, true]) {
        expect(runGate("/app", store, tourGateScript(required)).length === 1).toBe(expected("/app", store, required));
      }
    }
  });
});

describe("someone who quits at any step comes back through the cover", () => {
  /** What is on the phone after leaving at `step`: the settings typed so far (saved on each Continue, never the body answers) and the progress note. */
  const leftAt = (step: WelcomeStepId, extra: Record<string, unknown> = {}) => {
    const i = WELCOME_STEPS.indexOf(step);
    const typed = {
      ...(i > 0 ? { goal: "lose" } : {}),
      ...(i > 1 ? { preferences: { vegetarianOnly: true } } : {}),
      ...(i > 3 ? { shops: ["sainsburys"] } : {}),
      ...(i > 8 ? { dailyCalories: 1700, hasSetTargets: true } : {}),
    };
    return storage({ "mm.v1.settings": settings({ ...typed, hasCompletedOnboarding: false }), [WELCOME_PROGRESS_KEY]: progressNote({ step }, "2026-11-20"), ...extra });
  };

  it.each(WELCOME_STEPS.map((s) => [s]))("left at %s: a plain launch opens the cover, which carries on from the right step", (step) => {
    for (const [script, signedIn] of [[TOUR_GATE_SCRIPT, false], [tourGateScript(true), false], [tourGateScript(true), true], [tourGateScript(false), false]] as const) {
      const store = leftAt(step, signedIn ? { "mm.v1.account": { id: "u1" } } : {});
      expect(runGate("/app", store, script), `${step}, signed in: ${signedIn}`).toEqual(["/app/welcome"]);
    }
    const note = storedData((k) => leftAt(step).getItem(k))(WELCOME_PROGRESS_KEY);
    const at = resumeAt(startRun(false), note as never);
    if (step === "goal") expect(at).toBeNull();
    else expect(stepCounter(startRun(false), at!.step)!.step).toBe(["about", "size", "active"].includes(step) ? 6 : WELCOME_STEPS.indexOf(step) + 1);
  });

  it("but a link still opens at once", () => {
    expect(runGate("/app/chain?id=kfc", leftAt("eatOut"), tourGateScript(true))).toEqual([]);
  });
});

describe("the welcome screens write nothing of the person's own before an account exists", () => {
  const ownStores = ["logStore", "savedStore", "favoritesStore", "shoppingStore", "savedRecipesStore", "myRecipesStore", "waterStore", "remindersStore", "addLogEntry", "deleteLogEntry", "addToList"];
  const welcomeFiles = (dir: URL): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? welcomeFiles(new URL(`${e.name}/`, dir)) : /\.(tsx?|mjs)$/.test(e.name) ? [new URL(e.name, dir).pathname] : []));

  it("no welcome screen touches the log, favourites, shopping list, saved orders, recipes, water or reminders", () => {
    const files = welcomeFiles(new URL("../app/app/welcome/", import.meta.url));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const name of [...ownStores, ...OWN_DATA_KEYS]) expect(source.includes(name), `${file} uses ${name}`).toBe(false);
    }
  });

  it("so OWN_DATA_KEYS stay empty on a fresh phone after onboarding: only the settings, the welcome screens' own marks and the progress note are written", () => {
    const written = ["mm.v1.settings", "mm.v1.tour", "mm.v1.coach", "mm.v1.trialOffer", WELCOME_PROGRESS_KEY];
    for (const key of written) expect(OWN_DATA_KEYS, key).not.toContain(key);
    // and once they are finished, the gate leaves the phone alone
    const finished = storage({ "mm.v1.settings": settings({ hasCompletedOnboarding: true }), "mm.v1.tour": TOUR_VERSION, "mm.v1.coach": {} });
    expect(runGate("/app", finished, tourGateScript(true))).toEqual([]);
  });
});
