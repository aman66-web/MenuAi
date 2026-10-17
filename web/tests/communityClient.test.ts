import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { failureText, usernameProblemText } from "../app/app/_lib/communityText";
import { CACHED_INBOX, emptyCache, liveInbox, sanitiseCache, withCached, withoutExpired } from "../lib/mm/communityCache";
import { cleanInboxItem, cleanPerson, cleanProfile, cleanUsername, createCommunityApi, isFailure, type CommunityApi } from "../lib/mm/communityClient";
import { checkUsernameShape } from "../lib/community/username";
import { codeFromPasted } from "../lib/community/friendCode";
import { CUSTOM_RETAILER } from "../lib/mm/groceries";
import { decodePayload, encodeEntries, type SharedEntry } from "../lib/mm/shareList";
import { englishT } from "../lib/mm/i18n";
import { SYNC_STORES } from "../lib/mm/syncMerge";
import { communityWorld, type World } from "./helpers/communityServer";

// The app's side of Community: the client reads answers from the REAL handlers (tests/helpers/communityServer.ts runs lib/community/handlers.ts on the in-memory
// tables behind the routes' paths), so a change to what the server says that the app can't read fails here. Then: everything that comes back is checked like
// the untrusted data about other people it is, the copy kept on the device is checked and never synced, and every failure has words.

const ANA = "10000000-0000-4000-8000-0000000000a1";
const BEN = "10000000-0000-4000-8000-0000000000b2";
const LIST: SharedEntry[] = [
  { retailer: "tesco", kind: "barcode", code: "5000169000000", qty: 2 },
  { retailer: CUSTOM_RETAILER, kind: "typed", code: "Milk", qty: 1 },
];
const PAYLOAD = encodeEntries(LIST)!.payload;

/** A person's client: every call goes through the world's routes as that person. */
function phone(world: World, userId: string, offline = { on: false }): CommunityApi {
  return createCommunityApi({
    request: async (path, init) => {
      if (offline.on) throw new Error("offline");
      const r = await world.handle(userId, init?.method ?? "GET", path, init?.body);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
    },
  });
}

async function befriended() {
  const world = communityWorld();
  const ana = phone(world, ANA);
  const ben = phone(world, BEN);
  const a = await ana.chooseUsername("ana.cooks");
  const b = await ben.chooseUsername("ben99");
  if (!a.ok || !b.ok) throw new Error("usernames");
  const asked = await ana.requestFriend(b.profile.friendCode);
  if (!asked.ok) throw new Error("request");
  const incoming = await ben.friends();
  if (!incoming.ok) throw new Error("friends");
  const accepted = await ben.respond(incoming.incoming[0]!.id, true);
  if (!accepted.ok) throw new Error("respond");
  const mine = await ana.friends();
  if (!mine.ok) throw new Error("friends");
  return { world, ana, ben, a: a.profile, b: b.profile, friendOfAna: mine.friends[0]!, friendOfBen: (await ben.friends() as { friends: Array<{ id: string }> }).friends[0]! };
}

