import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureRef, captureRefFromLocation, currentRef, forgetRef } from "../lib/payments/ref";

// The creator code (?ref=) lives in memory only (founder 14 Nov 2026: no storage, so no consent banner). It survives moving around the app (a module variable) and is gone when the page reloads.

const touched: string[] = [];
const guard = (name: string) =>
  new Proxy({}, {
    get: (_t, prop) => {
      touched.push(`${name}.${String(prop)}`);
      throw new Error(`${name} must not be used for the creator code`);
    },
  });

beforeEach(() => {
  touched.length = 0;
  forgetRef();
  Object.defineProperty(globalThis, "sessionStorage", { value: guard("sessionStorage"), configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: guard("localStorage"), configurable: true });
  Object.defineProperty(globalThis, "document", { value: { get cookie() { touched.push("document.cookie"); throw new Error("no cookies"); }, set cookie(_v: string) { touched.push("document.cookie"); throw new Error("no cookies"); } }, configurable: true });
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).sessionStorage;
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).window;
});

function fakeWindow(href: string, state: unknown = { depth: 2 }) {
  const url = new URL(href);
  const replaced: unknown[][] = [];
  Object.defineProperty(globalThis, "window", {
    value: { location: { href, search: url.search }, history: { state, replaceState: (...a: unknown[]) => replaced.push(a) } },
    configurable: true,
  });
  return replaced;
}

describe("creator code in memory", () => {
  it("is empty until a link brings one", () => {
    expect(currentRef()).toBeNull();
  });

  it("keeps a clean code from the address, lower case", () => {
    captureRef("?ref=Anna_B");
    expect(currentRef()).toBe("anna_b");
  });

  it("keeps it across later calls (moving around the app) and a later address without one does not clear it", () => {
    captureRef("?ref=anna");
    captureRef("?x=1");
    captureRef("");
    expect(currentRef()).toBe("anna");
  });

  it("the latest valid code wins", () => {
    captureRef("?ref=anna");
    captureRef("?ref=ben-2");
    expect(currentRef()).toBe("ben-2");
  });

  it("ignores a code that is not valid and keeps the one it had", () => {
    captureRef("?ref=anna");
    for (const bad of ["?ref=<script>", "?ref=a", `?ref=${"x".repeat(33)}`, "?ref=a%20b", "?ref="]) captureRef(bad);
    expect(currentRef()).toBe("anna");
  });

  it("forgetRef empties it", () => {
    captureRef("?ref=anna");
    forgetRef();
    expect(currentRef()).toBeNull();
  });

  it("never touches session storage, local storage or cookies", () => {
    captureRef("?ref=anna");
    currentRef();
    forgetRef();
    expect(touched).toEqual([]);
  });

  // The address is cleaned as soon as the code is read: the app's own "tabs remember where you were" (and the browser's history) would otherwise keep ?ref=... in session storage.
  it("takes the code from the page address and removes ?ref= from the address, keeping the rest and the history state", () => {
    const replaced = fakeWindow("https://numbite.com/app/chain?id=kfc&ref=Anna_B#top");
    captureRefFromLocation();
    expect(currentRef()).toBe("anna_b");
    expect(replaced).toEqual([[{ depth: 2 }, "", "/app/chain?id=kfc#top"]]);
  });

  it("an address with only ?ref= becomes the plain path", () => {
    const replaced = fakeWindow("https://numbite.com/app?ref=anna");
    captureRefFromLocation();
    expect(replaced).toEqual([[{ depth: 2 }, "", "/app"]]);
  });

  it("an address with no code is left alone", () => {
    const replaced = fakeWindow("https://numbite.com/app?x=1");
    captureRefFromLocation();
    expect(replaced).toEqual([]);
    expect(currentRef()).toBeNull();
  });

  it("a code that is not valid is removed from the address too, and not kept", () => {
    const replaced = fakeWindow("https://numbite.com/app/pro?ref=%3Cscript%3E");
    captureRefFromLocation();
    expect(currentRef()).toBeNull();
    expect(replaced).toEqual([[{ depth: 2 }, "", "/app/pro"]]);
  });

  it("does nothing outside a browser", () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(() => captureRefFromLocation()).not.toThrow();
  });
});
