// Build-time switches for the web app. NEXT_PUBLIC_* values are inlined by Next.js at build time.

/** Fictional sample chains load only in local dev / previews (NODE_ENV !== "production" locally), or when explicitly enabled. */
export const SAMPLES_ENABLED =
  process.env.NEXT_PUBLIC_SHOW_SAMPLE_DATA === "1" || process.env.NODE_ENV !== "production";

/** Lets testers use Pro features without payments. Never enabled implicitly in production. */
export const PRO_PREVIEW_FROM_ENV = process.env.NEXT_PUBLIC_PRO_PREVIEW === "1";
export const DEV_TOOLS_ENABLED = SAMPLES_ENABLED || PRO_PREVIEW_FROM_ENV;

/**
 * Pro (the paid features) is switched off for the free launch. Founder 2026-10-12: "we just make everything free right now, we dont add
 * the ai features and we ship then after its on the app store then we add those extra improvements". While PRO_ENABLED is false, every
 * feature is open to everyone and nothing about Pro, subscriptions or a paywall is shown anywhere (Pro stays defined underneath for when
 * subscriptions arrive). The browser tests build with NEXT_PUBLIC_PRO=1 so they still check the paywall.
 */
export const PRO_ENABLED = process.env.NEXT_PUBLIC_PRO === "1";

/** Pip's AI recipe maker is off for the free launch (same founder message). A constant, not an environment variable, so adding an API key
 *  can't switch it on by accident. Its code stays for later. */
export const AI_RECIPES_ENABLED = false;

/** Flip to true once payments exist (docs/WEB_BUILD_PLAN.md). Until then the paywall is honest about it. */
export const PAYMENTS_ENABLED = false;

/** The iPhone app's build of the web app (npm run build:app): a static copy packed inside the app (docs/APP_BUILD.md). */
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD === "1";
/** Where the app build reaches the live website for newer data and the API: absolute, no trailing slash. Empty on the website itself. */
export const REMOTE_BASE = APP_BUILD ? (process.env.NEXT_PUBLIC_REMOTE_BASE ?? "").replace(/\/$/, "") : "";

/** The chains' own item photos (CLAUDE.md rule 2). The iPhone app's build can leave them out (web/app-content.json, docs/APP_BUILD.md). */
export const MENU_PHOTOS_ENABLED = process.env.NEXT_PUBLIC_MENU_PHOTOS !== "0";

export const APP_VERSION = "web 1.0";
/** Our API (reports, chain requests, messages). The iPhone app reaches it on the live website (lib/cors.ts lets the app's pages call it). */
export const API_BASE = `${REMOTE_BASE}/api/v1/`;
export const FREE_SAVED_ORDER_LIMIT = 3;
export const NEW_ITEM_DAYS = 30;

export const MENU_SOURCES: ReadonlyArray<{ id: "live" | "release" | "sample"; baseUrl: string }> = [
  // the iPhone app asks the live website first (newer menus when online; earlier sources win) and falls back to the menus packed inside it
  ...(APP_BUILD && REMOTE_BASE ? ([{ id: "live", baseUrl: `${REMOTE_BASE}/menus/` }] as const) : []),
  { id: "release", baseUrl: "/menus/" },
  ...(SAMPLES_ENABLED ? ([{ id: "sample", baseUrl: "/menus-sample/" }] as const) : []),
];
