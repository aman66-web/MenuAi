import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AskPlan } from "./planAiHandler";
import { RECIPE_MODEL } from "./recipeAi";

// Meal plan with Pip: the one AI call (lib/planAiHandler.ts decides when). Claude Opus 5.5 (founder 2026-11-20: every AI feature on Opus) at medium effort: it
// weighs the person's answers against the week's rules before it answers. Structured output, so the answer is seven lists of recipe ids and a sentence or two
// and nothing else; the handler checks every id against the lists it sent. The system prompt is the same for everyone (cached when long enough). Anything the
// SDK throws (the monthly spending cap, an outage, a rate limit, a timeout) is "unavailable": the phone then keeps its own week. Needs ANTHROPIC_API_KEY.

export const PLAN_MODEL = RECIPE_MODEL;

export function anthropicPlan(apiKey: string | undefined): AskPlan | null {
  if (!apiKey) return null;
  const c = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 0 }); // under the route's 120 s
  const schema = z.object({ days: z.array(z.array(z.string())), why: z.string() });
  return async (system, user, limitMs) => {
    try {
      const res = await c.messages.parse({
        model: PLAN_MODEL,
        max_tokens: 16000, // room for Opus's thinking before the week
        output_config: { effort: "medium", format: zodOutputFormat(schema) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }, limitMs ? { timeout: limitMs } : undefined);
      const u = res.usage;
      console.info(`meal plan: ${PLAN_MODEL} in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}`);
      if (res.stop_reason === "refusal") return { status: "refused" };
      return res.parsed_output ? { status: "ok", value: res.parsed_output } : { status: "error" };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) console.error("meal plan AI: rate limited");
      else if (error instanceof Anthropic.APIError) console.error(`meal plan AI: ${error.status} ${error.message}`);
      else console.error("meal plan AI:", error);
      return { status: "unavailable" };
    }
  };
}
