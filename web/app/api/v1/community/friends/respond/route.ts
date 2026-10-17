import { authPreflight } from "@/lib/auth/http";
import { handleFriendRespond } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Accept or decline a request waiting for me. Body: { id, accept }.
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return communityRoute(request, (userId, ctx, body) => handleFriendRespond(userId, body, ctx), { json: true });
}
