// The Google Play names the page, the app and our server must agree on (docs/ANDROID_BRIDGE.md). No imports, so the page and the server can both use it (lib/payments/google.ts
// is server-only: it signs with node:crypto).

/** Our Android app's package name (the default of GOOGLE_PLAY_PACKAGE_NAME on the server). */
export const GOOGLE_PACKAGE_NAME = "com.amanmarwaha.numbite";
/** The one subscription in Play Console; its two base plans are the two ways to pay. No free-trial offer on it: the free week is the account's own (lib/payments/freeWeek.ts). */
export const GOOGLE_SUBSCRIPTION_ID = "com.amanmarwaha.numbite.premium";
/** The base plans of that subscription (Play Console: `annual` £49.99 a year, `monthly` £4.99 a month). */
export const GOOGLE_BASE_PLAN_IDS = { annual: "annual", monthly: "monthly" } as const;

/** How the page and the app name a plan: `<subscription id>:<base plan id>`. */
export const googleProductId = (plan: keyof typeof GOOGLE_BASE_PLAN_IDS): string => `${GOOGLE_SUBSCRIPTION_ID}:${GOOGLE_BASE_PLAN_IDS[plan]}`;
