import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeSwitches, NO_SWITCHES, sanitizeAppSwitches, signInRequiredWith } from "../lib/mm/appSwitches";
import { showcaseDishes, dishFits } from "../lib/mm/showcase";
import { afterSignIn, CODE_LENGTH, CODE_RESEND_SECONDS, codeDigits, looksLikeEmail, resendWait, sanitizeResume, SIGN_IN_HEADING, SIGN_IN_REASONS, signInGate, TYPED_SETUP_KEYS, typedSetup, type GateState } from "../lib/mm/signInGate";
import { NO_PREFERENCES, type Chain } from "../lib/mm/types";
import { DEFAULT_SETTINGS, type UserSettings } from "../lib/mm/user-data";
import { tinyChain } from "./fixtures";

const base: GateState = { required: true, hydrated: true, signedIn: false, checking: false, pathname: "/app" };

describe("the sign-in screen (founder 2026-11-17: everyone signs in)", () => {
  it("stands in front of every app page until someone is signed in", () => {
    for (const pathname of ["/app", "/app/", "/app/eat-out", "/app/chain", "/app/recipes/view", "/app/groceries/list/shared", "/app/community/friends", "/app/settings", "/app/today"]) {
      expect(signInGate({ ...base, pathname }), pathname).toBe("signIn");
      expect(signInGate({ ...base, pathname, signedIn: true }), pathname).toBe("open");
    }
  });
  it("leaves the welcome screens and the offline page open (they ask for the account themselves, as their last step)", () => {
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

// The onboarding redesign meeting of 20 November 2026 (build list 7, approved by the founder): the account is the welcome screens' last step (Step 11 of 11), and
// after it the person goes straight to Home; "Look around first" and its reason are gone. From 19 November: the heading follows how the screen was reached, and
// a switches file on numbite.com can make sign-in optional (never stricter).
describe("the welcome screens' sign-in step", () => {
  const typedNow = (over: Partial<UserSettings> = {}): UserSettings => ({ ...DEFAULT_SETTINGS, goal: "glp1", dailyCalories: 1500, dailyProtein: 110, hasSetTargets: true, glp1MealCap: 500, preferences: { ...DEFAULT_SETTINGS.preferences, veganOnly: true }, ...over });

  it("heads the screen by the way it was reached, and keeps 'Sign in or sign up' on a page of the app", () => {
    expect(SIGN_IN_HEADING).toEqual({
      setup: "Save your plan", // founder 2026-11-20, "short and simple" (that morning: "Save your goal and numbers: make your free account")
      returning: "Welcome back. Sign in",
      page: "Sign in or sign up",
    });
    expect(SIGN_IN_REASONS).toEqual(["setup", "returning"]);
  });

  it("takes only the goal, the targets, the diet and the shops from what was typed (never anything about the body, which is never stored)", () => {
    const typed = typedSetup({ ...typedNow(), shops: ["sainsburys"], textSize: "large", hasCompletedOnboarding: false });
    expect(Object.keys(typed).sort()).toEqual([...TYPED_SETUP_KEYS].sort());
    expect(typed).toMatchObject({ goal: "glp1", dailyCalories: 1500, dailyProtein: 110, hasSetTargets: true, shops: ["sainsburys"] });
    expect("textSize" in typed || "hasCompletedOnboarding" in typed).toBe(false);
  });

  it("an account already set up goes straight to the app, whichever way in (its own settings win)", () => {
    for (const reason of ["setup", "returning"] as const) {
      expect(afterSignIn({ reason, setUp: true, cleared: false, settingsSynced: true, current: typedNow(), typed: typedSetup(typedNow()) })).toEqual({ to: "app" });
    }
  });

  it("a new account goes straight to Home from the last step, and into the welcome steps (a signed-in run) from the cover's link", () => {
    const base = { setUp: false, cleared: false, settingsSynced: false, current: typedNow(), typed: typedSetup(typedNow()) };
    expect(afterSignIn({ ...base, reason: "setup" })).toEqual({ to: "home", restore: {} });
    expect(afterSignIn({ ...base, reason: "returning" })).toEqual({ to: "tour" });
  });

  it("puts back what was typed when signing in emptied this phone (a different person had signed in here before) and the account had no settings", () => {
    const typed = typedSetup({ ...typedNow(), shops: ["tesco"] });
    const emptied = { ...DEFAULT_SETTINGS };
    const after = afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: false, current: emptied, typed });
    expect(after.to).toBe("home");
    const restore = after.to === "home" ? after.restore : {};
    expect(restore).toMatchObject({ goal: "glp1", dailyCalories: 1500, dailyProtein: 110, hasSetTargets: true, glp1MealCap: 500, shops: ["tesco"] });
    expect(restore.preferences?.veganOnly).toBe(true);
    // only what differs
    const same = afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: false, current: typedNow(), typed: typedSetup(typedNow()) });
    expect(same).toEqual({ to: "home", restore: {} });
  });

  it("never overwrites an account's own settings: nothing is put back when the account's settings arrived, or when this phone wasn't emptied", () => {
    const typed = typedSetup(typedNow());
    const accounts = { ...DEFAULT_SETTINGS, goal: "lose" as const, dailyCalories: 1800, hasSetTargets: true };
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: true, current: accounts, typed })).toEqual({ to: "home", restore: {} });
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: false, settingsSynced: true, current: accounts, typed })).toEqual({ to: "home", restore: {} });
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: false, current: accounts, typed: null })).toEqual({ to: "home", restore: {} });
  });

  it("reads back the website's note of the sign-in step like anything stored, and nothing else", () => {
    const typed = typedSetup(typedNow());
    expect(sanitizeResume(JSON.parse(JSON.stringify({ reason: "setup", typed })))).toMatchObject({ reason: "setup", typed: { goal: "glp1", dailyCalories: 1500, hasSetTargets: true } });
    expect(sanitizeResume({ reason: "returning" })).toEqual({ reason: "returning", typed: null });
    for (const bad of [null, "setup", 3, {}, { reason: "admin" }, { reason: ["setup"] }]) expect(sanitizeResume(bad)).toBeNull();
    // a damaged target is tidied like a stored one (sanitizeSettings), never passed on as it is
    expect(sanitizeResume({ reason: "setup", typed: { dailyCalories: "lots", goal: "nonsense", dailyProtein: -4 } })?.typed).toMatchObject({ goal: DEFAULT_SETTINGS.goal, dailyCalories: DEFAULT_SETTINGS.dailyCalories, dailyProtein: undefined });
  });

  it("an old tab's note that says 'look' (Look around first, removed) no longer reads, so that tab lands on the cover", () => {
    expect(sanitizeResume({ reason: "look", typed: null })).toBeNull();
    expect(sanitizeResume(JSON.parse(JSON.stringify({ reason: "look", typed: typedSetup(typedNow()) })))).toBeNull();
  });

  it("keeps Home's two navigation hints through the website's Apple and Google trip, checked like anything stored", () => {
    const typed = typedSetup(typedNow());
    const note = { reason: "setup", typed, firstRecipeId: "chicken-fajita-bowl", firstDish: { chainId: "greggs", itemId: "greggs-chicken-bake" } };
    expect(sanitizeResume(JSON.parse(JSON.stringify(note)))).toMatchObject({ reason: "setup", firstRecipeId: "chicken-fajita-bowl", firstDish: { chainId: "greggs", itemId: "greggs-chicken-bake" } });
    // a damaged hint is dropped on its own; the note still reads
    const bad = sanitizeResume({ reason: "setup", typed, firstRecipeId: "<img src=x>", firstDish: { chainId: "Greggs", itemId: 4 } });
    expect(bad?.reason).toBe("setup");
    expect(bad && ("firstRecipeId" in bad || "firstDish" in bad)).toBe(false);
  });

  it("an existing account's settings win, and the Start here dish is checked again against them", () => {
    // typed on this phone: no diet; the account (signed in at step 11 on a phone it had used before) is vegan with a milk allergy
    const typed = typedSetup(typedNow({ preferences: { ...DEFAULT_SETTINGS.preferences } }));
    const account: UserSettings = { ...DEFAULT_SETTINGS, goal: "lose", dailyCalories: 1700, hasSetTargets: true, preferences: { ...DEFAULT_SETTINGS.preferences, veganOnly: true, avoidAllergens: ["milk"] } };
    // the account's settings arrived with the sync: nothing typed is put back over them
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: false, settingsSynced: true, current: account, typed })).toEqual({ to: "home", restore: {} });
    expect(afterSignIn({ reason: "setup", setUp: false, cleared: true, settingsSynced: true, current: account, typed })).toEqual({ to: "home", restore: {} });
    // the dish chosen on step 3 (it fitted what was typed) no longer fits the account's own diet, so Home doesn't offer it
    const c: Chain = { ...tinyChain([["wrap", "Chicken Wrap", 450, 40], ["burger", "Beef Burger", 620, 35]]), id: "testchain", sample: false };
    const dish = showcaseDishes(c, "maintain", NO_PREFERENCES)!.dishes[0]!;
    const item = c.items.find((i) => i.id === dish.itemId)!;
    expect(dishFits(c, item, typed.preferences!)).toBe(true);
    expect(dishFits(c, item, account.preferences)).toBe(false);
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

