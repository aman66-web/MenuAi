import { authPreflight } from "@/lib/auth/http";
import { handleUnblock } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Unblock. The id is the block's id from GET /api/v1/community/blocks.
export const OPTIONS = authPreflight;

export async function DELETE(request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  return communityRoute(request, (userId, ctx) => handleUnblock(userId, id, ctx));
}
