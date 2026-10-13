import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store, Table } from "./store";
import { REPORT_PHOTO_BUCKET } from "./store";
import { serverEnv } from "./env";
import type { UserDataStore } from "./sync/handlers";

// Server-side Supabase access using the SECRET key (bypasses RLS). Never import this from a
// client component; the "server-only" import makes the build fail if that happens.

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    const env = serverEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Supabase ${what} failed: ${error?.message ?? "unknown error"}`);
}

export const supabaseStore: Store = {
  async countRecent(table: Table, ipHash: string, sinceIso: string) {
    const { count, error } = await db()
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", sinceIso);
    if (error) fail(`count ${table}`, error);
    return count ?? 0;
  },

  async insert(table: Table, row: Record<string, unknown>) {
    const { data, error } = await db().from(table).insert(row).select("id").single();
    if (error || !data) fail(`insert ${table}`, error);
    return { id: String(data.id) };
  },

  async insertWaitlist(row) {
    const { error } = await db().from("waitlist").upsert(row, { onConflict: "email", ignoreDuplicates: true });
    if (error) fail("insert waitlist", error);
  },

  async setReportPhotoPath(reportId: string, path: string) {
    const { error } = await db().from("number_reports").update({ photo_path: path }).eq("id", reportId);
    if (error) fail("update report photo path", error);
  },

  async createPhotoUploadUrl(path: string) {
    const { data, error } = await db().storage.from(REPORT_PHOTO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) fail("create signed upload URL", error);
    return { signedUrl: data.signedUrl };
  },

  async clearIpHashes(table: Table, beforeIso: string) {
    const { count, error } = await db()
      .from(table)
      .update({ ip_hash: null }, { count: "exact" })
      .lt("created_at", beforeIso)
      .not("ip_hash", "is", null);
    if (error) fail(`clear ip hashes in ${table}`, error);
    return count ?? 0;
  },
};

// ------------------------------------------------------------------------------------------------ synced user data (docs/ACCOUNTS_SYNC.md)

/** public.user_data through the secret key. The API has already checked who the caller is; a row is only ever read or written for that person. */
export const supabaseUserData: UserDataStore = {
  async getAll(userId) {
    const { data, error } = await db().from("user_data").select("store, value, updated_at").eq("user_id", userId);
    if (error) fail("read user_data", error);
    return (data ?? []).map((r) => ({ store: String(r.store), value: r.value as unknown, updatedAt: String(r.updated_at) }));
  },

  async get(userId, store) {
    const { data, error } = await db().from("user_data").select("value, updated_at").eq("user_id", userId).eq("store", store).maybeSingle();
    if (error) fail("read user_data", error);
    return data ? { value: data.value as unknown, updatedAt: String(data.updated_at) } : null;
  },

  async putIfUnchanged(userId, store, value, expectedUpdatedAt) {
    if (expectedUpdatedAt === null) {
      const { error } = await db().from("user_data").insert({ user_id: userId, store, value });
      if (error?.code === "23505") return false; // another device created it first
      if (error) fail("insert user_data", error);
      return true;
    }
    const { data, error } = await db()
      .from("user_data")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("store", store)
      .eq("updated_at", expectedUpdatedAt)
      .select("store");
    if (error) fail("update user_data", error);
    return (data?.length ?? 0) === 1;
  },
};