// "Continue with email" as two screens (founder 2026-11-20): one big email box, then six code boxes that go on by themselves with the sixth digit, and
// "Send it again" once Supabase's minute between codes is over.
describe("the email code screens", () => {
  it("takes an address only when it looks like one", () => {
    for (const ok of ["joan@example.com", "  Joan.Smith@Example.co.uk ", "a+b@c.d"]) expect(looksLikeEmail(ok), ok).toBe(true);
    for (const bad of ["", "joan", "joan@example", "joan @example.com", "@example.com", "joan@.com x"]) expect(looksLikeEmail(bad), bad).toBe(false);
  });

  it("keeps only the code's six digits, however they arrive (typed, filled in from Mail, pasted)", () => {
    expect(CODE_LENGTH).toBe(6);
    expect(codeDigits("")).toBe("");
    expect(codeDigits("12")).toBe("12");
    expect(codeDigits("12a")).toBe("12");
    expect(codeDigits("123 456")).toBe("123456");
    expect(codeDigits("123-456")).toBe("123456");
    expect(codeDigits("1234567")).toBe("123456"); // a seventh digit is never kept
    expect(codeDigits("Your code is 482913. It runs out in 60 minutes.")).toBe("482913"); // a pasted sentence: its run of six
    expect(codeDigits("\uFF14\uFF18\uFF12\uFF19\uFF11\uFF13")).toBe("482913"); // wide digits
  });

  it("counts down a minute to 'Send it again', in whole seconds, never below 0 or above the minute", () => {
    expect(CODE_RESEND_SECONDS).toBe(60);
    const sent = 1_000_000;
    expect(resendWait(sent, sent)).toBe(60);
    expect(resendWait(sent, sent + 999)).toBe(60);
    expect(resendWait(sent, sent + 1000)).toBe(59);
    expect(resendWait(sent, sent + 59_000)).toBe(1);
    expect(resendWait(sent, sent + 60_000)).toBe(0);
    expect(resendWait(sent, sent + 3_600_000)).toBe(0);
    expect(resendWait(sent, sent - 5000)).toBe(60); // a clock set back
  });
});
