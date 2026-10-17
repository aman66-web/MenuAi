import { authPreflight } from "@/lib/auth/http";
import { handleDeleteInboxItem } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Delete one inbox item. The id is the item's id from GET /api/v1/community/inbox.
export const OPTIONS = authPreflight;

export async function DELETE(request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  return communityRoute(request, (userId, ctx) => handleDeleteInboxItem(userId, id, ctx));
}
