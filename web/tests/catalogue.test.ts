import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appShopCount, catalogueStats, heroProof } from "../lib/mm/catalogue";
import { RECIPES } from "../lib/mm/recipeBook";

const WEB = join(__dirname, "..");

describe("marketing numbers", () => {
  it("counts real chains only and rounds items down so the claim stays true", () => {
    expect(catalogueStats([{ sample: false, itemCount: 12_614 }, { sample: true, itemCount: 50 }])).toEqual({ chains: 1, itemsLabel: "over 12,500" });
    expect(catalogueStats([{ sample: false, itemCount: 1_234 }])).toEqual({ chains: 1, itemsLabel: "over 1,200" });
    expect(catalogueStats([{ sample: false, itemCount: 1_200 }])).toEqual({ chains: 1, itemsLabel: "1,200" });
    expect(catalogueStats([{ sample: false, itemCount: 7 }])).toEqual({ chains: 1, itemsLabel: "7" });
    expect(catalogueStats([])).toEqual({ chains: 0, itemsLabel: "0" });
  });
});

describe("the homepage hero's proof row", () => {
  it("says each count exactly, singular for one, leaves out a missing count and ends with Free to download", () => {
    expect(heroProof({ restaurants: 241, supermarkets: 9, recipes: 1_382 })).toEqual([
      { figure: "241", label: "UK restaurants" },
      { figure: "9", label: "supermarkets" },
      { figure: "1,382", label: "recipes" },
      { figure: "Free", label: "to download" },
    ]);
    expect(heroProof({ restaurants: 1, supermarkets: 1, recipes: 1 }).map((p) => p.label)).toEqual(["UK restaurant", "supermarket", "recipe", "to download"]);
    expect(heroProof({ restaurants: 0, supermarkets: 0, recipes: 0 })).toEqual([{ figure: "Free", label: "to download" }]);
  });

  it("counts only the supermarkets the app packs, when app-content.json names them", () => {
    const shops = [{ id: "asda" }, { id: "tesco" }, { id: "lidl" }];
    expect(appShopCount(shops)).toBe(3);
    expect(appShopCount(shops, ["asda", "lidl", "ocado"])).toBe(2);
  });

  it("matches the published data: the supermarkets with a full list that the app packs, and every recipe in the book", () => {
    const manifest = JSON.parse(readFileSync(join(WEB, "public/groceries/all/all-manifest.json"), "utf8")) as { retailers: { id: string }[] };
    const content = JSON.parse(readFileSync(join(WEB, "app-content.json"), "utf8")) as { shops?: string[] };
    const supermarkets = appShopCount(manifest.retailers, content.shops);
    expect(supermarkets).toBeGreaterThan(0);
    const proof = heroProof({ restaurants: 1, supermarkets, recipes: RECIPES.length });
    expect(proof[1]).toEqual({ figure: String(supermarkets), label: "supermarkets" });
    expect(proof[2]).toEqual({ figure: RECIPES.length.toLocaleString("en-GB"), label: "recipes" });
  });
});
