import { handleExchange } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson } from "@/lib/auth/http";

// The iPhone app swaps the one-time code from numbite://auth?code=... (plus its PKCE verifier) for the session.
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return authRoute(request, async (ctx) => {
    const read = await readJson(request);
    return "result" in read ? read.result : handleExchange(read.body, ctx);
  });
}
