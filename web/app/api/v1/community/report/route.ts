import { authPreflight } from "@/lib/auth/http";
import { handleReport } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Report a person or a shopping list they sent. Body: { friendId | listId | blockId, reason, note?, block? }.
export const OPTIONS = authPreflight;

export async function POST(request: Request) {
  return communityRoute(request, (userId, ctx, body) => handleReport(userId, body, ctx), { json: true });
}
