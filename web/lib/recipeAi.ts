import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AskPip } from "./recipeHandler";

// The one place the app talks to an AI model: Pip writing a recipe (lib/recipeHandler.ts decides when). Needs ANTHROPIC_API_KEY in the
// server environment (Vercel › Settings › Environment Variables); without it the recipe maker says it isn't switched on yet.
// Claude Opus 5.5 at low effort (the app fits the amounts afterwards, so the model only has to choose sensible ingredients and words),
// structured output limited to the pantry keys this person may use, and Anthropic's server-side fallback for a declined request.

export const RECIPE_MODEL = "claude-opus-5-5";

export function anthropicAsk(apiKey: string | undefined): AskPip | null {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: 40_000, maxRetries: 0 });
  return async (system, user, allowedKeys) => {
    const schema = z.object({
      name: z.string(),
      blurb: z.string(),
      servings: z.number().int(),
      minutes: z.number().int(),
      ingredients: z.array(z.object({ key: z.enum(allowedKeys as [string, ...string[]]), amount: z.number(), role: z.enum(["protein", "carb", "other"]) })),
      method: z.array(z.string()),
      extras: z.array(z.string()),
    });
    try {
      const res = await client.beta.messages.parse({
        model: RECIPE_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal") return { status: "refused" };
      if (!res.parsed_output) return { status: "error" };
      return { status: "ok", recipe: res.parsed_output };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) console.error("recipe AI: rate limited");
      else if (error instanceof Anthropic.APIError) console.error(`recipe AI: ${error.status} ${error.message}`);
      else console.error("recipe AI:", error);
      return { status: "error" };
    }
  };
}
