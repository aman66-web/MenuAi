import type { HttpResult } from "../auth/handlers";
import type { Limit } from "../auth/limiter";
import { decodePayload, encodeEntries, MAX_PAYLOAD_LENGTH, type SharedEntry } from "../mm/shareList";
import { generateFriendCode, parseFriendCode, type RandomInt } from "./friendCode";
import {
  INBOX_DAYS, INBOX_PAGE, MAX_CODE_TRIES_PER_DAY, MAX_FRIENDS, MAX_PENDING_IN, MAX_PENDING_OUT, MAX_REPORTS_PER_DAY, MAX_SENDS_PER_DAY, MAX_SENDS_TO_ONE_PER_DAY, MAX_UNREAD,
} from "./limits";
import { publicUsernameProblem, looksAbusiveText, validateUsername } from "./username";
import type { AttemptKind, BlockRow, CommunityProfile, CommunityStore, Friendship, ListRow } from "./types";
import {
  blockBodySchema, cleanNote, isUuid, reportBodySchema, requestBodySchema, respondBodySchema, sendListBodySchema, usernameBodySchema,
} from "./validation";

// Community, as pure request handlers: (caller, input, context) -> a result. app/api/v1/community/* wire them up (lib/community/route.ts runs the sign-in
// check first, so every handler here is given an already-authenticated user id). No Next.js or Supabase imports: tests/community.test.ts runs them against an
// in-memory store. The contract for the app is in docs/BACKEND.md "Community".
//
// The security rules, in one place:
//   * Nobody can look anybody up. A person is reached only by their friend code, and a code that is unknown, is your own, belongs to someone who blocked you
//     (or whom you blocked) or is already your friend all get the SAME answer (`cannot_add`), made by the same code path with the same queries.
//   * Nobody's user id or email leaves the server. Other people appear as a username and as the id of the ROW that connects you (a friendship, an inbox item,
//     a block), and every handler loads that row and checks the caller is a party to it, so a stranger's id answers exactly like an id that doesn't exist.
//   * Blocking removes the friendship and the lists in both directions, and hides each person from the other (no request, no send, no listing).
//   * A shopping list is stored only as the share-link code, re-written by this server from a checked copy: references only, never a price.

export interface CommunityCtx {
  store: CommunityStore;
  limit: Limit;
  now: () => number;
  /** Randomness for friend codes (the tests pass a fixed one; the default is the platform's secure generator). */
  random?: RandomInt;
}

// ---- the limits (docs/BACKEND.md; the numbers are in limits.ts so the app can say them too)
export { INBOX_DAYS, INBOX_PAGE, MAX_CODE_TRIES_PER_DAY, MAX_FRIENDS, MAX_PENDING_IN, MAX_PENDING_OUT, MAX_REPORTS_PER_DAY, MAX_SENDS_PER_DAY, MAX_SENDS_TO_ONE_PER_DAY, MAX_UNREAD };

const TEN_MIN = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const json = (status: number, body: Record<string, unknown>): HttpResult => ({ status, body });
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): HttpResult => json(status, { error, message, ...extra });
const iso = (ms: number) => new Date(ms).toISOString();

const tooMany = fail(429, "rate_limited", "Too many tries. Please wait a few minutes and try again.");
/** A daily limit (kept in the database, so a restart of the server doesn't give it back): the answer says "tomorrow", not "in a few minutes". */
const dailyLimit = fail(429, "daily_limit", "You've reached today's limit. Try again tomorrow.");
const inboxFull = fail(409, "inbox_full", "Your friend's inbox is full right now. Try again later.");
/** A row that doesn't exist, or that the caller is not a party to: indistinguishable on purpose. */
const notFound = fail(404, "not_found", "We couldn't find that.");
/** A request that can't be accepted right now, for a reason that isn't the accepter's to know. */
const cannotAccept = fail(409, "cannot_accept", "We couldn't accept that request. Try again later.");
/** Every reason a friend code can't be added gets exactly this answer. */
const cannotAdd = fail(404, "cannot_add", "We couldn't add that code. Check it and try again.");

const invalid = (issues: Array<{ path: PropertyKey[]; message: string }>): HttpResult =>
  json(400, { error: "invalid_request", message: "That request is not in the expected shape.", issues: issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) });

