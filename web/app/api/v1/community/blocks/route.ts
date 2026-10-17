import { authPreflight } from "@/lib/auth/http";
import { handleBlock, handleGetBlocks } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// The people I blocked, and blocking someone. Body for POST: { friendId } or { listId }.
export const OPTIONS = authPreflight;

export async function GET(request: Request) {
  return communityRoute(request, (userId, ctx) => handleGetBlocks(userId, ctx));
}

export async function POST(request: Request) {
  return communityRoute(request, (userId, ctx, body) => handleBlock(userId, body, ctx), { json: true });
}
