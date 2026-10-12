// One place for names, links and copy shared across the website.
// Change `name` here if you pick a different app name (and update docs/STORE.md to match).
export const site = {
  name: "Numbite",
  appStoreTitle: "Numbite: Calories & Protein",
  tagline: "Know your macros before you order.",
  description:
    "Full calories, protein, carbs, fat and salt for every item at popular UK restaurant chains, and the best order for what you have left today.",
  // The website's own address (bought 2026-10-12). NEXT_PUBLIC_SITE_URL overrides it; menumacros.vercel.app stays as an alias.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://numbite.com",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  // Set once the app is live (App Store Connect › App Information › Apple ID).
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL ?? "",
  appleStandardEula: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  privacyLastUpdated: "12 October 2026",
} as const;
