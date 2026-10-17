"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { COMMUNITY_FRIENDS_ENABLED } from "@/lib/mm/config";
import { createCommunityApi, isFailure, type Counts, type Failure, type FriendsData, type InboxData, type Person, type Profile } from "@/lib/mm/communityClient";
import { emptyCache, liveInbox, withCached, withoutExpired, type CommunityCache } from "@/lib/mm/communityCache";
import { accountApi, sessionEnded, useAccountUser, userStore } from "./account";
import { communityCacheStore } from "./communityCache";

// Friends and shared shopping lists, for the screens (docs/BACKEND.md "Community"; the founder's request of 16 October 2026). The one place the app talks to
// the Community routes. It keeps what the server last said in memory, shared by every screen (the tab bar's badge, the hub, the friends page, the inbox), and
// a copy on this device for showing offline (lib/mm/communityCache.ts: never synced, cleared by sign-out, account deletion and "Clear data").
//
// Nothing here runs for someone who is signed out, and nothing here touches the sync stores. Other people appear only as a username and the id of the row
// that connects you; the screens print them as plain text.

export const communityApi = createCommunityApi({ request: (path, init) => accountApi().request(path, init) });

/** What one kind of thing (my profile, the friends, the inbox) is like right now. */
export interface Resource<T> {
  /** The latest copy we have: from the server, or (before it answers, or when it can't) from this device. */
  data: T | null;
  source: "none" | "cache" | "network";
  loading: boolean;
  /** Why the last try failed; the data stays what it was. */
  failure: Failure | null;
}

export interface CommunityState {
  /** The account this belongs to; everything resets when it changes. */
  userId: string | null;
  me: Resource<{ profile: Profile | null; counts: Counts }>;
  friends: Resource<FriendsData>;
  inbox: Resource<InboxData>;
  blocks: Resource<Person[]>;
}

function idle<T>(): Resource<T> {
  return { data: null, source: "none", loading: false, failure: null };
}
const EMPTY: CommunityState = { userId: null, me: idle(), friends: idle(), inbox: idle(), blocks: idle() };

let state: CommunityState = EMPTY;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getState = () => state;
const getServerState = () => EMPTY;
function setState(patch: Partial<CommunityState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

/** The load of each kind of thing that is on its way (a second ask while one is running waits for it). Declared before bind(), which runs when this file loads. */
const inflight = new Map<string, Promise<void>>();

const fromDevice = <T,>(data: T | null): Resource<T> => (data ? { data, source: "cache", loading: false, failure: null } : idle());

/** Tie everything to one account: another person (or nobody) means starting again, from the copy on this device only if it is theirs. */
function bind(userId: string | null): void {
  if (state.userId === userId) return;
  inflight.clear();
  const cached = userId ? communityCacheStore.get() : null;
  if (cached && cached.userId !== userId) communityCacheStore.reset();
  const mine = cached && cached.userId === userId ? withoutExpired(cached, Date.now()) : null; // a list that ran out while the phone was offline is not shown
  state = userId
    ? { userId, me: fromDevice(mine ? { profile: mine.profile, counts: mine.counts } : null), friends: fromDevice(mine?.friends ?? null), inbox: fromDevice(mine?.inbox ?? null), blocks: idle() }
    : EMPTY;
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  bind(userStore.get()?.id ?? null);
  userStore.subscribe(() => bind(userStore.get()?.id ?? null));
  // The device's copy was emptied (Clear data, signing out): forget what is in memory too.
  communityCacheStore.subscribe(() => {
    if (communityCacheStore.get() === null && state.userId !== null && (state.me.source === "cache" || state.friends.source === "cache" || state.inbox.source === "cache")) {
      state = { ...state, me: state.me.source === "cache" ? idle() : state.me, friends: state.friends.source === "cache" ? idle() : state.friends, inbox: state.inbox.source === "cache" ? idle() : state.inbox };
      listeners.forEach((fn) => fn());
    }
  });
}

/** Keep a copy of what the server said on this device. */
function remember(patch: Partial<Omit<CommunityCache, "userId" | "savedAt">>): void {
  const userId = state.userId;
  if (!userId) return;
  const current = communityCacheStore.get();
  const base = current && current.userId === userId ? current : emptyCache(userId, Date.now());
  const known = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)); // a part we don't know yet leaves the copy's part alone
  communityCacheStore.set(withCached(base, known, Date.now()));
}

const withCounts = (patch: Partial<Counts>): Resource<{ profile: Profile | null; counts: Counts }> => {
  const me = state.me.data;
  return me ? { ...state.me, data: { ...me, counts: { ...me.counts, ...patch } } } : state.me;
};

