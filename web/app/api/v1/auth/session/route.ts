import { handleSession } from "@/lib/auth/handlers";
import { authPreflight, authRoute } from "@/lib/auth/http";

// Who is signed in right now (cookie or Authorization header), renewing the website's cookies if the access token has run out.
export const OPTIONS = authPreflight;

export async function GET(request: Request) {
  return authRoute(request, (ctx) => handleSession(request.headers, ctx));
}
