import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { EstimateAi, FirstLookAi } from "./foodScanHandler";
import { MAX_ITEMS } from "./mm/foodScan";
import { RECIPE_MODEL } from "./recipeAi";

// Scan food's two AI calls (lib/foodScanHandler.ts decides when). The first look (what is on the plate and how much,
// and the searches for dishes like it). The estimate uses Claude Opus 5.5 at high effort, as every AI feature does since 2026-11-20, with the photo, the first look and the reference dishes (founder
// 2026-11-18: "whatever you think is the most accurate way"); its house rules are a cached system block. Structured output gives the shape; the app checks
// every number (lib/mm/foodScan.ts scanFromAi). The photo is sent as a base64 JPEG; nothing is stored by us. Needs ANTHROPIC_API_KEY in the server environment.
// Anything the SDK throws (an API error such as the monthly spending cap or an outage, a rate limit, no connection, a timeout) is "unavailable", so the screen
// says Pip can't do this right now instead of blaming the photo (the 20 November 2026 audit); an answer that can't be read is "error". `limitMs`: the handler's
// time left for this call, so a slow answer stops in time for the route to say so (instead of the platform cutting it off with no words of ours).

export const SCAN_ESTIMATE_MODEL = "claude-opus-5-5"; // founder 2026-11-20: Opus for every AI feature (the first look uses RECIPE_MODEL, also Opus)

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: 100_000, maxRetries: 0 });
}

function logError(where: string, error: unknown): void {
  if (error instanceof Anthropic.RateLimitError) console.error(`${where}: rate limited`);
  else if (error instanceof Anthropic.APIError) console.error(`${where}: ${error.status} ${error.message}`);
  else console.error(`${where}:`, error);
}

const photo = (data: string) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } });

const firstLookSchema = z.object({
  isFood: z.boolean(),
  dish: z.string(),
  items: z.array(z.object({ name: z.string(), portion: z.string(), search: z.array(z.string()) })),
});

const estimateSchema = z.object({
  name: z.string(),
  items: z.array(z.object({ name: z.string(), portion: z.string(), kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() })),
  confidence: z.enum(["low", "medium", "high"]),
});

export function anthropicFirstLook(apiKey: string | undefined): FirstLookAi | null {
  if (!apiKey) return null;
  const c = client(apiKey);
  return async (system, image, note, limitMs) => {
    try {
      const res = await c.messages.parse({
        model: RECIPE_MODEL,
        max_tokens: 8000, // room for Opus's thinking before the answer
        output_config: { effort: "medium", format: zodOutputFormat(firstLookSchema) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [photo(image), { type: "text", text: `${note ? `${note}\n\n` : ""}What food or drink is in this photo? List at most ${MAX_ITEMS} items.` }] }],
      }, limitMs ? { timeout: limitMs } : undefined);
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("scan first look AI", error);
      return { status: "unavailable" };
    }
  };
}

export function anthropicEstimate(apiKey: string | undefined): EstimateAi | null {
  if (!apiKey) return null;
  const c = client(apiKey);
  return async (system, image, user, limitMs) => {
    try {
      const res = await c.messages.parse({
        model: SCAN_ESTIMATE_MODEL,
        max_tokens: 12000,
        output_config: { effort: "high", format: zodOutputFormat(estimateSchema) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [photo(image), { type: "text", text: user }] }],
      }, limitMs ? { timeout: limitMs } : undefined);
      // token counts only (no content), so Vercel's logs show the cost and whether the cache is read
      const u = res.usage;
      console.info(`food scan: ${SCAN_ESTIMATE_MODEL} in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}`);
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("scan estimate AI", error);
      return { status: "unavailable" };
    }
  };
}
