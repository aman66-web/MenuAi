// One place for names, links and copy shared across the website.
// Change `name` here if you pick a different app name (and update docs/STORE.md to match).
export const site = {
  name: "Numbite",
  appStoreTitle: "Numbite: Calories & Protein",
  tagline: "Know your macros before you order.",
  // what the menus really hold: every item's calories, and protein, carbs and fat where the chain publishes them (about half publish calories only)
  description:
    "Calories for every item at popular UK restaurant chains, with protein, carbs and fat wherever the chain publishes them, and the best order for what you have left today.",
  // The website's own address (bought 2026-10-12). NEXT_PUBLIC_SITE_URL overrides it; menumacros.vercel.app stays as an alias.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://numbite.com",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  // The two store pages: the iPhone app is live in the UK App Store (since 12 November 2026) and the Android app on Google Play (since 22 November 2026).
  // NEXT_PUBLIC_APP_STORE_URL (set in Vercel to the same address) and NEXT_PUBLIC_PLAY_STORE_URL override them; an empty value falls back too.
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL || "https://apps.apple.com/gb/app/numbite-calories-protein/id6822767746",
  playStoreUrl: process.env.NEXT_PUBLIC_PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.amanmarwaha.numbite",
  appleStandardEula: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  privacyLastUpdated: "21 November 2026",
  /** The policy's date on the website and in the Android app, which name the Android app and say the website no longer runs the web app (27 November 2026;
   *  the iPhone app's copy is the 21 November text, so its date stays). */
  privacyLastUpdatedAndroid: "27 November 2026",
} as const;
