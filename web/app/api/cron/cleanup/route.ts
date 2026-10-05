import { handleCleanup } from "@/lib/handlers";
import { safely } from "@/lib/http";
import { serverEnv } from "@/lib/env";
import { supabaseStore } from "@/lib/store-supabase";

// Called daily by Vercel Cron (see web/vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  return safely(async () =>
    handleCleanup(request.headers.get("authorization"), serverEnv().CRON_SECRET, { store: supabaseStore, ipHash: null }),
  );
}
