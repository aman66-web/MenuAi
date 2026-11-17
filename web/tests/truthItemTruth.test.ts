import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { calorieCalloutParts, itemTruth, referenceRows } from "../lib/mm/truth/itemTruth";
import { IMAGE_CARD_FOOTER, IMAGE_CARD_SIZE, imageFileName, shareMessage, shareUrl, whatsappUrl } from "../lib/mm/truth/shareTruth";
import type { Chain, MenuItem } from "../lib/mm/types";

const mk = (name: string, category: string, nutrients: MenuItem["nutrients"]) => ({ name, category, nutrients });

describe("itemTruth", () => {
  it("gathers kind, score, lights, reference rows and household equivalents from the published figures", () => {
    const t = itemTruth(mk("Chicken wrap", "Wraps", { calories: 450, protein: 36, carbs: 40, fat: 14, saturatedFat: 4, sugar: 6, salt: 1.9 }));
    expect(t.kind).toBe("main");
    expect(t.score?.score).toBe(5); // 32% protein share, 450 kcal
    expect(t.lights.find((l) => l.key === "salt")).toMatchObject({ light: "red", basis: "portion" });
    expect(t.lights.find((l) => l.key === "sugar")).toMatchObject({ basis: "no-weight" });
    expect(t.caloriePercent).toBe(23);
    expect(t.reference.find((r) => r.key === "protein")?.percent).toBe(72);
    expect(t.household.map((h) => h.kind)).toEqual(["sugar", "fat", "protein"]);
  });

  it("a drink has no score and no colours; a dip has no score", () => {
    const drink = itemTruth(mk("Large latte", "Hot drinks", { calories: 250, protein: 12, carbs: 25, fat: 9, sugar: 20 }));
    expect(drink.kind).toBe("drink");
    expect(drink.score).toBeNull();
    expect(drink.lights.every((l) => l.light === undefined)).toBe(true);
    expect(itemTruth(mk("Mayo", "Dips", { calories: 160, protein: 1, carbs: 1, fat: 17 })).score).toBeNull();
  });

  it("a calories-only item shows calories and nothing it doesn't publish", () => {
    const t = itemTruth(mk("Pasty", "Pasties", { calories: 600 }));
    expect(t.score).toBeNull();
    expect(t.household).toEqual([]);
    expect(t.reference).toEqual([{ key: "calories", grams: 600, percent: 30 }]);
    expect(t.lights.every((l) => l.basis === "not-published")).toBe(true);
  });

  it("reference rows follow the label order", () => {
    expect(referenceRows({ calories: 100, protein: 5, carbs: 20, sugar: 4, fat: 3, saturatedFat: 1, salt: 0.5 }).map((r) => r.key)).toEqual([
      "calories",
      "protein",
      "carbs",
      "sugar",
      "fat",
      "saturatedFat",
      "salt",
    ]);
  });

  it("the calorie callout starts at a tenth of the day", () => {
    expect(calorieCalloutParts(9)).toBeNull();
    expect(calorieCalloutParts(10)).toEqual({ percent: 10 });
  });
});

describe("share message and links", () => {
  const base = { chainId: "kfc", chainName: "KFC", item: { id: "zinger", name: "Zinger Burger", nutrients: { calories: 580 } }, origin: "https://numbite.com/" };
  it("links to the item inside the app", () => {
    expect(shareUrl("https://numbite.com/", "kfc", "zinger")).toBe("https://numbite.com/app/item?chain=kfc&item=zinger");
    expect(shareUrl("https://numbite.com", "a b", "x&y")).toBe("https://numbite.com/app/item?chain=a%20b&item=x%26y");
  });
  it("with a swap, names both and the saving", () => {
    const m = shareMessage({ ...base, swap: { item: { id: "s", name: "Grilled Wrap" } as MenuItem, kcalSaved: 210 } });
    expect(m).toBe(
      "Look at the actual nutrition in this KFC Zinger Burger (580 kcal) vs the Smart Swap (Grilled Wrap, saves 210 kcal!). Figures from KFC's own published nutrition guide, on Numbite: https://numbite.com/app/item?chain=kfc&item=zinger",
    );
  });
  it("without a swap, just the item", () => {
    const m = shareMessage({ ...base, swap: null });
    expect(m).toBe("Look at the actual nutrition in this KFC Zinger Burger (580 kcal). Figures from KFC's own published nutrition guide, on Numbite: https://numbite.com/app/item?chain=kfc&item=zinger");
    expect(m).not.toMatch(/\b(good|bad|healthy|unhealthy|worst|best)\b/i);
  });
  it("builds a wa.me link with the message encoded", () => {
    const u = whatsappUrl("a b & c?");
    expect(u).toBe("https://wa.me/?text=a%20b%20%26%20c%3F");
    expect(decodeURIComponent(u.split("text=")[1])).toBe("a b & c?");
  });
  it("the image card is 1080 x 1350, with a plain footer and a safe file name", () => {
    expect(IMAGE_CARD_SIZE).toEqual({ width: 1080, height: 1350 });
    expect(IMAGE_CARD_FOOTER).toBe("Figures from each restaurant's own guide • numbite.com");
    expect(imageFileName("Nando's", "Peri-Peri Chicken Wrap!")).toBe("numbite-nando-s-peri-peri-chicken-wrap.png");
    expect(imageFileName("", "")).toBe("numbite-card.png");
  });
});

const menuDir = fileURLToPath(new URL("../public/menus/", import.meta.url));
const chains: Chain[] = readdirSync(menuDir)
  .filter((f) => f.startsWith("chain-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(menuDir + f, "utf8")) as Chain)
  .filter((c) => !c.sample);

describe("itemTruth: real menus", () => {
  it("never throws and never produces a NaN for any published item", () => {
    let n = 0;
    for (const c of chains) {
      for (const it of c.items) {
        const t = itemTruth(it);
        expect(Number.isFinite(t.caloriePercent)).toBe(true);
        for (const r of t.reference) expect(Number.isFinite(r.percent)).toBe(true);
        for (const h of t.household) {
          expect(Number.isFinite(h.amount)).toBe(true);
          expect(h.icons).toBeGreaterThanOrEqual(1);
        }
        n++;
      }
    }
    expect(n).toBe(chains.reduce((total, c) => total + c.items.length, 0)); // every item was looked at (the menus change, so the total is not written here)
    expect(n).toBeGreaterThan(30000);
  });
});
