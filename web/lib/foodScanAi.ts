import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { EstimateAi, FirstLookAi } from "./foodScanHandler";
import { MAX_ITEMS } from "./mm/foodScan";
import { RECIPE_MODEL } from "./recipeAi";

// Scan food's two AI calls (lib/foodScanHandler.ts decides when). The first look uses Claude Haiku 5.5 (quick and cheap: what is on the plate and how much,
// and the searches for dishes like it). The estimate uses Claude Sonnet 5.5 at high effort with the photo, the first look and the reference dishes (founder
// 2026-11-18: "whatever you think is the most accurate way"); its house rules are a cached system block. Structured output gives the shape; the app checks
// every number (lib/mm/foodScan.ts scanFromAi). The photo is sent as a base64 JPEG; nothing is stored by us. Needs ANTHROPIC_API_KEY in the server environment.

export const SCAN_ESTIMATE_MODEL = "claude-sonnet-5-5";

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });
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
  return async (system, image) => {
    try {
      const res = await c.messages.parse({
        model: RECIPE_MODEL,
        max_tokens: 3000,
        output_config: { effort: "medium", format: zodOutputFormat(firstLookSchema) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [photo(image), { type: "text", text: `What food or drink is in this photo? List at most ${MAX_ITEMS} items.` }] }],
      });
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("scan first look AI", error);
      return { status: "error" };
    }
  };
}

export function anthropicEstimate(apiKey: string | undefined): EstimateAi | null {
  if (!apiKey) return null;
  const c = client(apiKey);
  return async (system, image, user) => {
    try {
      const res = await c.messages.parse({
        model: SCAN_ESTIMATE_MODEL,
        max_tokens: 12000,
        output_config: { effort: "high", format: zodOutputFormat(estimateSchema) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [photo(image), { type: "text", text: user }] }],
      });
      // token counts only (no content), so Vercel's logs show the cost and whether the cache is read
      const u = res.usage;
      console.info(`food scan: ${SCAN_ESTIMATE_MODEL} in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}`);
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("scan estimate AI", error);
      return { status: "error" };
    }
  };
}
