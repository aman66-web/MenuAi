import { ipHash } from "@/lib/http";
import { RECIPES_ANY_SHOP_ENABLED } from "@/lib/mm/config";
import { notFoundPost, notFoundPreflight } from "@/lib/notFoundRoute";
import { supabaseStore } from "@/lib/store-supabase";

// "Couldn't find this at {shop}?" from a recipe's Swap (docs/RECIPES_ANY_SUPERMARKET_REPORT.md). Write-only, like the other reports; the founder reads the counts in
// Supabase (view not_found_counts). Answers 404 while RECIPES_ANY_SHOP_ENABLED is off (lib/notFoundRoute.ts). The iPhone app's pages (lib/cors.ts) may call this too.
export function OPTIONS(request: Request) {
  return notFoundPreflight(request);
}

export function POST(request: Request) {
  return notFoundPost(request, { enabled: RECIPES_ANY_SHOP_ENABLED, store: supabaseStore, ipHash });
}
