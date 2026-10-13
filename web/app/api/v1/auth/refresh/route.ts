import { handleRefresh } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson } from "@/lib/auth/http";

// The iPhone app renews its session with the refresh token. (The website renews through /api/v1/auth/session and its cookies.)
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return authRoute(request, async (ctx) => {
    const read = await readJson(request);
    return "result" in read ? read.result : handleRefresh(read.body, ctx);
  });
}
