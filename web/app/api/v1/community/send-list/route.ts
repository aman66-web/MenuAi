import { authPreflight } from "@/lib/auth/http";
import { handleSendList } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Send a shopping list to a friend. Body: { friendId, payload } (payload: the share-link code, lib/mm/shareList.ts).
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return communityRoute(request, (userId, ctx, body) => handleSendList(userId, body, ctx), { json: true });
}
