import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { fakeSupabaseOverPsql, parseTarget, runSql } from "./helpers/postgrestOverPsql";
import {
  handleBlock, handleFriendRequest, handleFriendRespond, handleGetBlocks, handleGetFriends, handleGetInbox, handleGetMe, handleMarkRead, handlePutMe, handleRemoveFriend,
  handleReport, handleSendList, handleUnblock, handleDeleteInboxItem, MAX_CODE_TRIES_PER_DAY, MAX_SENDS_TO_ONE_PER_DAY, MAX_UNREAD, type CommunityCtx,
} from "../lib/community/handlers";
import { handleCleanup } from "../lib/handlers";
import { makeLimit } from "../lib/auth/limiter";
import { decodePayload, encodeEntries, type SharedEntry } from "../lib/mm/shareList";
import type { RandomInt } from "../lib/community/friendCode";

// The Supabase adapter (lib/store-supabase-community.ts) against the REAL tables of the migration, in a scratch Postgres, through a stand-in for supabase-js
// that runs its queries with psql as the service_role (tests/helpers/postgrestOverPsql.ts). It proves the adapter's columns, filters, constraint handling and
// the database's cascade work together with the real handlers. Skipped unless COMMUNITY_TEST_PG names a scratch database that already has
// supabase/migrations/20261016120000_community.sql applied (see docs/BACKEND.md "Tests"):
//   COMMUNITY_TEST_PG=127.0.0.1:54329/scratch npx vitest run tests/communityAdapter.test.ts
// A bare Postgres needs what Supabase provides first: psql -d scratch -f tests/helpers/scratch-supabase-stub.sql (roles, an auth.users table, default privileges),
// then supabase/migrations/20261016120000_community.sql. Needs psql on the PATH.
// It empties the Community tables and auth.users in that database, so it refuses any database whose name doesn't contain "scratch" or "test".

const SPEC = process.env.COMMUNITY_TEST_PG;
const target = SPEC ? parseTarget(SPEC) : null;

vi.mock("server-only", () => ({}));
vi.mock("../lib/store-supabase", () => ({
  serverDb: () => {
    if (!target) throw new Error("no database");
    return fakeSupabaseOverPsql(target);
  },
}));

const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const sql = (text: string) => {
  const r = runSql(target!, text);
  if (r.error) throw new Error(`${r.error.code} ${r.error.message}`);
  return r.out;
};

const MILK: SharedEntry = { retailer: "own", kind: "typed", code: "Milk", qty: 1 };
const PANCAKES: SharedEntry = { retailer: "tesco", kind: "shop", code: "272407558", qty: 2 };
const LIST = encodeEntries([PANCAKES, MILK])!.payload;

