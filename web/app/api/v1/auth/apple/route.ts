import { handleAppleNative } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson } from "@/lib/auth/http";

// Native Sign in with Apple (the iPhone's own sheet): the app posts Apple's identity token and gets our session back.
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return authRoute(request, async (ctx) => {
    const read = await readJson(request);
    return "result" in read ? read.result : handleAppleNative(read.body, ctx);
  });
}
