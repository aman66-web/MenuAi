import "server-only";
import { authenticate, type HttpResult } from "../auth/handlers";
import { authRoute, communityContext, readJson } from "../auth/http";
import type { CommunityCtx } from "./handlers";

/**
 * Run a Community handler for a signed-in caller: the same sign-in check, cookies/Bearer, CORS and clean 500 as /api/v1/sync (lib/auth/http.ts), then the
 * handler with the caller's user id. A caller who isn't signed in gets 401 before anything is read. `json: true` reads the (small) JSON body first.
 */
export function communityRoute(
  request: Request,
  run: (userId: string, ctx: CommunityCtx, body: unknown) => Promise<HttpResult>,
  options: { json?: boolean } = {},
): Promise<Response> {
  return authRoute(request, async (auth) => {
    const who = await authenticate(request.headers, auth);
    if (!who) return { status: 401, body: { error: "unauthorized" } };
    let body: unknown;
    if (options.json) {
      const read = await readJson(request);
      if ("result" in read) return read.result;
      body = read.body;
    }
    const result = await run(who.user.id, communityContext(request), body);
    return who.cookies ? { ...result, cookies: who.cookies } : result;
  });
}
