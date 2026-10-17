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

/**
 * Friends and shopping lists sent to a friend (Community, founder 2026-10-16). On unless NEXT_PUBLIC_COMMUNITY_FRIENDS=0: the switch is for shipping the app
 * BEFORE the database tables exist (supabase/migrations/20261016120000_community.sql is applied by the founder, never by us). While it is off the hub's
 * Friends and Shared with you cards, the Send to a friend button and the tab bar's badge are hidden and nothing asks the server about Community. The food
 * blogs never depend on it.
 */
/**
 * The app is English only (founder 2026-10-16: "lets just leave the app in only english"). While this is false there is no language screen in
 * onboarding and no Language row in Settings, and any language stored on the phone or synced from an account shows English. The ten
 * dictionaries in lib/mm/locales stay in the repository, so switching this back on is the whole change to bring languages back.
 */
export const LANGUAGES_ENABLED = false;

export const COMMUNITY_FRIENDS_ENABLED = process.env.NEXT_PUBLIC_COMMUNITY_FRIENDS !== "0";

/**
 * FOUNDER TO DECIDE (2026-10-16, "swap an ingredient for a product from another supermarket"). May a recipe add up Open Food Facts contributors' numbers
 * ("community data") for a product from another supermarket? false (the shipped default): a recipe uses only labels printed on a supermarket's own product
 * page, so a product at another shop is offered only with the label of the very same barcode from the recipe shop's own page, and community numbers are
 * refused everywhere in the recipe engine. true: the same barcode's community record from that shop's catalogue is also allowed, marked "Community data"
 * wherever it shows. NEXT_PUBLIC_RECIPE_COMMUNITY=1 turns it on at build time (the browser tests do); production stays false until the founder says.
 */
export const RECIPE_COMMUNITY_NUMBERS = process.env.NEXT_PUBLIC_RECIPE_COMMUNITY === "1";

/** Flip to true once payments exist (docs/WEB_BUILD_PLAN.md). Until then the paywall is honest about it. */
export const PAYMENTS_ENABLED = false;

/** The iPhone app's build of the web app (npm run build:app): a static copy packed inside the app (docs/APP_BUILD.md). */
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD === "1";
/** Where the app build reaches the live website for newer data and the API: absolute, no trailing slash. Empty on the website itself. */
export const REMOTE_BASE = APP_BUILD ? (process.env.NEXT_PUBLIC_REMOTE_BASE ?? "").replace(/\/$/, "") : "";

/** The chains' own item photos (CLAUDE.md rule 2). The iPhone app's build can leave them out (web/app-content.json, docs/APP_BUILD.md). */
export const MENU_PHOTOS_ENABLED = process.env.NEXT_PUBLIC_MENU_PHOTOS !== "0";
/** The chains' and supermarkets' own logo files. The iPhone app can be built without them (web/app-content.json "appLogos": false → NEXT_PUBLIC_APP_LOGOS=0): chains then show our own
 *  cuisine icons and shops their plain-text names. Off is the safest answer to App Review 5.2.1 (third-party trademarks); on is the founder's accepted-risk decision (CLAUDE.md rule 2). */
export const LOGOS_ENABLED = process.env.NEXT_PUBLIC_APP_LOGOS !== "0";

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
