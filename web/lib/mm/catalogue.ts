// Honest headline numbers for the marketing site, from the published menus (never typed in by hand).

import { englishT, type T } from "./i18n";

export interface CatalogueStats {
  chains: number;
  /** e.g. "over 12,500": rounded DOWN so the claim stays true as items are held back or removed. */
  itemsLabel: string;
}

/** A count for a headline: rounded down (to 500 from 10,000, to 100 from 1,000, else to 10) and said as "over …", so it stays true. */
export function countLabel(n: number, t: T = englishT): string {
  const step = n >= 10_000 ? 500 : n >= 1_000 ? 100 : 10;
  const floor = Math.floor(n / step) * step;
  return floor === n || floor === 0 ? n.toLocaleString("en-GB") : t("over {n}", { n: floor.toLocaleString("en-GB") });
}

export function catalogueStats(chains: ReadonlyArray<{ sample: boolean; itemCount: number }>, t: T = englishT): CatalogueStats {
  const real = chains.filter((c) => !c.sample);
  return { chains: real.length, itemsLabel: countLabel(real.reduce((n, c) => n + c.itemCount, 0), t) };
}

/** One published chain file, as far as these counts need it. */
export interface ChainForStats {
  sample?: boolean;
  nutritionLevel?: "full" | "calories";
  items: ReadonlyArray<{ nutrients: { protein?: number | null; carbs?: number | null; fat?: number | null; salt?: number | null } }>;
}

export interface NutritionStats {
  chains: number;
  /** Chains that publish calories only (nutritionLevel "calories"). */
  caloriesOnlyChains: number;
  items: number;
  /** Items whose chain publishes protein, carbs and fat for them, all three. */
  withMacros: number;
  itemsLabel: string;
  withMacrosLabel: string;
}

/**
 * What the published menus really hold (the overnight audit of 20 November 2026: the website said every item had protein, carbs, fat and salt, when about half
 * publish calories only). Counted from each chain's own file at build time; the sample chains are never counted.
 */
export function nutritionStats(chains: ReadonlyArray<ChainForStats>, t: T = englishT): NutritionStats {
  const real = chains.filter((c) => !c.sample);
  let items = 0;
  let withMacros = 0;
  for (const c of real) {
    for (const i of c.items) {
      items++;
      const n = i.nutrients;
      if (c.nutritionLevel !== "calories" && [n.protein, n.carbs, n.fat].every((v) => typeof v === "number")) withMacros++;
    }
  }
  return {
    chains: real.length,
    caloriesOnlyChains: real.filter((c) => c.nutritionLevel === "calories").length,
    items,
    withMacros,
    itemsLabel: countLabel(items, t),
    withMacrosLabel: countLabel(withMacros, t),
  };
}

// ------------------------------------------------------------------------------------------------ the website's questions (app/(site)/page.tsx)

export interface SiteFaqFlags {
  /** Premium is sold in the iPhone app (APP_PREMIUM). */
  appPremium: boolean;
  /** Paid access is sold on this website (WEB_PRO_ENABLED): only then are the website's own prices named. */
  webPro: boolean;
  /** The older Pro machinery of test builds (PRO_ENABLED). */
  pro: boolean;
  /** Everyone signs in (SIGN_IN_REQUIRED). */
  signInRequired: boolean;
  /** Community's friends are switched on (COMMUNITY_FRIENDS_ENABLED). */
  communityFriends: boolean;
  /** The App Store page, once there is one ("" before). */
  appStoreUrl: string;
  /** The Google Play page, once there is one ("" before). */
  playStoreUrl: string;
  /** The website's prices (lib/payments/plans.ts PLANS), used only with `webPro`. */
  webPrices: { monthly: string; annual: string; pass90: string };
  appName: string;
}

/**
 * The home page's questions and answers. Every answer follows the switches, so the page never says something the build doesn't do (the overnight audit of
 * 20 November 2026: with Premium sold in the app, the page said there was nothing to buy, and turning the app's Premium on would have printed the website's
 * old Stripe prices). The App Store shows the app's prices itself, so the app's Premium is described without figures. English only, like the website.
 */
export function siteFaqs(f: SiteFaqFlags, chains: number): Array<{ q: string; a: string }> {
  const account = f.signInRequired ? ` You need a free account to use ${f.appName}.` : "";
  const free = f.webPro
    ? `Every restaurant's full menu with calories and macros is free, and so is the Truth card for three dishes a day. Paid access on this website adds the rest: ${f.webPrices.monthly} a month, ${f.webPrices.annual} a year, or a ${f.webPrices.pass90} 90-day pass with no subscription. Prices are shown before you pay.${f.appPremium ? " In the iPhone app, Premium is sold through the App Store." : ""}${account}`
    : f.appPremium
      ? `Every restaurant's menu with calories and macros is free. Premium (Monthly or Annual, with a free first week) is sold in the iPhone app through the App Store, which shows the price before you pay. Nothing is sold on this website.${account}`
      : f.pro
        ? `Full menus with calories and macros are free for everyone. Premium adds the ranked best orders, the order builder and logging. Pricing will be shown before you pay for anything.${account}`
        : `Yes. Every feature is free and there is nothing to buy.${f.signInRequired ? ` You need a free account to use ${f.appName}.` : f.communityFriends ? " Nothing needs an account except adding friends in Community." : " Nothing needs an account."}`;
  return [
    { q: "Is it free?", a: free },
    { q: "Where do the numbers come from?", a: "From each restaurant's own published nutrition information. We show the source and the date we last checked on every chain, never estimate missing values, and fix reported mistakes within 48 hours." },
    { q: "Which restaurants?", a: `${chains > 0 ? `${chains} popular UK chains so far` : "Popular UK chains first"}, taken from each chain's own nutrition guide, with more added based on what people request. US chains come later.` },
    {
      q: "Is it an app?",
      a: f.appStoreUrl
        ? `Yes: ${f.appName} is on the App Store for iPhone${f.playStoreUrl ? " and on Google Play for Android phones" : ""}, and there is a web version that works in any browser.`
        : "There is a web version that works in any browser and can be added to your home screen. An iPhone app is planned; Android may follow later.",
    },
    { q: "Is this medical advice?", a: "No. It shows published nutrition information and helps you choose. Talk to your doctor or a dietitian about your own needs." },
  ];
}
