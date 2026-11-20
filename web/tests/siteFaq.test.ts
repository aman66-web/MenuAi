import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countLabel, nutritionStats, siteFaqs, type SiteFaqFlags } from "../lib/mm/catalogue";

// numbite.com's home page questions (lib/mm/catalogue.ts siteFaqs) and headline counts. The overnight audit of 20 November 2026: with Premium sold in the
// iPhone app the page said there was nothing to buy and the app was "planned", and switching the app's Premium on would have printed the website's old Stripe
// prices; the counts said every item had protein, carbs, fat and salt.

const STOREKIT = join(__dirname, "../../Config/Numbite.storekit");
const appStorePrices = (): string[] => [...readFileSync(STOREKIT, "utf8").matchAll(/"displayPrice"\s*:\s*"([\d.]+)"/g)].map((m) => m[1]!);

const base: SiteFaqFlags = {
  appPremium: false, webPro: false, pro: false, signInRequired: true, communityFriends: false, appStoreUrl: "https://apps.apple.com/gb/app/id1",
  webPrices: { monthly: "£2.99", annual: "£14.99", pass90: "£9.99" }, appName: "Numbite",
};
const text = (f: SiteFaqFlags) => siteFaqs(f, 241).map((x) => `${x.q} ${x.a}`).join("\n");

describe("the website's questions", () => {
  it("with Premium sold in the iPhone app: no 90-day pass and no price that isn't the App Store's own", () => {
    const words = text({ ...base, appPremium: true });
    expect(words).not.toMatch(/90-day/i);
    const allowed = new Set(appStorePrices());
    expect(allowed.size).toBeGreaterThan(0);
    for (const m of words.matchAll(/£\s?([\d.]+)/g)) expect(allowed, `£${m[1]} is not an App Store price`).toContain(m[1]);
    expect(words).toContain("Premium (Monthly or Annual, with a free first week) is sold in the iPhone app through the App Store");
    expect(words).toContain("Nothing is sold on this website.");
    expect(words).not.toMatch(/nothing to buy/i);
  });

  it("names the website's own prices only when the website sells something", () => {
    expect(text({ ...base, webPro: true })).toContain("£2.99 a month");
    for (const f of [base, { ...base, appPremium: true }, { ...base, pro: true }]) expect(text(f)).not.toMatch(/£/);
  });

  it("says an account is needed when everyone signs in, and mentions friends only while they are switched on", () => {
    expect(text(base)).toContain("You need a free account to use Numbite.");
    expect(text(base)).not.toMatch(/Community|nothing needs an account/i);
    const optional = { ...base, signInRequired: false };
    expect(text(optional)).toContain("Nothing needs an account.");
    expect(text(optional)).not.toMatch(/Community/);
    expect(text({ ...optional, communityFriends: true })).toContain("Nothing needs an account except adding friends in Community.");
  });

  it("says the app is on the App Store once it has a page, and 'planned' only before", () => {
    expect(text(base)).toContain("Yes: Numbite is on the App Store for iPhone");
    expect(text(base)).not.toMatch(/planned/);
    expect(text({ ...base, appStoreUrl: "" })).toContain("An iPhone app is planned");
  });
});

describe("the headline counts", () => {
  const item = (protein?: number) => ({ nutrients: { protein, carbs: protein === undefined ? undefined : 10, fat: protein === undefined ? undefined : 5 } });
  it("counts the items with protein, carbs and fat apart from the calories-only chains, and never the sample chains", () => {
    const s = nutritionStats([
      { items: [item(20), item(30), item(undefined)] },
      { nutritionLevel: "calories", items: [item(undefined), item(undefined)] },
      { sample: true, items: [item(40)] },
    ]);
    expect(s).toMatchObject({ chains: 2, caloriesOnlyChains: 1, items: 5, withMacros: 2 });
  });

  it("rounds down, so the claim stays true", () => {
    expect(countLabel(36_986)).toBe("over 36,500");
    expect(countLabel(20_243)).toBe("over 20,000");
    expect(countLabel(1_200)).toBe("1,200");
  });

  it("the published menus: about half publish calories only", () => {
    const root = join(__dirname, "../public/menus");
    const manifest = JSON.parse(readFileSync(join(root, "menus-manifest.json"), "utf8")) as { chains: Array<{ file: string; sample: boolean; nutritionLevel?: "full" | "calories" }> };
    const s = nutritionStats(manifest.chains.filter((c) => !c.sample).map((c) => ({ ...c, ...JSON.parse(readFileSync(join(root, c.file), "utf8")) })));
    expect(s.withMacros).toBeLessThan(s.items);
    expect(s.caloriesOnlyChains).toBeGreaterThan(0);
  });
});
