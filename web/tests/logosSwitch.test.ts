import { afterEach, describe, expect, it, vi } from "vitest";

// The iPhone app can be built without the chains' and shops' logo files (web/app-content.json "appLogos": false → NEXT_PUBLIC_APP_LOGOS=0).
describe("the logos switch", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("on by default: a chain and a shop with a logo file get it", async () => {
    const m = await import("../lib/mm/logos");
    expect(m.logoFor("kfc")).toBeDefined();
    expect(m.shopLogoFor("tesco") ?? m.shopLogoFor("sainsburys")).toBeDefined();
  });

  it("off: no chain and no shop shows a logo file (cuisine icons and names take over)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_LOGOS", "0");
    vi.resetModules();
    const m = await import("../lib/mm/logos");
    expect(m.logoFor("kfc")).toBeUndefined();
    expect(m.shopLogoFor("tesco")).toBeUndefined();
    expect(m.shopLogoFor("sainsburys")).toBeUndefined();
  });
});
