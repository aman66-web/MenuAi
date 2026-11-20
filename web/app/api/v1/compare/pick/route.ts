import { preflight, withCors, fromUs } from "@/lib/cors";
import { handleComparePick } from "@/lib/comparePickHandler";
import { pickCtx } from "@/lib/comparePickRoute";
import { withJsonBody } from "@/lib/http";
import { COMPARE_PICK_ENABLED } from "@/lib/mm/comparePick";

// Pip's pick on the Compare screen: two products' or dishes' names and figures, the goal and the diet words in; which one fits the goal, one sentence and reason
// keys out (lib/comparePickHandler.ts). Off unless NEXT_PUBLIC_COMPARE_PICK=1. The answer for a pair is kept (compare_picks) so the AI is asked once per pair.

export const maxDuration = 60; // Opus (20 Nov)

const refuse = (request: Request, status: number, error: string) =>
  withCors(request, Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }));

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  if (!COMPARE_PICK_ENABLED) return refuse(request, 404, "not_found");
  if (!fromUs(request)) return refuse(request, 403, "forbidden");
  const res = await withJsonBody(request, (body) => handleComparePick(body, pickCtx(request, maxDuration * 1000)), 8 * 1024);
  return withCors(request, res);
}
