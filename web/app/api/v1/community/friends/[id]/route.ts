import { authPreflight } from "@/lib/auth/http";
import { handleRemoveFriend } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Remove a friend, or take back / turn down a request. The id is the friendship row's id from GET /api/v1/community/friends.
export const OPTIONS = authPreflight;

export async function DELETE(request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  return communityRoute(request, (userId, ctx) => handleRemoveFriend(userId, id, ctx));
}
