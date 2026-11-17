import "server-only";
import type { PickCache } from "./comparePickHandler";
import { serverDb } from "./store-supabase";

// Pip's pick, kept answers (supabase/migrations/20261117120000_compare_picks.sql). Written and read only here, through the secret key; RLS is on with no policies.
// The route works before the table exists (the founder runs the migration): any failure, a missing table or a missing database setting included, is a cache miss,
// said once in the log and then left alone.

let said = false;
function once(what: string, message: string): void {
  if (said) return;
  said = true;
  console.warn(`compare picks cache (${what}): ${message}. Answers are not being kept until the table works.`);
}

export const supabaseComparePicks: PickCache = {
  async get(key) {
    try {
      const { data, error } = await serverDb().from("compare_picks").select("pick").eq("key", key).maybeSingle();
      if (error) {
        once("read", error.message);
        return null;
      }
      return data?.pick ?? null;
    } catch (error) {
      once("read", error instanceof Error ? error.message : "failed");
      return null;
    }
  },

  async put(key, pick, model) {
    try {
      // the first answer for a key stays: two people asking at once make one row
      const { error } = await serverDb().from("compare_picks").upsert({ key, pick, model }, { onConflict: "key", ignoreDuplicates: true });
      if (error) once("write", error.message);
    } catch (error) {
      once("write", error instanceof Error ? error.message : "failed");
    }
  },
};
