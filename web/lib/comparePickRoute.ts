import "server-only";
import { createHash } from "node:crypto";
import { anthropicPick, PICK_MODEL } from "./comparePickAi";
import type { PickCtx } from "./comparePickHandler";
import { COMPARE_PICK_ENABLED } from "./mm/comparePick";
import { makeLimiter } from "./recipeHandler";
import { supabaseComparePicks } from "./store-supabase-compare";

// What Pip's pick route needs from the server: the AI call (only with ANTHROPIC_API_KEY), the kept answers and a limit per caller. Only a miss in the kept answers
// counts against the limit (lib/comparePickHandler.ts): 8 new pairs in ten minutes and 40 a day.

const limit = makeLimiter(8, 40);

function caller(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex");
}

export function pickCtx(request: Request, deadlineMs: number): PickCtx {
  const who = caller(request);
  const started = Date.now();
  return {
    ask: COMPARE_PICK_ENABLED ? anthropicPick(process.env.ANTHROPIC_API_KEY) : null,
    cache: COMPARE_PICK_ENABLED ? supabaseComparePicks : null,
    model: PICK_MODEL,
    allow: () => limit(who),
    timeLeft: () => deadlineMs - (Date.now() - started),
  };
}
