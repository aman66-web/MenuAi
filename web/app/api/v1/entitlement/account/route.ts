import { authenticate } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson } from "@/lib/auth/http";
import { handleAccountEntitlement } from "@/lib/payments/freeWeek";
import { freeWeekContext } from "@/lib/payments/freeWeekRoute";

// POST { deviceToken?, deviceEnv? } -> the signed-in account's own Premium (lib/payments/freeWeek.ts): a gift, or its free week (claimed on the first ask,
// FREE_WEEK_DAYS long, never twice for the same email, Apple ID or iPhone), as { premium: true, token, plan: "gift" | "trial", expiresAt, ... }; otherwise
// { premium: false, freeWeek: "ended" | "device_used" | "no_identity" }. The iPhone app sends the account's session (Authorization: Bearer) and, when it can,
// Apple's DeviceCheck token for this iPhone. 401 when not signed in.
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return authRoute(request, async (auth) => {
    const read = await readJson(request);
    if ("result" in read) return read.result;
    const who = await authenticate(request.headers, auth);
    if (!who) return { status: 401, body: { error: "unauthorized" } };
    const appleSub = who.user.providers?.includes("apple") && auth.port.appleSubject ? await auth.port.appleSubject(who.user.id) : null;
    const result = await handleAccountEntitlement({ userId: who.user.id, email: who.user.email, appleSub }, read.body, freeWeekContext());
    return who.cookies ? { ...result, cookies: who.cookies } : result;
  });
}
