import { handleEmailStart } from "@/lib/auth/handlers";
import { authPreflight, authRoute, readJson } from "@/lib/auth/http";

// Email the person a 6-digit sign-in code (Resend, through Supabase's SMTP setting).
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return authRoute(request, async (ctx) => {
    const read = await readJson(request);
    return "result" in read ? read.result : handleEmailStart(read.body, ctx);
  });
}
