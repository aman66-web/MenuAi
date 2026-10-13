import "server-only";
import { ACCOUNT_CORS, APP_ORIGIN, preflight, withCors } from "../cors";
import { serverEnv } from "../env";
import { ipHash } from "../http";
import { site } from "../../site.config";
import { supabaseUserData } from "../store-supabase";
import type { SyncCtx } from "../sync/handlers";
import type { AuthCtx, HttpResult } from "./handlers";
import { appleConfigFromEnv } from "./apple";
import { makeLimit } from "./limiter";
import { supabaseAuthPort } from "./port-supabase";
import type { AuthPort } from "./types";

// The glue between Next.js route files and the pure handlers: build the context from the request, turn a result into a Response
// (cookies, redirect, no-store, the app's CORS headers), and turn anything unexpected into a clean 500.

let port: AuthPort | null = null;
const limit = makeLimit();

const isLocal = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

export function authContext(request: Request): AuthCtx {
  const env = serverEnv();
  const url = new URL(request.url);
  // Supabase only sends the browser back to the addresses on its allow list (numbite.com); locally we use the address we're served on.
  const origin = isLocal(url.host) ? url.origin : site.url.replace(/\/$/, "");
  const fromHeader = request.headers.get("origin");
  let sameOrigin = false;
  try {
    sameOrigin = fromHeader !== null && new URL(fromHeader).host === url.host;
  } catch {
    sameOrigin = false;
  }
  port ??= supabaseAuthPort({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, apple: appleConfigFromEnv(env) });
  return {
    port,
    secret: env.SUPABASE_SECRET_KEY,
    now: () => Date.now(),
    limit,
    who: ipHash(request) ?? "unknown",
    origin,
    secure: origin.startsWith("https://"),
    method: request.method,
    sameOrigin,
    fromApp: fromHeader === APP_ORIGIN,
  };
}

export function syncContext(request: Request): SyncCtx {
  authContext(request); // same environment checks
  return { data: supabaseUserData, limit, now: () => Date.now() };
}

export function toResponse(result: HttpResult, origin: string): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const c of result.cookies ?? []) headers.append("Set-Cookie", c);
  if (result.redirect) {
    headers.set("Location", result.redirect.startsWith("/") ? `${origin}${result.redirect}` : result.redirect);
    return new Response(null, { status: result.status === 302 ? 302 : result.status, headers });
  }
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(result.body ?? {}), { status: result.status, headers });
}

const failed = () => Response.json({ error: "server_error", message: "Something went wrong. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });

/** Run a sign-in or sync handler for a request. `cors`: the iPhone app's pages may call it (Authorization header allowed). */
export async function authRoute(request: Request, run: (ctx: AuthCtx) => Promise<HttpResult> | HttpResult, cors = true): Promise<Response> {
  let response: Response;
  try {
    const ctx = authContext(request);
    response = toResponse(await run(ctx), ctx.origin);
  } catch (error) {
    console.error(error);
    response = failed();
  }
  return cors ? withCors(request, response, ACCOUNT_CORS) : response;
}

export const authPreflight = (request: Request): Response => preflight(request, ACCOUNT_CORS);

const MAX_BODY_BYTES = 16 * 1024;

/** Read a small JSON body; a bad one becomes a clean 400/413 result instead of a crash. */
export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<{ body: unknown } | { result: HttpResult }> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { result: { status: 413, body: { error: "too_large" } } };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { result: { status: 400, body: { error: "invalid_json" } } };
  }
}
