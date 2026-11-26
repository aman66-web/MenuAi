import { preflight, withCors } from "@/lib/cors";
import { isJsonRequest, NOT_JSON } from "@/lib/http";
import { anthropicPip } from "@/lib/askPipAi";
import { siteData } from "@/lib/askPipData";
import { makePipLimiter, prepareAskPip, runAskPip, type AskPipCtx } from "@/lib/askPipHandler";
import { ASK_PIP_API_ENABLED, type PipEvent } from "@/lib/mm/askPip";
import { fromUs, limitedCaller, notFound, PHOTO_CORS } from "@/lib/photoRecipeRoute";

// Ask Pip (lib/askPipHandler.ts): the conversation's newest turns, the person's targets, diet and shops, and their diary, saved recipes and plan in; Pip's
// checked words, what he is looking at and his cards out, as a stream of JSON lines. Premium only (the paid token in the Authorization header), counted per
// token (else per hashed address): ASK_PIP_DAILY_LIMIT messages a day. Off unless NEXT_PUBLIC_ASK_PIP=1. Nothing is stored.

// a few rounds of tool calls on Sonnet at low effort; the model call itself stops at 50 s
export const maxDuration = 60;

const limit = makePipLimiter();
const MAX_BODY = 48 * 1024;

const json = (request: Request, status: number, body: Record<string, unknown>) =>
  withCors(request, Response.json(body, { status, headers: { "Cache-Control": "no-store" } }), PHOTO_CORS);

export function OPTIONS(request: Request) {
  return preflight(request, PHOTO_CORS);
}

export async function POST(request: Request) {
  if (!ASK_PIP_API_ENABLED) return notFound(request);
  if (!fromUs(request)) return json(request, 403, { error: "forbidden" });
  if (!isJsonRequest(request)) return json(request, NOT_JSON.status, { ...NOT_JSON.body });
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY) return json(request, 413, { error: "too_large" });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json(request, 400, { error: "invalid_json" }); }

  const id = limitedCaller(request);
  const ctx: AskPipCtx = {
    model: anthropicPip(process.env.ANTHROPIC_API_KEY),
    data: siteData(new URL(request.url).origin),
    premium: id.premium,
    take: () => limit.take(id.who()),
    giveBack: () => limit.release(id.who()),
    signal: request.signal,
  };
  const ready = await prepareAskPip(body, ctx);
  if ("status" in ready) return json(request, ready.status, { error: ready.error, message: ready.message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: PipEvent) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`)); } catch { /* the phone went away */ }
      };
      await runAskPip(ready.req, ready.left, ctx, emit);
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return withCors(request, new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  }), PHOTO_CORS);
}
