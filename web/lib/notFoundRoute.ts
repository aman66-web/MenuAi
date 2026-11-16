import { handleNotFound } from "./handlers";
import { preflight, withCors } from "./cors";
import { withJsonBody } from "./http";
import type { Store } from "./store";

// POST /api/v1/not-found (app/api/v1/not-found/route.ts), here so the tests can run it with a fake store and the switch either way (tests/notFound.test.ts).
// Answers 404 while RECIPES_ANY_SHOP_ENABLED is off: nothing is written before the founder approves the feature and applies its migration.
export function notFoundPreflight(request: Request): Response {
  return preflight(request);
}

export async function notFoundPost(request: Request, deps: { enabled: boolean; store: Store; ipHash: (request: Request) => string | null }): Promise<Response> {
  if (!deps.enabled) return withCors(request, Response.json({ error: "not_found" }, { status: 404 }));
  return withCors(request, await withJsonBody(request, (body) => handleNotFound(body, { store: deps.store, ipHash: deps.ipHash(request) })));
}
