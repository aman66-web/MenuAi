// One place for names, links and copy shared across the website.
// Change `name` here if you pick a different app name (and update docs/STORE.md to match).
export const site = {
  name: "Menu Math",
  appStoreTitle: "Menu Math: Fast Food Macros",
  tagline: "Know your macros before you order.",
  description:
    "Full calories, protein, carbs, fat and salt for every item at popular UK restaurant chains, and the best order for what you have left today.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  // Set once the app is live (App Store Connect › App Information › Apple ID).
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL ?? "",
  appleStandardEula: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  privacyLastUpdated: "6 October 2026",
} as const;
