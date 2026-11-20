import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeSwitches, NO_SWITCHES, sanitizeAppSwitches, signInRequiredWith } from "../lib/mm/appSwitches";
import { afterSignIn, sanitizeResume, SIGN_IN_HEADING, signInGate, TYPED_SETUP_KEYS, typedSetup, type GateState } from "../lib/mm/signInGate";
import { DEFAULT_SETTINGS, type UserSettings } from "../lib/mm/user-data";

const base: GateState = { required: true, hydrated: true, signedIn: false, checking: false, pathname: "/app" };

describe("the sign-in screen (founder 2026-11-17: everyone signs in)", () => {
  it("stands in front of every app page until someone is signed in", () => {
    for (const pathname of ["/app", "/app/", "/app/eat-out", "/app/chain", "/app/recipes/view", "/app/groceries/list/shared", "/app/community/friends", "/app/settings", "/app/today"]) {
      expect(signInGate({ ...base, pathname }), pathname).toBe("signIn");
      expect(signInGate({ ...base, pathname, signedIn: true }), pathname).toBe("open");
    }
  });
  it("leaves the welcome screens and the offline page open (they ask for the account themselves, after 'Your daily targets')", () => {
    for (const pathname of ["/app/welcome", "/app/welcome/", "/app/offline"]) expect(signInGate({ ...base, pathname })).toBe("open");
    expect(signInGate({ ...base, pathname: "/app/welcomeback" })).toBe("signIn");
  });
  it("waits, never flashing the sign-in screen, while the device's storage isn't read or the sign-in is being checked", () => {
    expect(signInGate({ ...base, hydrated: false })).toBe("wait");
    expect(signInGate({ ...base, checking: true })).toBe("wait");
    expect(signInGate({ ...base, checking: true, signedIn: true })).toBe("open");
  });
  it("does nothing when sign-in isn't required (the fallback switch)", () => {
    expect(signInGate({ ...base, required: false })).toBe("open");
    expect(signInGate({ ...base, required: false, hydrated: false })).toBe("open");
  });
});