const readLimited = (userId: string, ctx: CommunityCtx) => ctx.limit("community-read", userId, 300, TEN_MIN);
const writeLimited = (userId: string, ctx: CommunityCtx) => ctx.limit("community-write", userId, 120, TEN_MIN);

const otherParty = (f: Friendship, me: string) => (f.requester === me ? f.addressee : f.requester);
const isParty = (f: Friendship, me: string) => f.requester === me || f.addressee === me;
const live = (l: ListRow | null, now: number): l is ListRow => l !== null && Date.parse(l.expiresAt) > now;

// ----------------------------------------------------------------------------------------------- daily limits kept in the database

/**
 * Take one slot from a daily budget that lives in the database (community_attempts), and say whether there was one. The server's own limiter (ctx.limit) is only a
 * quick first line: it lives in one server's memory and starts again with every cold start, so it can't be what holds a daily limit. The tally here can't be given
 * back by deleting something (a request taken back, a list the friend deleted), and it counts every try, not just the ones that worked.
 * It counts first (a person over the limit adds no more rows), then writes its own row, then counts AGAIN with that row in: when several requests arrive at once
 * every one of them is in the second count, so no more than the limit can pass.
 * `pair` is a smaller budget for one friend (lists sent to them), counted over the same rows.
 */
async function takeSlot(ctx: CommunityCtx, userId: string, kind: AttemptKind, perDay: number, pair?: { target: string; perDay: number }): Promise<"ok" | "day" | "pair"> {
  const now = ctx.now();
  const since = iso(now - DAY);
  const tally = async () => {
    const [all, one] = await Promise.all([ctx.store.countAttempts(userId, kind, since), pair ? ctx.store.countAttempts(userId, kind, since, pair.target) : Promise.resolve(0)]);
    return { all, one };
  };
  const before = await tally();
  if (before.all >= perDay) return "day";
  if (pair && before.one >= pair.perDay) return "pair";
  await ctx.store.addAttempt(userId, kind, pair?.target ?? null, iso(now));
  const after = await tally();
  if (after.all > perDay) return "day";
  if (pair && after.one > pair.perDay) return "pair";
  return "ok";
}

// ----------------------------------------------------------------------------------------------- me

const ownProfile = (p: CommunityProfile) => ({ username: p.username, friendCode: p.friendCode, createdAt: p.createdAt });

/** Who I am in Community, and the two numbers the tab badge needs: unread lists and friend requests waiting for me. `profile` is null until a username is chosen. */
export async function handleGetMe(userId: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!readLimited(userId, ctx)) return tooMany;
  const profile = await ctx.store.getProfile(userId);
  if (!profile) return json(200, { ok: true, profile: null, counts: { unread: 0, friendRequests: 0 } });
  const [unread, friendRequests] = await Promise.all([ctx.store.countUnread(userId, iso(ctx.now())), ctx.store.countPendingIn(userId)]);
  return json(200, { ok: true, profile: ownProfile(profile), counts: { unread, friendRequests } });
}

const MAX_CODE_TRIES = 8;

/** Choose a username (once) and get a friend code. */
export async function handlePutMe(userId: string, raw: unknown, ctx: CommunityCtx): Promise<HttpResult> {
  const parsed = usernameBodySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (!ctx.limit("community-username", userId, 10, HOUR)) return tooMany;
  const checked = validateUsername(parsed.data.username);
  if (!checked.ok) {
    return fail(400, "invalid_username", "That username can't be used.", { reason: publicUsernameProblem(checked.reason) });
  }
  if (await ctx.store.getProfile(userId)) return fail(409, "username_set", "You have already chosen a username.");
  for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
    const made = await ctx.store.createProfile(userId, checked.username, generateFriendCode(ctx.random));
    if (made.ok) return json(201, { ok: true, profile: ownProfile(made.profile) });
    if (made.conflict === "username") return fail(409, "username_taken", "That username is taken. Try another.");
    if (made.conflict === "profile") return fail(409, "username_set", "You have already chosen a username.");
    // the friend code was taken (about one in 8.5e11): make another
  }
  throw new Error("could not make a free friend code");
}

// ----------------------------------------------------------------------------------------------- friends

interface PersonEntry {
  id: string;
  username: string;
  createdAt: string;
}

