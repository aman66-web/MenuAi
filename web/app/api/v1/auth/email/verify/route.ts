import { handleEmailVerify } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson } from "@/lib/auth/http";

// Check the 6-digit code: sets the session cookies (website), or returns the session to the iPhone app's own pages (mode "token").
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return authRoute(request, async (ctx) => {
    const read = await readJson(request);
    return "result" in read ? read.result : handleEmailVerify(read.body, ctx);
  });
}
