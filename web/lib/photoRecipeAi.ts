import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { RECIPE_MODEL } from "./recipeAi";
import type { AskFridgeRecipe } from "./fridgeRecipeHandler";
import type { AskPhotoRecipe, DescribePhoto } from "./photoRecipeHandler";

// Make it at home's two AI calls (lib/photoRecipeHandler.ts decides when): check the photo shows food (and say what it is), and write the home recipe.
// The food check uses Claude Opus 5.5 at low effort. The recipe uses Claude Opus 5.5 at high effort (both Opus since 2026-11-20) (founder 2026-11-17, "Sonnet with
// caching", after a 10-dish test against Haiku: docs/MODEL_COMPARISON_2026-11-17.md), with the system prompt and the shop's ingredient list as two cached system
// blocks (prompt caching: the same for everyone at that shop with that diet), then the photo and what the person asked for. Structured output limits the
// ingredients to the pantry keys this person may use; the app checks the answer and works out every number from the labels. The photo is sent as a base64
// JPEG; nothing is stored by us. Needs ANTHROPIC_API_KEY in the server environment.
// Anything the SDK throws (an API error such as the monthly spending cap or an outage, a rate limit, no connection, a timeout) is "unavailable", so the screen
// says Pip can't do this right now instead of blaming the photo or the words (the 20 November 2026 audit); an answer that can't be read is "error". `limitMs`:
// the handler's time left for this call, so a slow answer stops in time for the route to say so (instead of the platform cutting it off with no words of ours).

/** The model that writes the recipe (the food check uses RECIPE_MODEL; both Claude Opus 5.5 since 2026-11-20). */
export const PHOTO_RECIPE_MODEL = "claude-opus-5-5"; // founder 2026-11-20: Opus for every AI feature

function client(apiKey: string): Anthropic {
  // up to 75 s an answer: the recipe is asked for at high effort (founder 2026-11-17: "I don't mind how long this takes ... we need to ensure that the recipe is really good")
  return new Anthropic({ apiKey, timeout: 140_000, maxRetries: 0 }); // under the routes' 150 s
}

function logError(where: string, error: unknown): void {
  if (error instanceof Anthropic.RateLimitError) console.error(`${where}: rate limited`);
  else if (error instanceof Anthropic.APIError) console.error(`${where}: ${error.status} ${error.message}`);
  else console.error(`${where}:`, error);
}

const photo = (data: string) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } });

export function anthropicPhotoRecipe(apiKey: string | undefined): AskPhotoRecipe | null {
  if (!apiKey) return null;
  const c = client(apiKey);
  return async (system, user, image, allowedKeys, pantry, limitMs) => {
    const schema = z.object({
      name: z.string(),
      blurb: z.string(),
      servings: z.number().int(),
      minutes: z.number().int(),
      ingredients: z.array(z.object({ key: z.enum(allowedKeys as [string, ...string[]]), amount: z.number(), role: z.enum(["protein", "carb", "other"]) })),
      method: z.array(z.string()),
    });
    try {
      const res = await c.messages.parse({
        model: PHOTO_RECIPE_MODEL,
        max_tokens: 16000,
        output_config: { effort: "high", format: zodOutputFormat(schema) },
        // two cache breakpoints: the house rules (the same for every request) and the shop's ingredient list (the same for everyone at that shop with that
        // diet); the photo and the person's words come after them, so they never break the cached part
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
          { type: "text", text: pantry, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: [photo(image), { type: "text", text: user }] }],
      }, limitMs ? { timeout: limitMs } : undefined);
      // token counts only (no content), so Vercel's logs show whether the cache is being read (docs/PROGRESS.md 2026-11-17)
      const u = res.usage;
      console.info(`photo recipe: ${PHOTO_RECIPE_MODEL} in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}`);
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("photo recipe AI", error);
      return { status: "unavailable" };
    }
  };
}

export function anthropicDescribePhoto(apiKey: string | undefined): DescribePhoto | null {
  if (!apiKey) return null;
  const c = client(apiKey);
  return async (system, image, limitMs) => {
    // where the food is, so the app can show the dish and not the rest of the photo (lib/mm/photoRecipe.ts cleanFoodBox, foodCrop)
    const schema = z.object({ isFood: z.boolean(), description: z.string(), food: z.object({ left: z.number(), top: z.number(), width: z.number(), height: z.number() }).nullable() });
    try {
      const res = await c.messages.parse({
        model: RECIPE_MODEL,
        max_tokens: 6000, // room for Opus's short thinking before the answer
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: [photo(image), { type: "text", text: "What dish is this?" }] }],
      }, limitMs ? { timeout: limitMs } : undefined);
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("describe photo AI", error);
      return { status: "unavailable" };
    }
  };
}

/** Cook with what you have (lib/fridgeRecipeHandler.ts): the same model, effort, caching and checks as the photo recipe, with no photo, and "fromHome" (the keys of
 *  what the person already has) in the answer. */
export function anthropicFridgeRecipe(apiKey: string | undefined): AskFridgeRecipe | null {
  if (!apiKey) return null;
  const c = client(apiKey);
  return async (system, user, allowedKeys, pantry, limitMs) => {
    const key = z.enum(allowedKeys as [string, ...string[]]);
    const schema = z.object({
      name: z.string(),
      blurb: z.string(),
      servings: z.number().int(),
      minutes: z.number().int(),
      ingredients: z.array(z.object({ key, amount: z.number(), role: z.enum(["protein", "carb", "other"]) })),
      method: z.array(z.string()),
      fromHome: z.array(key),
    });
    try {
      const res = await c.messages.parse({
        model: PHOTO_RECIPE_MODEL,
        max_tokens: 16000,
        output_config: { effort: "high", format: zodOutputFormat(schema) },
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
          { type: "text", text: pantry, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: user }],
      }, limitMs ? { timeout: limitMs } : undefined);
      const u = res.usage;
      console.info(`fridge recipe: ${PHOTO_RECIPE_MODEL} in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}`);
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("fridge recipe AI", error);
      return { status: "unavailable" };
    }
  };
}
