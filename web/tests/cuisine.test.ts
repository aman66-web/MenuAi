import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chainsInGroup, cuisineGroupId, cuisineGroups, CUISINE_GROUPS } from "../lib/mm/cuisine";

describe("browse by type", () => {
  it("places each cuisine in one broad group", () => {
    expect(cuisineGroupId("Burgers")).toBe("burgers");
    expect(cuisineGroupId("Japanese")).toBe("asian");
    expect(cuisineGroupId("Southeast Asian")).toBe("asian");
    expect(cuisineGroupId("Noodles")).toBe("asian");
    expect(cuisineGroupId("Italian American")).toBe("italian");
    expect(cuisineGroupId("Latin American")).toBe("mexican");
    expect(cuisineGroupId("Cafe")).toBe("coffee");
    expect(cuisineGroupId("Ice cream")).toBe("bakery");
    expect(cuisineGroupId("Wraps & bowls")).toBe("sandwiches");
    expect(cuisineGroupId("Bar & Kitchen")).toBe("pubs");
    expect(cuisineGroupId("Cocktail bar")).toBe("pubs");
    expect(cuisineGroupId("Carvery")).toBe("pubs");
    expect(cuisineGroupId("Steakhouse")).toBe("grill");
    expect(cuisineGroupId("French")).toBe("brasserie");
  });
  it("never reads 'Barbecue' as a bar, and puts pizza chains under Pizza, not Italian", () => {
    expect(cuisineGroupId("Barbecue")).toBe("grill");
    expect(cuisineGroupId("Pizza")).toBe("pizza");
  });
  it("puts a cuisine that fits no group, or none at all, under More", () => {
    expect(cuisineGroupId("Swedish")).toBe("more");
    expect(cuisineGroupId(undefined)).toBe("more");
    expect(cuisineGroupId("  ")).toBe("more");
  });
  it("lists only groups that have chains, in chip order, with More last", () => {
    const groups = cuisineGroups([{ cuisine: "Swedish" }, { cuisine: "Pizza" }, { cuisine: "Burgers" }, { cuisine: "Burgers" }]);
    expect(groups).toEqual([
      { id: "burgers", label: "Burgers", count: 2 },
      { id: "pizza", label: "Pizza", count: 1 },
      { id: "more", label: "More", count: 1 },
    ]);
  });
  it("lists a group's chains A to Z, ignoring case", () => {
    const chains = [{ name: "wagamama", cuisine: "Japanese" }, { name: "Itsu", cuisine: "Japanese" }, { name: "KFC", cuisine: "Chicken" }];
    expect(chainsInGroup(chains, "asian").map((c) => c.name)).toEqual(["Itsu", "wagamama"]);
  });
  it("covers the published data: every chain lands in a group and no group label is a judgement of the food", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/menus/menus-manifest.json", import.meta.url), "utf8")) as { chains: Array<{ cuisine?: string }> };
    const groups = cuisineGroups(manifest.chains);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(manifest.chains.length);
    for (const g of CUISINE_GROUPS) expect(g.label).not.toMatch(/health|good|bad|clean|guilt/i);
    // "More" should stay a small remainder, not where most chains end up
    expect(groups.find((g) => g.id === "more")?.count ?? 0).toBeLessThanOrEqual(4);
  });
});
