import { handleOAuthCallback } from "@/lib/auth/handlers";
import { authRoute } from "@/lib/auth/http";

// Where Supabase sends the browser back after Google or Apple (https://numbite.com/auth/callback is on its Redirect URLs list).
// Finishes the sign-in: the session cookies and on to the app (website), or numbite://auth?code=... (iPhone). Not part of the app's own build.
export async function GET(request: Request) {
  return authRoute(request, (auth) => handleOAuthCallback(new URL(request.url).searchParams, request.headers.get("cookie"), auth), false);
}
