import type { Result } from "./handlers";
import { cleanPhrases, helpQuery } from "./mm/searchHelp";
import type { AskHelp } from "./searchHelpAi";

// POST /api/v1/search/help: { q } in, { phrases } out (lib/mm/searchHelp.ts). Answers are kept in memory for a day (the same slip is typed by many people), and
// only a new question counts against the caller's limit. Pure apart from what ctx gives it, so it is unit-tested without the AI.

export interface HelpCtx {
  ask: AskHelp | null;
  allow: () => boolean;
  cache: Map<string, { phrases: string[]; at: number }>;
  now?: () => number;
}

const DAY = 24 * 3600_000;

export async function handleSearchHelp(body: unknown, ctx: HelpCtx): Promise<Result> {
  const q = helpQuery((body as { q?: unknown } | null)?.q);
  if (!q) return { status: 400, body: { error: "bad_request" } };
  if (!ctx.ask) return { status: 503, body: { error: "not_configured" } };
  const key = q.toLowerCase();
  const now = (ctx.now ?? Date.now)();
  const kept = ctx.cache.get(key);
  if (kept && now - kept.at < DAY) return { status: 200, body: { phrases: kept.phrases } };
  if (!ctx.allow()) return { status: 429, body: { error: "too_many" } };
  const r = await ctx.ask(q);
  if (r.status !== "ok") return { status: 502, body: { error: "ai_failed" } };
  const phrases = cleanPhrases(r.phrases, q);
  ctx.cache.set(key, { phrases, at: now });
  if (ctx.cache.size > 2000) ctx.cache.delete(ctx.cache.keys().next().value as string);
  return { status: 200, body: { phrases } };
}
