import { authenticate } from "@/lib/auth/handlers";
import { authPreflight, authRoute } from "@/lib/auth/http";
import { handleMine } from "@/lib/payments/handlers";
import { payContext } from "@/lib/payments/route";

// GET -> { token, plan, expiresAt } for the signed-in person's verified email, so paying on the website gives access on every device they sign in on (the iPhone app too).
export const OPTIONS = authPreflight;

export async function GET(request: Request) {
  return authRoute(request, async (auth) => {
    const who = await authenticate(request.headers, auth);
    if (!who) return { status: 401, body: { error: "unauthorized" } };
    const result = await handleMine(who.user.email, payContext(request));
    return who.cookies ? { ...result, cookies: who.cookies } : result;
  });
}
