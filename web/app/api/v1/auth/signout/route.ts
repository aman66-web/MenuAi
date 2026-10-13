import { handleSignOut } from "@/lib/auth/handlers";
import { authPreflight, authRoute } from "@/lib/auth/http";

// Sign out: stops the session and clears the cookies. The data stays on this device.
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return authRoute(request, (ctx) => handleSignOut(request.headers, ctx));
}
