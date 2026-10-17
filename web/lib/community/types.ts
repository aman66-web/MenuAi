// Community (docs/BACKEND.md "Community"): the rows and the storage port. The API talks to the database only through CommunityStore, so the handlers
// (lib/community/handlers.ts) are pure and the tests run them against an in-memory copy (tests/helpers/communityMemory.ts). The real one is
// lib/store-supabase-community.ts, whose queries match supabase/migrations/20261016120000_community.sql column for column.
//
// Rule for every method that takes an id: it does NOT check who is asking. The handlers do that, always, by loading the row and checking that the caller
// is a party to it before they use it (so a stranger's id is answered exactly like an id that doesn't exist).

export interface CommunityProfile {
  userId: string;
  username: string;
  friendCode: string;
  createdAt: string;
}

/** "declined" rows are kept for DECLINED_DAYS so the same person can't ask again at once; no screen ever shows one. */
export type FriendshipStatus = "pending" | "accepted" | "declined";

export interface Friendship {
  id: string;
  requester: string;
  addressee: string;
  status: FriendshipStatus;
  createdAt: string;
}

export interface BlockRow {
  id: string;
  blocker: string;
  blocked: string;
  createdAt: string;
}

export interface ListRow {
  id: string;
  sender: string;
  recipient: string;
  /** The share-link code (lib/mm/shareList.ts), re-written by the API from a checked copy. */
  payload: string;
  itemCount: number;
  createdAt: string;
  readAt: string | null;
  expiresAt: string;
}

/** The daily limits that are tallied in the database: friend-code tries, shopping lists sent, reports made. */
export const ATTEMPT_KINDS = ["code", "send", "report"] as const;
export type AttemptKind = (typeof ATTEMPT_KINDS)[number];

export const REPORT_REASONS = ["abusive_username", "abusive_list", "spam", "harassment", "impersonation", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface NewReport {
  /** The two people (the database empties these if an account is deleted, and the report stays). */
  reporter: string;
  reported: string;
  /** Copies of the two usernames, so the table reads without joins. */
  reporterUsername: string | null;
  reportedUsername: string | null;
  reason: ReportReason;
  note: string | null;
  /** When a shopping list is reported: the list as sent, and the words typed into it. */
  listPayload: string | null;
  listText: string | null;
}

export type CreateProfileResult =
  | { ok: true; profile: CommunityProfile }
  /** Which unique rule refused it: this username is taken, this friend code is taken (try another), or this person already has a profile. */
  | { ok: false; conflict: "username" | "code" | "profile" };

export interface NewList {
  sender: string;
  recipient: string;
  payload: string;
  itemCount: number;
  createdAt: string;
  expiresAt: string;
}

export interface CommunityStore {
  // ---- profiles
  getProfile(userId: string): Promise<CommunityProfile | null>;
  /** The profiles that exist among these people (any order). */
  getProfiles(userIds: readonly string[]): Promise<CommunityProfile[]>;
  getProfileByCode(code: string): Promise<CommunityProfile | null>;
  createProfile(userId: string, username: string, friendCode: string): Promise<CreateProfileResult>;

  // ---- friendships
  /** The friendships and requests the person is a party to (pending either way, and accepted; never declined ones), newest first, at most a few hundred. */
  friendshipsOf(userId: string): Promise<Friendship[]>;
  /** Any status, declined included. */
  getFriendship(id: string): Promise<Friendship | null>;
  /** The row between two people, whichever of them asked, any status. */
  findFriendship(a: string, b: string): Promise<Friendship | null>;
  /** A new pending request; null when the pair already has a row (a unique violation) or the other person already has too many requests waiting (the database cap). */
  createFriendship(requester: string, addressee: string, createdAt: string): Promise<Friendship | null>;
  /** pending -> accepted; null when the row is gone, no longer pending, or either person already has the most friends (the database cap). */
  acceptFriendship(id: string): Promise<Friendship | null>;
  /** pending -> declined (kept for DECLINED_DAYS); false when the row is gone or no longer pending. */
  declineFriendship(id: string, atIso: string): Promise<boolean>;
  deleteFriendship(id: string): Promise<boolean>;
  countFriends(userId: string): Promise<number>;
  countPendingOut(userId: string): Promise<number>;
  countPendingIn(userId: string): Promise<number>;

  // ---- blocks
  /** Blocks the person made AND blocks made against them. */
  blocksInvolving(userId: string): Promise<BlockRow[]>;
  isBlockedEitherWay(a: string, b: string): Promise<boolean>;
  /** Idempotent: blocking someone already blocked returns the block that exists. */
  addBlock(blocker: string, blocked: string, createdAt: string): Promise<BlockRow>;
  getBlock(id: string): Promise<BlockRow | null>;
  deleteBlock(id: string): Promise<boolean>;

  // ---- reports
  /** false when the reporter already has an open report about this person and list (nothing is added: the founder reads one, not a pile). */
  addReport(report: NewReport, createdAt: string): Promise<boolean>;
  countOpenReports(): Promise<number>;

  // ---- tallies for the daily limits (community_attempts): rows nobody but the cron deletes, so a limit can't be given back
  addAttempt(userId: string, kind: AttemptKind, target: string | null, atIso: string): Promise<void>;
  /** The person's rows of this kind since this time; with `target`, only those aimed at that person. */
  countAttempts(userId: string, kind: AttemptKind, sinceIso: string, target?: string): Promise<number>;

  // ---- lists
  /** null when the recipient already has the most unread lists (the database cap). */
  insertList(list: NewList): Promise<ListRow | null>;
  getList(id: string): Promise<ListRow | null>;
  /** Not yet expired, newest first. */
  inbox(recipient: string, nowIso: string, limit: number): Promise<ListRow[]>;
  countUnread(recipient: string, nowIso: string): Promise<number>;
  /** Sets read_at if it is not set. */
  markRead(id: string, readAtIso: string): Promise<void>;
  deleteList(id: string): Promise<boolean>;
  /** Every list between the two, in both directions (used when one blocks the other). */
  deleteListsBetween(a: string, b: string): Promise<number>;

  // ---- the daily clean-up (each returns how many rows it deleted)
  deleteExpiredLists(nowIso: string): Promise<number>;
  /** Tally rows older than this. */
  deleteOldAttempts(beforeIso: string): Promise<number>;
  /** Declined requests answered before this. */
  deleteOldDeclined(beforeIso: string): Promise<number>;
  /** Reports that are not open and were made before this. */
  deleteOldReports(beforeIso: string): Promise<number>;
}
