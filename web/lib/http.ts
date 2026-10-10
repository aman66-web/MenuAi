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

/** Parse a JSON request body (max 16 KB unless a route allows more), then run the handler. Bad bodies get a clear 400/413. */
export async function withJsonBody(request: Request, run: (body: unknown) => Promise<Result>, maxBytes = MAX_BODY_BYTES): Promise<Response> {
  return safely(async () => {
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
