import { handleChainRequest } from "@/lib/handlers";
import { preflight, withCors } from "@/lib/cors";
import { ipHash, withJsonBody } from "@/lib/http";
import { supabaseStore } from "@/lib/store-supabase";

// The iPhone app's pages (lib/cors.ts) may call this too.
export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  return withCors(request, await withJsonBody(request, (body) => handleChainRequest(body, { store: supabaseStore, ipHash: ipHash(request) })));
}
