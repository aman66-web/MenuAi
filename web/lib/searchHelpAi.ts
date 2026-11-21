import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MAX_HELP_PHRASES } from "./mm/searchHelp";
import { RECIPE_MODEL } from "./recipeAi";

// Pip's search help: the one AI call. The same model as every other AI feature (Claude Opus 5.5 since 2026-11-20), low effort and a short answer: up to three
// search phrases and nothing else. Only the typed words are sent (nothing about the person). Needs ANTHROPIC_API_KEY in the server environment.

export const SEARCH_HELP_MODEL = RECIPE_MODEL;

export type AskHelp = (typed: string) => Promise<{ status: "ok"; phrases: string[] } | { status: "error" }>;

const SYSTEM = `You help people search a UK app that lists the official nutrition of dishes at UK restaurant and café chains (McDonald's, Nando's, Greggs, Pret, Wagamama, KFC, Subway, Costa and about 240 more).
Someone typed a search that matched nothing, probably because of a spelling slip, a missing or extra space, a nickname or a short form.
Reply with up to ${MAX_HELP_PHRASES} search phrases they most likely meant, best first. Each phrase is a UK chain's name, a dish's name as UK chains name it, or a chain and a dish ("mcdonalds mcchicken"). Fix the spelling. Keep each phrase short (1 to 4 words).
Only suggest real UK chains and dishes. If you can't tell what they meant, reply with an empty list. Never add numbers, advice or anything else.`;

export function anthropicHelp(apiKey: string | undefined): AskHelp | null {
  if (!apiKey) return null;
  const c = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 0 });
  const schema = z.object({ phrases: z.array(z.string()).max(MAX_HELP_PHRASES) });
  return async (typed) => {
    try {
      const res = await c.messages.parse({
        model: SEARCH_HELP_MODEL,
        max_tokens: 1500,
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        system: SYSTEM,
        messages: [{ role: "user", content: `They typed: ${JSON.stringify(typed)}` }],
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) return { status: "error" };
      return { status: "ok", phrases: res.parsed_output.phrases };
    } catch (error) {
      if (error instanceof Anthropic.APIError) console.error(`search help AI: ${error.status} ${error.message}`);
      else console.error("search help AI:", error);
      return { status: "error" };
    }
  };
}
