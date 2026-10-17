import { INBOX_PAGE } from "../community/limits";
import { checkUsernameShape } from "../community/username";
import { REPORT_REASONS, type ReportReason } from "../community/types";
import { FRIEND_CODE_LENGTH, isFriendCode } from "../community/friendCode";
import { MAX_PAYLOAD_LENGTH } from "./shareList";

// The app's side of Community (docs/BACKEND.md "Community"): a small typed client for our own /api/v1/community routes. Nothing here knows about screens.
// It speaks to the API through one function (`request`, which is the signed-in account's own, with its cookies or Bearer token), so tests give it a fake.
//
// Everything that comes back is DATA ABOUT OTHER PEOPLE, so it is read with suspicion: a username must have the shape the server enforces, an id must look
// like an id, a payload must be made of the characters a shopping list code uses, a date must be a date; anything else is dropped. Nothing is ever run or
// shown as markup: the screens print these values as plain text.
//
// The server never sends another person's user id, email or friend code. The only handles are the ids of the ROWS that connect two people:
//   friendId = a friendship row (friends[].id, incoming[].id, outgoing[].id), listId = an inbox item, blockId = a block.

export interface Person {
  /** The friendship row's id (not a person's id). */
  id: string;
  username: string;
  createdAt: string;
}

export interface Profile {
  username: string;
  /** My own friend code (the one I share). */
  friendCode: string;
  createdAt: string;
}

export interface Counts {
  /** Shopping lists I haven't opened. */
  unread: number;
  /** Friend requests waiting for my answer. */
  friendRequests: number;
}

export interface InboxItem {
  id: string;
  /** The sender's username. */
  from: string;
  itemCount: number;
  /** The share-link code (lib/mm/shareList.ts decodePayload reads it). */
  payload: string;
  createdAt: string;
  readAt: string | null;
  expiresAt: string;
}

export interface Failure {
  ok: false;
  /** The server's `error` code ("cannot_add", "inbox_full", "rate_limited"...), or "offline" when it couldn't be reached, or "error". */
  error: string;
  status: number;
  /** Extra detail some errors carry (invalid_username / invalid_list). */
  reason?: string;
  offline: boolean;
}

export type Result<T extends object = object> = ({ ok: true } & T) | Failure;

export interface FriendsData {
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
}

export interface InboxData {
  items: InboxItem[];
  unread: number;
}

export interface CommunityDeps {
  /** A signed-in request to our API (path after /api/v1/, e.g. "community/me"). Rejects when the server can't be reached. */
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Response>;
}

// ---- reading what the server sends

const ID = /^[A-Za-z0-9-]{8,64}$/;
const PAYLOAD = /^[A-Za-z0-9_-]+$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1_000_000) : 0);
const isoOrNull = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
/** A username exactly as the server stores it (3 to 20 of a-z 0-9 _ ., no stray dots at the ends), else null. */
export function cleanUsername(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const shape = checkUsernameShape(v);
  return shape.ok && shape.username === v ? v : null;
}

export function cleanPerson(raw: unknown): Person | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const username = cleanUsername(raw.username);
  const createdAt = isoOrNull(raw.createdAt);
  return id && ID.test(id) && username && createdAt ? { id, username, createdAt } : null;
}

export function cleanProfile(raw: unknown): Profile | null {
  if (!isRecord(raw)) return null;
  const username = cleanUsername(raw.username);
  const code = str(raw.friendCode);
  const createdAt = isoOrNull(raw.createdAt);
  return username && code && code.length === FRIEND_CODE_LENGTH && isFriendCode(code) && createdAt ? { username, friendCode: code, createdAt } : null;
}

export function cleanCounts(raw: unknown): Counts {
  return isRecord(raw) ? { unread: count(raw.unread), friendRequests: count(raw.friendRequests) } : { unread: 0, friendRequests: 0 };
}

export function cleanInboxItem(raw: unknown): InboxItem | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  // the server sends the sender as { username }; the copy kept on the phone (lib/mm/communityCache.ts) holds the checked name as plain text: both are read here
  const from = cleanUsername(isRecord(raw.from) ? raw.from.username : raw.from);
  const payload = str(raw.payload);
  const createdAt = isoOrNull(raw.createdAt);
  const expiresAt = isoOrNull(raw.expiresAt);
  if (!id || !ID.test(id) || !from || !payload || payload.length > MAX_PAYLOAD_LENGTH || !PAYLOAD.test(payload) || !createdAt || !expiresAt) return null;
  return { id, from, itemCount: Math.max(1, count(raw.itemCount)), payload, createdAt, readAt: isoOrNull(raw.readAt), expiresAt };
}

const people = (raw: unknown): Person[] => (Array.isArray(raw) ? raw.map(cleanPerson).filter((p): p is Person => p !== null) : []);

/** Whether this is a failure (for narrowing: `if (isFailure(r)) ...`). */
export const isFailure = (r: { ok: boolean }): r is Failure => !r.ok;

// ---- the client