describe("the app's client against the real Community handlers", () => {
  it("choosing a username gives a profile, once; the rules answer with a reason", async () => {
    const world = communityWorld();
    const ana = phone(world, ANA);
    const me0 = await ana.me();
    expect(me0).toEqual({ ok: true, profile: null, counts: { unread: 0, friendRequests: 0 } });
    const short = await ana.chooseUsername("ab");
    expect(isFailure(short) && short.error === "invalid_username" && short.reason === "too_short").toBe(true);
    const odd = await ana.chooseUsername("ana cooks");
    expect(isFailure(odd) && odd.reason).toBe("characters");
    const reserved = await ana.chooseUsername("numbite_team");
    expect(isFailure(reserved) && reserved.reason).toBe("unavailable");
    const ok = await ana.chooseUsername("Ana.Cooks");
    expect(ok.ok && ok.profile.username).toBe("ana.cooks");
    expect(ok.ok && /^[A-HJKMNP-Z2-9]{8}$/.test(ok.profile.friendCode)).toBe(true);
    const again = await ana.chooseUsername("another1");
    expect(isFailure(again) && again.error).toBe("username_set");
    const taken = await phone(world, BEN).chooseUsername("ana.cooks");
    expect(isFailure(taken) && taken.error).toBe("username_taken");
    const me1 = await ana.me();
    expect(me1.ok && me1.profile?.username).toBe("ana.cooks");
  });

  it("add by code, accept, list the friends: other people are a username and a row id only", async () => {
    const { ana, ben, world } = await befriended();
    const f = await ana.friends();
    expect(f.ok && f.friends.map((p) => p.username)).toEqual(["ben99"]);
    expect(f.ok && f.incoming).toEqual([]);
    const g = await ben.friends();
    expect(g.ok && g.friends.map((p) => p.username)).toEqual(["ana.cooks"]);
    // no user id, email or friend code of the other person is anywhere in what the server answered
    const raw = JSON.stringify((await world.handle(ANA, "GET", "community/friends")).body);
    expect(raw).not.toContain(BEN);
    expect(raw).not.toMatch(/@|friendCode/);
  });

  it("an unknown code, your own code and a malformed one all fail the same way (no enumeration through the client either)", async () => {
    const world = communityWorld();
    const ana = phone(world, ANA);
    const me = await ana.chooseUsername("ana.cooks");
    const own = await ana.requestFriend(me.ok ? me.profile.friendCode : "");
    const unknown = await ana.requestFriend("ZZZZZZZZ");
    const garbage = await ana.requestFriend("not a code!");
    for (const r of [own, unknown, garbage]) expect(isFailure(r) && [r.status, r.error]).toEqual([404, "cannot_add"]);
  });

  it("send a list: it arrives in the friend's inbox with the sender's name, can be opened with the share-link decoder, marked read and deleted", async () => {
    const { ana, ben, friendOfAna } = await befriended();
    const sent = await ana.sendList(friendOfAna.id, PAYLOAD);
    expect(sent.ok && sent.itemCount).toBe(2);
    expect((await ben.me()).ok && ((await ben.me()) as { counts: { unread: number } }).counts.unread).toBe(1);
    const inbox = await ben.inbox();
    expect(inbox.ok && inbox.unread).toBe(1);
    const item = inbox.ok ? inbox.items[0]! : null;
    expect(item?.from).toBe("ana.cooks");
    expect(item?.readAt).toBeNull();
    const decoded = decodePayload(item!.payload);
    expect(decoded.ok && decoded.entries).toEqual(LIST);
    expect((await ben.markRead(item!.id)).ok).toBe(true);
    const after = await ben.inbox();
    expect(after.ok && after.unread).toBe(0);
    expect((await ben.deleteItem(item!.id)).ok).toBe(true);
    const empty = await ben.inbox();
    expect(empty.ok && empty.items.length).toBe(0);
  });

  it("a list that isn't a list is refused with a reason", async () => {
    const { ana, friendOfAna } = await befriended();
    for (const payload of ["x", "1AAAAAAhello", "9" + PAYLOAD.slice(1)]) {
      const r = await ana.sendList(friendOfAna.id, payload);
      expect(isFailure(r) && r.error).toBe("invalid_list");
    }
  });

  it("blocking removes the friendship and the lists; the blocked person's view is a removed friend's; unblocking does not bring the friendship back", async () => {
    const { ana, ben, friendOfAna, friendOfBen } = await befriended();
    await ana.sendList(friendOfAna.id, PAYLOAD);
    const inbox = await ben.inbox();
    const listId = inbox.ok ? inbox.items[0]!.id : "";
    expect((await ben.block({ listId })).ok).toBe(true);
    expect((await ben.inbox()).ok && ((await ben.inbox()) as { items: unknown[] }).items.length).toBe(0);
    const a = await ana.friends();
    expect(a.ok && a.friends.length).toBe(0);
    const stranger = await ana.sendList(friendOfAna.id, PAYLOAD);
    expect(isFailure(stranger) && stranger.error).toBe("not_found");
    const blocks = await ben.blocks();
    expect(blocks.ok && blocks.blocks.map((p) => p.username)).toEqual(["ana.cooks"]);
    expect((await ben.unblock(blocks.ok ? blocks.blocks[0]!.id : "")).ok).toBe(true);
    expect(((await ben.friends()) as { friends: unknown[] }).friends.length).toBe(0);
    expect(friendOfBen.id).toBeTruthy();
  });

  it("report: needs a reason from the list; with block it also blocks; the report is stored for the founder", async () => {
    const { ana, ben, world, friendOfBen } = await befriended();
    // the client refuses a reason the server doesn't know before sending anything
    const bad = await ben.report({ friendId: friendOfBen.id, reason: "boring" as never });
    expect(isFailure(bad) && bad.error).toBe("invalid_request");
    const r = await ben.report({ friendId: friendOfBen.id, reason: "abusive_username", note: "  rude name ", block: true });
    expect(r.ok && r.blocked).toBe(true);
    expect(world.mem.reports.length).toBe(1);
    expect(world.mem.reports[0]!.note).toBe("rude name");
    expect(((await ana.friends()) as { friends: unknown[] }).friends.length).toBe(0);
  });

  it("when the network is down every call says offline, and nothing throws", async () => {
    const world = communityWorld();
    const off = { on: true };
    const ana = phone(world, ANA, off);
    for (const call of [() => ana.me(), () => ana.friends(), () => ana.inbox(), () => ana.requestFriend("ABCDEFGH"), () => ana.sendList("x", PAYLOAD), () => ana.markRead("x")]) {
      const r = await call();
      expect(isFailure(r) && [r.offline, r.error, r.status]).toEqual([true, "offline", 0]);
    }
  });

  it("a signed-out caller gets an unauthorized failure the screens can act on", async () => {
    const api = createCommunityApi({ request: async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) });
    const r = await api.me();
    expect(isFailure(r) && [r.error, r.status, r.offline]).toEqual(["unauthorized", 401, false]);
  });
});

