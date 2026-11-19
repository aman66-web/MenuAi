import { describe, expect, it } from "vitest";
import { signInGate, type GateState } from "../lib/mm/signInGate";

const base: GateState = { required: true, hydrated: true, signedIn: false, checking: false, pathname: "/app" };

describe("the sign-in screen (founder 2026-11-17: everyone signs in)", () => {
  it("stands in front of every app page until someone is signed in", () => {
    for (const pathname of ["/app", "/app/", "/app/eat-out", "/app/chain", "/app/recipes/view", "/app/groceries/list/shared", "/app/community/friends", "/app/settings", "/app/today"]) {
      expect(signInGate({ ...base, pathname }), pathname).toBe("signIn");
      expect(signInGate({ ...base, pathname, signedIn: true }), pathname).toBe("open");
    }
  });
  it("leaves the welcome screen and the offline page open (the welcome screen sends Get started through sign-in itself)", () => {
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
