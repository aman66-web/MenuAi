// Build-time switches for the web app. NEXT_PUBLIC_* values are inlined by Next.js at build time.

/** Fictional sample chains load only in local dev / previews (NODE_ENV !== "production" locally), or when explicitly enabled. */
export const SAMPLES_ENABLED =
  process.env.NEXT_PUBLIC_SHOW_SAMPLE_DATA === "1" || process.env.NODE_ENV !== "production";

/** Lets testers use Pro features without payments. Never enabled implicitly in production. */
export const PRO_PREVIEW_FROM_ENV = process.env.NEXT_PUBLIC_PRO_PREVIEW === "1";
export const DEV_TOOLS_ENABLED = SAMPLES_ENABLED || PRO_PREVIEW_FROM_ENV;

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