describe("what comes back about other people is checked before it is used", () => {
  const NOW = "2026-10-16T12:00:00.000Z";
  it("usernames must have exactly the stored shape (no markup, no capitals, no spaces)", () => {
    for (const bad of ["<script>alert(1)</script>", "Ana", "a b c", "ab", "x".repeat(21), ".dot", "dot.", "a..b", "😀😀😀", "", null, 5, undefined]) expect(cleanUsername(bad as never), String(bad)).toBeNull();
    for (const good of ["ana", "ana.cooks", "ben_99", "a1b"]) expect(cleanUsername(good)).toBe(good);
  });
  it("a person needs an id, a username and a date", () => {
    expect(cleanPerson({ id: "00000000-0000-4000-8000-000000000001", username: "ana", createdAt: NOW })).toEqual({ id: "00000000-0000-4000-8000-000000000001", username: "ana", createdAt: NOW });
    for (const bad of [null, "x", {}, { id: "1", username: "ana", createdAt: NOW }, { id: "00000000-0000-4000-8000-000000000001", username: "<b>", createdAt: NOW }, { id: "00000000-0000-4000-8000-000000000001", username: "ana", createdAt: "yesterday" }]) expect(cleanPerson(bad)).toBeNull();
  });
  it("a profile needs a well-formed friend code", () => {
    expect(cleanProfile({ username: "ana", friendCode: "ABCDEFGH", createdAt: NOW })).not.toBeNull();
    for (const code of ["abcdefgh", "ABCDEFG", "ABCDEFG0", "ABCD-EFG", "ILLEGAL1"]) expect(cleanProfile({ username: "ana", friendCode: code, createdAt: NOW }), code).toBeNull();
  });
  it("an inbox item keeps only a payload made of the characters a list uses, within the size limit", () => {
    const item = { id: "00000000-0000-4000-8000-000000000009", from: { username: "ana" }, itemCount: 2, payload: PAYLOAD, createdAt: NOW, readAt: null, expiresAt: "2026-11-15T12:00:00.000Z" };
    expect(cleanInboxItem(item)?.payload).toBe(PAYLOAD);
    for (const payload of ["<img src=x onerror=alert(1)>", "a b", "x".repeat(6001), "", 5]) expect(cleanInboxItem({ ...item, payload }), String(payload).slice(0, 12)).toBeNull();
    expect(cleanInboxItem({ ...item, from: { username: "<b>x</b>" } })).toBeNull();
    expect(cleanInboxItem({ ...item, from: 5 })).toBeNull();
    expect(cleanInboxItem({ ...item, itemCount: -4 })?.itemCount).toBe(1);
  });
  it("a server that sends nonsense gives an error, not a crash", async () => {
    const api = createCommunityApi({ request: async () => new Response(JSON.stringify({ ok: true, profile: { username: "<x>" } }), { status: 200 }) });
    const r = await api.me();
    expect(isFailure(r) && r.error).toBe("error");
    const html = createCommunityApi({ request: async () => new Response("<html>502</html>", { status: 502 }) });
    const f = await html.friends();
    expect(isFailure(f) && [f.error, f.status]).toEqual(["error", 502]);
  });
});

