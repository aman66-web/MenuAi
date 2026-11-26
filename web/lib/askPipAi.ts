import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ModelUnavailable, PIP_MODEL, type PipModel } from "./askPipHandler";

// Ask Pip's model call (lib/askPipHandler.ts decides when): Claude Sonnet 5.5 (founder's default for the chat, 2026-11-26; the meal plan keeps its own model),
// streamed so the person sees Pip's words as they come, with the tools of lib/askPipTools.ts. Adaptive thinking at low effort: a chat, where a quick first word
// matters more than long thought, and the figures come from the tools anyway. The instructions and the tools are the same for everyone and cached (the first
// system block's cache_control covers tools and instructions); the person's own block follows the cache breakpoint. A refusal on Sonnet 5.5 is retried on the
// server's default fallback model (server-side fallback, beta) where Anthropic allows it. Anything the SDK throws (the monthly spending cap, an outage, a rate
// limit, a timeout) is ModelUnavailable, and the chat says "Pip can't do this right now". Needs ANTHROPIC_API_KEY.

export function anthropicPip(apiKey: string | undefined): PipModel | null {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 }); // under the route's 60 s
  return async ({ system, tools, messages, onText, signal }) => {
    try {
      const stream = client.beta.messages.stream({
        model: PIP_MODEL,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        tools,
        messages,
      }, signal ? { signal } : undefined);
      stream.on("text", (delta) => onText(delta));
      const msg = await stream.finalMessage();
      const u = msg.usage;
      console.info(`ask pip: ${msg.model} in ${u.input_tokens}, cache read ${u.cache_read_input_tokens ?? 0}, cache write ${u.cache_creation_input_tokens ?? 0}, out ${u.output_tokens}, ${msg.stop_reason}`);
      return { content: msg.content, stop: msg.stop_reason ?? "end_turn" };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) console.error("ask pip AI: rate limited");
      else if (error instanceof Anthropic.APIError) console.error(`ask pip AI: ${error.status} ${error.message}`);
      else console.error("ask pip AI:", error);
      throw new ModelUnavailable();
    }
  };
}
