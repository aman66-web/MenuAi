import { createHash } from "node:crypto";
import { withJsonBody } from "@/lib/http";
import { anthropicAsk } from "@/lib/recipeAi";
import { handleRecipe, makeLimiter } from "@/lib/recipeHandler";

// Pip's recipe maker. GET says whether it is switched on (ANTHROPIC_API_KEY set); POST asks Pip for a recipe. Nothing is stored: the
// request goes to Anthropic and the answer straight back to the browser (docs/BACKEND.md, the privacy page).

export const maxDuration = 60;

const limiter = makeLimiter();

export function GET() {
  return Response.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // only our own pages may ask (a browser always sends Origin on a POST)
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const who = createHash("sha256").update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`).digest("hex");
  const started = Date.now();
  return withJsonBody(request, (body) =>
    handleRecipe(body, { ask: anthropicAsk(process.env.ANTHROPIC_API_KEY), allow: () => limiter(who), timeLeft: () => maxDuration * 1000 - (Date.now() - started) }),
    48 * 1024, // the pantry list (about 70 products) is bigger than other requests
  );
}