/** Drop lists that have run out (30 days) from what is on screen, like the server would; called when the app opens or comes back, and when the inbox is opened. */
export function expireInbox(): void {
  const inbox = state.inbox.data;
  if (!inbox) return;
  const live = liveInbox(inbox, Date.now());
  if (live === inbox) return;
  setState({ inbox: { ...state.inbox, data: live }, me: withCounts({ unread: live.unread }) });
  remember({ inbox: live, counts: state.me.data?.counts });
}

// ------------------------------------------------------------------------------------------------ loading

/** The server said "not signed in" (and the session could not be renewed): leave the account on this device. */
function unauthorized(f: Failure): void {
  if (f.error === "unauthorized") void sessionEnded();
}

function load<K extends "me" | "friends" | "inbox" | "blocks">(key: K, run: () => Promise<{ ok: true; apply: () => void } | Failure>): Promise<void> {
  const userId = state.userId;
  if (!userId) return Promise.resolve();
  const running = inflight.get(key);
  if (running) return running;
  setState({ [key]: { ...state[key], loading: true } } as Partial<CommunityState>);
  const p = run().then((r) => {
    if (state.userId !== userId) return; // another account since: this answer isn't theirs
    if ("apply" in r) {
      r.apply();
      return;
    }
    unauthorized(r);
    setState({ [key]: { ...state[key], loading: false, failure: r } } as Partial<CommunityState>);
  }).finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/** My profile and the two numbers for the tab bar's badge. */
export const refreshMe = (): Promise<void> =>
  load("me", async () => {
    const r = await communityApi.me();
    if (isFailure(r)) return r;
    return {
      ok: true as const,
      apply: () => {
        setState({ me: { data: { profile: r.profile, counts: r.counts }, source: "network", loading: false, failure: null } });
        remember({ profile: r.profile, counts: r.counts });
      },
    };
  });

export const refreshFriends = (): Promise<void> =>
  load("friends", async () => {
    const r = await communityApi.friends();
    if (isFailure(r)) return r;
    const data: FriendsData = { friends: r.friends, incoming: r.incoming, outgoing: r.outgoing };
    return {
      ok: true as const,
      apply: () => {
        setState({ friends: { data, source: "network", loading: false, failure: null }, me: withCounts({ friendRequests: data.incoming.length }) });
        remember({ friends: data, counts: state.me.data?.counts });
      },
    };
  });

export const refreshInbox = (): Promise<void> =>
  load("inbox", async () => {
    const r = await communityApi.inbox();
    if (isFailure(r)) return r;
    const data: InboxData = { items: r.items, unread: r.unread };
    return {
      ok: true as const,
      apply: () => {
        setState({ inbox: { data, source: "network", loading: false, failure: null }, me: withCounts({ unread: data.unread }) });
        remember({ inbox: data, counts: state.me.data?.counts });
      },
    };
  });

export const refreshBlocks = (): Promise<void> =>
  load("blocks", async () => {
    const r = await communityApi.blocks();
    if (isFailure(r)) return r;
    return { ok: true as const, apply: () => setState({ blocks: { data: r.blocks, source: "network", loading: false, failure: null } }) };
  });

const LOADERS = { me: refreshMe, friends: refreshFriends, inbox: refreshInbox, blocks: refreshBlocks } as const;

// ------------------------------------------------------------------------------------------------ doing things

/** Run a call; a "not signed in" answer ends the session here too. */
async function act<R extends { ok: boolean }>(run: () => Promise<R>): Promise<R> {
  const r = await run();
  if (isFailure(r)) unauthorized(r);
  return r;
}

export async function chooseUsername(username: string) {
  const r = await act(() => communityApi.chooseUsername(username));
  if (r.ok) {
    setState({ me: { data: { profile: r.profile, counts: state.me.data?.counts ?? { unread: 0, friendRequests: 0 } }, source: "network", loading: false, failure: null } });
    remember({ profile: r.profile });
  }
  return r;
}

export async function addFriendByCode(code: string) {
  const r = await act(() => communityApi.requestFriend(code));
  if (r.ok) void refreshFriends();
  return r;
}

export async function answerRequest(id: string, accept: boolean) {
  const r = await act(() => communityApi.respond(id, accept));
  if (r.ok) void refreshFriends();
  return r;
}

export async function removeFriend(id: string) {
  const r = await act(() => communityApi.removeFriend(id));
  if (r.ok) void refreshFriends();
  return r;
}

/** After someone is blocked, everything that listed them is stale. */
function blocked(): void {
  void refreshFriends();
  void refreshInbox();
  void refreshBlocks();
}

export async function blockPerson(target: { friendId: string } | { listId: string }) {
  const r = await act(() => communityApi.block(target));
  if (r.ok) blocked();
  return r;
}

export async function unblock(blockId: string) {
  const r = await act(() => communityApi.unblock(blockId));
  if (r.ok) void refreshBlocks();
  return r;
}

export async function reportAbuse(input: Parameters<typeof communityApi.report>[0]) {
  const r = await act(() => communityApi.report(input));
  if (r.ok && r.blocked) blocked();
  return r;
}

export const sendList = (friendId: string, payload: string) => act(() => communityApi.sendList(friendId, payload));

/** Mark a list as read: the number on the tab bar drops at once. */
export async function markListRead(id: string) {
  const item = state.inbox.data?.items.find((i) => i.id === id);
  if (!item || item.readAt) return { ok: true as const };
  const r = await act(() => communityApi.markRead(id));
  if (r.ok && state.inbox.data) {
    const data: InboxData = { items: state.inbox.data.items.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)), unread: Math.max(0, state.inbox.data.unread - 1) };
    setState({ inbox: { ...state.inbox, data }, me: withCounts({ unread: data.unread }) });
    remember({ inbox: data, counts: state.me.data?.counts });
  }
  return r;
}

