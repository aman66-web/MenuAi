import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkListPayload, handleBlock, handleDeleteInboxItem, handleFriendRequest, handleFriendRespond, handleGetBlocks, handleGetFriends, handleGetInbox, handleGetMe,
  handleMarkRead, handlePutMe, handleRemoveFriend, handleReport, handleSendList, handleUnblock, INBOX_DAYS, MAX_FRIENDS, MAX_PENDING_IN, MAX_PENDING_OUT, MAX_REPORTS_PER_DAY,
  MAX_CODE_TRIES_PER_DAY, MAX_SENDS_PER_DAY, MAX_UNREAD, MAX_SENDS_TO_ONE_PER_DAY, type CommunityCtx,
} from "../lib/community/handlers";
import { isFriendCode, type RandomInt } from "../lib/community/friendCode";
import { handleCleanup, type Ctx as CleanupCtx } from "../lib/handlers";
import { makeLimit } from "../lib/auth/limiter";
import { decodePayload, encodeEntries, MAX_PAYLOAD_LENGTH, type SharedEntry } from "../lib/mm/shareList";
import { memoryCommunityStore } from "./helpers/communityMemory";

// Community (friends, reports, blocks, shopping lists to a friend): the handlers against an in-memory copy of the tables. The same rules in SQL are proven by
// supabase/tests/community.sql; the HTTP glue by tests/communityRoute.test.ts.

const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A small deterministic generator (xorshift), so friend codes are reproducible. */
function seeded(seed: number): RandomInt {
  let s = seed >>> 0 || 1;
  return (n) => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s % n;
  };
}

interface Person {
  id: string;
  username: string;
  code: string;
}

