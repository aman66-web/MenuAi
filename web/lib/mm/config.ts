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
 * Everyone signs in (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"). Until someone is signed in, every app screen shows the
 * sign-in screen (_components/SignInScreen.tsx) instead; the welcome screen and the privacy, terms and support pages stay open. On for the real website and the
 * iPhone app. Off for the browser tests' builds (they turn the sample chains on; NEXT_PUBLIC_SIGN_IN_REQUIRED=1 forces it on there) and with
 * NEXT_PUBLIC_SIGN_IN_REQUIRED=0: the one-line fallback if App Review objects under guideline 5.1.1(v) (sign-in then goes back to being optional).
 */
export const SIGN_IN_REQUIRED =
  process.env.NEXT_PUBLIC_SIGN_IN_REQUIRED === "1" || (process.env.NEXT_PUBLIC_SIGN_IN_REQUIRED !== "0" && !SAMPLES_ENABLED);

/** Flip to true once payments exist (docs/WEB_BUILD_PLAN.md). Until then the paywall is honest about it. */
export const PAYMENTS_ENABLED = false;

/** The iPhone app's build of the web app (npm run build:app): a static copy packed inside the app (docs/APP_BUILD.md). */
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD === "1";

/**
 * Paid access on the website (Stripe Checkout, the "viral and monetisation upgrade" of November 2026). Off unless NEXT_PUBLIC_WEB_PRO=1, and never in
 * the iPhone app's build: App Store guideline 3.1.1 forbids buying digital features there with anything but In-App Purchase. While it is off the
 * website and the app behave exactly as before (every feature free, no wording about Pro, payment or a pass anywhere; tests/prodmode.mjs checks that).
 */
export const WEB_PRO_ENABLED = process.env.NEXT_PUBLIC_WEB_PRO === "1" && !APP_BUILD;

/**
 * Paid access inside the iPhone app through Apple's In-App Purchase (StoreKit). Off unless the app is built with NEXT_PUBLIC_IAP=1 (and only in the
 * app build). Needs the Swift side and the App Store Connect products, which the founder and the Mac session set up (docs/APP_BUILD.md).
 */
export const IAP_ENABLED = process.env.NEXT_PUBLIC_IAP === "1" && APP_BUILD;

/** Paid access exists on this build, by either route. */
export const PAID_ACCESS_ENABLED = WEB_PRO_ENABLED || IAP_ENABLED;

/** Free and paid are told apart on this build: the older Pro machinery (test builds, NEXT_PUBLIC_PRO=1) or real paid access. False = every feature is open to everyone (the free launch). */
export const GATING_ENABLED = PRO_ENABLED || PAID_ACCESS_ENABLED;

/**
 * "Make it at home" (founder 2026-11-16: "take photo of food and add a name to it then it makes the recipe ... using the ingredients from the supermarket";
 * "Only on the premium mode"). A photo (or screenshot) of a dish and the person's description go to Pip, who writes a home recipe from real supermarket
 * products (lib/mm/photoRecipe.ts). Premium only: it exists only on a build where free and paid are told apart (GATING_ENABLED) AND NEXT_PUBLIC_PHOTO_RECIPES=1,
 * so it can never show up free, nor before Premium launches. The API route needs ANTHROPIC_API_KEY as well (and checks the paid token).
 */
export const PHOTO_RECIPES_ENABLED = process.env.NEXT_PUBLIC_PHOTO_RECIPES === "1" && GATING_ENABLED;

/**
 * The iPhone app sells Premium through Apple (version 1.1). True in an In-App Purchase app build; on the website it is set with NEXT_PUBLIC_APP_PREMIUM=1 once that
 * app version is out, so the website's Privacy, Terms and Support pages (the ones the App Store links to) describe Apple purchases, and its API serves the app's
 * paid features. It sells nothing on the website itself.
 */
export const APP_PREMIUM = IAP_ENABLED || (!APP_BUILD && process.env.NEXT_PUBLIC_APP_PREMIUM === "1");

/** Make it at home's two API routes answer with NEXT_PUBLIC_PHOTO_RECIPES=1 (each still needs a paid token and ANTHROPIC_API_KEY, lib/photoRecipeRoute.ts), so the
 *  website can serve the iPhone app's Premium feature while the website itself shows no Make it at home card (that needs GATING_ENABLED too). The privacy page
 *  describes the feature whenever these routes answer. */
export const PHOTO_RECIPES_API_ENABLED = process.env.NEXT_PUBLIC_PHOTO_RECIPES === "1";

/**
 * Scan food (founder 2026-11-18: "a way to scan food at restaurants or wherever the person is and they will get the calories protein fats and also carbs like
 * everything estimated"; "its a premium feature"): a photo of a plate in, an estimate out (lib/mm/foodScan.ts). It rides on Make it at home's switch: both are
 * Premium photo features using the same AI key, so the screen exists only where Make it at home does, and its API route answers wherever Make it at home's do.
 */
export const FOOD_SCAN_ENABLED = PHOTO_RECIPES_ENABLED;
export const FOOD_SCAN_API_ENABLED = PHOTO_RECIPES_API_ENABLED;
/** Where the app build reaches the live website for newer data and the API: absolute, no trailing slash. Empty on the website itself. */
export const REMOTE_BASE = APP_BUILD ? (process.env.NEXT_PUBLIC_REMOTE_BASE ?? "").replace(/\/$/, "") : "";

/**
 * Photos in the iPhone app come from the website, not from inside the app (founder 2026-11-17: "when the user downloads the app it shouldn't use excessive
 * storage"): dish, recipe and stored product photos are about 125 MB, so the app's build leaves them out (scripts/pack_app_web.py, web/app-content.json
 * "remoteImages") and loads each one from the live site the first time it is shown; the phone keeps it in the web view's cache. Offline, a photo not yet
 * seen shows the usual plain tile. NEXT_PUBLIC_APP_REMOTE_IMAGES=0 packs them in again.
 */
export const REMOTE_IMAGES = APP_BUILD && !!REMOTE_BASE && process.env.NEXT_PUBLIC_APP_REMOTE_IMAGES !== "0";
/** A photo's address: the site's own path on the website and in a packed app, the live site's address when the app loads photos from it. */
export const assetUrl = (path: string): string => (REMOTE_IMAGES && path.startsWith("/") && !path.startsWith("//") ? `${REMOTE_BASE}${path}` : path);

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
