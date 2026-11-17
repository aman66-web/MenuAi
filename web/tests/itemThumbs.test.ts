import { afterEach, describe, expect, it, vi } from "vitest";
import { itemImageUrl, itemThumbUrl } from "../lib/mm/images";
import { setHiddenLogos } from "../lib/mm/logos";

// The small copy of a dish photo for list tiles (tools/uk_extract/make_thumbs.py): same file name under menu-images/thumbs/<chain>/.
describe("itemThumbUrl", () => {
  afterEach(() => {
    setHiddenLogos([]);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("maps '<chain>/<file>.webp' to the small copy beside the full photo", () => {
    expect(itemThumbUrl("kfc/221a7d83d8dc.webp")).toBe("/menu-images/thumbs/kfc/221a7d83d8dc.webp");
    expect(itemImageUrl("kfc/221a7d83d8dc.webp")).toBe("/menu-images/kfc/221a7d83d8dc.webp");
  });

  it("gives nothing when there is no photo, and refuses anything that is not that exact shape", () => {
    expect(itemThumbUrl(undefined)).toBeUndefined();
    expect(itemThumbUrl("")).toBeUndefined();
    for (const bad of ["../x/y.webp", "kfc/../y.webp", "https://example.com/a.webp", "/kfc/a.webp", "kfc/a.png", "kfc/a.webp?x=1", "KFC/a.webp", "a/b/c.webp", "thumbs/kfc/a.webp"]) {
      expect(itemThumbUrl(bad), bad).toBeUndefined();
    }
  });

  it("'thumbs' is the small copies' folder, never a chain: no photo for either size", () => {
    expect(itemThumbUrl("thumbs/a1.webp")).toBeUndefined();
    expect(itemImageUrl("thumbs/a1.webp")).toBeUndefined();
  });

  it("a chain on the taken-down list (public/logos/hidden.json) loses its small copies as well as its full photos", () => {
    setHiddenLogos(["kfc"]);
    expect(itemThumbUrl("kfc/221a7d83d8dc.webp")).toBeUndefined();
    expect(itemImageUrl("kfc/221a7d83d8dc.webp")).toBeUndefined();
    expect(itemThumbUrl("nandos/abc123.webp")).toBe("/menu-images/thumbs/nandos/abc123.webp");
  });

  it("photos switched off for the app build (NEXT_PUBLIC_MENU_PHOTOS=0): no small copy either", async () => {
    vi.stubEnv("NEXT_PUBLIC_MENU_PHOTOS", "0");
    vi.resetModules();
    const m = await import("../lib/mm/images");
    expect(m.itemThumbUrl("kfc/221a7d83d8dc.webp")).toBeUndefined();
  });

  it("in the iPhone app that loads photos from the website, the small copy comes from there too", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BUILD", "1");
    vi.stubEnv("NEXT_PUBLIC_REMOTE_BASE", "https://numbite.com/");
    vi.resetModules();
    const m = await import("../lib/mm/images");
    expect(m.itemThumbUrl("kfc/221a7d83d8dc.webp")).toBe("https://numbite.com/menu-images/thumbs/kfc/221a7d83d8dc.webp");
    expect(m.itemImageUrl("kfc/221a7d83d8dc.webp")).toBe("https://numbite.com/menu-images/kfc/221a7d83d8dc.webp");
  });

  // A chain's photos come down the day it asks (CLAUDE.md rule 2): deleting its folder must not leave its small copies on the website.
  it("no small copy is left without its full photo", async () => {
    const { existsSync, readdirSync } = await import("node:fs");
    const root = new URL("../public/menu-images/", import.meta.url);
    const thumbs = new URL("thumbs/", root);
    if (!existsSync(thumbs)) return; // not made in this checkout: tiles then load the full photos
    for (const chain of readdirSync(thumbs)) {
      for (const file of readdirSync(new URL(`${chain}/`, thumbs))) {
        expect(existsSync(new URL(`${chain}/${file}`, root)), `thumbs/${chain}/${file} has no full photo: run python3 tools/uk_extract/make_thumbs.py to remove it`).toBe(true);
      }
    }
  });
});