function makeWorld(random: RandomInt = seeded(20261016)) {
  const clock = { now: T0 };
  const mem = memoryCommunityStore({ clock: () => clock.now });
  const ctx: CommunityCtx = { store: mem.store, limit: makeLimit(() => clock.now), now: () => clock.now, random };
  let n = 0;
  const newUserId = () => `10000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;

  const join = async (username: string): Promise<Person> => {
    const id = newUserId();
    const r = await handlePutMe(id, { username }, ctx);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return { id, username: username.toLowerCase(), code: (r.body!.profile as { friendCode: string }).friendCode };
  };
  const friendsOf = async (p: Person) => (await handleGetFriends(p.id, ctx)).body as {
    friends: Array<{ id: string; username: string; createdAt: string }>;
    incoming: Array<{ id: string; username: string; createdAt: string }>;
    outgoing: Array<{ id: string; username: string; createdAt: string }>;
  };
  /** a asks for b's code, b accepts; returns the friendship's id. */
  const befriend = async (a: Person, b: Person): Promise<string> => {
    const asked = await handleFriendRequest(a.id, { code: b.code }, ctx);
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    const id = (asked.body as { id: string }).id;
    const accepted = await handleFriendRespond(b.id, { id, accept: true }, ctx);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    return id;
  };
  /** A friendship made directly in the store, a month old (so it counts for no daily limit), for the tests of caps. */
  const seedFriends = async (a: Person, b: Person) => {
    const f = await mem.store.createFriendship(a.id, b.id, new Date(clock.now - 30 * DAY).toISOString());
    await mem.store.acceptFriendship(f!.id);
    return f!.id;
  };
  const seedPerson = (username: string): Person => {
    const id = newUserId();
    const code = `SEED${String(n).padStart(4, "0")}`; // only has to be unique: a seeded person's code is never typed
    mem.seedProfile(id, username, code);
    return { id, username, code };
  };
  const send = (from: Person, friendshipId: string, payload: string) => handleSendList(from.id, { friendId: friendshipId, payload }, ctx);
  /** A cold start of the server: what it kept in its own memory (the in-process limiter) is gone, the database is not. */
  const restart = () => { ctx.limit = makeLimit(() => clock.now); };
  const inboxOf = async (p: Person) =>
    (await handleGetInbox(p.id, ctx)).body as {
      items: Array<{ id: string; from: { username: string }; itemCount: number; payload: string; createdAt: string; readAt: string | null; expiresAt: string }>;
      unread: number;
    };
  const meOf = async (p: Person) => (await handleGetMe(p.id, ctx)).body as { profile: { username: string; friendCode: string } | null; counts: { unread: number; friendRequests: number } };
  return { clock, mem, ctx, join, friendsOf, befriend, seedFriends, seedPerson, send, inboxOf, meOf, newUserId, restart };
}

// ---- lists

const MILK: SharedEntry = { retailer: "own", kind: "typed", code: "Milk", qty: 1 };
const PANCAKES: SharedEntry = { retailer: "tesco", kind: "shop", code: "272407558", qty: 2 };
const KEEMA: SharedEntry = { retailer: "asda", kind: "barcode", code: "5030039010492", qty: 1 };
const pack = (...entries: SharedEntry[]) => encodeEntries(entries)!.payload;
const LIST = pack(PANCAKES, KEEMA, MILK);

/** The share-link checksum (lib/mm/shareList.ts), repeated here so a test can build a payload the app would never write. */
function checksum(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const bytes = String.fromCharCode((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  return Buffer.from(bytes, "latin1").toString("base64url").padEnd(6, "A");
}
const forge = (wire: unknown, version = "1") => {
  const body = Buffer.from(JSON.stringify(wire)).toString("base64url");
  return version + checksum(body) + body;
};
const wireOf = (payload: string): unknown => JSON.parse(Buffer.from(payload.slice(7), "base64url").toString());

describe("the test helpers agree with the app's codec", () => {
  it("a forged payload with the same content as a real one is the same payload", () => {
    expect(forge([["tesco", [["s272407558", 2]]], ["asda", ["g5030039010492"]], ["own", ["nMilk"]]])).toBe(LIST);
  });
});

// ======================================================================================================================== me

describe("choosing a username", () => {
  it("starts with no profile and no counts", async () => {
    const w = makeWorld();
    const r = await handleGetMe(w.newUserId(), w.ctx);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, profile: null, counts: { unread: 0, friendRequests: 0 } });
  });

  it("creates the profile with a lower-case username and a friend code, once", async () => {
    const w = makeWorld();
    const id = w.newUserId();
    const r = await handlePutMe(id, { username: "  @Sam.Cook " }, w.ctx);
    expect(r.status).toBe(201);
    const profile = r.body!.profile as { username: string; friendCode: string; createdAt: string };
    expect(profile.username).toBe("sam.cook");
    expect(isFriendCode(profile.friendCode)).toBe(true);
    expect((await handleGetMe(id, w.ctx)).body).toEqual({ ok: true, profile, counts: { unread: 0, friendRequests: 0 } });
    // never an email or a user id in what a person is told about themselves
    expect(JSON.stringify(r.body)).not.toContain(id);
    expect(JSON.stringify(r.body)).not.toMatch(/@/);
  });

  it("can't be changed afterwards, even to a free name", async () => {
    const w = makeWorld();
    const sam = await w.join("sam");
    const again = await handlePutMe(sam.id, { username: "samuel" }, w.ctx);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: "username_set" });
    expect((await w.meOf(sam)).profile!.username).toBe("sam");
  });

  it("refuses a name somebody has, whatever the capitals", async () => {
    const w = makeWorld();
    await w.join("sam");
    const r = await handlePutMe(w.newUserId(), { username: "SAM" }, w.ctx);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "username_taken" });
  });

  it("tells a person what is wrong with a name, and 'unavailable' (not which rule) for reserved and blocked names", async () => {
    const w = makeWorld();
    const cases: Array<[string, string]> = [
      ["ab", "too_short"], ["a".repeat(21), "too_long"], ["sam cook", "characters"], ["élise", "characters"], [".sam", "edges"], ["sa..m", "repeats"], ["", "empty"],
      ["numbite", "unavailable"], ["Admin_Sam", "unavailable"], ["numb1te", "unavailable"], ["f.u.c.k", "unavailable"], ["sh1t", "unavailable"],
    ];
    for (const [name, reason] of cases) {
      const r = await handlePutMe(w.newUserId(), { username: name }, w.ctx);
      expect(r.status, name).toBe(400);
      expect(r.body, name).toMatchObject({ error: "invalid_username", reason });
    }
    expect(w.mem.profiles).toHaveLength(0);
  });

  it("refuses a body that isn't { username: text }", async () => {
    const w = makeWorld();
    for (const body of [null, undefined, "sam", 5, {}, { username: 5 }, { username: ["sam"] }, { username: "x".repeat(101) }]) {
      const r = await handlePutMe(w.newUserId(), body, w.ctx);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body).toMatchObject({ error: "invalid_request" });
    }
  });

  it("makes another friend code when the first is taken, and gives up loudly after many", async () => {
    // a generator that returns the same code twice, then a different one
    const calls: number[] = [];
    let i = 0;
    const random: RandomInt = () => {
      calls.push(i);
      return i++ < 16 ? 0 : 1; // codes: AAAAAAAA (for the first two attempts, 8 draws each), then BBBBBBBB
    };
    const w = makeWorld(random);
    const first = await w.join("first");
    expect(first.code).toBe("AAAAAAAA");
    const second = await w.join("second");
    expect(second.code).toBe("BBBBBBBB");
    // always the same code: after 8 tries it stops with an error rather than looping
    const stuck = makeWorld(() => 0);
    await stuck.join("one");
    await expect(handlePutMe(stuck.newUserId(), { username: "two" }, stuck.ctx)).rejects.toThrow(/friend code/);
  });

  it("limits username tries to 10 an hour per person", async () => {
    const w = makeWorld();
    const id = w.newUserId();
    for (let i = 0; i < 10; i++) expect((await handlePutMe(id, { username: "x" }, w.ctx)).status).toBe(400);
    expect((await handlePutMe(id, { username: "valid.name" }, w.ctx)).status).toBe(429);
    w.clock.now += HOUR + 1;
    expect((await handlePutMe(id, { username: "valid.name" }, w.ctx)).status).toBe(201);
  });

  it("every person gets a different friend code", async () => {
    const w = makeWorld();
    const codes = new Set<string>();
    for (let i = 0; i < 60; i++) codes.add((await w.join(`person${i}`)).code);
    expect(codes.size).toBe(60);
  });
});

// ======================================================================================================================== friends

describe("the friend flow", () => {
  it("ask by code, see it waiting, accept, and both are friends", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");

    const asked = await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ ok: true, status: "requested", username: "bob" });

    expect((await w.friendsOf(alice)).outgoing.map((f) => f.username)).toEqual(["bob"]);
    expect((await w.friendsOf(bob)).incoming.map((f) => f.username)).toEqual(["alice"]);
    expect((await w.friendsOf(bob)).friends).toEqual([]);
    expect((await w.meOf(bob)).counts.friendRequests).toBe(1);
    expect((await w.meOf(alice)).counts.friendRequests).toBe(0);

    const id = (await w.friendsOf(bob)).incoming[0]!.id;
    const answered = await handleFriendRespond(bob.id, { id, accept: true }, w.ctx);
    expect(answered.body).toEqual({ ok: true, status: "accepted" });

    for (const [me, other] of [[alice, "bob"], [bob, "alice"]] as const) {
      const f = await w.friendsOf(me);
      expect(f.friends.map((x) => x.username)).toEqual([other]);
      expect(f.incoming).toEqual([]);
      expect(f.outgoing).toEqual([]);
    }
    expect((await w.meOf(bob)).counts.friendRequests).toBe(0);
  });

  it("the code can be typed any way: lower case, with a hyphen or spaces", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const typed = `${bob.code.slice(0, 4)}-${bob.code.slice(4)}`.toLowerCase();
    expect((await handleFriendRequest(alice.id, { code: ` ${typed} ` }, w.ctx)).status).toBe(201);
  });

  it("declining keeps a quiet 'declined' row for 30 days: nobody is shown it, and the asker can't ask again at once", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const id = (await w.friendsOf(bob)).incoming[0]!.id;
    expect((await handleFriendRespond(bob.id, { id, accept: false }, w.ctx)).body).toEqual({ ok: true, status: "declined" });
    expect(w.mem.friendships.map((f) => f.status)).toEqual(["declined"]);
    expect((await w.friendsOf(alice)).outgoing).toEqual([]);
    expect((await w.friendsOf(bob)).incoming).toEqual([]);
    expect((await w.meOf(bob)).counts.friendRequests).toBe(0);
    // asking again gets the answer of any code that can't be added, and taking the request back is not a way round it
    const again = await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ error: "cannot_add" });
    expect((await handleRemoveFriend(alice.id, id, w.ctx)).status).toBe(404);
    expect((await handleRemoveFriend(bob.id, id, w.ctx)).status).toBe(404);
    expect((await handleFriendRespond(bob.id, { id, accept: true }, w.ctx)).status).toBe(404); // answered already
    expect(w.mem.friendships).toHaveLength(1);
    // after 30 days the daily clean-up forgets it, and she may ask again
    w.clock.now += 31 * DAY;
    const cleanup: CleanupCtx = { store: { clearIpHashes: async () => 0 } as never, ipHash: null, now: new Date(w.clock.now), community: w.mem.store };
    expect((await handleCleanup("Bearer secret-secret-123", "secret-secret-123", cleanup)).body).toMatchObject({ oldDeclined: 1 });
    expect(w.mem.friendships).toEqual([]);
    expect((await handleFriendRequest(alice.id, { code: bob.code }, w.ctx)).status).toBe(201);
  });

  it("turning a request down by removing it is declining it: the asker still can't ask again at once", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const id = (await w.friendsOf(bob)).incoming[0]!.id;
    expect((await handleRemoveFriend(bob.id, id, w.ctx)).status).toBe(200);
    expect(w.mem.friendships.map((f) => f.status)).toEqual(["declined"]);
    expect((await handleFriendRequest(alice.id, { code: bob.code }, w.ctx)).body).toMatchObject({ error: "cannot_add" });
  });

  it("the person who declined can still add the person they declined (their request makes way for the new one)", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    await handleFriendRespond(bob.id, { id: (await w.friendsOf(bob)).incoming[0]!.id, accept: false }, w.ctx);
    const asked = await handleFriendRequest(bob.id, { code: alice.code }, w.ctx);
    expect(asked.status).toBe(201);
    expect(w.mem.friendships.map((f) => [f.requester, f.addressee, f.status])).toEqual([[bob.id, alice.id, "pending"]]);
    expect((await w.friendsOf(alice)).incoming.map((f) => f.username)).toEqual(["bob"]);
  });

  it("a declined request can't be reported, blocked or sent a list through, and is never listed", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const id = w.mem.friendships[0]!.id;
    await handleFriendRespond(bob.id, { id, accept: false }, w.ctx);
    for (const who of [alice, bob]) {
      expect((await handleReport(who.id, { friendId: id, reason: "other" }, w.ctx)).status).toBe(404);
      expect((await handleBlock(who.id, { friendId: id }, w.ctx)).status).toBe(404);
      expect((await w.send(who, id, LIST)).status).toBe(404);
    }
    expect(w.mem.reports).toEqual([]);
    expect(w.mem.blocks).toEqual([]);
  });

  it("the asker can take a request back; either friend can remove the friendship", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const asked = await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const id = (asked.body as { id: string }).id;
    expect((await handleRemoveFriend(alice.id, id, w.ctx)).status).toBe(200);
    expect((await w.friendsOf(bob)).incoming).toEqual([]);

    const fid = await w.befriend(alice, bob);
    expect((await handleRemoveFriend(bob.id, fid, w.ctx)).status).toBe(200);
    expect((await w.friendsOf(alice)).friends).toEqual([]);
    expect((await handleRemoveFriend(bob.id, fid, w.ctx)).status).toBe(404); // already gone
  });

  it("asking someone who has already asked you makes you friends at once", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const back = await handleFriendRequest(bob.id, { code: alice.code }, w.ctx);
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ ok: true, status: "friends", username: "alice" });
    expect((await w.friendsOf(alice)).friends.map((f) => f.username)).toEqual(["bob"]);
    expect(w.mem.friendships).toHaveLength(1);
  });

  it("asking twice changes nothing and says so", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const first = await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const second = await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ status: "requested", id: (first.body as { id: string }).id });
    expect(w.mem.friendships).toHaveLength(1);
  });

  it("needs a username first", async () => {
    const w = makeWorld();
    const bob = await w.join("bob");
    const r = await handleFriendRequest(w.newUserId(), { code: bob.code }, w.ctx);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "no_username" });
  });

  it("a person who answers a request must be the one it was made to, and it must still be waiting", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const asked = await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const id = (asked.body as { id: string }).id;
    expect((await handleFriendRespond(alice.id, { id, accept: true }, w.ctx)).status).toBe(404); // you can't accept your own request
    expect((await handleFriendRespond(bob.id, { id, accept: true }, w.ctx)).status).toBe(200);
    expect((await handleFriendRespond(bob.id, { id, accept: false }, w.ctx)).status).toBe(404); // already answered: a friendship can't be declined, only removed
    expect(w.mem.friendships).toHaveLength(1);
  });

  it("lists friends A to Z, requests newest first, and shows only a username and a row id: never a user id, a code or an email", async () => {
    const w = makeWorld();
    const me = await w.join("me.myself");
    const people = [await w.join("zed"), await w.join("amy"), await w.join("moe")];
    for (const p of people) await w.befriend(p, me);
    const early = await w.join("early");
    const late = await w.join("late");
    w.clock.now += MIN;
    await handleFriendRequest(early.id, { code: me.code }, w.ctx);
    w.clock.now += MIN;
    await handleFriendRequest(late.id, { code: me.code }, w.ctx);
    const out = await w.join("target");
    await handleFriendRequest(me.id, { code: out.code }, w.ctx);

    const f = await w.friendsOf(me);
    expect(f.friends.map((x) => x.username)).toEqual(["amy", "moe", "zed"]);
    expect(f.incoming.map((x) => x.username)).toEqual(["late", "early"]);
    expect(f.outgoing.map((x) => x.username)).toEqual(["target"]);
    const text = JSON.stringify(f);
    for (const p of [me, ...people, early, late, out]) {
      expect(text).not.toContain(p.id);
      if (p !== me) expect(text).not.toContain(p.code);
    }
    expect(Object.keys(f.friends[0]!).sort()).toEqual(["createdAt", "id", "username"]);
  });
});

describe("limits on friends", () => {
  it("at most 200 friends: asking stops, and accepting stops, for either person", async () => {
    const w = makeWorld();
    const full = await w.join("full");
    for (let i = 0; i < MAX_FRIENDS; i++) await w.seedFriends(full, w.seedPerson(`pal${i}`));
    const newcomer = await w.join("newcomer");

    const asking = await handleFriendRequest(full.id, { code: newcomer.code }, w.ctx);
    expect(asking.status).toBe(409);
    expect(asking.body).toMatchObject({ error: "friend_limit" });

    // a request made TO someone with 200 friends is made (we don't say anything about them), but can't be accepted
    const toFull = await handleFriendRequest(newcomer.id, { code: full.code }, w.ctx);
    expect(toFull.status).toBe(201);
    const id = (toFull.body as { id: string }).id;
    const accept = await handleFriendRespond(full.id, { id, accept: true }, w.ctx);
    expect(accept.status).toBe(409);
    expect(accept.body).toMatchObject({ error: "friend_limit" });
    // ...while declining still works
    expect((await handleFriendRespond(full.id, { id, accept: false }, w.ctx)).status).toBe(200);
    expect((await w.mem.store.countFriends(full.id))).toBe(MAX_FRIENDS);
  });

  it("an accepted request can't take the asker over 200 either", async () => {
    const w = makeWorld();
    const full = await w.join("full");
    for (let i = 0; i < MAX_FRIENDS - 1; i++) await w.seedFriends(full, w.seedPerson(`pal${i}`));
    const a = await w.join("ann");
    const b = await w.join("ben");
    await handleFriendRequest(a.id, { code: full.code }, w.ctx);
    await handleFriendRequest(b.id, { code: full.code }, w.ctx);
    const incoming = (await w.friendsOf(full)).incoming;
    expect((await handleFriendRespond(full.id, { id: incoming[0]!.id, accept: true }, w.ctx)).status).toBe(200);
    expect((await handleFriendRespond(full.id, { id: incoming[1]!.id, accept: true }, w.ctx)).status).toBe(409);
  });

  it("20 tries a day, right or wrong: codes can't be guessed in bulk", async () => {
    const w = makeWorld();
    const guesser = await w.join("guesser");
    const real = await w.join("real");
    for (let i = 0; i < MAX_CODE_TRIES_PER_DAY; i++) {
      const r = await handleFriendRequest(guesser.id, { code: `GUESS${String(i).padStart(3, "2")}` }, w.ctx);
      expect(r.status).toBe(404);
    }
    const stopped = await handleFriendRequest(guesser.id, { code: real.code }, w.ctx);
    expect(stopped.status).toBe(429);
    expect(w.mem.friendships).toHaveLength(0);
    w.clock.now += DAY + MIN;
    expect((await handleFriendRequest(guesser.id, { code: real.code }, w.ctx)).status).toBe(201);
  });

  it("the daily limit is kept in the database: a restart of the server gives nothing back, and neither does taking a request back", async () => {
    const w = makeWorld();
    const asker = await w.join("asker");
    const targets: Person[] = [];
    for (let i = 0; i < 3; i++) targets.push(await w.join(`target${i}`));
    let made = 0;
    let stopped = 0;
    // 60 tries in one day, each on a "fresh" server, each request taken straight back: the old counting (rows that still exist) gave the budget back every time
    for (let i = 0; i < 60; i++) {
      w.restart();
      const r = await handleFriendRequest(asker.id, { code: targets[i % 3]!.code }, w.ctx);
      if (r.status === 201) {
        made++;
        await handleRemoveFriend(asker.id, (r.body as { id: string }).id, w.ctx);
      } else {
        stopped++;
        expect(r.status).toBe(429);
        expect(r.body).toMatchObject({ error: "daily_limit" });
      }
    }
    expect(made).toBe(MAX_CODE_TRIES_PER_DAY);
    expect(stopped).toBe(60 - MAX_CODE_TRIES_PER_DAY);
    expect(w.mem.attempts.filter((a) => a.kind === "code")).toHaveLength(MAX_CODE_TRIES_PER_DAY); // once over the limit, no more rows are written
    w.clock.now += DAY + MIN;
    w.restart();
    expect((await handleFriendRequest(asker.id, { code: targets[0]!.code }, w.ctx)).status).toBe(201);
  });

  it("wrong codes are counted too, across restarts: 500 guesses get 20 answers", async () => {
    const w = makeWorld();
    const guesser = await w.join("guesser");
    const codes: number[] = [];
    for (let i = 0; i < 500; i++) {
      if (i % 7 === 0) w.restart();
      const r = await handleFriendRequest(guesser.id, { code: `GUESS${String(i % 1000).padStart(3, "2")}` }, w.ctx);
      codes.push(r.status);
    }
    expect(codes.filter((c) => c === 404)).toHaveLength(MAX_CODE_TRIES_PER_DAY);
    expect(codes.filter((c) => c === 429)).toHaveLength(500 - MAX_CODE_TRIES_PER_DAY);
  });

  it("the tally is the same for several requests at once: no more than the limit get through", async () => {
    const w = makeWorld();
    const asker = await w.join("asker");
    const target = await w.join("target");
    const results = await Promise.all(Array.from({ length: 40 }, () => handleFriendRequest(asker.id, { code: target.code }, w.ctx)));
    expect(results.filter((r) => r.status !== 429).length).toBeLessThanOrEqual(MAX_CODE_TRIES_PER_DAY);
    expect(w.mem.friendships).toHaveLength(1);
  });

  it("a person with a leaked code can't be buried: past 100 requests waiting, it answers like any code that can't be added", async () => {
    const w = makeWorld();
    const victim = await w.join("victim");
    for (let i = 0; i < MAX_PENDING_IN; i++) await w.mem.store.createFriendship(w.seedPerson(`asker${i}`).id, victim.id, new Date(w.clock.now - 3 * DAY).toISOString());
    expect(w.mem.friendships).toHaveLength(MAX_PENDING_IN);
    const late = await w.join("late.asker");
    const r = await handleFriendRequest(late.id, { code: victim.code }, w.ctx);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: "cannot_add" });
    expect(w.mem.friendships).toHaveLength(MAX_PENDING_IN);
    // the pile is also bounded where the database is asked (a race can't get past the check)
    expect(await w.mem.store.createFriendship(late.id, victim.id, new Date(w.clock.now).toISOString())).toBeNull();
    // answering one makes room
    const first = (await w.friendsOf(victim)).incoming[0]!;
    await handleFriendRespond(victim.id, { id: first.id, accept: false }, w.ctx);
    expect((await handleFriendRequest(late.id, { code: victim.code }, w.ctx)).status).toBe(201);
    // the friends page lists the pile in full, newest first
    expect((await w.friendsOf(victim)).incoming).toHaveLength(MAX_PENDING_IN);
  });

  it("at most 50 requests waiting at once", async () => {
    const w = makeWorld();
    const asker = await w.join("asker");
    for (let i = 0; i < MAX_PENDING_OUT; i++) await w.mem.store.createFriendship(asker.id, w.seedPerson(`target${i}`).id, new Date(w.clock.now - 3 * DAY).toISOString());
    const extra = await w.join("extra");
    const r = await handleFriendRequest(asker.id, { code: extra.code }, w.ctx);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "request_limit" });
  });
});

describe("no enumeration: a code that can't be added is always answered the same way", () => {
  async function setup() {
    const w = makeWorld();
    const alice = await w.join("alice");
    const blockedMe = await w.join("blocked.me"); // blocked alice
    const iBlocked = await w.join("i.blocked"); // alice blocked them
    const friend = await w.join("pal");
    const stranger = await w.join("stranger");
    const f1 = await w.befriend(alice, blockedMe);
    await handleBlock(blockedMe.id, { friendId: f1 }, w.ctx);
    const f2 = await w.befriend(alice, iBlocked);
    await handleBlock(alice.id, { friendId: f2 }, w.ctx);
    await w.befriend(alice, friend);
    return { w, alice, blockedMe, iBlocked, friend, stranger };
  }

  it("unknown, your own, blocked either way, already a friend and badly typed codes all give the same answer", async () => {
    const { w, alice, blockedMe, iBlocked, friend } = await setup();
    const tries: Array<[string, string]> = [
      ["unknown", "ZZZZZZZZ"], ["own", alice.code], ["they blocked me", blockedMe.code], ["I blocked them", iBlocked.code], ["already friends", friend.code],
      ["too short", "ABC"], ["look-alike letters", "OOOO1111"], ["empty", ""], ["symbols", "!!!!!!!!"],
    ];
    const answers = [] as Array<{ name: string; status: number; body: unknown }>;
    for (const [name, code] of tries) {
      const r = await handleFriendRequest(alice.id, { code }, w.ctx);
      answers.push({ name, status: r.status, body: r.body });
    }
    for (const a of answers) {
      expect(a.status, a.name).toBe(404);
      expect(a.body, a.name).toEqual(answers[0]!.body);
    }
    expect(answers[0]!.body).toMatchObject({ error: "cannot_add" });
    // nothing was created
    expect(w.mem.friendships.filter((f) => f.status === "pending")).toEqual([]);
  });

  it("they also take the same steps against the database (the same work, so the same time)", async () => {
    const { w, alice, blockedMe, iBlocked, friend } = await setup();
    const steps = async (code: string) => {
      const before = w.mem.calls.length;
      await handleFriendRequest(alice.id, { code }, w.ctx);
      return w.mem.calls.slice(before).join(">");
    };
    const unknown = await steps("ZZZZZZZZ");
    expect(unknown).toContain("getProfileByCode");
    expect(await steps(alice.code)).toBe(unknown);
    expect(await steps(blockedMe.code)).toBe(unknown);
    expect(await steps(iBlocked.code)).toBe(unknown);
    expect(await steps(friend.code)).toBe(unknown);
  });

  it("the person who blocked you can't tell from the answer that they are blocked, and you aren't told you were", async () => {
    const { w, alice, blockedMe } = await setup();
    const asBlocked = await handleFriendRequest(alice.id, { code: blockedMe.code }, w.ctx);
    const unknown = await handleFriendRequest(alice.id, { code: "ZZZZZZZZ" }, w.ctx);
    expect(asBlocked).toEqual(unknown);
    // and the blocker is not shown to the blocked in any list
    expect(JSON.stringify(await w.friendsOf(alice))).not.toContain("blocked.me");
  });

  it("the answer never carries a username, id or code", async () => {
    const { w, alice, friend } = await setup();
    const r = await handleFriendRequest(alice.id, { code: friend.code }, w.ctx);
    expect(JSON.stringify(r.body)).not.toMatch(new RegExp(`${friend.username}|${friend.code}|${friend.id}`));
  });
});

// ======================================================================================================================== blocks

describe("blocking", () => {
  it("removes the friendship and the lists in both directions, and hides each from the other", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await w.send(alice, fid, LIST);
    await w.send(bob, fid, pack(MILK));
    expect((await w.inboxOf(bob)).items).toHaveLength(1);

    const r = await handleBlock(alice.id, { friendId: fid }, w.ctx);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(w.mem.friendships).toEqual([]);
    expect(w.mem.lists).toEqual([]);
    expect((await w.friendsOf(alice)).friends).toEqual([]);
    expect((await w.friendsOf(bob)).friends).toEqual([]);
    expect((await w.inboxOf(alice)).items).toEqual([]);
    expect((await w.inboxOf(bob)).items).toEqual([]);

    // no requests either way, no sends
    expect((await handleFriendRequest(bob.id, { code: alice.code }, w.ctx)).status).toBe(404);
    expect((await handleFriendRequest(alice.id, { code: bob.code }, w.ctx)).status).toBe(404);
    expect((await w.send(bob, fid, LIST)).status).toBe(404);
    expect((await w.send(alice, fid, LIST)).status).toBe(404);
  });

  it("blocks the person behind an inbox item even when they are no longer a friend", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await w.send(bob, fid, LIST);
    await handleRemoveFriend(alice.id, fid, w.ctx);
    const item = (await w.inboxOf(alice)).items[0]!;
    expect((await handleBlock(alice.id, { listId: item.id }, w.ctx)).status).toBe(200);
    expect(w.mem.lists).toEqual([]);
    expect((await handleFriendRequest(bob.id, { code: alice.code }, w.ctx)).status).toBe(404);
  });

  it("blocks the person behind a request waiting for you, which removes the request", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    await handleFriendRequest(bob.id, { code: alice.code }, w.ctx);
    const id = (await w.friendsOf(alice)).incoming[0]!.id;
    expect((await handleBlock(alice.id, { friendId: id }, w.ctx)).status).toBe(200);
    expect((await w.friendsOf(alice)).incoming).toEqual([]);
    expect((await w.friendsOf(bob)).outgoing).toEqual([]);
  });

  it("is safe to repeat, and can be undone: unblocking does not make you friends again, but they can be asked for", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await handleBlock(alice.id, { friendId: fid }, w.ctx);
    // the friendship is gone so there is nothing left to point at from the friend list; the block can be repeated through an inbox item
    expect((await handleBlock(alice.id, { friendId: fid }, w.ctx)).status).toBe(404);
    const listed = (await handleGetBlocks(alice.id, w.ctx)).body as { blocks: Array<{ id: string; username: string; createdAt: string }> };
    expect(listed.blocks.map((b) => b.username)).toEqual(["bob"]);
    expect(Object.keys(listed.blocks[0]!).sort()).toEqual(["createdAt", "id", "username"]);
    expect((await handleGetBlocks(bob.id, w.ctx)).body).toEqual({ ok: true, blocks: [] }); // the blocked person sees nothing about it

    expect((await handleUnblock(alice.id, listed.blocks[0]!.id, w.ctx)).status).toBe(200);
    expect((await handleGetBlocks(alice.id, w.ctx)).body).toEqual({ ok: true, blocks: [] });
    expect((await w.friendsOf(alice)).friends).toEqual([]);
    expect((await handleFriendRequest(bob.id, { code: alice.code }, w.ctx)).status).toBe(201);
  });

  it("hides a person from the friend list even if a row got in after the block", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await handleBlock(alice.id, { friendId: fid }, w.ctx);
    await w.seedFriends(alice, bob); // a late write (a race) leaves a friendship behind
    expect((await w.friendsOf(alice)).friends).toEqual([]);
    expect((await w.friendsOf(bob)).friends).toEqual([]);
  });

  it("wants exactly one handle, and a real one", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    for (const body of [{}, { friendId: "x" }, { friendId: "10000000-0000-4000-8000-0000000000aa", listId: "10000000-0000-4000-8000-0000000000bb" }, null, "hi"]) {
      expect((await handleBlock(alice.id, body, w.ctx)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await handleBlock(alice.id, { friendId: "10000000-0000-4000-8000-0000000000aa" }, w.ctx)).status).toBe(404);
    expect((await handleUnblock(alice.id, "not-an-id", w.ctx)).status).toBe(404);
  });
});

// ======================================================================================================================== reports

describe("reporting", () => {
  it("saves who reported whom, the reason and a note, with both usernames written out", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const r = await handleReport(alice.id, { friendId: fid, reason: "harassment", note: "  keeps sending me\u0007 rude things  " }, w.ctx);
    expect(r).toEqual({ status: 201, body: { ok: true, blocked: false } });
    expect(w.mem.reports).toEqual([
      expect.objectContaining({
        reporter: alice.id, reported: bob.id, reporterUsername: "alice", reportedUsername: "bob", reason: "harassment", note: "keeps sending me rude things",
        listPayload: null, listText: null, status: "open",
      }),
    ]);
    expect(w.mem.friendships).toHaveLength(1); // a report alone does not remove the friend
  });

  it("can report and block in one go", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const r = await handleReport(alice.id, { friendId: fid, reason: "spam", block: true }, w.ctx);
    expect(r.body).toEqual({ ok: true, blocked: true });
    expect(w.mem.reports).toHaveLength(1);
    expect(w.mem.friendships).toEqual([]);
    expect(w.mem.blocks).toHaveLength(1);
  });

  it("a reported shopping list keeps what it said, even after it is deleted by the block", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    await w.befriend(alice, bob);
    const words = pack({ retailer: "own", kind: "typed", code: "Something rude", qty: 1 }, PANCAKES);
    // the word filter would stop an abusive word reaching an inbox, so write the row as an older or cleverer sender could have
    await w.mem.store.insertList({ sender: bob.id, recipient: alice.id, payload: words, itemCount: 2, createdAt: new Date(w.clock.now).toISOString(), expiresAt: new Date(w.clock.now + DAY).toISOString() });
    const item = (await w.inboxOf(alice)).items[0]!;
    const r = await handleReport(alice.id, { listId: item.id, reason: "abusive_list", block: true }, w.ctx);
    expect(r.status).toBe(201);
    expect(w.mem.lists).toEqual([]);
    expect(w.mem.friendships).toEqual([]);
    expect(w.mem.reports[0]).toMatchObject({ reportedUsername: "bob", listPayload: words, listText: "Something rude", reason: "abusive_list" });
  });

  it("can report someone you already blocked, using the block", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await handleBlock(alice.id, { friendId: fid }, w.ctx);
    const blockId = w.mem.blocks[0]!.id;
    expect((await handleReport(alice.id, { blockId, reason: "other" }, w.ctx)).status).toBe(201);
    expect(w.mem.reports[0]).toMatchObject({ reporter: alice.id, reported: bob.id });
    expect((await handleReport(bob.id, { blockId, reason: "other" }, w.ctx)).status).toBe(404); // not theirs
  });

  it("checks the reason, the note and the handle", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const bad: unknown[] = [
      { friendId: fid }, { friendId: fid, reason: "dislike" }, { friendId: fid, reason: "other", note: "n".repeat(501) }, { reason: "other" },
      { friendId: fid, listId: fid, reason: "other" }, { friendId: "nope", reason: "other" }, { friendId: fid, reason: "other", block: "yes" }, null,
    ];
    for (const body of bad) expect((await handleReport(alice.id, body, w.ctx)).status, JSON.stringify(body)).toBe(400);
    expect(w.mem.reports).toEqual([]);
    expect((await handleReport(alice.id, { friendId: fid, reason: "other", note: "n".repeat(500) }, w.ctx)).status).toBe(201);
    expect(w.mem.reports.map((r) => r.note)).toEqual(["n".repeat(500)]);
    // one open report per person: a second only closes quietly (the founder reads one, not a pile); once it is closed another can be made
    expect((await handleReport(alice.id, { friendId: fid, reason: "other", note: " \u0000 " }, w.ctx)).status).toBe(201);
    expect(w.mem.reports).toHaveLength(1);
    w.mem.closeReport(w.mem.reports[0]!.id, "dismissed");
    expect((await handleReport(alice.id, { friendId: fid, reason: "other", note: " \u0000 " }, w.ctx)).status).toBe(201);
    expect(w.mem.reports.map((r) => r.note)).toEqual(["n".repeat(500), null]);
    for (const reason of ["abusive_username", "abusive_list", "spam", "harassment", "impersonation", "other"]) {
      expect((await handleReport(alice.id, { friendId: fid, reason }, w.ctx)).status, reason).toBe(201);
    }
  });

  it("10 reports a day, kept in the database (a restart gives nothing back)", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    for (let i = 0; i < MAX_REPORTS_PER_DAY; i++) {
      w.restart();
      expect((await handleReport(alice.id, { friendId: fid, reason: "spam" }, w.ctx)).status).toBe(201);
      w.mem.closeReport(w.mem.reports.at(-1)!.id, "dismissed"); // so each one is a new report
    }
    w.restart();
    const stopped = await handleReport(alice.id, { friendId: fid, reason: "spam" }, w.ctx);
    expect(stopped.status).toBe(429);
    expect(stopped.body).toMatchObject({ error: "daily_limit" });
    w.clock.now += DAY + MIN;
    w.restart();
    expect((await handleReport(alice.id, { friendId: fid, reason: "spam" }, w.ctx)).status).toBe(201);
  });

  it("only a real relationship can be reported or blocked: a friend, or a request made TO you, never one you made to a stranger's code", async () => {
    const w = makeWorld();
    const attacker = await w.join("attacker");
    const victim = await w.join("victim");
    const asked = await handleFriendRequest(attacker.id, { code: victim.code }, w.ctx); // the attacker holds the victim's code; the victim never answers
    const pendingId = (asked.body as { id: string }).id;
    for (let i = 0; i < 10; i++) expect((await handleReport(attacker.id, { friendId: pendingId, reason: "harassment", note: "made up" }, w.ctx)).status).toBe(404);
    expect((await handleBlock(attacker.id, { friendId: pendingId }, w.ctx)).status).toBe(404);
    expect(w.mem.reports).toEqual([]);
    expect(w.mem.blocks).toEqual([]);
    // so there is no block to report through either
    expect(w.mem.blocks).toHaveLength(0);
    // the victim, who was asked, may report and block the request
    expect((await handleReport(victim.id, { friendId: pendingId, reason: "spam" }, w.ctx)).status).toBe(201);
    expect(w.mem.reports).toHaveLength(1);
    expect((await handleBlock(victim.id, { friendId: pendingId }, w.ctx)).status).toBe(200);
  });

  it("a second report on the same person (and list) while one is open adds nothing, and blocking still happens", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    for (let i = 0; i < 3; i++) expect((await handleReport(alice.id, { friendId: fid, reason: "harassment", note: `again ${i}` }, w.ctx)).status).toBe(201);
    expect(w.mem.reports).toHaveLength(1);
    expect(w.mem.reports[0]!.note).toBe("again 0");
    const again = await handleReport(alice.id, { friendId: fid, reason: "harassment", block: true }, w.ctx);
    expect(again.body).toMatchObject({ ok: true, blocked: true });
    expect(w.mem.blocks).toHaveLength(1);
    expect(w.mem.reports).toHaveLength(1);
  });

  it("a reported list is stored whole even when a typed word is cut in the middle of an emoji (the database refuses half a character)", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const words = `n${"a".repeat(58)}\u{1F600} and more`; // the 60-character cut falls in the middle of the emoji
    const sent = await w.send(alice, fid, forge([["own", [`n${words}`]]]));
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const listId = (await w.inboxOf(bob)).items[0]!.id;
    expect((await handleReport(bob.id, { listId, reason: "abusive_list", note: "a\uD83D" }, w.ctx)).status).toBe(201);
    const stored = w.mem.reports[0]!;
    expect(stored.listText!.isWellFormed()).toBe(true);
    expect(stored.note!.isWellFormed()).toBe(true);
    expect(stored.listText!.length).toBeGreaterThan(10);
    expect(() => JSON.parse(JSON.stringify(stored))).not.toThrow();
    expect(JSON.stringify(stored)).not.toMatch(/\\ud83d"/i);
  });
});

// ======================================================================================================================== shopping lists

describe("what may be sent", () => {
  it("accepts a real list, and stores it again from what it understood", () => {
    const r = checkListPayload(LIST);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toBe(LIST);
      expect(r.itemCount).toBe(3);
    }
  });

  it("drops anything tucked into the code besides references: a price, a name, an unknown shop, a stray field", () => {
    const smuggled = forge([
      ["tesco", [["s272407558", 2, 4.99, "Pancakes £4.99"], "s111111111"]],
      ["evilshop", ["sabc123456"]],
      ["own", ["nMilk", ["nBread", 3, "price=1.20"]]],
      { price: 999 },
    ]);
    const r = checkListPayload(smuggled);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).not.toBe(smuggled);
    expect(r.payload.length).toBeLessThan(smuggled.length);
    expect(wireOf(r.payload)).toEqual([["tesco", [["s272407558", 2], "s111111111"]], ["own", ["nMilk", ["nBread", 3]]]]);
    expect(Buffer.from(r.payload.slice(7), "base64url").toString()).not.toMatch(/4\.99|£|Pancakes|price|evilshop|999/);
    expect(r.itemCount).toBe(4);
  });

  it("refuses garbage, each with its reason", () => {
    const cases: Array<[string, string]> = [
      ["hello", "unreadable"], ["!!!!!!!!!!", "unreadable"], ["1abc", "cut"], ["9" + LIST.slice(1), "version"], [LIST.slice(0, -4), "cut"],
      [forge([]), "empty"], [forge([["evilshop", ["sabc123456"]]]), "empty"], [forge("not a list"), "unreadable"], ["1", "cut"], ["", "empty"],
      ["x".repeat(MAX_PAYLOAD_LENGTH + 1), "too_large"],
    ];
    for (const [payload, reason] of cases) {
      const r = checkListPayload(payload);
      expect(r, payload.slice(0, 20)).toEqual({ ok: false, reason });
    }
  });

  it("keeps at most 100 lines", () => {
    const many = Array.from({ length: 150 }, (_, i) => `s${100000000 + i}`);
    const r = checkListPayload(forge([["tesco", many]]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itemCount).toBe(100);
      expect(r.payload.length).toBeLessThanOrEqual(MAX_PAYLOAD_LENGTH);
    }
  });

  it("refuses strong abusive words typed into a list, but not British food names", () => {
    expect(checkListPayload(pack({ retailer: "own", kind: "typed", code: "fuck this", qty: 1 }))).toEqual({ ok: false, reason: "unsuitable" });
    expect(checkListPayload(pack({ retailer: "own", kind: "typed", code: "f4ggot", qty: 1 }))).toEqual({ ok: false, reason: "unsuitable" });
    for (const food of ["Spotted dick", "Cock-a-leekie soup", "Faggots and peas", "Shiitake mushrooms", "Rapeseed oil", "Cumin", "Scunthorpe sausages", "Pass hit"]) {
      expect(checkListPayload(pack({ retailer: "own", kind: "typed", code: food, qty: 1 })).ok, food).toBe(true);
    }
  });
});

describe("sending a list to a friend", () => {
  it("it lands in their inbox with the sender's username, the line count and the code the app opens", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const sent = await w.send(alice, fid, LIST);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ ok: true, sentTo: "bob", itemCount: 3 });

    const inbox = await w.inboxOf(bob);
    expect(inbox.unread).toBe(1);
    expect(inbox.items).toHaveLength(1);
    const item = inbox.items[0]!;
    expect(item.from).toEqual({ username: "alice" });
    expect(item.itemCount).toBe(3);
    expect(decodePayload(item.payload)).toEqual({ ok: true, entries: [PANCAKES, KEEMA, MILK] });
    expect(item.readAt).toBeNull();
    expect(Date.parse(item.expiresAt) - Date.parse(item.createdAt)).toBe(INBOX_DAYS * DAY);
    expect(Object.keys(item).sort()).toEqual(["createdAt", "expiresAt", "from", "id", "itemCount", "payload", "readAt"]);
    // no user id and no code leaks into the inbox
    expect(JSON.stringify(inbox)).not.toContain(alice.id);
    expect(JSON.stringify(inbox)).not.toContain(alice.code);
    // the sender's own inbox is empty
    expect((await w.inboxOf(alice)).items).toEqual([]);
    expect((await w.meOf(bob)).counts.unread).toBe(1);
    expect((await w.meOf(alice)).counts.unread).toBe(0);
  });

  it("what is stored is the server's own re-writing of the list, never the text it was sent", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const smuggled = forge([["tesco", [["s272407558", 2, 4.99, "Pancakes £4.99"]]], ["evilshop", ["sabc123456"]], ["own", ["nMilk"]]]);
    expect((await w.send(alice, fid, ` ${smuggled} `)).status).toBe(201);
    const stored = w.mem.lists[0]!.payload;
    expect(stored).not.toBe(smuggled);
    expect(wireOf(stored)).toEqual([["tesco", [["s272407558", 2]]], ["own", ["nMilk"]]]);
    expect((await w.inboxOf(bob)).items[0]!.payload).toBe(stored);
    expect((await w.inboxOf(bob)).items[0]!.itemCount).toBe(2);
  });

  it("mark read, mark read again, delete", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await w.send(alice, fid, LIST);
    const id = (await w.inboxOf(bob)).items[0]!.id;
    expect((await handleMarkRead(bob.id, id, w.ctx)).body).toEqual({ ok: true });
    const readAt = (await w.inboxOf(bob)).items[0]!.readAt;
    expect(readAt).toBe(new Date(T0).toISOString());
    w.clock.now += HOUR;
    expect((await handleMarkRead(bob.id, id, w.ctx)).status).toBe(200);
    expect((await w.inboxOf(bob)).items[0]!.readAt).toBe(readAt); // the first time stays
    expect((await w.meOf(bob)).counts.unread).toBe(0);
    expect((await w.inboxOf(bob)).unread).toBe(0);
    expect((await handleDeleteInboxItem(bob.id, id, w.ctx)).status).toBe(200);
    expect((await w.inboxOf(bob)).items).toEqual([]);
    expect((await handleDeleteInboxItem(bob.id, id, w.ctx)).status).toBe(404);
  });

  it("the inbox is newest first", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await w.send(alice, fid, pack(MILK));
    w.clock.now += MIN;
    await w.send(alice, fid, pack(KEEMA));
    w.clock.now += MIN;
    await w.send(alice, fid, pack(PANCAKES));
    expect((await w.inboxOf(bob)).items.map((i) => (decodePayload(i.payload) as { entries: SharedEntry[] }).entries[0]!.code)).toEqual(["272407558", "5030039010492", "Milk"]);
  });

  it("refuses a list that isn't one, saying why, and stores nothing", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const r = await w.send(alice, fid, "hello");
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "invalid_list", reason: "unreadable" });
    expect((await w.send(alice, fid, "x".repeat(MAX_PAYLOAD_LENGTH + 1))).body).toMatchObject({ error: "invalid_list", reason: "too_large" });
    expect((await w.send(alice, fid, "x".repeat(20001))).body).toMatchObject({ error: "invalid_request" });
    for (const body of [{}, { friendId: fid }, { payload: LIST }, { friendId: 5, payload: LIST }, { friendId: fid, payload: 5 }, { friendId: fid, payload: "" }, null]) {
      expect((await handleSendList(alice.id, body, w.ctx)).status, JSON.stringify(body)).toBe(400);
    }
    expect(w.mem.lists).toEqual([]);
  });

  it("only to a friend: not a request still waiting, not a stranger's friendship, not a made-up id", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const carol = await w.join("carol");
    const dave = await w.join("dave");
    const waiting = await handleFriendRequest(alice.id, { code: bob.code }, w.ctx);
    const fCD = await w.befriend(carol, dave);
    const answers = [
      await w.send(alice, (waiting.body as { id: string }).id, LIST), // not accepted yet
      await w.send(bob, (waiting.body as { id: string }).id, LIST), // the other side of it
      await w.send(alice, fCD, LIST), // somebody else's friendship
      await w.send(alice, "10000000-0000-4000-8000-0000000000ff", LIST), // nothing there
    ];
    for (const a of answers) expect(a).toEqual({ status: 404, body: expect.objectContaining({ error: "not_found" }) });
    expect(answers.map((a) => JSON.stringify(a))).toEqual(Array(4).fill(JSON.stringify(answers[0])));
    expect(w.mem.lists).toEqual([]);
  });

  it("not to someone who blocked you", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await handleBlock(bob.id, { friendId: fid }, w.ctx);
    expect(await w.send(alice, fid, LIST)).toEqual(await w.send(alice, "10000000-0000-4000-8000-0000000000ff", LIST));
    expect(w.mem.lists).toEqual([]);
  });

  it("not once the friendship has been removed", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await handleRemoveFriend(bob.id, fid, w.ctx);
    expect((await w.send(alice, fid, LIST)).status).toBe(404);
  });

  it("at most 50 unread lists for one person, and 10 from any one friend", async () => {
    const w = makeWorld();
    const me = await w.join("me.inbox");
    const senders: Array<{ person: Person; fid: string }> = [];
    for (let i = 0; i < 6; i++) {
      const p = await w.join(`sender${i}`);
      senders.push({ person: p, fid: await w.seedFriends(p, me) });
    }
    // one friend can send 10, then is told the inbox is full
    for (let i = 0; i < MAX_SENDS_TO_ONE_PER_DAY; i++) expect((await w.send(senders[0]!.person, senders[0]!.fid, pack(MILK))).status).toBe(201);
    const full = await w.send(senders[0]!.person, senders[0]!.fid, pack(MILK));
    expect(full.status).toBe(409);
    expect(full.body).toMatchObject({ error: "inbox_full" });
    // four more friends fill the rest (10 each = 50 in all)
    for (let s = 1; s <= 4; s++) for (let i = 0; i < MAX_SENDS_TO_ONE_PER_DAY; i++) expect((await w.send(senders[s]!.person, senders[s]!.fid, pack(MILK))).status).toBe(201);
    expect((await w.inboxOf(me)).unread).toBe(MAX_UNREAD);
    expect((await w.send(senders[5]!.person, senders[5]!.fid, pack(MILK))).body).toMatchObject({ error: "inbox_full" });
    // reading one frees a place, for anyone
    await handleMarkRead(me.id, (await w.inboxOf(me)).items[0]!.id, w.ctx);
    expect((await w.send(senders[5]!.person, senders[5]!.fid, pack(MILK))).status).toBe(201);
    // so does deleting one
    const another = (await w.inboxOf(me)).items.find((i) => i.readAt === null)!;
    await handleDeleteInboxItem(me.id, another.id, w.ctx);
    expect((await w.send(senders[5]!.person, senders[5]!.fid, pack(MILK))).status).toBe(201);
  });

  it("30 sends a day per person", async () => {
    const w = makeWorld();
    const me = await w.join("me.sender");
    const friends: Array<{ fid: string }> = [];
    for (let i = 0; i < 4; i++) friends.push({ fid: await w.seedFriends(me, await w.join(`pal${i}`)) });
    for (let f = 0; f < 3; f++) for (let i = 0; i < 10; i++) expect((await w.send(me, friends[f]!.fid, pack(MILK))).status).toBe(201);
    expect(w.mem.lists).toHaveLength(MAX_SENDS_PER_DAY);
    const stopped = await w.send(me, friends[3]!.fid, pack(MILK));
    expect(stopped.status).toBe(429);
    expect(w.mem.lists).toHaveLength(MAX_SENDS_PER_DAY);
    w.clock.now += DAY + MIN;
    expect((await w.send(me, friends[3]!.fid, pack(MILK))).status).toBe(201);
  });

  it("the daily send limit is kept in the database: a restart gives nothing back, and neither does the friend deleting the lists", async () => {
    const w = makeWorld();
    const me = await w.join("me.sender");
    const pals = [];
    for (let i = 0; i < 5; i++) pals.push({ person: await w.join(`pal${i}`), fid: "" });
    for (const p of pals) p.fid = await w.seedFriends(me, p.person);
    let sent = 0;
    for (let i = 0; i < 60; i++) {
      w.restart();
      const p = pals[i % 5]!;
      const r = await w.send(me, p.fid, pack(MILK));
      if (r.status === 201) {
        sent++;
        await handleDeleteInboxItem(p.person.id, (r.body as { id: string }).id, w.ctx); // the friend deletes it at once
      } else expect([409, 429]).toContain(r.status);
    }
    expect(sent).toBeLessThanOrEqual(MAX_SENDS_PER_DAY);
    expect(sent).toBe(MAX_SENDS_PER_DAY);
    expect((await w.send(me, pals[0]!.fid, pack(MILK))).body).toMatchObject({ error: "daily_limit" });
    w.clock.now += DAY + MIN;
    w.restart();
    expect((await w.send(me, pals[0]!.fid, pack(MILK))).status).toBe(201);
  });

  it("10 a day to one friend counts what was sent, not what the friend did: reading or deleting gives nothing back, so a refusal tells the sender nothing", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const answers: unknown[] = [];
    for (let i = 0; i < MAX_SENDS_TO_ONE_PER_DAY; i++) answers.push((await w.send(alice, fid, pack(MILK))).status);
    expect(answers.every((a) => a === 201)).toBe(true);
    const refused = await w.send(alice, fid, pack(MILK));
    expect(refused.body).toMatchObject({ error: "inbox_full" });
    // bob reads them all, then deletes some: nothing changes for alice
    for (const item of (await w.inboxOf(bob)).items) await handleMarkRead(bob.id, item.id, w.ctx);
    expect((await w.send(alice, fid, pack(MILK))).body).toEqual(refused.body);
    await handleDeleteInboxItem(bob.id, (await w.inboxOf(bob)).items[0]!.id, w.ctx);
    expect((await w.send(alice, fid, pack(MILK))).body).toEqual(refused.body);
    // a day later it is open again
    w.clock.now += DAY + MIN;
    expect((await w.send(alice, fid, pack(MILK))).status).toBe(201);
  });

  it("several lists at once from one friend: no more than 10 get through", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    const results = await Promise.all(Array.from({ length: 30 }, () => w.send(alice, fid, pack(MILK))));
    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(MAX_SENDS_TO_ONE_PER_DAY);
    expect(w.mem.lists.length).toBeLessThanOrEqual(MAX_SENDS_TO_ONE_PER_DAY);
  });

  it("the inbox cap is the database's, so friends sending at the same moment can't push it past 50", async () => {
    const w = makeWorld();
    const me = await w.join("me.inbox");
    const senders: Array<{ person: Person; fid: string }> = [];
    for (let i = 0; i < 6; i++) {
      const p = await w.join(`sender${i}`);
      senders.push({ person: p, fid: await w.seedFriends(p, me) });
    }
    const results = await Promise.all(senders.flatMap((s) => Array.from({ length: 9 }, () => w.send(s.person, s.fid, pack(MILK)))));
    expect(w.mem.lists.length).toBeLessThanOrEqual(MAX_UNREAD);
    expect(results.filter((r) => r.status === 201)).toHaveLength(w.mem.lists.length);
    expect(results.filter((r) => r.status !== 201).every((r) => (r.body as { error?: string }).error === "inbox_full")).toBe(true);
    expect(results.filter((r) => r.status !== 201).length).toBeGreaterThan(0);
  });
});

describe("how long a list stays", () => {
  it("30 days; then it is not shown, not counted, can't be opened, and the daily clean-up deletes it", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await w.send(alice, fid, LIST);
    const id = (await w.inboxOf(bob)).items[0]!.id;

    w.clock.now = T0 + 29 * DAY;
    expect((await w.inboxOf(bob)).items).toHaveLength(1);
    expect((await w.meOf(bob)).counts.unread).toBe(1);

    w.clock.now = T0 + 30 * DAY + MIN;
    // an expired list can't be reported or blocked through either (it is as good as gone, though the row waits for the clean-up)
    expect((await handleReport(bob.id, { listId: id, reason: "spam" }, w.ctx)).status).toBe(404);
    expect((await handleBlock(bob.id, { listId: id }, w.ctx)).status).toBe(404);
    expect(w.mem.reports).toEqual([]);
    expect((await w.inboxOf(bob)).items).toEqual([]);
    expect((await w.meOf(bob)).counts.unread).toBe(0);
    expect((await handleMarkRead(bob.id, id, w.ctx)).status).toBe(404);
    expect(w.mem.lists).toHaveLength(1); // still there until the clean-up

    const cleanup: CleanupCtx = {
      store: { clearIpHashes: async () => 0 } as never, ipHash: null, now: new Date(w.clock.now), community: w.mem.store,
    };
    const done = await handleCleanup("Bearer secret-secret-123", "secret-secret-123", cleanup);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ ok: true, expiredLists: 1 });
    expect(w.mem.lists).toEqual([]);
  });

  it("the clean-up leaves lists that haven't expired, and works without Community attached", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const fid = await w.befriend(alice, bob);
    await w.send(alice, fid, LIST);
    const cleanup: CleanupCtx = { store: { clearIpHashes: async () => 0 } as never, ipHash: null, now: new Date(T0 + 10 * DAY), community: w.mem.store };
    expect((await handleCleanup("Bearer secret-secret-123", "secret-secret-123", cleanup)).body).toMatchObject({ expiredLists: 0 });
    expect(w.mem.lists).toHaveLength(1);
    const without = await handleCleanup("Bearer secret-secret-123", "secret-secret-123", { store: { clearIpHashes: async () => 0 } as never, ipHash: null });
    expect(without.body).toEqual({ ok: true, cleared: { waitlist: 0, number_reports: 0, chain_requests: 0, support_messages: 0 } });
    expect((await handleCleanup("Bearer wrong", "secret-secret-123", cleanup)).status).toBe(401);
  });
});

// ======================================================================================================================== IDOR

describe("a stranger can touch nothing that isn't theirs", () => {
  it("every endpoint that takes an id answers a stranger exactly as it answers an id that doesn't exist, and changes nothing", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const carol = await w.join("carol");
    const dave = await w.join("dave");
    const erin = await w.join("erin");
    const fAB = await w.befriend(alice, bob);
    await w.send(alice, fAB, LIST);
    await w.send(bob, fAB, pack(MILK));
    const listToBob = (await w.inboxOf(bob)).items[0]!.id;
    const listToAlice = (await w.inboxOf(alice)).items[0]!.id;
    const fAD = await w.befriend(alice, dave);
    await handleBlock(alice.id, { friendId: fAD }, w.ctx); // alice blocked dave
    const aliceBlock = w.mem.blocks[0]!.id;
    const waiting = await handleFriendRequest(alice.id, { code: erin.code }, w.ctx); // a pending request alice -> erin
    const pendingId = (waiting.body as { id: string }).id;
    const missing = "10000000-0000-4000-8000-0000000000ee";

    const snapshot = () => JSON.stringify([w.mem.profiles, w.mem.friendships, w.mem.blocks, w.mem.reports, w.mem.lists]);
    const before = snapshot();
    const notFound = { status: 404, body: expect.objectContaining({ error: "not_found" }) };

    // [who tries, what]: carol is a stranger to everything; the others try ids that belong to their counterpart
    const attempts: Array<[string, () => Promise<{ status: number; body?: Record<string, unknown> }>]> = [
      ["carol answers alice+bob's request", () => handleFriendRespond(carol.id, { id: fAB, accept: true }, w.ctx)],
      ["carol declines the request alice made to erin", () => handleFriendRespond(carol.id, { id: pendingId, accept: false }, w.ctx)],
      ["alice accepts the request she made herself", () => handleFriendRespond(alice.id, { id: pendingId, accept: true }, w.ctx)],
      ["carol removes alice+bob", () => handleRemoveFriend(carol.id, fAB, w.ctx)],
      ["carol cancels alice's request", () => handleRemoveFriend(carol.id, pendingId, w.ctx)],
      ["carol blocks through a friendship", () => handleBlock(carol.id, { friendId: fAB }, w.ctx)],
      ["carol blocks through bob's inbox item", () => handleBlock(carol.id, { listId: listToBob }, w.ctx)],
      ["alice (the sender) blocks through the item she sent", () => handleBlock(alice.id, { listId: listToBob }, w.ctx)],
      ["carol reports through a friendship", () => handleReport(carol.id, { friendId: fAB, reason: "spam" }, w.ctx)],
      ["carol reports through an inbox item", () => handleReport(carol.id, { listId: listToBob, reason: "spam" }, w.ctx)],
      ["alice reports the item she sent", () => handleReport(alice.id, { listId: listToBob, reason: "spam" }, w.ctx)],
      ["carol reports through alice's block", () => handleReport(carol.id, { blockId: aliceBlock, reason: "spam" }, w.ctx)],
      ["dave (the blocked) reports through the block", () => handleReport(dave.id, { blockId: aliceBlock, reason: "spam" }, w.ctx)],
      ["carol sends a list down alice+bob's friendship", () => handleSendList(carol.id, { friendId: fAB, payload: LIST }, w.ctx)],
      ["carol marks bob's item read", () => handleMarkRead(carol.id, listToBob, w.ctx)],
      ["alice (the sender) marks bob's item read", () => handleMarkRead(alice.id, listToBob, w.ctx)],
      ["bob (the sender) marks the item he sent read", () => handleMarkRead(bob.id, listToAlice, w.ctx)],
      ["carol deletes bob's item", () => handleDeleteInboxItem(carol.id, listToBob, w.ctx)],
      ["alice (the sender) deletes bob's item", () => handleDeleteInboxItem(alice.id, listToBob, w.ctx)],
      ["carol unblocks alice's block", () => handleUnblock(carol.id, aliceBlock, w.ctx)],
      ["dave (the blocked) lifts his own block", () => handleUnblock(dave.id, aliceBlock, w.ctx)],
      ["an id that is nothing", () => handleRemoveFriend(carol.id, missing, w.ctx)],
      ["an id that isn't an id", () => handleDeleteInboxItem(carol.id, "../../etc/passwd", w.ctx)],
    ];
    for (const [name, attempt] of attempts) {
      expect(await attempt(), name).toEqual(notFound);
    }
    // every refusal is the very same answer
    const first = JSON.stringify(await attempts[0]![1]());
    for (const [name, attempt] of attempts) expect(JSON.stringify(await attempt()), name).toBe(first);
    expect(snapshot()).toBe(before);
  });

  it("lists, inboxes and the profile only ever show the caller's own rows", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const carol = await w.join("carol");
    const fid = await w.befriend(alice, bob);
    await w.send(alice, fid, LIST);
    expect((await w.inboxOf(carol)).items).toEqual([]);
    expect((await w.friendsOf(carol))).toMatchObject({ friends: [], incoming: [], outgoing: [] });
    expect((await handleGetBlocks(carol.id, w.ctx)).body).toEqual({ ok: true, blocks: [] });
    expect((await w.meOf(carol)).profile!.username).toBe("carol");
  });
});

// ======================================================================================================================== accounts

describe("deleting an account", () => {
  it("removes the person from everyone's friends, requests and inbox, and frees their code (modelling ON DELETE CASCADE)", async () => {
    const w = makeWorld();
    const alice = await w.join("alice");
    const bob = await w.join("bob");
    const carol = await w.join("carol");
    const fid = await w.befriend(alice, bob);
    await w.befriend(alice, carol);
    await w.send(alice, fid, LIST);
    await w.send(bob, fid, pack(MILK));
    await handleReport(bob.id, { friendId: fid, reason: "other" }, w.ctx);
    await handleFriendRequest(bob.id, { code: carol.code }, w.ctx);

    w.mem.deleteUser(alice.id);

    expect((await w.friendsOf(bob)).friends).toEqual([]);
    expect((await w.friendsOf(carol)).friends).toEqual([]);
    expect((await w.friendsOf(carol)).incoming.map((f) => f.username)).toEqual(["bob"]); // bob's own request to carol is untouched
    expect((await w.inboxOf(bob)).items).toEqual([]);
    expect(w.mem.lists).toEqual([]);
    // a report about the person STAYS (readable from the copied names), with the person's id emptied: deleting an account can't destroy the evidence
    expect(w.mem.reports).toHaveLength(1);
    expect(w.mem.reports[0]).toMatchObject({ reporter: bob.id, reported: null, reportedUsername: "alice", reporterUsername: "bob", status: "open" });
    expect(w.mem.attempts.filter((a) => a.userId === alice.id)).toEqual([]);
    expect((await handleFriendRequest(bob.id, { code: alice.code }, w.ctx)).body).toMatchObject({ error: "cannot_add" });
    // her username is free again
    expect((await handlePutMe(w.newUserId(), { username: "alice" }, w.ctx)).status).toBe(201);
  });

  it("every reference to an account in the migration is ON DELETE CASCADE, except the two on reports, which are SET NULL (the real database does it; supabase/tests/community.sql proves it)", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20261016120000_community.sql", import.meta.url), "utf8");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    const references = [...code.matchAll(/(\w+)\s+uuid[^,\n]*?references auth\.users \(id\)([^,\n]*)/g)];
    expect(references.length).toBe(11); // profile 1, friendships 2, blocks 2, reports 2, lists 2, tallies 2
    for (const m of references) {
      if (m[1] === "reporter" || m[1] === "reported") expect(m[2], m[0]).toMatch(/^\s*on delete set null/);
      else expect(m[2], m[0]).toMatch(/^\s*on delete cascade/);
    }
    // the two on reports are not "not null" (a report can lose a person, never its row)
    expect(code).toMatch(/reporter\s+uuid references auth\.users \(id\) on delete set null,/);
    expect(code).toMatch(/reported\s+uuid references auth\.users \(id\) on delete set null,/);
  });
});

// ======================================================================================================================== the migration

describe("the migration keeps the same security model as the other tables", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261016120000_community.sql", import.meta.url), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const tables = ["community_profiles", "friendships", "community_blocks", "community_reports", "community_lists", "community_attempts"];

  it("RLS on for every table, no policies, nothing for anon or authenticated, everything for the server role", () => {
    for (const t of tables) expect(code, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    expect(code).not.toMatch(/create policy/i);
    const revoke = code.match(/revoke all on([\s\S]*?)from anon, authenticated;/)![1]!;
    const grant = code.match(/grant all on([\s\S]*?)to service_role;/)![1]!;
    for (const t of [...tables, "open_community_reports"]) {
      expect(revoke, t).toContain(`public.${t}`);
      expect(grant, t).toContain(`public.${t}`);
    }
    expect(code).toMatch(/create view public\.open_community_reports with \(security_invoker = true\)/);
  });

  it("changes nothing that exists: it only creates", () => {
    expect(code).not.toMatch(/\b(drop|truncate|delete\s+from|update\s+public|alter\s+table\s+public\.(waitlist|number_reports|chain_requests|support_messages|user_data))\b/i);
    expect(code.match(/create (table|view|unique index|index) /g)!.length).toBeGreaterThanOrEqual(10);
  });

  it("its username and code rules are the ones in code", async () => {
    const { USERNAME_MAX, USERNAME_MIN } = await import("../lib/community/username");
    const { FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH } = await import("../lib/community/friendCode");
    expect(code).toContain(`between ${USERNAME_MIN} and ${USERNAME_MAX}`);
    expect(code).toContain(`{${FRIEND_CODE_LENGTH}}`);
    const alphabet = code.match(/friend_code ~ '\^\[(.*?)\]\{8\}\$'/)![1]!;
    expect(alphabet).toBe("A-HJKMNP-Z2-9");
    // expand the character class and compare with the alphabet used to generate codes
    const expanded = [...FRIEND_CODE_ALPHABET].every((c) => new RegExp(`^[${alphabet}]$`).test(c)) && [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].filter((c) => new RegExp(`^[${alphabet}]$`).test(c)).length === FRIEND_CODE_ALPHABET.length;
    expect(expanded).toBe(true);
  });

  it("its three caps (the triggers that hold under a race) are the numbers in code", async () => {
    const { MAX_FRIENDS, MAX_PENDING_IN, MAX_UNREAD } = await import("../lib/community/limits");
    expect(code).toMatch(new RegExp(`if unread >= ${MAX_UNREAD} then`));
    expect(code).toMatch(new RegExp(`if waiting >= ${MAX_PENDING_IN} then`));
    expect(code).toMatch(new RegExp(`if friends >= ${MAX_FRIENDS} then`));
    for (const name of ["community_inbox_full", "community_requests_full", "community_friends_full"]) {
      expect(code).toContain(`'${name}'`);
      expect(readFileSync(new URL("../lib/store-supabase-community.ts", import.meta.url), "utf8")).toContain(name);
    }
  });

  it("the tally's kinds are the ones the API uses", async () => {
    const { ATTEMPT_KINDS } = await import("../lib/community/types");
    const listed = code.match(/kind\s+text not null check \(kind in \(([^)]*)\)\)/)![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(listed).toEqual([...ATTEMPT_KINDS]);
  });

  it("the reasons it allows are the reasons the API accepts", async () => {
    const { REPORT_REASONS } = await import("../lib/community/types");
    const listed = code.match(/reason\s+in \(([^)]*)\)/)![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(listed).toEqual([...REPORT_REASONS]);
  });
});

// ======================================================================================================================== not synced

describe("Community data is never synced", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const syncFiles = ["lib/sync/handlers.ts", "lib/mm/syncMerge.ts", "lib/mm/syncStores.ts", "lib/mm/sync.ts"];

  it("none of it is a synced store, and the table behind sync doesn't allow it", async () => {
    const { SYNC_STORES } = await import("../lib/mm/syncMerge");
    for (const name of SYNC_STORES) expect(name).not.toMatch(/communit|friend|inbox|block|report|username|profile/i);
    const migration = readFileSync(new URL("../../supabase/migrations/20261013120000_user_data.sql", import.meta.url), "utf8");
    const allowed = migration.match(/check \(store in \(([^)]*)\)\)/)![1]!;
    expect(allowed).not.toMatch(/communit|friend|inbox|block|report|username|profile/i);
  });

  it("the sync code doesn't mention Community, and the Community code doesn't use the sync code", async () => {
    for (const f of syncFiles) expect(read(f), f).not.toMatch(/communit|friend|inbox|username/i);
    const { SYNCED_SETTING_KEYS } = await import("../lib/mm/syncStores");
    for (const key of SYNCED_SETTING_KEYS) expect(key).not.toMatch(/communit|friend|inbox|username/i);
    for (const f of ["lib/community/handlers.ts", "lib/community/types.ts", "lib/community/route.ts", "lib/store-supabase-community.ts"]) {
      expect(read(f), f).not.toMatch(/from ["'][./]*(\.\.\/)?(sync\/|mm\/sync)/);
      expect(read(f), f).not.toMatch(/user_data|SYNC_STORES|syncMerge/);
    }
  });
});

// ======================================================================================================================== the adapter

describe("the Supabase adapter and the migration name the same things", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261016120000_community.sql", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../lib/store-supabase-community.ts", import.meta.url), "utf8");

  it("every table the adapter reads or writes exists in the migration", () => {
    const used = new Set([...adapter.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual(["community_attempts", "community_blocks", "community_lists", "community_profiles", "community_reports", "friendships"]);
    for (const t of used) expect(sql).toContain(`create table public.${t}`);
  });

  it("every column it names exists in that table", () => {
    const body = (table: string) => sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))![1]!;
    const columns = (table: string) => new Set(body(table).split("\n").map((l) => l.trim().match(/^([a-z_]+)\s+(uuid|text|timestamptz|integer)\b/)?.[1]).filter(Boolean) as string[]);
    const cols: Record<string, string> = {
      PROFILE_COLS: "community_profiles", FRIENDSHIP_COLS: "friendships", BLOCK_COLS: "community_blocks", LIST_COLS: "community_lists",
    };
    for (const [constant, table] of Object.entries(cols)) {
      const list = adapter.match(new RegExp(`const ${constant} = "([^"]+)"`))![1]!.split(",").map((s) => s.trim());
      for (const c of list) expect(columns(table).has(c), `${constant}: ${c}`).toBe(true);
    }
    // the report insert
    for (const c of ["reporter", "reported", "reporter_username", "reported_username", "reason", "note", "list_payload", "list_text", "created_at"]) {
      expect(columns("community_reports").has(c), c).toBe(true);
      expect(adapter).toContain(c);
    }
    // the unique constraints the adapter reads back by name
    for (const name of ["community_profiles_username_key", "community_profiles_friend_code_key"]) expect(sql).toContain(name);
    expect(adapter).toMatch(/community_profiles_username_key/);
    expect(adapter).toMatch(/community_profiles_friend_code_key/);
  });
});
