import { afterEach, describe, expect, it } from "vitest";
import { logoFor, sanitizeHiddenLogos, setHiddenLogos, shopLogoFor } from "../lib/mm/logos";

// Logo safeguards for the App Store (founder 2026-10-12): a logo whose owner asks comes down by listing it in public/logos/hidden.json.
describe("taken-down logos", () => {
  afterEach(() => setHiddenLogos([]));

  it("reads the website's file: chain ids and shop:<id>, nothing else", () => {
    expect(sanitizeHiddenLogos({ v: 1, note: "x", hidden: ["kfc", "shop:tesco", "KFC", "../x", 4, "kfc"] })).toEqual(["kfc", "shop:tesco"]);
    expect(sanitizeHiddenLogos(["nandos"])).toEqual(["nandos"]);
    expect(sanitizeHiddenLogos(null)).toEqual([]);
    expect(sanitizeHiddenLogos({ hidden: "kfc" })).toEqual([]);
  });

  it("a listed chain or shop shows no logo (its cuisine icon or basket instead); others are untouched", () => {
    expect(logoFor("kfc")).toBeDefined();
    expect(shopLogoFor("sainsburys")).toBeDefined();
    setHiddenLogos(["kfc", "shop:sainsburys"]);
    expect(logoFor("kfc")).toBeUndefined();
    expect(shopLogoFor("sainsburys")).toBeUndefined();
    expect(logoFor("nandos")).toBeDefined();
    expect(shopLogoFor("asda")).toBeDefined();
    setHiddenLogos([]);
    expect(logoFor("kfc")).toBeDefined();
  });

  it("the published list is valid and starts empty", async () => {
    const { readFileSync } = await import("node:fs");
    const file = JSON.parse(readFileSync(new URL("../public/logos/hidden.json", import.meta.url), "utf8")) as { v: number; hidden: unknown[] };
    expect(file.v).toBe(1);
    expect(sanitizeHiddenLogos(file)).toEqual(file.hidden);
  });
});
