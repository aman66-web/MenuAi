// The iPhone app is the web app packed inside an app (docs/APP_BUILD.md). Its pages load from this origin and send reports, chain requests
// and messages to our API on the live website, so those routes answer this one origin with CORS headers. Nothing else is allowed
// cross-origin; the website's own pages are same-origin and don't need it.
export const APP_ORIGIN = "app://menumath";

export function corsHeaders(origin: string | null): Record<string, string> {
  if (origin !== APP_ORIGIN) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** The browser's "may I?" before a cross-origin POST. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

/** The same response, with the app's CORS headers when the app asked. */
export function withCors(request: Request, response: Response): Response {
  for (const [k, v] of Object.entries(corsHeaders(request.headers.get("origin")))) response.headers.set(k, v);
  return response;
}
