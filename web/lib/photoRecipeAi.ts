import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { RECIPE_MODEL } from "./recipeAi";
import type { AskPhotoRecipe, DescribePhoto } from "./photoRecipeHandler";

// Make it at home's two AI calls (lib/photoRecipeHandler.ts decides when): suggest what the dish in the photo is, and write the home recipe. The same model
// as the recipe maker (Claude Haiku 5.5, founder's choice for recipes: fast and low cost; the app checks the answer and works out every number from the
// labels), with structured output: the recipe's ingredients are limited to the pantry keys this person may use. The photo is sent as a base64 JPEG; nothing is
// stored by us. Needs ANTHROPIC_API_KEY in the server environment.

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: 45_000, maxRetries: 0 });
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
  return async (system, user, image, allowedKeys) => {
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
        model: RECIPE_MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium", format: zodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: [photo(image), { type: "text", text: user }] }],
      });
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("photo recipe AI", error);
      return { status: "error" };
    }
  };
}

export function anthropicDescribePhoto(apiKey: string | undefined): DescribePhoto | null {
  if (!apiKey) return null;
  const c = client(apiKey);
  return async (system, image) => {
    const schema = z.object({ isFood: z.boolean(), description: z.string() });
    try {
      const res = await c.messages.parse({
        model: RECIPE_MODEL,
        max_tokens: 2000,
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: [photo(image), { type: "text", text: "What dish is this?" }] }],
      });
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      logError("describe photo AI", error);
      return { status: "error" };
    }
  };
}
