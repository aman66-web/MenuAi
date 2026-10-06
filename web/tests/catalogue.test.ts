import { describe, expect, it } from "vitest";
import { catalogueStats } from "../lib/mm/catalogue";

describe("marketing numbers", () => {
  it("counts real chains only and rounds items down so the claim stays true", () => {
    expect(catalogueStats([{ sample: false, itemCount: 12_614 }, { sample: true, itemCount: 50 }])).toEqual({ chains: 1, itemsLabel: "over 12,500" });
    expect(catalogueStats([{ sample: false, itemCount: 1_234 }])).toEqual({ chains: 1, itemsLabel: "over 1,200" });
    expect(catalogueStats([{ sample: false, itemCount: 1_200 }])).toEqual({ chains: 1, itemsLabel: "1,200" });
    expect(catalogueStats([{ sample: false, itemCount: 7 }])).toEqual({ chains: 1, itemsLabel: "7" });
    expect(catalogueStats([])).toEqual({ chains: 0, itemsLabel: "0" });
  });
});