describe("the copy kept on this device", () => {
  const person = { id: "00000000-0000-4000-8000-000000000001", username: "ben99", createdAt: "2026-10-16T12:00:00.000Z" };
  it("is for one account and is checked when it is read back", () => {
    const cache = withCached(emptyCache("user-1", 1), { profile: { username: "ana", friendCode: "ABCDEFGH", createdAt: "2026-10-16T12:00:00.000Z" }, friends: { friends: [person], incoming: [], outgoing: [] } }, 2);
    const round = sanitiseCache(JSON.parse(JSON.stringify(cache)));
    expect(round?.userId).toBe("user-1");
    expect(round?.friends?.friends).toEqual([person]);
    expect(sanitiseCache(null)).toBeNull();
    expect(sanitiseCache({ userId: "" })).toBeNull();
    const dirty = sanitiseCache({ userId: "u", savedAt: 1, profile: { username: "<b>" }, counts: { unread: -1, friendRequests: "x" }, friends: { friends: [person, { id: "x", username: "<i>" }], incoming: "no", outgoing: [] }, inbox: { items: [{ nope: 1 }], unread: 3 } });
    expect(dirty?.profile).toBeNull();
    expect(dirty?.counts).toEqual({ unread: 0, friendRequests: 0 });
    expect(dirty?.friends?.friends).toEqual([person]);
    expect(dirty?.friends?.incoming).toEqual([]);
    expect(dirty?.inbox?.items).toEqual([]);
  });
  it("an inbox written to the copy and read back keeps its lists (the copy holds the sender as plain text, the server as { username })", () => {
    const item = { id: "00000000-0000-4000-8000-000000000009", from: "ana", itemCount: 2, payload: PAYLOAD, createdAt: "2026-10-16T12:00:00.000Z", readAt: null, expiresAt: "2026-11-15T12:00:00.000Z" };
    const cache = withCached(emptyCache("u", 1), { inbox: { items: [item], unread: 1 } }, 2);
    const back = sanitiseCache(JSON.parse(JSON.stringify(cache)));
    expect(back?.inbox?.items).toEqual([item]);
    expect(back?.inbox?.unread).toBe(1);
    expect(cleanInboxItem({ ...item, from: { username: "ana" } })?.from).toBe("ana");
    expect(cleanInboxItem({ ...item, from: "<b>x</b>" })).toBeNull();
  });
  it("drops a list that has run out (30 days) when the copy is read back, as the server would: it isn't listed, counted or openable", () => {
    const item = (n: number, expiresAt: string, readAt: string | null = null) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, from: "ana", itemCount: 1, payload: PAYLOAD, createdAt: "2026-09-01T12:00:00.000Z", readAt, expiresAt });
    const items = [item(1, "2026-10-01T12:00:00.000Z"), item(2, "2026-10-20T12:00:00.000Z"), item(3, "2026-10-02T12:00:00.000Z", "2026-09-02T12:00:00.000Z"), item(4, "2026-11-20T12:00:00.000Z", "2026-09-05T12:00:00.000Z")];
    const cache = { ...withCached(emptyCache("u", 1), { inbox: { items, unread: 2 } }, 2), counts: { unread: 2, friendRequests: 1 } };
    const now = Date.parse("2026-10-16T12:00:00.000Z");
    const fresh = withoutExpired(cache, now);
    expect(fresh.inbox?.items.map((i) => i.id)).toEqual([items[1]!.id, items[3]!.id]);
    expect(fresh.inbox?.unread).toBe(1); // counted again from what is left
    expect(fresh.counts).toEqual({ unread: 1, friendRequests: 1 });
    // nothing run out: the same objects come back (no needless work, no new state)
    expect(withoutExpired(fresh, now)).toBe(fresh);
    expect(liveInbox(fresh.inbox!, now)).toBe(fresh.inbox);
    expect(withoutExpired(emptyCache("u", 1), now).inbox).toBeNull();
    // exactly at the moment it runs out it is gone
    expect(liveInbox({ items: [item(5, "2026-10-16T12:00:00.000Z")], unread: 1 }, now).items).toEqual([]);
  });
  it("keeps only the newest lists for offline reading", () => {
    const item = (n: number) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, from: "ana", itemCount: 1, payload: PAYLOAD, createdAt: "2026-10-16T12:00:00.000Z", readAt: null, expiresAt: "2026-11-15T12:00:00.000Z" });
    const many = withCached(emptyCache("u", 1), { inbox: { items: Array.from({ length: 60 }, (_, i) => item(i + 1)), unread: 60 } }, 2);
    expect(many.inbox?.items.length).toBe(CACHED_INBOX);
    expect(many.inbox?.items[0]?.id).toBe(item(1).id);
  });
  it("is never one of the synced stores, never reaches the sync code, and is cleared when someone signs out, deletes the account or clears the device", () => {
    expect(SYNC_STORES as readonly string[]).not.toContain("community");
    for (const name of SYNC_STORES) expect(name).not.toMatch(/communit|friend|inbox|block|username/i);
    const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    for (const f of ["lib/mm/syncStores.ts", "lib/mm/sync.ts", "lib/mm/syncMerge.ts", "lib/sync/handlers.ts"]) expect(read(f), f).not.toMatch(/communit/i);
    const account = read("app/app/_lib/account.ts");
    // the sync engine is handed the stores listed explicitly; the community copy is not among them
    expect(account.match(/createSyncAdapters\(\{[\s\S]*?\}\)/)?.[0]).not.toMatch(/communit/i);
    expect(account.match(/localStores: \[[^\]]*\]/)?.[0]).not.toMatch(/communit/i);
    // and it is emptied in the three places the account goes away from this device
    expect((account.match(/communityCacheStore\.reset\(\)/g) ?? []).length).toBe(3);
  });
});

