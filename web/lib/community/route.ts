import "server-only";
import { COMMUNITY_FRIENDS_ENABLED } from "../mm/config";
import { authenticate, type HttpResult } from "../auth/handlers";
import { authRoute, communityContext, readJson } from "../auth/http";
import type { CommunityCtx } from "./handlers";

/**
 * Run a Community handler for a signed-in caller: the same sign-in check, cookies/Bearer, CORS and clean 500 as /api/v1/sync (lib/auth/http.ts), then the
 * handler with the caller's user id. A caller who isn't signed in gets 401 before anything is read. `json: true` reads the (small) JSON body first.
 * While Community's friends are switched off (lib/mm/config.ts COMMUNITY_FRIENDS_ENABLED, off since 18 November 2026) every route answers 404 before anyone
 * is even signed in: nothing in the app calls them, and nothing new is kept.
 */
export function communityRoute(
  request: Request,
  run: (userId: string, ctx: CommunityCtx, body: unknown) => Promise<HttpResult>,
  options: { json?: boolean } = {},
): Promise<Response> {
  return authRoute(request, async (auth) => {
    if (!COMMUNITY_FRIENDS_ENABLED) return { status: 404, body: { error: "not_found" } };
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
