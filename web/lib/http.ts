import "server-only";
import { createHash } from "node:crypto";
import type { Result } from "./handlers";
import { serverEnv } from "./env";

const MAX_BODY_BYTES = 16 * 1024;

/** Salted one-way hash of the caller's IP (for rate limiting only; cleared after 30 days). */
export function ipHash(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "";
  if (!ip) return null;
  return createHash("sha256").update(`${serverEnv().IP_HASH_SALT}:${ip}`).digest("hex");
}

/**
 * Whether a request says its body is JSON. Every route that reads a body asks for this: a plain HTML form on another site can only send text/plain, form-encoded
 * or multipart bodies without asking first, so this keeps other sites from posting to us in a visitor's name (and sign-in from being forced on them).
 */
export const isJsonRequest = (request: Request): boolean => /^application\/json\s*(?:;|$)/i.test(request.headers.get("content-type")?.trim() ?? "");

/** The answer to a body that doesn't say it is JSON. */
export const NOT_JSON = { status: 415, body: { error: "unsupported_media_type", message: "Send the body as JSON (Content-Type: application/json)." } } as const;

/** Parse a JSON request body (max 16 KB unless a route allows more), then run the handler. Bad bodies get a clear 400/413, and one not sent as JSON a 415. */
export async function withJsonBody(request: Request, run: (body: unknown) => Promise<Result>, maxBytes = MAX_BODY_BYTES): Promise<Response> {
  return safely(async () => {
    if (!isJsonRequest(request)) return { status: NOT_JSON.status, body: { ...NOT_JSON.body } };
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) return { status: 413, body: { error: "too_large" } };
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { status: 400, body: { error: "invalid_json" } };
    }
    return run(body);
  });
}

export function respond(result: Result): Response {
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a handler so unexpected errors become a clean 500 (details go to the Vercel logs). */
export async function safely(run: () => Promise<Result>): Promise<Response> {
  try {
    return respond(await run());
  } catch (error) {
    console.error(error);
    return respond({ status: 500, body: { error: "server_error", message: "Something went wrong. Please try again." } });
  }
}
