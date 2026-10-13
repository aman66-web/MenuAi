import { handleOAuthStart } from "@/lib/auth/handlers";
import { authRoute } from "@/lib/auth/http";

// Start Continue with Google / Sign in with Apple on the web: sets the PKCE cookie and sends the browser to Supabase.
// `?mode=app&challenge=...` is the iPhone app's version (it finishes on numbite://auth). A browser navigation, so no CORS.
export async function GET(request: Request, route: { params: Promise<{ provider: string }> }) {
  const { provider } = await route.params;
  return authRoute(request, (auth) => handleOAuthStart(provider, new URL(request.url).searchParams, auth), false);
}
