import { authenticate } from "@/lib/auth/handlers";
import { authPreflight, authRoute, syncContext } from "@/lib/auth/http";
import { handleSyncGet } from "@/lib/sync/handlers";

// Everything this signed-in person has synced (one entry per store).
export const OPTIONS = authPreflight;

export async function GET(request: Request) {
  return authRoute(request, async (ctx) => {
    const who = await authenticate(request.headers, ctx);
    if (!who) return { status: 401, body: { error: "unauthorized" } };
    const result = await handleSyncGet(who.user.id, syncContext(request));
    return who.cookies ? { ...result, cookies: who.cookies } : result;
  });
}
