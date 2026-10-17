import { authPreflight } from "@/lib/auth/http";
import { handleMarkRead } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Mark one inbox item read.
export const OPTIONS = authPreflight;

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  return communityRoute(request, (userId, ctx) => handleMarkRead(userId, id, ctx));
}