/** Friends, requests waiting for me, and requests I made. Only a username and the row id: never a user id or an email. */
export async function handleGetFriends(userId: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!readLimited(userId, ctx)) return tooMany;
  const [rows, blocks] = await Promise.all([ctx.store.friendshipsOf(userId), ctx.store.blocksInvolving(userId)]);
  const hidden = new Set(blocks.map((b) => (b.blocker === userId ? b.blocked : b.blocker)));
  const shown = rows.filter((r) => isParty(r, userId) && !hidden.has(otherParty(r, userId)));
  const profiles = new Map((await ctx.store.getProfiles([...new Set(shown.map((r) => otherParty(r, userId)))])).map((p) => [p.userId, p]));
  const entry = (r: Friendship): PersonEntry | null => {
    const p = profiles.get(otherParty(r, userId));
    return p ? { id: r.id, username: p.username, createdAt: r.createdAt } : null;
  };
  const pick = (test: (r: Friendship) => boolean) => shown.filter(test).map(entry).filter((e): e is PersonEntry => e !== null);
  const byName = (a: PersonEntry, b: PersonEntry) => a.username.localeCompare(b.username);
  const newest = (a: PersonEntry, b: PersonEntry) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return json(200, {
    ok: true,
    friends: pick((r) => r.status === "accepted").sort(byName),
    incoming: pick((r) => r.status === "pending" && r.addressee === userId).sort(newest),
    outgoing: pick((r) => r.status === "pending" && r.requester === userId).sort(newest),
    limits: { maxFriends: MAX_FRIENDS },
  });
}

/** Ask for a friendship with the owner of a friend code. */
export async function handleFriendRequest(userId: string, raw: unknown, ctx: CommunityCtx): Promise<HttpResult> {
  const parsed = requestBodySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const me = await ctx.store.getProfile(userId);
  if (!me) return fail(409, "no_username", "Choose a username first.");
  // Every try counts, right or wrong, so codes can't be guessed in bulk (31^8 codes against 20 tries a day), and a request can't be sent, taken back and sent again
  // without end. The tally is in the database (see takeSlot); the server's own limiter only saves a database round trip for someone going far past it.
  if (!writeLimited(userId, ctx)) return tooMany;
  if (!ctx.limit("community-request", userId, MAX_CODE_TRIES_PER_DAY, DAY)) return dailyLimit;
  if ((await takeSlot(ctx, userId, "code", MAX_CODE_TRIES_PER_DAY)) !== "ok") return dailyLimit;
  const now = ctx.now();
  const [pendingOut, friends] = await Promise.all([ctx.store.countPendingOut(userId), ctx.store.countFriends(userId)]);
  if (pendingOut >= MAX_PENDING_OUT) return fail(409, "request_limit", "You have a lot of requests waiting. Wait for some to be answered.");
  if (friends >= MAX_FRIENDS) return fail(409, "friend_limit", "You can't add more friends right now.");

  // From here on every path does the same reads, so a wrong code, your own code and a blocked code take the same time and say the same thing.
  const code = parseFriendCode(parsed.data.code);
  const target = code ? await ctx.store.getProfileByCode(code) : null;
  const targetId = target?.userId ?? NIL_UUID;
  const [blocked, existing, waitingForThem] = await Promise.all([
    ctx.store.isBlockedEitherWay(userId, targetId), ctx.store.findFriendship(userId, targetId), ctx.store.countPendingIn(targetId),
  ]);
  if (!target || target.userId === userId || blocked) return cannotAdd;

  if (existing) {
    if (existing.status === "accepted") return cannotAdd;
    if (existing.status === "declined") {
      // they turned me down (kept for a while so I can't ask again at once): the same answer as any other code that can't be added.
      if (existing.requester === userId) return cannotAdd;
      // I turned them down earlier and now I am the one asking: that old row makes way for my request
      await ctx.store.deleteFriendship(existing.id);
    } else {
      if (existing.requester === userId) return json(200, { ok: true, status: "requested", id: existing.id, username: target.username }); // asking again changes nothing
      // they asked me first, and now I have asked them: that is a yes from both
      if ((await ctx.store.countFriends(target.userId)) >= MAX_FRIENDS) return cannotAdd;
      const accepted = await ctx.store.acceptFriendship(existing.id);
      return accepted ? json(200, { ok: true, status: "friends", id: accepted.id, username: target.username }) : cannotAdd;
    }
  }

  // a code that got out can't bury somebody in requests: past this many waiting, it answers like any code that can't be added
  if (waitingForThem >= MAX_PENDING_IN) return cannotAdd;
  const made = await ctx.store.createFriendship(userId, target.userId, iso(now));
  if (!made) return cannotAdd; // someone created the pair a moment ago, or their pile of requests filled up in the meantime
  return json(201, { ok: true, status: "requested", id: made.id, username: target.username });
}

