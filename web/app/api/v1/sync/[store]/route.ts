import { authenticate } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson, syncContext } from "@/lib/auth/http";
import { handleSyncPut, MAX_SYNC_BODY_BYTES } from "@/lib/sync/handlers";

// Merge what a device sends for one store into the stored copy, and return the merged store (lib/mm/syncMerge.ts has the rules).
export const OPTIONS = authPreflight;

export async function PUT(request: Request, route: RouteContext<"/api/v1/sync/[store]">) {
  const { store } = await route.params;
  return authRoute(request, async (ctx) => {
    const who = await authenticate(request.headers, ctx);
    if (!who) return { status: 401, body: { error: "unauthorized" } };
    const read = await readJson(request, MAX_SYNC_BODY_BYTES);
    if ("result" in read) return read.result;
    const result = await handleSyncPut(store, read.body, who.user.id, syncContext(request));
    return who.cookies ? { ...result, cookies: who.cookies } : result;
  });
}
