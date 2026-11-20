import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MAX_REASONS, REASON_KEYS } from "./mm/comparePick";
import { RECIPE_MODEL } from "./recipeAi";
import type { AskPick } from "./comparePickHandler";

// Pip's pick: the one AI call (lib/comparePickHandler.ts decides when). The same model as the recipe maker (Claude Opus 5.5 since 2026-11-20; earlier Claude Haiku 5.5, the founder's choice for this kind of
// work: fast and cheap), structured output, so the answer is a pick, one sentence and reason keys and nothing else. The call sends the two products' names and figures,
// the goal and the diet words, nothing about the person; nothing is kept by Anthropic's side beyond its own handling, and the answer is kept by us so it is made once.
// Needs ANTHROPIC_API_KEY in the server environment.

export const PICK_MODEL = RECIPE_MODEL;

export function anthropicPick(apiKey: string | undefined): AskPick | null {
  if (!apiKey) return null;
  const c = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 0 });
  const schema = z.object({
    pick: z.enum(["first", "second", "tie"]),
    sentence: z.string(),
    reasons: z.array(z.enum(REASON_KEYS)).max(MAX_REASONS),
  });
  return async (system, user) => {
    try {
      const res = await c.messages.parse({
        model: PICK_MODEL,
        max_tokens: 4000, // room for Opus's thinking before the answer
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) console.error("compare pick AI: rate limited");
      else if (error instanceof Anthropic.APIError) console.error(`compare pick AI: ${error.status} ${error.message}`);
      else console.error("compare pick AI:", error);
      return { status: "error" };
    }
  };
}
