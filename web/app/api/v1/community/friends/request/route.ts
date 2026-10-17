import { authPreflight } from "@/lib/auth/http";
import { handleFriendRequest } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Ask for a friendship with the owner of a friend code. Body: { code }.
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return communityRoute(request, (userId, ctx, body) => handleFriendRequest(userId, body, ctx), { json: true });
}