describe("the words for what can go wrong", () => {
  const f = (error: string, extra: Record<string, unknown> = {}) => ({ ok: false as const, error, status: error === "offline" ? 0 : 400, offline: error === "offline", ...extra });
  it("every error the server can send has its own sentence, in plain words with no code in it", () => {
    const codes = ["offline", "unauthorized", "rate_limited", "cannot_add", "no_username", "request_limit", "friend_limit", "not_found", "inbox_full", "username_taken", "username_set", "invalid_username", "invalid_list", "daily_limit", "cannot_accept"];
    const seen = new Map<string, string>();
    for (const c of codes) {
      const text = failureText(f(c), englishT, "Ben");
      expect(text, c).not.toMatch(/undefined|\{|_|error/i);
      expect(text.length).toBeGreaterThan(15);
      seen.set(c, text);
    }
    // everything else is the same generic line
    expect(failureText(f("server_error"), englishT)).toBe(failureText(f("whatever"), englishT));
    expect(new Set(seen.values()).size).toBe(codes.length);
    expect(failureText(f("inbox_full"), englishT, "Ben")).toContain("Ben");
  });
  it("a name that can't be used says why without saying which rule list caught it", () => {
    for (const problem of ["empty", "too_short", "too_long", "characters", "edges", "repeats", "unavailable"] as const) expect(usernameProblemText(problem, englishT).length).toBeGreaterThan(10);
    expect(usernameProblemText("reserved" as never, englishT)).toBe(usernameProblemText("unavailable", englishT));
    expect(usernameProblemText("blocked" as never, englishT)).toBe(usernameProblemText("unavailable", englishT));
    // the live check the sheet uses for the shape agrees with the sentences
    expect(checkUsernameShape("a")).toEqual({ ok: false, reason: "too_short" });
  });
  it("an invite link, a hyphenated code and a lower-case code all come out as the same code (the Add a friend box tidies them the way the server does)", () => {
    for (const pasted of ["ABCDEFGH", "abcd-efgh", " ABCD EFGH ", "https://numbite.com/f#ABCDEFGH", "numbite://f#abcd-efgh", "Add me! https://numbite.com/f#ABCDEFGH thanks"]) expect(codeFromPasted(pasted), pasted).toBe("ABCDEFGH");
    for (const pasted of ["", "ABCDEFG", "ABCDEFG0", "hello there", "https://numbite.com/f"]) expect(codeFromPasted(pasted), pasted).toBeNull();
  });
});
