import { authPreflight } from "@/lib/auth/http";
import { handleGetMe, handlePutMe } from "@/lib/community/handlers";
import { communityRoute } from "@/lib/community/route";

// Who I am in Community (profile, friend code, the badge counts), and choosing a username once. docs/BACKEND.md "Community".
export const OPTIONS = authPreflight;

export async function GET(request: Request) {
  return communityRoute(request, (userId, ctx) => handleGetMe(userId, ctx));
}

export async function PUT(request: Request) {
  return communityRoute(request, (userId, ctx, body) => handlePutMe(userId, body, ctx), { json: true });
}
