import { describe, expect, it } from "vitest";
import { FREE_TRUTH_PER_DAY, NO_PAID, SHARE_UNLOCK_MS, grantShareUnlock, hasAccess, localDay, openTruth, paidActive, sanitizePaid, sanitizeTruthDay, shareUnlockActive, truthViewsLeft, withVerifiedToken, withoutToken } from "../lib/mm/paid";

const NOW = Date.UTC(2026, 10, 14, 12);
const TOKEN = "v1." + "a".repeat(30) + "." + "b".repeat(30);

describe("paid state", () => {
  it("starts with nothing and keeps nothing it can't make sense of", () => {
    expect(sanitizePaid(null)).toEqual(NO_PAID);
    expect(sanitizePaid("x")).toEqual(NO_PAID);
    expect(sanitizePaid({ token: "<script>alert(1)</script>", plan: "annual", until: 5, unlockUntil: -1 })).toEqual(NO_PAID);
    expect(sanitizePaid({ token: "short" })).toEqual(NO_PAID);
    expect(sanitizePaid({ token: TOKEN, plan: "gold", until: NOW })).toEqual({ token: TOKEN, plan: null, until: NOW, unlockUntil: null });
    expect(sanitizePaid({ token: TOKEN, plan: "annual", until: NOW, unlockUntil: NOW + 5 })).toEqual({ token: TOKEN, plan: "annual", until: NOW, unlockUntil: NOW + 5 });
    // a plan or date without a token means nothing
    expect(sanitizePaid({ plan: "annual", until: NOW })).toEqual(NO_PAID);
  });
  it("paid means a checked token that has not run out; a share unlock is separate", () => {
    const paid = withVerifiedToken(NO_PAID, TOKEN, "pass90", NOW + 1000);
    expect(paidActive(paid, NOW)).toBe(true);
    expect(paidActive(paid, NOW + 1000)).toBe(false);
    expect(paidActive(NO_PAID, NOW)).toBe(false);
    expect(paidActive(withoutToken(paid), NOW)).toBe(false);
    expect(withoutToken({ ...paid, unlockUntil: NOW + 5 }).unlockUntil).toBe(NOW + 5);
  });
  it("a share gives 48 hours, once while one is running, and never replaces a payment", () => {
    const a = grantShareUnlock(NO_PAID, NOW);
    expect(a.unlockUntil).toBe(NOW + SHARE_UNLOCK_MS);
    expect(shareUnlockActive(a, NOW + SHARE_UNLOCK_MS - 1)).toBe(true);
    expect(shareUnlockActive(a, NOW + SHARE_UNLOCK_MS)).toBe(false);
    expect(grantShareUnlock(a, NOW + 1000)).toBe(a); // already running
    expect(grantShareUnlock(a, NOW + SHARE_UNLOCK_MS + 1).unlockUntil).toBe(NOW + SHARE_UNLOCK_MS + 1 + SHARE_UNLOCK_MS); // ended: a new share earns another
    const paid = withVerifiedToken(NO_PAID, TOKEN, "annual", NOW + 10_000);
    expect(grantShareUnlock(paid, NOW)).toBe(paid);
    expect(hasAccess(a, NOW)).toBe(true);
    expect(hasAccess(NO_PAID, NOW)).toBe(false);
  });
});

describe("free Truth views", () => {
  const today = "2026-11-14";
  it("allows three different dishes a day, the same dish again for free, and counts a new day from zero", () => {
    let t = sanitizeTruthDay(null);
    expect(truthViewsLeft(t, today)).toBe(FREE_TRUTH_PER_DAY);
    for (const k of ["kfc/a", "kfc/b", "nandos/c"]) {
      const r = openTruth(t, today, k);
      expect(r.allowed).toBe(true);
      t = r.next;
    }
    expect(truthViewsLeft(t, today)).toBe(0);
    expect(openTruth(t, today, "kfc/a").allowed).toBe(true); // already opened today
    expect(openTruth(t, today, "kfc/d")).toEqual({ allowed: false, next: t });
    expect(truthViewsLeft(t, "2026-11-15")).toBe(FREE_TRUTH_PER_DAY);
    expect(openTruth(t, "2026-11-15", "kfc/d")).toEqual({ allowed: true, next: { day: "2026-11-15", keys: ["kfc/d"] } });
  });
  it("reads back only what is well formed", () => {
    expect(sanitizeTruthDay({ day: "yesterday", keys: ["a"] })).toEqual({ day: "", keys: [] });
    expect(sanitizeTruthDay({ day: today, keys: ["a", 5, "x".repeat(200), "b"] })).toEqual({ day: today, keys: ["a", "b"] });
  });
  it("names the day by the phone's own date", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
