import { authPreflight } from "@/lib/auth/http";
import { handleGetFriends } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// My friends, the requests waiting for me and the requests I made.
export const OPTIONS = authPreflight;

export async function GET(request: Request) {
  return communityRoute(request, (userId, ctx) => handleGetFriends(userId, ctx));
}
