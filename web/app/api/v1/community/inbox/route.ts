import { authPreflight } from "@/lib/auth/http";
import { handleGetInbox } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// My inbox: the shopping lists friends sent me (30 days).
export const OPTIONS = authPreflight;

export async function GET(request: Request) {
  return communityRoute(request, (userId, ctx) => handleGetInbox(userId, ctx));
}