export function createCommunityApi(deps: CommunityDeps) {
  async function call(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: true; body: unknown } | Failure> {
    let res: Response;
    try {
      res = await deps.request(path, init);
    } catch {
      return { ok: false, error: "offline", status: 0, offline: true };
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const error = isRecord(body) ? str(body.error) : null;
      const reason = isRecord(body) ? str(body.reason) : null;
      return { ok: false, error: error && /^[a-z_]{1,40}$/.test(error) ? error : "error", status: res.status, offline: false, ...(reason && /^[a-z_]{1,40}$/.test(reason) ? { reason } : {}) };
    }
    return { ok: true, body };
  }
  /** A failure for an answer that was OK but not in the shape we know. */
  const odd = (): Failure => ({ ok: false, error: "error", status: 200, offline: false });
  const encode = encodeURIComponent;

  return {
    /** My profile (null until I choose a username) and the numbers for the tab badge. */
    async me(): Promise<Result<{ profile: Profile | null; counts: Counts }>> {
      const r = await call("community/me");
      if (!r.ok) return r;
      if (!isRecord(r.body)) return odd();
      const profile = r.body.profile === null ? null : cleanProfile(r.body.profile);
      if (r.body.profile !== null && !profile) return odd();
      return { ok: true, profile, counts: cleanCounts(r.body.counts) };
    },

    /** Choose my username (once). */
    async chooseUsername(username: string): Promise<Result<{ profile: Profile }>> {
      const r = await call("community/me", { method: "PUT", body: { username } });
      if (!r.ok) return r;
      const profile = isRecord(r.body) ? cleanProfile(r.body.profile) : null;
      return profile ? { ok: true, profile } : odd();
    },

    async friends(): Promise<Result<FriendsData>> {
      const r = await call("community/friends");
      if (!r.ok) return r;
      if (!isRecord(r.body)) return odd();
      return { ok: true, friends: people(r.body.friends), incoming: people(r.body.incoming), outgoing: people(r.body.outgoing) };
    },

    /** Ask for a friendship with the owner of a friend code. Every code that can't be added answers the same `cannot_add`. */
    async requestFriend(code: string): Promise<Result<{ status: "requested" | "friends"; id: string; username: string }>> {
      const r = await call("community/friends/request", { method: "POST", body: { code } });
      if (!r.ok) return r;
      const b = isRecord(r.body) ? r.body : null;
      const id = b ? str(b.id) : null;
      const username = b ? cleanUsername(b.username) : null;
      const status = b?.status === "friends" ? "friends" : b?.status === "requested" ? "requested" : null;
      return id && ID.test(id) && username && status ? { ok: true, status, id, username } : odd();
    },

    async respond(id: string, accept: boolean): Promise<Result<{ status: "accepted" | "declined" }>> {
      const r = await call("community/friends/respond", { method: "POST", body: { id, accept } });
      if (!r.ok) return r;
      return { ok: true, status: isRecord(r.body) && r.body.status === "declined" ? "declined" : "accepted" };
    },

    /** Remove a friend, take back a request I made, or turn down one made to me. */
    async removeFriend(id: string): Promise<Result> {
      const r = await call(`community/friends/${encode(id)}`, { method: "DELETE" });
      return r.ok ? { ok: true } : r;
    },

    async blocks(): Promise<Result<{ blocks: Person[] }>> {
      const r = await call("community/blocks");
      if (!r.ok) return r;
      return { ok: true, blocks: isRecord(r.body) ? people(r.body.blocks) : [] };
    },

    /** Block the person behind a friend / request (friendId) or an inbox item (listId). */
    async block(target: { friendId: string } | { listId: string }): Promise<Result> {
      const r = await call("community/blocks", { method: "POST", body: target });
      return r.ok ? { ok: true } : r;
    },

    async unblock(blockId: string): Promise<Result> {
      const r = await call(`community/blocks/${encode(blockId)}`, { method: "DELETE" });
      return r.ok ? { ok: true } : r;
    },

    /** Report a person (friendId, or blockId) or a list they sent (listId). `block: true` also blocks them after the report is saved. */
    async report(input: ({ friendId: string } | { listId: string } | { blockId: string }) & { reason: ReportReason; note?: string; block?: boolean }): Promise<Result<{ blocked: boolean }>> {
      if (!REPORT_REASONS.includes(input.reason)) return { ok: false, error: "invalid_request", status: 400, offline: false };
      const r = await call("community/report", { method: "POST", body: input });
      if (!r.ok) return r;
      return { ok: true, blocked: isRecord(r.body) && r.body.blocked === true };
    },

    /** Send a shopping list (the share-link code) to a friend (the friendship's id). */
    async sendList(friendId: string, payload: string): Promise<Result<{ id: string; itemCount: number }>> {
      const r = await call("community/send-list", { method: "POST", body: { friendId, payload } });
      if (!r.ok) return r;
      const b = isRecord(r.body) ? r.body : null;
      const id = b ? str(b.id) : null;
      return id && ID.test(id) ? { ok: true, id, itemCount: b ? Math.max(1, count(b.itemCount)) : 1 } : odd();
    },

    async inbox(): Promise<Result<InboxData>> {
      const r = await call("community/inbox");
      if (!r.ok) return r;
      if (!isRecord(r.body)) return odd();
      const items = (Array.isArray(r.body.items) ? r.body.items : []).slice(0, INBOX_PAGE).map(cleanInboxItem).filter((i): i is InboxItem => i !== null);
      return { ok: true, items, unread: count(r.body.unread) };
    },

    async markRead(id: string): Promise<Result> {
      const r = await call(`community/inbox/${encode(id)}/read`, { method: "POST" });
      return r.ok ? { ok: true } : r;
    },

    async deleteItem(id: string): Promise<Result> {
      const r = await call(`community/inbox/${encode(id)}`, { method: "DELETE" });
      return r.ok ? { ok: true } : r;
    },
  };
}

export type CommunityApi = ReturnType<typeof createCommunityApi>;