describe.skipIf(!target)("the Supabase adapter against the real tables", { timeout: 120_000 }, () => {
  let store: CommunityCtx["store"];
  let clock = { now: T0 };
  let ctx: CommunityCtx;
  let n = 0;

  beforeAll(async () => {
    if (!/scratch|test/.test(target!.db)) throw new Error(`refusing to run against a database called ${target!.db}: it must contain "scratch" or "test"`);
    store = (await import("../lib/store-supabase-community")).supabaseCommunity;
  });

  beforeEach(() => {
    sql("truncate auth.users cascade");
    clock = { now: T0 };
    let seed = 7;
    const random: RandomInt = (m) => (seed = (seed * 1103515245 + 12345) % 2147483648) % m;
    ctx = { store, limit: makeLimit(() => clock.now), now: () => clock.now, random };
    n = 0;
  });

  const newUser = (): string => {
    const id = `30000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
    sql(`insert into auth.users (id, aud, role, email) values ('${id}', 'authenticated', 'authenticated', 'adapter-test-${n}@numbite.invalid')`);
    return id;
  };
  const join = async (username: string) => {
    const id = newUser();
    const r = await handlePutMe(id, { username }, ctx);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return { id, username, code: (r.body!.profile as { friendCode: string }).friendCode };
  };
  type Person = Awaited<ReturnType<typeof join>>;
  const friends = async (p: Person) =>
    (await handleGetFriends(p.id, ctx)).body as { friends: Array<{ id: string; username: string }>; incoming: Array<{ id: string; username: string }>; outgoing: Array<{ id: string; username: string }> };
  const befriend = async (a: Person, b: Person) => {
    const asked = await handleFriendRequest(a.id, { code: b.code }, ctx);
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    const id = (asked.body as { id: string }).id;
    expect((await handleFriendRespond(b.id, { id, accept: true }, ctx)).status).toBe(200);
    return id;
  };
  const inbox = async (p: Person) => (await handleGetInbox(p.id, ctx)).body as { items: Array<{ id: string; from: { username: string }; payload: string; itemCount: number; readAt: string | null }>; unread: number };
  const count = (table: string) => Number(sql(`select count(*) from public.${table}`));

  it("choosing a username: stored lower case with a valid code; a taken name and a taken code are told apart; once only", async () => {
    const alice = await join("alice");
    expect(sql(`select username || ' ' || friend_code from public.community_profiles where user_id = '${alice.id}'`)).toBe(`alice ${alice.code}`);
    expect((await handleGetMe(alice.id, ctx)).body).toMatchObject({ profile: { username: "alice", friendCode: alice.code }, counts: { unread: 0, friendRequests: 0 } });

    const taken = await handlePutMe(newUser(), { username: "Alice" }, ctx);
    expect(taken.body).toMatchObject({ error: "username_taken" });
    expect((await handlePutMe(alice.id, { username: "alice2" }, ctx)).body).toMatchObject({ error: "username_set" });

    // the database's unique friend code: a generator that first repeats alice's code makes the database refuse it, and the handler draws again
    let calls = 0;
    const replay: RandomInt = (m) => {
      const i = calls++;
      return i < 8 ? "ABCDEFGHJKMNPQRSTUVWXYZ23456789".indexOf(alice.code[i]!) % m : (i * 7) % m;
    };
    const second = await handlePutMe(newUser(), { username: "bob" }, { ...ctx, random: replay });
    expect(second.status).toBe(201);
    expect((second.body!.profile as { friendCode: string }).friendCode).not.toBe(alice.code);
    expect(calls).toBeGreaterThan(8); // it had to draw again after the first code was refused by the database
  });

  it("the friend flow, with requests, counts and lists in both directions", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const asked = await handleFriendRequest(alice.id, { code: bob.code.toLowerCase() }, ctx);
    expect(asked.status).toBe(201);
    expect((await friends(alice)).outgoing.map((f) => f.username)).toEqual(["bob"]);
    expect((await friends(bob)).incoming.map((f) => f.username)).toEqual(["alice"]);
    expect((await handleGetMe(bob.id, ctx)).body).toMatchObject({ counts: { friendRequests: 1 } });
    // the same pair twice, and the other way round, are one row (the unique index on the sorted pair)
    expect((await handleFriendRequest(alice.id, { code: bob.code }, ctx)).body).toMatchObject({ status: "requested", id: (asked.body as { id: string }).id });
    const back = await handleFriendRequest(bob.id, { code: alice.code }, ctx);
    expect(back.body).toMatchObject({ status: "friends" });
    expect(count("friendships")).toBe(1);
    expect((await friends(alice)).friends.map((f) => f.username)).toEqual(["bob"]);
    expect((await friends(bob)).friends.map((f) => f.username)).toEqual(["alice"]);
    expect((await handleGetMe(bob.id, ctx)).body).toMatchObject({ counts: { friendRequests: 0 } });
    // the unknown code and the own code are the same neutral answer
    const unknown = await handleFriendRequest(alice.id, { code: "ZZZZZZZZ" }, ctx);
    expect(unknown).toEqual(await handleFriendRequest(alice.id, { code: alice.code }, ctx));
    expect(unknown.body).toMatchObject({ error: "cannot_add" });
  });

  it("declining keeps a hidden row for 30 days (so the same person can't ask again); removing and taking back delete the row", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const carol = await join("carol");
    await handleFriendRequest(alice.id, { code: bob.code }, ctx);
    expect((await handleFriendRespond(bob.id, { id: (await friends(bob)).incoming[0]!.id, accept: false }, ctx)).body).toEqual({ ok: true, status: "declined" });
    expect(sql("select status || '|' || (answered_at is not null)::text from public.friendships")).toBe("declined|true");
    expect((await friends(alice)).outgoing).toEqual([]);
    expect((await friends(bob)).incoming).toEqual([]);
    expect((await handleFriendRequest(alice.id, { code: bob.code }, ctx)).body).toMatchObject({ error: "cannot_add" });
    // 31 days later the daily clean-up deletes it, and she may ask again
    clock.now = T0 + 31 * DAY;
    const done = await handleCleanup("Bearer secret-secret-123", "secret-secret-123", { store: { clearIpHashes: async () => 0 } as never, ipHash: null, now: new Date(clock.now), community: store });
    expect(done.body).toMatchObject({ oldDeclined: 1 });
    expect(count("friendships")).toBe(0);
    expect((await handleFriendRequest(alice.id, { code: bob.code }, ctx)).status).toBe(201);
    clock.now = T0;
    sql("truncate public.friendships");
    const fid = await befriend(alice, carol);
    expect((await handleRemoveFriend(bob.id, fid, ctx)).status).toBe(404); // a stranger
    expect(count("friendships")).toBe(1);
    expect((await handleRemoveFriend(carol.id, fid, ctx)).status).toBe(200);
    expect(count("friendships")).toBe(0);
  });

  it("sending a list: the inbox, newest first, unread counts, read, delete; the stored text is the server's own", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const fid = await befriend(alice, bob);
    const sent = await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx);
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body).toMatchObject({ sentTo: "bob", itemCount: 2 });
    clock.now += 60_000;
    await handleSendList(alice.id, { friendId: fid, payload: encodeEntries([MILK])!.payload }, ctx);

    const box = await inbox(bob);
    expect(box.items.map((i) => i.itemCount)).toEqual([1, 2]); // newest first
    expect(box.unread).toBe(2);
    expect(box.items[0]!.from).toEqual({ username: "alice" });
    expect(decodePayload(box.items[1]!.payload)).toEqual({ ok: true, entries: [PANCAKES, MILK] });
    expect((await handleGetMe(bob.id, ctx)).body).toMatchObject({ counts: { unread: 2 } });
    expect((await inbox(alice)).items).toEqual([]);

    expect((await handleMarkRead(bob.id, box.items[0]!.id, ctx)).status).toBe(200);
    expect((await handleMarkRead(alice.id, box.items[0]!.id, ctx)).status).toBe(404);
    expect((await handleGetMe(bob.id, ctx)).body).toMatchObject({ counts: { unread: 1 } });
    expect(sql(`select count(*) from public.community_lists where read_at is not null`)).toBe("1");
    expect((await handleDeleteInboxItem(alice.id, box.items[1]!.id, ctx)).status).toBe(404);
    expect((await handleDeleteInboxItem(bob.id, box.items[1]!.id, ctx)).status).toBe(200);
    expect(count("community_lists")).toBe(1);
  });

  it("10 lists a day to one friend are counted in the database whatever the friend does; a restart of the server gives nothing back", async () => {
    const bob = await join("bob");
    const alice = await join("alice");
    const fid = await befriend(alice, bob);
    for (let i = 0; i < MAX_SENDS_TO_ONE_PER_DAY; i++) {
      ctx.limit = makeLimit(() => clock.now); // "a new server" each time
      expect((await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx)).status).toBe(201);
    }
    expect((await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx)).body).toMatchObject({ error: "inbox_full" });
    for (const item of (await inbox(bob)).items) await handleMarkRead(bob.id, item.id, ctx); // reading them all changes nothing for the sender
    for (const item of (await inbox(bob)).items.slice(0, 5)) await handleDeleteInboxItem(bob.id, item.id, ctx); // nor does deleting some
    expect((await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx)).body).toMatchObject({ error: "inbox_full" });
    expect(sql(`select count(*) from public.community_attempts where user_id = '${alice.id}' and kind = 'send' and target = '${bob.id}'`)).toBe(String(MAX_SENDS_TO_ONE_PER_DAY));
    clock.now = T0 + DAY + 60_000;
    expect((await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx)).status).toBe(201);
  });

  it("friend-code tries are counted in the database: wrong codes and taken-back requests give nothing back", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    let ok = 0;
    for (let i = 0; i < 40; i++) {
      ctx.limit = makeLimit(() => clock.now);
      const r = await handleFriendRequest(alice.id, { code: i % 2 === 0 ? bob.code : `GUESS${String(i).padStart(3, "2")}` }, ctx);
      if (r.status === 201) {
        ok++;
        await handleRemoveFriend(alice.id, (r.body as { id: string }).id, ctx);
      }
    }
    expect(ok).toBe(MAX_CODE_TRIES_PER_DAY / 2);
    expect(sql(`select count(*) from public.community_attempts where user_id = '${alice.id}' and kind = 'code'`)).toBe(String(MAX_CODE_TRIES_PER_DAY));
    const stopped = await handleFriendRequest(alice.id, { code: bob.code }, ctx);
    expect(stopped.body).toMatchObject({ error: "daily_limit" });
    // the daily clean-up forgets tallies older than 2 days
    clock.now = T0 + 3 * DAY;
    const done = await handleCleanup("Bearer secret-secret-123", "secret-secret-123", { store: { clearIpHashes: async () => 0 } as never, ipHash: null, now: new Date(clock.now), community: store });
    expect(done.body).toMatchObject({ oldTallies: MAX_CODE_TRIES_PER_DAY });
    expect(count("community_attempts")).toBe(0);
  });

  it("the inbox holds at most 50 unread lists: the database refuses the 51st and the handler says the inbox is full", async () => {
    const bob = await join("bob");
    const senders = [];
    for (let i = 0; i < 6; i++) {
      const p = await join(`sender${i}`);
      senders.push({ p, fid: await befriend(p, bob) });
    }
    let sent = 0;
    // five friends send 9 each (45), the sixth sends 5: that is 50 unread (each is far under the 10 a day to one friend)
    for (const [n, { p, fid }] of senders.entries()) for (let i = 0; i < (n === 5 ? 5 : 9); i++) if ((await handleSendList(p.id, { friendId: fid, payload: LIST }, ctx)).status === 201) sent++;
    expect(sent).toBe(MAX_UNREAD);
    expect(count("community_lists")).toBe(MAX_UNREAD);
    const full = await handleSendList(senders[5]!.p.id, { friendId: senders[5]!.fid, payload: LIST }, ctx);
    expect(full.body).toMatchObject({ error: "inbox_full" });
    await handleMarkRead(bob.id, (await inbox(bob)).items[0]!.id, ctx);
    expect((await handleSendList(senders[5]!.p.id, { friendId: senders[5]!.fid, payload: LIST }, ctx)).status).toBe(201);
  });

  it("the per-friend cap counts only that friend's lists", async () => {
    const bob = await join("bob");
    const alice = await join("alice");
    const carol = await join("carol");
    const fA = await befriend(alice, bob);
    const fC = await befriend(carol, bob);
    for (let i = 0; i < MAX_SENDS_TO_ONE_PER_DAY; i++) await handleSendList(alice.id, { friendId: fA, payload: LIST }, ctx);
    expect((await handleSendList(alice.id, { friendId: fA, payload: LIST }, ctx)).body).toMatchObject({ error: "inbox_full" });
    expect((await handleSendList(carol.id, { friendId: fC, payload: LIST }, ctx)).status).toBe(201);
    expect((await inbox(bob)).unread).toBe(MAX_SENDS_TO_ONE_PER_DAY + 1);
  });

  it("store details the handlers lean on: a pair is found from either side, only a pending request can be accepted, a pair can't be created twice", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const at = new Date(T0).toISOString();
    const made = await store.createFriendship(alice.id, bob.id, at);
    expect(made).toMatchObject({ requester: alice.id, addressee: bob.id, status: "pending" });
    expect(await store.createFriendship(alice.id, bob.id, at)).toBeNull();
    expect(await store.createFriendship(bob.id, alice.id, at)).toBeNull();
    expect((await store.findFriendship(alice.id, bob.id))?.id).toBe(made!.id);
    expect((await store.findFriendship(bob.id, alice.id))?.id).toBe(made!.id);
    expect(await store.findFriendship(alice.id, newUser())).toBeNull();
    expect((await store.acceptFriendship(made!.id))?.status).toBe("accepted");
    expect(await store.acceptFriendship(made!.id)).toBeNull();
    expect(await store.countFriends(alice.id)).toBe(1);
    expect(await store.countFriends(bob.id)).toBe(1);
    expect(await store.countPendingOut(alice.id)).toBe(0);
    expect(await store.isBlockedEitherWay(alice.id, bob.id)).toBe(false);
    await store.addBlock(bob.id, alice.id, at);
    expect(await store.isBlockedEitherWay(alice.id, bob.id)).toBe(true);
    expect(await store.isBlockedEitherWay(bob.id, alice.id)).toBe(true);
    const again = await store.addBlock(bob.id, alice.id, at); // idempotent: the same block comes back
    expect((await store.getBlock(again.id))?.blocked).toBe(alice.id);
    expect(count("community_blocks")).toBe(1);
    expect(await store.deleteBlock(again.id)).toBe(true);
    expect(await store.deleteBlock(again.id)).toBe(false);
  });

  it("lists expire after 30 days: not shown, not counted, deleted by the clean-up", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const fid = await befriend(alice, bob);
    await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx);
    expect(sql(`select (expires_at - created_at)::text from public.community_lists`)).toBe("30 days");
    clock.now = T0 + 29 * DAY;
    expect((await inbox(bob)).items).toHaveLength(1);
    clock.now = T0 + 31 * DAY;
    expect((await inbox(bob)).items).toEqual([]);
    expect((await handleGetMe(bob.id, ctx)).body).toMatchObject({ counts: { unread: 0 } });
    expect(count("community_lists")).toBe(1);
    const done = await handleCleanup("Bearer secret-secret-123", "secret-secret-123", { store: { clearIpHashes: async () => 0 } as never, ipHash: null, now: new Date(clock.now), community: store });
    expect(done.body).toMatchObject({ expiredLists: 1 });
    expect(count("community_lists")).toBe(0);
  });

  it("blocking removes the friendship and the lists both ways; the block can be listed and lifted", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const fid = await befriend(alice, bob);
    await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx);
    await handleSendList(bob.id, { friendId: fid, payload: LIST }, ctx);
    expect(count("community_lists")).toBe(2);
    expect((await handleBlock(bob.id, { friendId: fid }, ctx)).status).toBe(200);
    expect(count("friendships")).toBe(0);
    expect(count("community_lists")).toBe(0);
    expect(count("community_blocks")).toBe(1);
    expect((await handleFriendRequest(alice.id, { code: bob.code }, ctx)).body).toMatchObject({ error: "cannot_add" });
    expect((await handleFriendRequest(bob.id, { code: alice.code }, ctx)).body).toMatchObject({ error: "cannot_add" });
    expect((await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx)).status).toBe(404);
    const blocks = (await handleGetBlocks(bob.id, ctx)).body as { blocks: Array<{ id: string; username: string }> };
    expect(blocks.blocks.map((b) => b.username)).toEqual(["alice"]);
    expect((await handleGetBlocks(alice.id, ctx)).body).toEqual({ ok: true, blocks: [] });
    expect((await handleUnblock(alice.id, blocks.blocks[0]!.id, ctx)).status).toBe(404);
    expect((await handleUnblock(bob.id, blocks.blocks[0]!.id, ctx)).status).toBe(200);
    expect(count("community_blocks")).toBe(0);
    expect((await handleFriendRequest(alice.id, { code: bob.code }, ctx)).status).toBe(201);
  });

  it("blocking through an inbox item, and a second block of the same person, are fine", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const fid = await befriend(alice, bob);
    await handleSendList(bob.id, { friendId: fid, payload: LIST }, ctx);
    await handleRemoveFriend(alice.id, fid, ctx);
    const item = (await inbox(alice)).items[0]!;
    expect((await handleBlock(alice.id, { listId: item.id }, ctx)).status).toBe(200);
    expect(count("community_blocks")).toBe(1);
    const fid2 = await (async () => {
      await handleUnblock(alice.id, ((await handleGetBlocks(alice.id, ctx)).body as { blocks: Array<{ id: string }> }).blocks[0]!.id, ctx);
      return befriend(alice, bob);
    })();
    await handleSendList(bob.id, { friendId: fid2, payload: LIST }, ctx);
    const item2 = (await inbox(alice)).items[0]!;
    await handleBlock(alice.id, { listId: item2.id }, ctx);
    await handleBlock(alice.id, { listId: item2.id }, ctx).then((r) => expect(r.status).toBe(404)); // the list went with the block
    expect(count("community_blocks")).toBe(1);
  });

  it("a report keeps both usernames, the reason, the note and the words of a reported list; the founder's view lists it", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const fid = await befriend(alice, bob);
    await handleSendList(bob.id, { friendId: fid, payload: LIST }, ctx);
    const item = (await inbox(alice)).items[0]!;
    expect((await handleReport(alice.id, { listId: item.id, reason: "abusive_list", note: "rude", block: true }, ctx)).status).toBe(201);
    expect(count("community_lists")).toBe(0); // gone with the block, but the report remembers
    const row = sql(`select reporter_username || '|' || reported_username || '|' || reason || '|' || note || '|' || list_text || '|' || (list_payload is not null)::text from public.community_reports`);
    expect(row).toBe("alice|bob|abusive_list|rude|Milk|true");
    expect(sql(`select count(*) from public.open_community_reports where reported_username = 'bob'`)).toBe("1");
    expect(sql(`select status from public.community_reports`)).toBe("open");
  });

  it("deleting an account in the database takes the person out of everyone's lists", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const carol = await join("carol");
    const fAB = await befriend(alice, bob);
    await befriend(alice, carol);
    await handleSendList(alice.id, { friendId: fAB, payload: LIST }, ctx);
    await handleReport(bob.id, { friendId: fAB, reason: "other" }, ctx);
    sql(`delete from auth.users where id = '${alice.id}'`);
    expect(count("community_profiles")).toBe(2);
    expect(count("friendships")).toBe(0);
    expect(count("community_lists")).toBe(0);
    expect(sql(`select count(*) from public.community_attempts where user_id = '${alice.id}' or target = '${alice.id}'`)).toBe("0");
    // the report about her stays, readable from the copied names, with her id emptied
    expect(sql("select reporter_username || '|' || reported_username || '|' || (reported is null)::text || '|' || (reporter is not null)::text from public.community_reports")).toBe("bob|alice|true|true");
    expect((await friends(bob)).friends).toEqual([]);
    expect((await inbox(bob)).items).toEqual([]);
    expect((await handleFriendRequest(bob.id, { code: alice.code }, ctx)).body).toMatchObject({ error: "cannot_add" });
    expect((await handlePutMe(newUser(), { username: "alice" }, ctx)).status).toBe(201); // the name is free again
  });

  it("only a real relationship can be reported or blocked, and one open report per person and list", async () => {
    const attacker = await join("attacker");
    const victim = await join("victim");
    const pending = (await handleFriendRequest(attacker.id, { code: victim.code }, ctx)).body as { id: string };
    expect((await handleReport(attacker.id, { friendId: pending.id, reason: "harassment", note: "made up" }, ctx)).status).toBe(404);
    expect((await handleBlock(attacker.id, { friendId: pending.id }, ctx)).status).toBe(404);
    expect(count("community_reports")).toBe(0);
    expect(count("community_blocks")).toBe(0);
    // the one who was asked may
    expect((await handleReport(victim.id, { friendId: pending.id, reason: "spam" }, ctx)).status).toBe(201);
    expect((await handleReport(victim.id, { friendId: pending.id, reason: "spam", note: "again" }, ctx)).status).toBe(201); // the unique index refuses a second open one; the handler is quiet about it
    expect(count("community_reports")).toBe(1);
    expect(sql("select count(*) from public.community_reports where note is null")).toBe("1");
    sql("update public.community_reports set status = 'dismissed', resolved_at = now()");
    expect((await handleReport(victim.id, { friendId: pending.id, reason: "spam", note: "again" }, ctx)).status).toBe(201);
    expect(count("community_reports")).toBe(2);
  });

  it("a reported typed word cut in the middle of an emoji is stored whole (Postgres refuses half a character)", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const fid = await befriend(alice, bob);
    const typed: SharedEntry = { retailer: "own", kind: "typed", code: `${"a".repeat(59)}\u{1F600} and more`, qty: 1 };
    const sent = await handleSendList(alice.id, { friendId: fid, payload: encodeEntries([typed])!.payload }, ctx);
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const item = (await inbox(bob)).items[0]!;
    expect((await handleReport(bob.id, { listId: item.id, reason: "abusive_list", note: "x\uD83D" }, ctx)).status).toBe(201);
    expect(sql("select length(list_text) from public.community_reports")).toBe("59");
  });

  it("the caps hold when requests arrive at the same moment (the triggers take a lock): unread lists, waiting requests and friends", async () => {
    const run = (statement: string) =>
      new Promise<boolean>((resolve) => {
        execFile("psql", ["-h", target!.host, "-p", target!.port, "-U", target!.user, "-d", target!.db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", statement], (error) => resolve(!error));
      });
    const uid = (n: number) => `40000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
    sql(`insert into auth.users (id, aud, role, email) select '${uid(0)}'::uuid, 'a', 'a', 'race-0@x.invalid'`);
    sql(`insert into auth.users (id, aud, role, email) select ('40000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'a', 'a', 'race-' || g || '@x.invalid' from generate_series(1, 320) g`);
    // (a) 45 unread lists waiting, then 12 more arrive together: exactly 5 fit
    sql(`insert into public.community_lists (sender, recipient, payload, item_count) select '${uid(1)}', '${uid(0)}', '1abcdefgh', 1 from generate_series(1, 45)`);
    const lists = await Promise.all(Array.from({ length: 12 }, () => run(`insert into public.community_lists (sender, recipient, payload, item_count) values ('${uid(1)}', '${uid(0)}', '1abcdefgh', 1)`)));
    expect(lists.filter(Boolean)).toHaveLength(5);
    expect(sql(`select count(*) from public.community_lists where recipient = '${uid(0)}'`)).toBe("50");
    // (b) 95 requests waiting, then 12 more from different people together: exactly 5 fit
    sql(`insert into public.friendships (requester, addressee) select ('40000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, '${uid(0)}' from generate_series(2, 96) g`);
    const asks = await Promise.all(Array.from({ length: 12 }, (_, i) => run(`insert into public.friendships (requester, addressee) values ('${uid(100 + i)}', '${uid(0)}')`)));
    expect(asks.filter(Boolean)).toHaveLength(5);
    expect(sql(`select count(*) from public.friendships where addressee = '${uid(0)}' and status = 'pending'`)).toBe("100");
    // (c) 195 friends and 12 requests waiting, all accepted together: exactly 5 fit
    sql("truncate public.friendships");
    sql(`insert into public.friendships (requester, addressee, status) select '${uid(0)}', ('40000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'accepted' from generate_series(1, 195) g`);
    sql(`insert into public.friendships (requester, addressee) select ('40000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, '${uid(0)}' from generate_series(200, 211) g`);
    const accepts = await Promise.all(Array.from({ length: 12 }, (_, i) => run(`update public.friendships set status = 'accepted' where requester = '${uid(200 + i)}' and addressee = '${uid(0)}'`)));
    expect(accepts.filter(Boolean)).toHaveLength(5);
    expect(sql(`select count(*) from public.friendships where status = 'accepted' and (requester = '${uid(0)}' or addressee = '${uid(0)}')`)).toBe("200");
  });

  it("a stranger can't touch another pair's rows", async () => {
    const alice = await join("alice");
    const bob = await join("bob");
    const carol = await join("carol");
    const fid = await befriend(alice, bob);
    await handleSendList(alice.id, { friendId: fid, payload: LIST }, ctx);
    const item = (await inbox(bob)).items[0]!;
    const before = ["friendships", "community_lists", "community_blocks", "community_reports"].map(count).join(",");
    for (const attempt of [
      handleRemoveFriend(carol.id, fid, ctx), handleBlock(carol.id, { friendId: fid }, ctx), handleBlock(carol.id, { listId: item.id }, ctx),
      handleReport(carol.id, { friendId: fid, reason: "spam" }, ctx), handleSendList(carol.id, { friendId: fid, payload: LIST }, ctx), handleMarkRead(carol.id, item.id, ctx),
      handleDeleteInboxItem(carol.id, item.id, ctx), handleFriendRespond(carol.id, { id: fid, accept: true }, ctx),
    ]) {
      expect((await attempt).status).toBe(404);
    }
    expect(["friendships", "community_lists", "community_blocks", "community_reports"].map(count).join(",")).toBe(before);
  });

  it("friend lists with more than 50 people work (the lookups are done in chunks)", async () => {
    const me = await join("me.many");
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      const id = newUser();
      const tail = [Math.floor(i / 961), Math.floor(i / 31) % 31, i % 31].map((x) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[x]).join("");
      sql(`insert into public.community_profiles (user_id, username, friend_code) values ('${id}', 'p${String(i).padStart(3, "0")}', 'AAAAA${tail}')`);
      sql(`insert into public.friendships (requester, addressee, status, created_at) values ('${id}', '${me.id}', 'accepted', '${new Date(T0 - 5 * DAY).toISOString()}')`);
      ids.push(id);
    }
    const f = await friends(me);
    expect(f.friends).toHaveLength(60);
    expect(f.friends[0]!.username).toBe("p000");
  });
});