/** Accept or decline a request that is waiting for me. */
export async function handleFriendRespond(userId: string, raw: unknown, ctx: CommunityCtx): Promise<HttpResult> {
  const parsed = respondBodySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (!writeLimited(userId, ctx)) return tooMany;
  const row = await ctx.store.getFriendship(parsed.data.id);
  if (!row || row.status !== "pending" || row.addressee !== userId) return notFound; // not mine to answer (also: my own request, or already answered)
  if (!parsed.data.accept) {
    // the row stays for a while as 'declined', so the same person can't ask again at once; nobody is shown it
    return (await ctx.store.declineFriendship(row.id, iso(ctx.now()))) ? json(200, { ok: true, status: "declined" }) : notFound;
  }
  if (await ctx.store.isBlockedEitherWay(userId, row.requester)) return notFound;
  const [mine, theirs] = await Promise.all([ctx.store.countFriends(userId), ctx.store.countFriends(row.requester)]);
  if (mine >= MAX_FRIENDS) return fail(409, "friend_limit", "You can't add more friends right now.");
  // the other person being full is not for me to know (it would tell me how many friends someone has): the same words as any request that can't be accepted
  if (theirs >= MAX_FRIENDS) return cannotAccept;
  const accepted = await ctx.store.acceptFriendship(row.id);
  return accepted ? json(200, { ok: true, status: "accepted" }) : cannotAccept;
}

/** Remove a friend, take back a request I made, or (same thing as declining) turn down one made to me. */
export async function handleRemoveFriend(userId: string, id: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!writeLimited(userId, ctx)) return tooMany;
  if (!isUuid(id)) return notFound;
  const row = await ctx.store.getFriendship(id);
  // a declined request is not shown to anyone, and deleting it would give the person who was turned down the right to ask again at once
  if (!row || row.status === "declined" || !isParty(row, userId)) return notFound;
  // turning down a request made to me is declining it, however it is asked for: the row stays, as 'declined', for a while
  if (row.status === "pending" && row.addressee === userId) {
    await ctx.store.declineFriendship(row.id, iso(ctx.now()));
    return json(200, { ok: true });
  }
  await ctx.store.deleteFriendship(row.id);
  return json(200, { ok: true });
}

// ----------------------------------------------------------------------------------------------- blocks and reports

interface Handle {
  friendId?: string | undefined;
  listId?: string | undefined;
  blockId?: string | undefined;
}

/**
 * Who the caller means by one of the ids they were given. Only rows the caller is a party to count, and only a real relationship: a friend, or a request made TO the
 * caller. Not a request the caller made (anyone who holds a stranger's friend code could otherwise report or block that stranger), and never a declined one.
 */
async function resolveOther(userId: string, ref: Handle, ctx: CommunityCtx): Promise<{ other: string; list: ListRow | null } | null> {
  if (ref.friendId !== undefined) {
    const f = await ctx.store.getFriendship(ref.friendId);
    const real = f !== null && isParty(f, userId) && (f.status === "accepted" || (f.status === "pending" && f.addressee === userId));
    return real ? { other: otherParty(f, userId), list: null } : null;
  }
  if (ref.listId !== undefined) {
    const l = await ctx.store.getList(ref.listId);
    return live(l, ctx.now()) && l.recipient === userId ? { other: l.sender, list: l } : null;
  }
  if (ref.blockId !== undefined) {
    const b = await ctx.store.getBlock(ref.blockId);
    return b && b.blocker === userId ? { other: b.blocked, list: null } : null;
  }
  return null;
}

/** Block someone: the block first (so nothing new can arrive), then the friendship and every list between the two. Safe to repeat. */
async function blockPerson(userId: string, other: string, ctx: CommunityCtx): Promise<void> {
  await ctx.store.addBlock(userId, other, iso(ctx.now()));
  const f = await ctx.store.findFriendship(userId, other);
  if (f) await ctx.store.deleteFriendship(f.id);
  await ctx.store.deleteListsBetween(userId, other);
}

