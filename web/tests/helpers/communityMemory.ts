import { MAX_FRIENDS, MAX_PENDING_IN, MAX_UNREAD } from "../../lib/community/limits";
import type {
  AttemptKind, BlockRow, CommunityProfile, CommunityStore, CreateProfileResult, Friendship, ListRow, NewList, NewReport,
} from "../../lib/community/types";

// The Community tables in memory, with the same rules the database enforces (supabase/migrations/20261016120000_community.sql): a unique username and
// friend code, one row per pair whichever way round, a block once per direction, one open report per reporter, person and list, the three caps (50 unread
// lists, 100 waiting requests, 200 friends) and ON DELETE CASCADE from the account (deleteUser; reports are the exception: they lose the person, not the row).
// The real adapter is lib/store-supabase-community.ts; the SQL itself is proven by supabase/tests/community.sql.

/** A report as the table holds it: the two people are emptied (not the report) when an account is deleted. */
export interface StoredReport extends Omit<NewReport, "reporter" | "reported"> {
  id: string;
  reporter: string | null;
  reported: string | null;
  createdAt: string;
  status: "open" | "actioned" | "dismissed";
}

interface Attempt {
  userId: string;
  kind: AttemptKind;
  target: string | null;
  at: string;
}

export function memoryCommunityStore(opts: { clock?: () => number } = {}) {
  const clock = opts.clock ?? (() => Date.now());
  const profiles = new Map<string, CommunityProfile>();
  let friendships: Friendship[] = [];
  let blocks: BlockRow[] = [];
  let reports: StoredReport[] = [];
  let lists: ListRow[] = [];
  let attempts: Attempt[] = [];
  /** When each declined request was answered (the table's answered_at). */
  const answered = new Map<string, string>();
  let counter = 0;
  /** How many database calls were made: the "same work for every cause" tests compare these. */
  const calls: string[] = [];
  const newId = () => `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`;
  const note = (name: string) => void calls.push(name);

  const samePair = (f: { requester: string; addressee: string }, a: string, b: string) =>
    (f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a);

  const store: CommunityStore = {
    async getProfile(userId) {
      note("getProfile");
      return profiles.get(userId) ?? null;
    },
    async getProfiles(userIds) {
      note("getProfiles");
      return [...new Set(userIds)].map((id) => profiles.get(id)).filter((p): p is CommunityProfile => p !== undefined);
    },
    async getProfileByCode(code) {
      note("getProfileByCode");
      return [...profiles.values()].find((p) => p.friendCode === code) ?? null;
    },
    async createProfile(userId, username, friendCode): Promise<CreateProfileResult> {
      note("createProfile");
      if (profiles.has(userId)) return { ok: false, conflict: "profile" };
      if ([...profiles.values()].some((p) => p.username === username)) return { ok: false, conflict: "username" };
      if ([...profiles.values()].some((p) => p.friendCode === friendCode)) return { ok: false, conflict: "code" };
      const profile = { userId, username, friendCode, createdAt: new Date(clock()).toISOString() };
      profiles.set(userId, profile);
      return { ok: true, profile };
    },

    async friendshipsOf(userId) {
      note("friendshipsOf");
      return friendships
        .filter((f) => f.status !== "declined" && (f.requester === userId || f.addressee === userId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((f) => ({ ...f }));
    },
    async getFriendship(id) {
      note("getFriendship");
      const f = friendships.find((x) => x.id === id);
      return f ? { ...f } : null;
    },
    async findFriendship(a, b) {
      note("findFriendship");
      const f = friendships.find((x) => samePair(x, a, b));
      return f ? { ...f } : null;
    },
    async createFriendship(requester, addressee, createdAt) {
      note("createFriendship");
      if (requester === addressee || friendships.some((x) => samePair(x, requester, addressee))) return null;
      if (!profiles.has(requester) || !profiles.has(addressee)) return null;
      if (friendships.filter((x) => x.status === "pending" && x.addressee === addressee).length >= MAX_PENDING_IN) return null; // the database cap
      const f: Friendship = { id: newId(), requester, addressee, status: "pending", createdAt };
      friendships.push(f);
      return { ...f };
    },
    async acceptFriendship(id) {
      note("acceptFriendship");
      const f = friendships.find((x) => x.id === id && x.status === "pending");
      if (!f) return null;
      const friendsOf = (u: string) => friendships.filter((x) => x.status === "accepted" && (x.requester === u || x.addressee === u)).length;
      if (friendsOf(f.requester) >= MAX_FRIENDS || friendsOf(f.addressee) >= MAX_FRIENDS) return null; // the database cap
      f.status = "accepted";
      return { ...f };
    },
    async declineFriendship(id, atIso) {
      note("declineFriendship");
      const f = friendships.find((x) => x.id === id && x.status === "pending");
      if (!f) return false;
      f.status = "declined";
      answered.set(id, atIso);
      return true;
    },
    async deleteFriendship(id) {
      note("deleteFriendship");
      const before = friendships.length;
      friendships = friendships.filter((x) => x.id !== id);
      return friendships.length < before;
    },
    async countFriends(userId) {
      note("countFriends");
      return friendships.filter((f) => f.status === "accepted" && (f.requester === userId || f.addressee === userId)).length;
    },
    async countPendingOut(userId) {
      note("countPendingOut");
      return friendships.filter((f) => f.status === "pending" && f.requester === userId).length;
    },
    async countPendingIn(userId) {
      note("countPendingIn");
      return friendships.filter((f) => f.status === "pending" && f.addressee === userId).length;
    },

    async blocksInvolving(userId) {
      note("blocksInvolving");
      return blocks.filter((b) => b.blocker === userId || b.blocked === userId).map((b) => ({ ...b }));
    },
    async isBlockedEitherWay(a, b) {
      note("isBlockedEitherWay");
      return blocks.some((x) => (x.blocker === a && x.blocked === b) || (x.blocker === b && x.blocked === a));
    },
    async addBlock(blocker, blocked, createdAt) {
      note("addBlock");
      const had = blocks.find((b) => b.blocker === blocker && b.blocked === blocked);
      if (had) return { ...had };
      const b: BlockRow = { id: newId(), blocker, blocked, createdAt };
      blocks.push(b);
      return { ...b };
    },
    async getBlock(id) {
      note("getBlock");
      const b = blocks.find((x) => x.id === id);
      return b ? { ...b } : null;
    },
    async deleteBlock(id) {
      note("deleteBlock");
      const before = blocks.length;
      blocks = blocks.filter((x) => x.id !== id);
      return blocks.length < before;
    },

    async addReport(report, createdAt) {
      note("addReport");
      // the unique index: one open report per reporter, person and list
      if (reports.some((r) => r.status === "open" && r.reporter === report.reporter && r.reported === report.reported && (r.listPayload ?? "") === (report.listPayload ?? ""))) return false;
      reports.push({ ...report, id: newId(), createdAt, status: "open" });
      return true;
    },
    async countOpenReports() {
      note("countOpenReports");
      return reports.filter((r) => r.status === "open").length;
    },

    async addAttempt(userId, kind, target, atIso) {
      note("addAttempt");
      attempts.push({ userId, kind, target, at: atIso });
    },
    async countAttempts(userId, kind, sinceIso, target) {
      note("countAttempts");
      return attempts.filter((a) => a.userId === userId && a.kind === kind && a.at >= sinceIso && (target === undefined || a.target === target)).length;
    },

    async insertList(list: NewList) {
      note("insertList");
      // the database cap: at most MAX_UNREAD unread lists that haven't run out
      const nowIso = new Date(clock()).toISOString();
      if (lists.filter((l) => l.recipient === list.recipient && l.readAt === null && l.expiresAt > nowIso).length >= MAX_UNREAD) return null;
      const row: ListRow = { id: newId(), sender: list.sender, recipient: list.recipient, payload: list.payload, itemCount: list.itemCount, createdAt: list.createdAt, readAt: null, expiresAt: list.expiresAt };
      lists.push(row);
      return { ...row };
    },
    async getList(id) {
      note("getList");
      const l = lists.find((x) => x.id === id);
      return l ? { ...l } : null;
    },
    async inbox(recipient, nowIso, limit) {
      note("inbox");
      return lists
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.recipient === recipient && l.expiresAt > nowIso)
        .sort((a, b) => b.l.createdAt.localeCompare(a.l.createdAt) || b.i - a.i)
        .slice(0, limit)
        .map(({ l }) => ({ ...l }));
    },
    async countUnread(recipient, nowIso) {
      note("countUnread");
      return lists.filter((l) => l.recipient === recipient && l.readAt === null && l.expiresAt > nowIso).length;
    },
    async markRead(id, readAtIso) {
      note("markRead");
      const l = lists.find((x) => x.id === id && x.readAt === null);
      if (l) l.readAt = readAtIso;
    },
    async deleteList(id) {
      note("deleteList");
      const before = lists.length;
      lists = lists.filter((x) => x.id !== id);
      return lists.length < before;
    },
    async deleteListsBetween(a, b) {
      note("deleteListsBetween");
      const before = lists.length;
      lists = lists.filter((l) => !samePair({ requester: l.sender, addressee: l.recipient }, a, b));
      return before - lists.length;
    },
    async deleteExpiredLists(nowIso) {
      note("deleteExpiredLists");
      const before = lists.length;
      lists = lists.filter((l) => l.expiresAt >= nowIso);
      return before - lists.length;
    },
    async deleteOldAttempts(beforeIso) {
      note("deleteOldAttempts");
      const before = attempts.length;
      attempts = attempts.filter((a) => a.at >= beforeIso);
      return before - attempts.length;
    },
    async deleteOldDeclined(beforeIso) {
      note("deleteOldDeclined");
      const before = friendships.length;
      friendships = friendships.filter((f) => !(f.status === "declined" && (answered.get(f.id) ?? "") < beforeIso));
      return before - friendships.length;
    },
    async deleteOldReports(beforeIso) {
      note("deleteOldReports");
      const before = reports.length;
      reports = reports.filter((r) => r.status === "open" || r.createdAt >= beforeIso);
      return before - reports.length;
    },
  };

  return {
    store,
    calls,
    /** Rows, for the tests to look at. */
    get profiles() { return [...profiles.values()]; },
    get friendships() { return friendships.map((f) => ({ ...f })); },
    get blocks() { return blocks.map((b) => ({ ...b })); },
    get reports() { return reports.map((r) => ({ ...r })); },
    get lists() { return lists.map((l) => ({ ...l })); },
    get attempts() { return attempts.map((a) => ({ ...a })); },
    /** The founder closing a report in the Table Editor. */
    closeReport(id: string, status: "actioned" | "dismissed") {
      const r = reports.find((x) => x.id === id);
      if (r) r.status = status;
    },
    /** Set up a person directly (as if they had signed up and chosen a username). */
    seedProfile(userId: string, username: string, friendCode: string) {
      profiles.set(userId, { userId, username, friendCode, createdAt: new Date(clock()).toISOString() });
    },
    /** "Delete my account": ON DELETE CASCADE removes every row that names the person, in every table but reports (ON DELETE SET NULL: the report stays, without the person). */
    deleteUser(userId: string) {
      profiles.delete(userId);
      friendships = friendships.filter((f) => f.requester !== userId && f.addressee !== userId);
      blocks = blocks.filter((b) => b.blocker !== userId && b.blocked !== userId);
      for (const r of reports) {
        if (r.reporter === userId) r.reporter = null;
        if (r.reported === userId) r.reported = null;
      }
      lists = lists.filter((l) => l.sender !== userId && l.recipient !== userId);
      attempts = attempts.filter((a) => a.userId !== userId && a.target !== userId);
    },
  };
}

export type MemoryCommunity = ReturnType<typeof memoryCommunityStore>;
