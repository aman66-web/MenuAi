import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverDb } from "./store-supabase";
import type { BlockRow, CommunityProfile, CommunityStore, Friendship, FriendshipStatus, ListRow } from "./community/types";

// public.community_* and public.friendships through the secret key (supabase/migrations/20261016120000_community.sql). The API has already checked who the
// caller is and that they are a party to any row it asks for; nothing here decides who may see what. Keep this file small and obvious: every column name
// below is a column of that migration.

const db = (): SupabaseClient => serverDb();

interface DbError {
  code?: string;
  message: string;
  details?: string | null;
}
function fail(what: string, error: DbError | null): never {
  throw new Error(`Supabase ${what} failed: ${error?.message ?? "unknown error"}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids go into PostgREST filter strings (.or(...)), so only a real uuid may. Callers pass ids that came from the database or from our own checks. */
function uid(v: string): string {
  if (!UUID.test(v)) throw new Error("not a uuid");
  return v;
}

const PROFILE_COLS = "user_id, username, friend_code, created_at";
const FRIENDSHIP_COLS = "id, requester, addressee, status, created_at";
const BLOCK_COLS = "id, blocker, blocked, created_at";
const LIST_COLS = "id, sender, recipient, payload, item_count, created_at, read_at, expires_at";

interface ProfileRow { user_id: string; username: string; friend_code: string; created_at: string }
interface FriendshipRow { id: string; requester: string; addressee: string; status: string; created_at: string }
interface BlockDbRow { id: string; blocker: string; blocked: string; created_at: string }
interface ListDbRow { id: string; sender: string; recipient: string; payload: string; item_count: number; created_at: string; read_at: string | null; expires_at: string }

const toProfile = (r: ProfileRow): CommunityProfile => ({ userId: r.user_id, username: r.username, friendCode: r.friend_code, createdAt: String(r.created_at) });
const STATUS: Record<string, FriendshipStatus> = { accepted: "accepted", declined: "declined" };
const toFriendship = (r: FriendshipRow): Friendship => ({
  id: r.id, requester: r.requester, addressee: r.addressee, status: STATUS[r.status] ?? "pending", createdAt: String(r.created_at),
});

/** The caps that the database itself enforces under a race (triggers in the migration) refuse with check_violation and one of these messages. */
const isCap = (error: DbError | null, name: string): boolean => error?.code === "23514" && (error.message ?? "").includes(name);

/** Most rows of friendships one person can have: 200 friends + 100 waiting for them + 50 they asked, and a little more for rows being answered right now. */
const FRIENDSHIP_PAGE = 500;
const toBlock = (r: BlockDbRow): BlockRow => ({ id: r.id, blocker: r.blocker, blocked: r.blocked, createdAt: String(r.created_at) });
const toList = (r: ListDbRow): ListRow => ({
  id: r.id, sender: r.sender, recipient: r.recipient, payload: r.payload, itemCount: r.item_count, createdAt: String(r.created_at),
  readAt: r.read_at === null ? null : String(r.read_at), expiresAt: String(r.expires_at),
});

/** "pairs between a and b, whichever way round" as a PostgREST filter on two uuid columns. */
const either = (colA: string, colB: string, a: string, b: string) => `and(${colA}.eq.${uid(a)},${colB}.eq.${uid(b)}),and(${colA}.eq.${uid(b)},${colB}.eq.${uid(a)})`;
const involving = (colA: string, colB: string, id: string) => `${colA}.eq.${uid(id)},${colB}.eq.${uid(id)}`;

const IN_CHUNK = 50;

export const supabaseCommunity: CommunityStore = {
  // ---- profiles
  async getProfile(userId) {
    const { data, error } = await db().from("community_profiles").select(PROFILE_COLS).eq("user_id", uid(userId)).maybeSingle();
    if (error) fail("read community_profiles", error);
    return data ? toProfile(data as ProfileRow) : null;
  },

  async getProfiles(userIds) {
    const ids = [...new Set(userIds)].map(uid);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
    // the chunks are asked for together, not one after the other
    const answers = await Promise.all(chunks.map((chunk) => db().from("community_profiles").select(PROFILE_COLS).in("user_id", chunk)));
    const out: CommunityProfile[] = [];
    for (const { data, error } of answers) {
      if (error) fail("read community_profiles", error);
      for (const r of (data ?? []) as ProfileRow[]) out.push(toProfile(r));
    }
    return out;
  },

  async getProfileByCode(code) {
    const { data, error } = await db().from("community_profiles").select(PROFILE_COLS).eq("friend_code", code).maybeSingle();
    if (error) fail("read community_profiles", error);
    return data ? toProfile(data as ProfileRow) : null;
  },

  async createProfile(userId, username, friendCode) {
    const { data, error } = await db().from("community_profiles").insert({ user_id: uid(userId), username, friend_code: friendCode }).select(PROFILE_COLS).single();
    if (!error && data) return { ok: true, profile: toProfile(data as ProfileRow) };
    if (error?.code === "23505") {
      const text = `${error.message} ${error.details ?? ""}`;
      if (/community_profiles_username_key|\(username\)/.test(text)) return { ok: false, conflict: "username" };
      if (/community_profiles_friend_code_key|\(friend_code\)/.test(text)) return { ok: false, conflict: "code" };
      return { ok: false, conflict: "profile" };
    }
    return fail("insert community_profiles", error);
  },

  // ---- friendships
  async friendshipsOf(userId) {
    // never the declined ones (kept only to stop a re-ask); newest first; bounded, so the project's row limit can never cut a list short in an arbitrary place
    const { data, error } = await db()
      .from("friendships")
      .select(FRIENDSHIP_COLS)
      .in("status", ["pending", "accepted"])
      .or(involving("requester", "addressee", userId))
      .order("created_at", { ascending: false })
      .limit(FRIENDSHIP_PAGE);
    if (error) fail("read friendships", error);
    return ((data ?? []) as FriendshipRow[]).map(toFriendship);
  },

  async getFriendship(id) {
    const { data, error } = await db().from("friendships").select(FRIENDSHIP_COLS).eq("id", uid(id)).maybeSingle();
    if (error) fail("read friendships", error);
    return data ? toFriendship(data as FriendshipRow) : null;
  },

  async findFriendship(a, b) {
    const { data, error } = await db().from("friendships").select(FRIENDSHIP_COLS).or(either("requester", "addressee", a, b)).limit(1);
    if (error) fail("read friendships", error);
    const row = ((data ?? []) as FriendshipRow[])[0];
    return row ? toFriendship(row) : null;
  },

  async createFriendship(requester, addressee, createdAt) {
    const { data, error } = await db()
      .from("friendships")
      .insert({ requester: uid(requester), addressee: uid(addressee), status: "pending", created_at: createdAt })
      .select(FRIENDSHIP_COLS)
      .single();
    if (!error && data) return toFriendship(data as FriendshipRow);
    if (error?.code === "23505" || error?.code === "23503") return null; // the pair already has a row, or one of them has just been deleted
    if (isCap(error, "community_requests_full")) return null; // the other person already has the most requests waiting
    return fail("insert friendships", error);
  },

  async acceptFriendship(id) {
    const { data, error } = await db().from("friendships").update({ status: "accepted" }).eq("id", uid(id)).eq("status", "pending").select(FRIENDSHIP_COLS);
    if (isCap(error, "community_friends_full")) return null; // one of them already has the most friends
    if (error) fail("update friendships", error);
    const row = ((data ?? []) as FriendshipRow[])[0];
    return row ? toFriendship(row) : null;
  },

  async declineFriendship(id, atIso) {
    const { data, error } = await db().from("friendships").update({ status: "declined", answered_at: atIso }).eq("id", uid(id)).eq("status", "pending").select("id");
    if (error) fail("update friendships", error);
    return (data?.length ?? 0) > 0;
  },

  async deleteFriendship(id) {
    const { data, error } = await db().from("friendships").delete().eq("id", uid(id)).select("id");
    if (error) fail("delete friendships", error);
    return (data?.length ?? 0) > 0;
  },

  async countFriends(userId) {
    const { count, error } = await db().from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(involving("requester", "addressee", userId));
    if (error) fail("count friendships", error);
    return count ?? 0;
  },

  async countPendingOut(userId) {
    const { count, error } = await db().from("friendships").select("id", { count: "exact", head: true }).eq("status", "pending").eq("requester", uid(userId));
    if (error) fail("count friendships", error);
    return count ?? 0;
  },

  async countPendingIn(userId) {
    const { count, error } = await db().from("friendships").select("id", { count: "exact", head: true }).eq("status", "pending").eq("addressee", uid(userId));
    if (error) fail("count friendships", error);
    return count ?? 0;
  },

  // ---- blocks
  async blocksInvolving(userId) {
    const { data, error } = await db().from("community_blocks").select(BLOCK_COLS).or(involving("blocker", "blocked", userId));
    if (error) fail("read community_blocks", error);
    return ((data ?? []) as BlockDbRow[]).map(toBlock);
  },

  async isBlockedEitherWay(a, b) {
    const { data, error } = await db().from("community_blocks").select("id").or(either("blocker", "blocked", a, b)).limit(1);
    if (error) fail("read community_blocks", error);
    return (data?.length ?? 0) > 0;
  },

  async addBlock(blocker, blocked, createdAt) {
    const { data, error } = await db().from("community_blocks").insert({ blocker: uid(blocker), blocked: uid(blocked), created_at: createdAt }).select(BLOCK_COLS).single();
    if (!error && data) return toBlock(data as BlockDbRow);
    if (error?.code !== "23505") fail("insert community_blocks", error);
    const existing = await db().from("community_blocks").select(BLOCK_COLS).eq("blocker", uid(blocker)).eq("blocked", uid(blocked)).single();
    if (existing.error || !existing.data) fail("read community_blocks", existing.error);
    return toBlock(existing.data as BlockDbRow);
  },

  async getBlock(id) {
    const { data, error } = await db().from("community_blocks").select(BLOCK_COLS).eq("id", uid(id)).maybeSingle();
    if (error) fail("read community_blocks", error);
    return data ? toBlock(data as BlockDbRow) : null;
  },

  async deleteBlock(id) {
    const { data, error } = await db().from("community_blocks").delete().eq("id", uid(id)).select("id");
    if (error) fail("delete community_blocks", error);
    return (data?.length ?? 0) > 0;
  },

  // ---- reports
  async addReport(report, createdAt) {
    const { error } = await db().from("community_reports").insert({
      reporter: uid(report.reporter),
      reported: uid(report.reported),
      reporter_username: report.reporterUsername,
      reported_username: report.reportedUsername,
      reason: report.reason,
      note: report.note,
      list_payload: report.listPayload,
      list_text: report.listText,
      created_at: createdAt,
    });
    if (error?.code === "23505") return false; // an open report about this person and list is already there
    if (error) fail("insert community_reports", error);
    return true;
  },

  async countOpenReports() {
    const { count, error } = await db().from("community_reports").select("id", { count: "exact", head: true }).eq("status", "open");
    if (error) fail("count community_reports", error);
    return count ?? 0;
  },

  // ---- tallies for the daily limits
  async addAttempt(userId, kind, target, atIso) {
    const { error } = await db().from("community_attempts").insert({ user_id: uid(userId), kind, target: target === null ? null : uid(target), at: atIso });
    if (error) fail("insert community_attempts", error);
  },

  async countAttempts(userId, kind, sinceIso, target) {
    let q = db().from("community_attempts").select("id", { count: "exact", head: true }).eq("user_id", uid(userId)).eq("kind", kind).gte("at", sinceIso);
    if (target !== undefined) q = q.eq("target", uid(target));
    const { count, error } = await q;
    if (error) fail("count community_attempts", error);
    return count ?? 0;
  },

  // ---- lists
  async insertList(list) {
    const { data, error } = await db()
      .from("community_lists")
      .insert({
        sender: uid(list.sender), recipient: uid(list.recipient), payload: list.payload, item_count: list.itemCount, created_at: list.createdAt, expires_at: list.expiresAt,
      })
      .select(LIST_COLS)
      .single();
    if (isCap(error, "community_inbox_full")) return null; // the recipient already has the most unread lists
    if (error || !data) fail("insert community_lists", error);
    return toList(data as ListDbRow);
  },

  async getList(id) {
    const { data, error } = await db().from("community_lists").select(LIST_COLS).eq("id", uid(id)).maybeSingle();
    if (error) fail("read community_lists", error);
    return data ? toList(data as ListDbRow) : null;
  },

  async inbox(recipient, nowIso, limit) {
    const { data, error } = await db()
      .from("community_lists")
      .select(LIST_COLS)
      .eq("recipient", uid(recipient))
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) fail("read community_lists", error);
    return ((data ?? []) as ListDbRow[]).map(toList);
  },

  async countUnread(recipient, nowIso) {
    const { count, error } = await db().from("community_lists").select("id", { count: "exact", head: true }).eq("recipient", uid(recipient)).is("read_at", null).gt("expires_at", nowIso);
    if (error) fail("count community_lists", error);
    return count ?? 0;
  },

  async markRead(id, readAtIso) {
    const { error } = await db().from("community_lists").update({ read_at: readAtIso }).eq("id", uid(id)).is("read_at", null);
    if (error) fail("update community_lists", error);
  },

  async deleteList(id) {
    const { data, error } = await db().from("community_lists").delete().eq("id", uid(id)).select("id");
    if (error) fail("delete community_lists", error);
    return (data?.length ?? 0) > 0;
  },

  async deleteListsBetween(a, b) {
    const { data, error } = await db().from("community_lists").delete().or(either("sender", "recipient", a, b)).select("id");
    if (error) fail("delete community_lists", error);
    return data?.length ?? 0;
  },

  async deleteExpiredLists(nowIso) {
    const { data, error } = await db().from("community_lists").delete().lt("expires_at", nowIso).select("id");
    if (error) fail("delete community_lists", error);
    return data?.length ?? 0;
  },

  async deleteOldAttempts(beforeIso) {
    const { data, error } = await db().from("community_attempts").delete().lt("at", beforeIso).select("id");
    if (error) fail("delete community_attempts", error);
    return data?.length ?? 0;
  },

  async deleteOldDeclined(beforeIso) {
    const { data, error } = await db().from("friendships").delete().eq("status", "declined").lt("answered_at", beforeIso).select("id");
    if (error) fail("delete friendships", error);
    return data?.length ?? 0;
  },

  async deleteOldReports(beforeIso) {
    const { data, error } = await db().from("community_reports").delete().neq("status", "open").lt("created_at", beforeIso).select("id");
    if (error) fail("delete community_reports", error);
    return data?.length ?? 0;
  },
};