/** Block the person behind a friend, a request or an inbox item. */
export async function handleBlock(userId: string, raw: unknown, ctx: CommunityCtx): Promise<HttpResult> {
  const parsed = blockBodySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (!writeLimited(userId, ctx)) return tooMany;
  const target = await resolveOther(userId, parsed.data, ctx);
  if (!target) return notFound;
  await blockPerson(userId, target.other, ctx);
  return json(200, { ok: true });
}

/** The people I have blocked (so I can unblock). */
export async function handleGetBlocks(userId: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!readLimited(userId, ctx)) return tooMany;
  const mine = (await ctx.store.blocksInvolving(userId)).filter((b) => b.blocker === userId);
  const profiles = new Map((await ctx.store.getProfiles(mine.map((b) => b.blocked))).map((p) => [p.userId, p]));
  const blocks = mine
    .map((b: BlockRow) => ({ id: b.id, username: profiles.get(b.blocked)?.username, createdAt: b.createdAt }))
    .filter((b): b is { id: string; username: string; createdAt: string } => b.username !== undefined)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return json(200, { ok: true, blocks });
}

/** Unblock. They are not friends again: they would have to be asked for, with their code. */
export async function handleUnblock(userId: string, id: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!writeLimited(userId, ctx)) return tooMany;
  if (!isUuid(id)) return notFound;
  const block = await ctx.store.getBlock(id);
  if (!block || block.blocker !== userId) return notFound;
  await ctx.store.deleteBlock(block.id);
  return json(200, { ok: true });
}

/** The words typed into a list, one per line of the founder's table: what someone abusive would have written. */
function typedWords(entries: readonly SharedEntry[]): string {
  // cut by whole characters: cutting in the middle of an emoji leaves half of it, which the database refuses (and the report would be lost)
  return Array.from(entries.filter((e) => e.kind === "typed").map((e) => e.code).join(" | ")).slice(0, 2000).join("");
}

/** Report a person (by a friend, a request or a block) or a shopping list they sent (by the inbox item); optionally block them too. */
export async function handleReport(userId: string, raw: unknown, ctx: CommunityCtx): Promise<HttpResult> {
  const parsed = reportBodySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (!writeLimited(userId, ctx)) return tooMany;
  if (!ctx.limit("community-report", userId, MAX_REPORTS_PER_DAY, DAY)) return dailyLimit;
  const target = await resolveOther(userId, parsed.data, ctx);
  if (!target) return notFound;
  if ((await takeSlot(ctx, userId, "report", MAX_REPORTS_PER_DAY)) !== "ok") return dailyLimit;
  const [reporter, reported] = await ctx.store.getProfiles([userId, target.other]).then((ps) => [ps.find((p) => p.userId === userId), ps.find((p) => p.userId === target.other)]);
  const decoded = target.list ? decodePayload(target.list.payload) : null;
  // false = there is already an open report from this person about this person (and list): the founder reads one, not a pile. It is still a success for them.
  await ctx.store.addReport(
    {
      reporter: userId,
      reported: target.other,
      reporterUsername: reporter?.username ?? null,
      reportedUsername: reported?.username ?? null,
      reason: parsed.data.reason,
      note: cleanNote(parsed.data.note),
      listPayload: target.list?.payload ?? null,
      listText: decoded?.ok ? typedWords(decoded.entries) || null : null,
    },
    iso(ctx.now()),
  );
  if (parsed.data.block) await blockPerson(userId, target.other, ctx);
  return json(201, { ok: true, blocked: parsed.data.block === true });
}

// ----------------------------------------------------------------------------------------------- shopping lists

export type ListProblem = "empty" | "version" | "cut" | "unreadable" | "too_large" | "unsuitable";

/**
 * A list that may be sent: the payload read with the same decoder the app uses, then WRITTEN AGAIN by this server from what it understood, so only
 * references and typed words are kept (anything else tucked into the code, such as a price, is dropped), the checksum is ours and the size is known.
 */
