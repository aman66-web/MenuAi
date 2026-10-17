import { cleanCounts, cleanInboxItem, cleanPerson, cleanProfile, type Counts, type FriendsData, type InboxData, type InboxItem, type Person, type Profile } from "./communityClient";

// What the app remembers of Community between visits, so a screen has something to show with no signal (founder 2026-10-16: friends and shared lists are for
// people who are signed in, but a dropped connection shouldn't leave them staring at nothing). It is a copy of what the server last said, kept on this device only:
//   * it is NEVER one of the synced stores (lib/mm/syncMerge.ts SYNC_STORES, the user_data table): friends, usernames and the lists people sent are not "my data"
//     to carry to other devices, and tests/communityClient.test.ts fails if that ever changes;
//   * a list that has run out (30 days) is dropped when the copy is read back (`withoutExpired`), as the server would have;
//   * it belongs to one account (`userId`): another person signing in on the same phone never sees it;
//   * it is cleared by signing out, by "Delete my account", and by "Clear data on this device" (app/app/_lib/account.ts);
//   * it is read back with suspicion, like everything else from storage: each person, list and number goes through the same checks as a server answer.
// Pure (no browser, no React): the store itself is app/app/_lib/communityCache.ts.

/** The newest shopping lists kept for offline reading (each is at most 6,000 characters, so this is at most about 120 KB). */
export const CACHED_INBOX = 20;

export interface CommunityCache {
  userId: string;
  savedAt: number;
  profile: Profile | null;
  counts: Counts;
  friends: FriendsData | null;
  inbox: InboxData | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = <T,>(raw: unknown, clean: (x: unknown) => T | null, max: number): T[] => (Array.isArray(raw) ? raw.slice(0, max).map(clean).filter((x): x is T => x !== null) : []);

/** The cache as stored, checked; null when it is missing or not ours. */
export function sanitiseCache(raw: unknown): CommunityCache | null {
  if (!isRecord(raw) || typeof raw.userId !== "string" || raw.userId.length === 0 || raw.userId.length > 100) return null;
  const savedAt = typeof raw.savedAt === "number" && Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
  const profile = raw.profile === null || raw.profile === undefined ? null : cleanProfile(raw.profile);
  const f = isRecord(raw.friends) ? raw.friends : null;
  const i = isRecord(raw.inbox) ? raw.inbox : null;
  return {
    userId: raw.userId,
    savedAt,
    profile,
    counts: cleanCounts(raw.counts),
    friends: f ? { friends: list<Person>(f.friends, cleanPerson, 200), incoming: list<Person>(f.incoming, cleanPerson, 100), outgoing: list<Person>(f.outgoing, cleanPerson, 100) } : null,
    inbox: i ? { items: list<InboxItem>(i.items, cleanInboxItem, CACHED_INBOX), unread: cleanCounts({ unread: i.unread }).unread } : null,
  };
}

/**
 * The inbox without the lists that have run out. The server never shows one (they last 30 days), and a phone that has been offline for weeks, or that kept the app open,
 * must not show one either; `unread` is counted again from what is left. The same object comes back when nothing has run out.
 */
export function liveInbox(inbox: InboxData, now: number): InboxData {
  const items = inbox.items.filter((i) => Date.parse(i.expiresAt) > now);
  if (items.length === inbox.items.length) return inbox;
  return { items, unread: items.filter((i) => i.readAt === null).length };
}

/** The cache without lists that have run out (and the unread number to match). */
export function withoutExpired(cache: CommunityCache, now: number): CommunityCache {
  if (!cache.inbox) return cache;
  const inbox = liveInbox(cache.inbox, now);
  return inbox === cache.inbox ? cache : { ...cache, inbox, counts: { ...cache.counts, unread: inbox.unread } };
}

/** An empty cache for this person. */
export const emptyCache = (userId: string, now: number): CommunityCache => ({ userId, savedAt: now, profile: null, counts: { unread: 0, friendRequests: 0 }, friends: null, inbox: null });

/** The cache with one more thing the server said; the inbox is cut to the newest few. */
export function withCached(cache: CommunityCache, patch: Partial<Omit<CommunityCache, "userId" | "savedAt">>, now: number): CommunityCache {
  const next = { ...cache, ...patch, savedAt: now };
  if (next.inbox && next.inbox.items.length > CACHED_INBOX) next.inbox = { ...next.inbox, items: next.inbox.items.slice(0, CACHED_INBOX) };
  return next;
}
