import "server-only";
import { serverDb } from "../store-supabase";
import type { FreeWeekStore, TrialClaim } from "./freeWeek";

// public.trial_claims and public.premium_gifts through the secret key (supabase/migrations/20261121120000_free_week.sql). Every column name below is a column of
// that migration. Until the founder runs it, every call fails and the route answers 500: the app then changes nothing (no free week, the paywall as before).

interface ClaimRow {
  key_hash: string;
  kind: string;
  claimed_at: string;
  ends_at: string;
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Supabase ${what} failed: ${error?.message ?? "unknown error"}`);
}

const toClaim = (r: ClaimRow): TrialClaim => ({ keyHash: r.key_hash, kind: r.kind === "apple" ? "apple" : "email", claimedAt: Date.parse(r.claimed_at), endsAt: Date.parse(r.ends_at) });

export const supabaseFreeWeek: FreeWeekStore = {
  async findClaims(keyHashes) {
    if (keyHashes.length === 0) return [];
    const { data, error } = await serverDb().from("trial_claims").select("key_hash, kind, claimed_at, ends_at").in("key_hash", keyHashes);
    if (error) fail("read trial_claims", error);
    return ((data ?? []) as ClaimRow[]).map(toClaim);
  },
  async insertClaims(claims) {
    if (claims.length === 0) return;
    const rows = claims.map((c) => ({ key_hash: c.keyHash, kind: c.kind, claimed_at: new Date(c.claimedAt).toISOString(), ends_at: new Date(c.endsAt).toISOString() }));
    // a key already there keeps its own row (on conflict do nothing)
    const { error } = await serverDb().from("trial_claims").upsert(rows, { onConflict: "key_hash", ignoreDuplicates: true });
    if (error) fail("insert trial_claims", error);
  },
  async activeGift(userId, nowMs) {
    const { data, error } = await serverDb().from("premium_gifts").select("until").eq("user_id", userId).or(`until.is.null,until.gt.${new Date(nowMs).toISOString()}`);
    if (error) fail("read premium_gifts", error);
    const rows = (data ?? []) as Array<{ until: string | null }>;
    if (rows.length === 0) return null;
    return rows.some((r) => r.until === null) ? { until: null } : { until: Math.max(...rows.map((r) => Date.parse(r.until as string))) };
  },
};