export function checkListPayload(payload: string): { ok: true; payload: string; itemCount: number; entries: SharedEntry[] } | { ok: false; reason: ListProblem } {
  if (payload.length > MAX_PAYLOAD_LENGTH) return { ok: false, reason: "too_large" };
  const decoded = decodePayload(payload);
  if (!decoded.ok) return { ok: false, reason: decoded.reason };
  if (decoded.entries.some((e) => e.kind === "typed" && looksAbusiveText(e.code))) return { ok: false, reason: "unsuitable" };
  const canonical = encodeEntries(decoded.entries);
  if (!canonical || canonical.included < canonical.total) return { ok: false, reason: "too_large" };
  return { ok: true, payload: canonical.payload, itemCount: decoded.entries.length, entries: decoded.entries };
}

/** Send a shopping list to a friend. It waits in their Community inbox for 30 days. */
export async function handleSendList(userId: string, raw: unknown, ctx: CommunityCtx): Promise<HttpResult> {
  const parsed = sendListBodySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  if (!writeLimited(userId, ctx)) return tooMany;
  const checked = checkListPayload(parsed.data.payload.trim());
  if (!checked.ok) return fail(400, "invalid_list", "That list can't be sent.", { reason: checked.reason });

  // Only to a friend. A person who blocked you is not your friend any more (blocking removes the friendship), so this answer is the same for them.
  const friendship = await ctx.store.getFriendship(parsed.data.friendId);
  if (!friendship || friendship.status !== "accepted" || !isParty(friendship, userId)) return notFound;
  const recipient = otherParty(friendship, userId);
  if (await ctx.store.isBlockedEitherWay(userId, recipient)) return notFound;

  // The daily limits, in the database: 30 lists a day in all and 10 a day to one friend, whether or not that friend has opened or deleted them, so a refusal
  // tells the sender nothing about what the friend did. (A friend whose inbox is full gets the same answer.)
  if (!ctx.limit("community-send", userId, MAX_SENDS_PER_DAY, DAY)) return dailyLimit;
  const slot = await takeSlot(ctx, userId, "send", MAX_SENDS_PER_DAY, { target: recipient, perDay: MAX_SENDS_TO_ONE_PER_DAY });
  if (slot === "day") return dailyLimit;
  if (slot === "pair") return inboxFull;

  const now = ctx.now();
  // the database refuses the 51st unread list even when several arrive together (a trigger): that comes back as null
  const [list, profiles] = await Promise.all([
    ctx.store.insertList({ sender: userId, recipient, payload: checked.payload, itemCount: checked.itemCount, createdAt: iso(now), expiresAt: iso(now + INBOX_DAYS * DAY) }),
    ctx.store.getProfiles([recipient]),
  ]);
  if (!list) return inboxFull;
  return json(201, { ok: true, id: list.id, sentTo: profiles[0]?.username ?? null, itemCount: list.itemCount });
}

/** My inbox: lists friends sent me that haven't expired, newest first, with the payload the app opens. */
export async function handleGetInbox(userId: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!readLimited(userId, ctx)) return tooMany;
  const rows = await ctx.store.inbox(userId, iso(ctx.now()), INBOX_PAGE);
  const profiles = new Map((await ctx.store.getProfiles([...new Set(rows.map((r) => r.sender))])).map((p) => [p.userId, p]));
  const items = rows
    .filter((r) => r.recipient === userId && profiles.has(r.sender))
    .map((r) => ({
      id: r.id, from: { username: profiles.get(r.sender)!.username }, itemCount: r.itemCount, payload: r.payload, createdAt: r.createdAt, readAt: r.readAt, expiresAt: r.expiresAt,
    }));
  return json(200, { ok: true, items, unread: items.filter((i) => i.readAt === null).length });
}

/** Mark one inbox item read (safe to repeat). */
export async function handleMarkRead(userId: string, id: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!writeLimited(userId, ctx)) return tooMany;
  if (!isUuid(id)) return notFound;
  const list = await ctx.store.getList(id);
  if (!live(list, ctx.now()) || list.recipient !== userId) return notFound;
  if (list.readAt === null) await ctx.store.markRead(list.id, iso(ctx.now()));
  return json(200, { ok: true });
}

/** Delete one inbox item. */
export async function handleDeleteInboxItem(userId: string, id: string, ctx: CommunityCtx): Promise<HttpResult> {
  if (!writeLimited(userId, ctx)) return tooMany;
  if (!isUuid(id)) return notFound;
  const list = await ctx.store.getList(id);
  if (!list || list.recipient !== userId) return notFound;
  await ctx.store.deleteList(list.id);
  return json(200, { ok: true });
}
