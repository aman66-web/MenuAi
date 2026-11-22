// The iPhone and Android apps are the web app packed inside an app (docs/APP_BUILD.md, docs/ANDROID_BRIDGE.md). Their pages load from these origins and send reports, chain
// requests and messages to our API on the live website, so those routes answer exactly these two origins with CORS headers. Nothing else is allowed
// cross-origin; the website's own pages are same-origin and don't need it.
/** The iPhone app's pages (its scheme handler). */
export const APP_ORIGIN = "app://menumath";
/** The Android app's pages (WebViewAssetLoader serves the packed web app from the app's assets at this address). */
export const ANDROID_APP_ORIGIN = "https://appassets.androidplatform.net";
/** Every origin an app's pages come from: an exact list, never a pattern. */
export const APP_ORIGINS: readonly string[] = [APP_ORIGIN, ANDROID_APP_ORIGIN];

/** Whether the request came from one of the apps' own pages (an exact match: the browser's Origin header is `scheme://host`). */
export const isAppOrigin = (origin: string | null): origin is string => origin !== null && APP_ORIGINS.includes(origin);

/** The store an app sells through, for the answer to a request that tried to pay another way ("Purchases in the app use ..."). */
export const storeOfApp = (origin: string | null): string => (origin === ANDROID_APP_ORIGIN ? "Google Play" : "the App Store");

/** What a route lets the app do. Reports, requests and messages are POST only; the sign-in and sync routes (docs/ACCOUNTS_SYNC.md) also use
 *  GET, PUT and DELETE and carry the app's session in an Authorization header. */
export interface CorsOptions {
  methods: string;
  headers: string;
}
const POST_ONLY: CorsOptions = { methods: "POST, OPTIONS", headers: "Content-Type" };
export const ACCOUNT_CORS: CorsOptions = { methods: "GET, POST, PUT, DELETE, OPTIONS", headers: "Content-Type, Authorization" };

export function corsHeaders(origin: string | null, options: CorsOptions = POST_ONLY): Record<string, string> {
  if (!isAppOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": options.methods,
    "Access-Control-Allow-Headers": options.headers,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** The browser's "may I?" before a cross-origin POST. */
export function preflight(request: Request, options: CorsOptions = POST_ONLY): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin"), options) });
}

/** The same response, with the app's CORS headers when an app asked. */
export function withCors(request: Request, response: Response, options: CorsOptions = POST_ONLY): Response {
  for (const [k, v] of Object.entries(corsHeaders(request.headers.get("origin"), options))) response.headers.set(k, v);
  return response;
}

/** Only our own pages (same host) and the apps may ask: a browser always sends Origin on a POST. */
export function fromUs(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (isAppOrigin(origin)) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