export async function deleteListItem(id: string) {
  const r = await act(() => communityApi.deleteItem(id));
  if (r.ok && state.inbox.data) {
    const gone = state.inbox.data.items.find((i) => i.id === id);
    const data: InboxData = { items: state.inbox.data.items.filter((i) => i.id !== id), unread: Math.max(0, state.inbox.data.unread - (gone && !gone.readAt ? 1 : 0)) };
    setState({ inbox: { ...state.inbox, data }, me: withCounts({ unread: data.unread }) });
    remember({ inbox: data, counts: state.me.data?.counts });
  }
  return r;
}

// ------------------------------------------------------------------------------------------------ for screens

export function useCommunityState(): CommunityState {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/**
 * One kind of thing, loaded when the screen opens (and again when the network returns after a failure). `signedIn` is false for someone with no account:
 * nothing is asked of the server then. `offline` means the last try couldn't reach it, so what is shown (if anything) is the copy kept on this device.
 */
export function useCommunityResource<K extends "me" | "friends" | "inbox" | "blocks">(key: K, enabled = true) {
  const user = useAccountUser();
  const s = useCommunityState();
  const userId = user?.id ?? null;
  const active = userId !== null && enabled && COMMUNITY_FRIENDS_ENABLED;
  useEffect(() => {
    if (!userId || !active) return;
    bind(userId);
    if (key === "inbox") expireInbox();
    void LOADERS[key]();
  }, [userId, key, active]);
  const res = s[key] as CommunityState[K];
  const failed = res.failure;
  useEffect(() => {
    if (!userId || !active || !failed?.offline) return;
    const again = () => void LOADERS[key]();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [userId, key, active, failed?.offline]);
  // "Try again" asks nothing while the friends feature is switched off (lib/mm/config.ts): no screen should reach the Community routes then
  const reload = useCallback(() => { if (COMMUNITY_FRIENDS_ENABLED) void LOADERS[key](); }, [key]);
  return {
    signedIn: userId !== null,
    data: res.data as NonNullable<CommunityState[K]["data"]> | null,
    source: res.source,
    loading: res.loading,
    failure: res.failure,
    offline: res.failure?.offline === true,
    reload,
    /** True until the first answer (from the device's copy or the server) is in. */
    waiting: active && res.data === null && res.failure === null,
  };
}

/** The friends screens exist only while the feature is switched on (NEXT_PUBLIC_COMMUNITY_FRIENDS=0 hides them and the website's invite page says "not yet"): a screen reached by an old link or a bookmark goes back to Community. */
export function useFriendsScreen(): boolean {
  const router = useRouter();
  useEffect(() => {
    if (!COMMUNITY_FRIENDS_ENABLED) router.replace("/app/community");
  }, [router]);
  return COMMUNITY_FRIENDS_ENABLED;
}

const POLL_MS = 3 * 60 * 1000;
const FOCUS_MIN_GAP_MS = 20 * 1000;

/**
 * The number on the Community tab: lists not opened yet plus friend requests waiting. Asked for when the app opens, when it comes back to the front, when the
 * network returns and every few minutes while it is on screen and someone is signed in (no push, no open connection). Offline it shows the last number kept.
 * Nothing is asked when nobody is signed in, or while the friends feature is switched off (lib/mm/config.ts).
 */
export function useCommunityBadge(): number {
  const user = useAccountUser();
  const s = useCommunityState();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || !COMMUNITY_FRIENDS_ENABLED) return;
    bind(userId);
    let last = 0;
    const run = () => {
      last = Date.now();
      expireInbox();
      void refreshMe();
    };
    run();
    const visible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > FOCUS_MIN_GAP_MS) run();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", run);
    const poll = setInterval(visible, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", run);
      clearInterval(poll);
    };
  }, [userId]);
  if (!userId || !COMMUNITY_FRIENDS_ENABLED) return 0;
  const counts = s.me.data?.counts;
  return counts ? counts.unread + counts.friendRequests : 0;
}
