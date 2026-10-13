// The iPhone app is the web app packed inside an app (docs/APP_BUILD.md). Its pages load from this origin and send reports, chain requests
// and messages to our API on the live website, so those routes answer this one origin with CORS headers. Nothing else is allowed
// cross-origin; the website's own pages are same-origin and don't need it.
export const APP_ORIGIN = "app://menumath";

/** What a route lets the app do. Reports, requests and messages are POST only; the sign-in and sync routes (docs/ACCOUNTS_SYNC.md) also use
 *  GET, PUT and DELETE and carry the app's session in an Authorization header. */
export interface CorsOptions {
  methods: string;
  headers: string;
}
const POST_ONLY: CorsOptions = { methods: "POST, OPTIONS", headers: "Content-Type" };
export const ACCOUNT_CORS: CorsOptions = { methods: "GET, POST, PUT, DELETE, OPTIONS", headers: "Content-Type, Authorization" };

export function corsHeaders(origin: string | null, options: CorsOptions = POST_ONLY): Record<string, string> {
  if (origin !== APP_ORIGIN) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": APP_ORIGIN,
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

/** The same response, with the app's CORS headers when the app asked. */
export function withCors(request: Request, response: Response, options: CorsOptions = POST_ONLY): Response {
  for (const [k, v] of Object.entries(corsHeaders(request.headers.get("origin"), options))) response.headers.set(k, v);
  return response;
}
