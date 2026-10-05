import { handleReport } from "@/lib/handlers";
import { ipHash, withJsonBody } from "@/lib/http";
import { supabaseStore } from "@/lib/store-supabase";

export async function POST(request: Request) {
  return withJsonBody(request, (body) => handleReport(body, { store: supabaseStore, ipHash: ipHash(request) }));
}
