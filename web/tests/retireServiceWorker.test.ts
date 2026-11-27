import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { retireServiceWorker } from "../lib/retireServiceWorker";

// The website's pages remove the old web app's service worker and its caches (lib/retireServiceWorker.ts), so a browser that had the web app stops getting
// it from a copy even if its old worker never checks for the retired one (public/sw.js).

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("retireServiceWorker", () => {
  it("unregisters every registration and deletes every cache", async () => {
    let unregistered = 0;
    const registration = { unregister: async () => { unregistered++; return true; } };
    const nav = { serviceWorker: { getRegistrations: async () => [registration, registration] } } as unknown as Navigator;
    const names = new Set(["mm-v10-pages", "mm-v10-static", "mm-v10-logos"]);
    const store = { keys: async () => [...names], delete: async (n: string) => names.delete(n) } as unknown as CacheStorage;
    await retireServiceWorker(nav, store);
    expect(unregistered).toBe(2);
    expect(names.size).toBe(0);
  });

  it("does nothing, and throws nothing, where a browser has neither or refuses", async () => {
    await expect(retireServiceWorker({} as Navigator, undefined)).resolves.toBeUndefined();
    const refusing = { serviceWorker: { getRegistrations: async () => { throw new Error("SecurityError"); } } } as unknown as Navigator;
    const broken = { keys: async () => { throw new Error("SecurityError"); } } as unknown as CacheStorage;
    await expect(retireServiceWorker(refusing, broken)).resolves.toBeUndefined();
  });

  it("runs on every website page and in a website copy of the web app, never in the phone apps", () => {
    expect(read("app/(site)/layout.tsx")).toContain("<RetireServiceWorker />");
    expect(read("app/components/RetireServiceWorker.tsx")).toContain("if (!APP_BUILD) void retireServiceWorker();");
    expect(read("app/app/_components/AppShell.tsx")).toContain("if (!APP_BUILD) void retireServiceWorker();");
  });
});
