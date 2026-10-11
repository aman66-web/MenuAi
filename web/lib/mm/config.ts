// Build-time switches for the web app. NEXT_PUBLIC_* values are inlined by Next.js at build time.

/** Fictional sample chains load only in local dev / previews (NODE_ENV !== "production" locally), or when explicitly enabled. */
export const SAMPLES_ENABLED =
  process.env.NEXT_PUBLIC_SHOW_SAMPLE_DATA === "1" || process.env.NODE_ENV !== "production";

/** Lets testers use Pro features without payments. Never enabled implicitly in production. */
export const PRO_PREVIEW_FROM_ENV = process.env.NEXT_PUBLIC_PRO_PREVIEW === "1";
export const DEV_TOOLS_ENABLED = SAMPLES_ENABLED || PRO_PREVIEW_FROM_ENV;

/**
 * Founder 2026-10-11: "It should be pro. But right now I need all the features free so I can test them." While this is on, every Pro
 * feature is open to everyone (no paywall, nothing charged; Pro stays defined exactly as before). Switch it off before launch by setting
 * it to false here, or build with NEXT_PUBLIC_ALL_FREE=0 (the browser tests build that way so they still check the paywall).
 */
export const ALL_FREE_FOR_TESTING = process.env.NEXT_PUBLIC_ALL_FREE !== "0";

/** Flip to true once web payments exist (docs/WEB_BUILD_PLAN.md). Until then the paywall is honest about it. */
export const PAYMENTS_ENABLED = false;

export const APP_VERSION = "web 1.0";
export const API_BASE = "/api/v1/";
export const FREE_SAVED_ORDER_LIMIT = 3;
export const NEW_ITEM_DAYS = 30;

export const MENU_SOURCES: ReadonlyArray<{ id: "release" | "sample"; baseUrl: string }> = [
  { id: "release", baseUrl: "/menus/" },
  ...(SAMPLES_ENABLED ? ([{ id: "sample", baseUrl: "/menus-sample/" }] as const) : []),
];
