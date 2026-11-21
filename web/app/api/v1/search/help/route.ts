import { createHash } from "node:crypto";
import { preflight, withCors, fromUs } from "@/lib/cors";
import { withJsonBody } from "@/lib/http";
import { SEARCH_HELP_ENABLED } from "@/lib/mm/searchHelp";
import { makeLimiter } from "@/lib/recipeHandler";
import { anthropicHelp } from "@/lib/searchHelpAi";
import { handleSearchHelp } from "@/lib/searchHelpHandler";

// Pip's search help (lib/mm/searchHelp.ts): the typed words in, up to three search phrases out. Only the words are sent to the AI; the caller is told apart by a
// one-way scramble of the IP address, for the limit only (10 new questions in ten minutes, 60 a day), never stored.

export const maxDuration = 30;

const limit = makeLimiter(10, 60);
const cache = new Map<string, { phrases: string[]; at: number }>();

const refuse = (request: Request, status: number, error: string) =>
  withCors(request, Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }));

function caller(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex");
}

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  if (!SEARCH_HELP_ENABLED) return refuse(request, 404, "not_found");
  if (!fromUs(request)) return refuse(request, 403, "forbidden");
  const who = caller(request);
  const res = await withJsonBody(request, (body) => handleSearchHelp(body, { ask: anthropicHelp(process.env.ANTHROPIC_API_KEY), allow: () => limit(who), cache }), 2 * 1024);
  return withCors(request, res);
}
