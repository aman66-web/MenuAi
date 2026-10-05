import { handleSupport } from "@/lib/handlers";
import { ipHash, withJsonBody } from "@/lib/http";
import { supabaseStore } from "@/lib/store-supabase";

export async function POST(request: Request) {
  return withJsonBody(request, (body) => handleSupport(body, { store: supabaseStore, ipHash: ipHash(request) }));
}