// The onboarding meeting of 19 November (questions 1, 4 and 8, approved by the founder that day): the welcome screens ask for the account after "Your daily targets",
// the sign-in screen's heading follows how it was reached, and a switches file on numbite.com can make sign-in optional (never stricter).
describe("the welcome screens' sign-in step", () => {
  const typedNow = (over: Partial<UserSettings> = {}): UserSettings => ({ ...DEFAULT_SETTINGS, goal: "glp1", dailyCalories: 1500, dailyProtein: 110, hasSetTargets: true, glp1MealCap: 500, preferences: { ...DEFAULT_SETTINGS.preferences, veganOnly: true }, ...over });

  it("heads the screen by the way it was reached, and keeps 'Sign in or sign up' on a page of the app", () => {
    expect(SIGN_IN_HEADING).toEqual({
      setup: "Save your plan: make your free account",
      look: "Make your free account",
      returning: "Welcome back. Sign in",
      page: "Sign in or sign up",
    });
  });

  it("takes only the goal, the targets, the diet and the shops from what was typed (never anything about the body, which is never stored)", () => {
    const typed = typedSetup({ ...typedNow(), shops: ["sainsburys"], textSize: "large", hasCompletedOnboarding: false });
    expect(Object.keys(typed).sort()).toEqual([...TYPED_SETUP_KEYS].sort());
    expect(typed).toMatchObject({ goal: "glp1", dailyCalories: 1500, dailyProtein: 110, hasSetTargets: true, shops: ["sainsburys"] });
    expect("textSize" in typed || "hasCompletedOnboarding" in typed).toBe(false);
  });

  it("an account already set up goes straight to the app, whichever way in (its own settings win)", () => {
    for (const reason of ["setup", "look", "returning"] as const) {
      expect(afterSignIn({ reason, setUp: true, cleared: false, settingsSynced: true, current: typedNow(), typed: typedSetup(typedNow()) })).toEqual({ to: "app" });
    }
  });

  it("a new account carries on: to 'Where do you shop?' after the targets, to Home from 'Look around first', into the welcome screens from the cover's link", () => {
    const base = { setUp: false, cleared: false, settingsSynced: false, current: typedNow(), typed: typedSetup(typedNow()) };
    expect(afterSignIn({ ...base, reason: "setup" })).toEqual({ to: "shops", restore: {} });
    expect(afterSignIn({ ...base, reason: "look" })).toEqual({ to: "home" });
    expect(afterSignIn({ ...base, reason: "returning" })).toEqual({ to: "tour" });
  });

  it("puts back what was typed when signing in emptied this phone (a different person had signed in here before) and the account had no settings", () => {
    const typed = typedSetup({ ...typedNow(), shops: ["tesco"] });
    const emptied = { ...DEFAULT_SETTINGS };
    const after = afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: false, current: emptied, typed });
    expect(after.to).toBe("shops");
    const restore = after.to === "shops" ? after.restore : {};
    expect(restore).toMatchObject({ goal: "glp1", dailyCalories: 1500, dailyProtein: 110, hasSetTargets: true, glp1MealCap: 500, shops: ["tesco"] });
    expect(restore.preferences?.veganOnly).toBe(true);
    // only what differs
    const same = afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: false, current: typedNow(), typed: typedSetup(typedNow()) });
    expect(same).toEqual({ to: "shops", restore: {} });
  });

  it("never overwrites an account's own settings: nothing is put back when the account's settings arrived, or when this phone wasn't emptied", () => {
    const typed = typedSetup(typedNow());
    const accounts = { ...DEFAULT_SETTINGS, goal: "lose" as const, dailyCalories: 1800, hasSetTargets: true };
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: true, current: accounts, typed })).toEqual({ to: "shops", restore: {} });
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: false, settingsSynced: true, current: accounts, typed })).toEqual({ to: "shops", restore: {} });
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: false, current: accounts, typed: null })).toEqual({ to: "shops", restore: {} });
  });

  it("reads back the website's note of the sign-in step like anything stored, and nothing else", () => {
    const typed = typedSetup(typedNow());
    expect(sanitizeResume(JSON.parse(JSON.stringify({ reason: "setup", typed })))).toMatchObject({ reason: "setup", typed: { goal: "glp1", dailyCalories: 1500, hasSetTargets: true } });
    expect(sanitizeResume({ reason: "look", typed: null })).toEqual({ reason: "look", typed: null });
    expect(sanitizeResume({ reason: "returning" })).toEqual({ reason: "returning", typed: null });
    for (const bad of [null, "setup", 3, {}, { reason: "admin" }, { reason: ["setup"] }]) expect(sanitizeResume(bad)).toBeNull();
    // a damaged target is tidied like a stored one (sanitizeSettings), never passed on as it is
    expect(sanitizeResume({ reason: "setup", typed: { dailyCalories: "lots", goal: "nonsense", dailyProtein: -4 } })?.typed).toMatchObject({ goal: DEFAULT_SETTINGS.goal, dailyCalories: DEFAULT_SETTINGS.dailyCalories, dailyProtein: undefined });
  });
});

describe("the remote switch on numbite.com (public/app-switches.json)", () => {
  it("ships with sign-in still required", () => {
    const file = JSON.parse(readFileSync(new URL("../public/app-switches.json", import.meta.url), "utf8"));
    expect(file.signInOptional).toBe(false);
    expect(sanitizeAppSwitches(file)).toEqual(NO_SWITCHES);
  });
  it("can only ever make sign-in optional, never stricter", () => {
    expect(signInRequiredWith(true, { signInOptional: false })).toBe(true);
    expect(signInRequiredWith(true, { signInOptional: true })).toBe(false);
    // a build where sign-in is optional stays optional whatever the file says
    expect(signInRequiredWith(false, { signInOptional: false })).toBe(false);
    expect(signInRequiredWith(false, { signInOptional: true })).toBe(false);
  });
  it("counts only a literal true", () => {
    for (const raw of [null, undefined, [], "x", { signInOptional: "true" }, { signInOptional: 1 }, { signInOptional: null }, { signInRequired: false }]) {
      expect(sanitizeAppSwitches(raw)).toEqual({ signInOptional: false });
    }
    expect(sanitizeAppSwitches({ signInOptional: true, note: "x" })).toEqual({ signInOptional: true });
  });
  it("takes the live file's answer, either way; the copy packed in the app can only add 'optional', never undo a live answer", () => {
    const on = { signInOptional: true }, off = { signInOptional: false };
    expect(mergeSwitches(off, on, true)).toEqual(on);
    expect(mergeSwitches(on, off, true)).toEqual(off);
    expect(mergeSwitches(on, off, false)).toEqual(on);
    expect(mergeSwitches(off, on, false)).toEqual(on);
    expect(mergeSwitches(off, off, false)).toEqual(off);
  });
});
