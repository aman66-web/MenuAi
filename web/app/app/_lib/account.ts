"use client";

import { useSyncExternalStore } from "react";
import { API_BASE, APP_BUILD } from "@/lib/mm/config";
import { cleanUser, createAccountApi, sanitizeStoredSession, type AccountApi, type AccountUser, type StoredSession } from "@/lib/mm/account";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { createStore, withCopy } from "@/lib/mm/persist";
import { EMPTY_META, SyncEngine, sanitizeMeta, type SyncStatus } from "@/lib/mm/sync";
import { createSyncAdapters } from "@/lib/mm/syncStores";
import { communityCacheStore } from "./communityCache";
import { forgetInviteCode } from "./inviteCode";
import { compareStore, cupboardStore, favoritesStore, logStore, myRecipesStore, remindersStore, savedRecipesStore, savedStore, settingsStore, shoppingStore, waterStore, householdStore } from "@/lib/mm/stores";

// Sign-in and sync for the running app (docs/ACCOUNTS_SYNC.md). Since 2026-11-17 everyone signs in (lib/mm/config.ts SIGN_IN_REQUIRED: the app shows the
// sign-in screen until someone is); with that switch off signing in is optional, and with no account none of this does anything and everything stays on the device. The cached "who" (mm.v1.account) is only for showing the name; the real session is the server's
// (http-only cookies on the website; the iPhone app's own copy in mm.v1.session).

const isUser = (u: unknown): u is AccountUser =>
  typeof u === "object" && u !== null && typeof (u as AccountUser).id === "string" && (typeof (u as AccountUser).email === "string" || (u as AccountUser).email === null);

export const userStore = createStore<AccountUser | null>("mm.v1.account", null, { sanitize: (raw) => (isUser(raw) ? cleanUser(raw) : null) });
const localTokens = createStore<StoredSession | null>("mm.v1.session", null, { sanitize: sanitizeStoredSession });
// The iPhone app also keeps the session in its Keychain (founder 2026-11-18: "It always goes to this screen whenever you do the new build"): the web view's
// storage can lose its newest writes when iOS ends the app at once (an install, an update, a crash), and a renewed session lost that way meant the old one
// was refused and the person was signed out. Every change is copied to the Keychain (MenuMacros/Services/SessionStore.swift), which bootAccount reads first.
const keepInKeychain = (session: StoredSession | null) => {
  if (APP_BUILD && hasNative()) void nativeCall("session.save", { value: session ? JSON.stringify(session) : null }, 5_000);
};
const tokensStore = withCopy(localTokens, keepInKeychain);

/** The iPhone app's Keychain copy of the session, put back in place before anything asks who is signed in; an app set up before the copy existed fills it. */
async function restoreKeychainSession(): Promise<void> {
  if (!APP_BUILD || !hasNative()) return;
  const reply = await nativeCall("session.load", {}, 3_000);
  if (reply.error) return; // no answer: carry on with what the page has
  let kept: StoredSession | null = null;
  try {
    kept = reply.session ? sanitizeStoredSession(JSON.parse(reply.session)) : null;
  } catch {
    kept = null;
  }
  const local = localTokens.get();
  if (kept) {
    if (JSON.stringify(kept) !== JSON.stringify(local)) localTokens.set(kept);
  } else if (local) {
    keepInKeychain(local);
  }
}
export const syncMetaStore = createStore("mm.v1.syncMeta", EMPTY_META, { sanitize: sanitizeMeta });

let api: AccountApi | null = null;
export const accountApi = (): AccountApi => (api ??= createAccountApi({ fetch: (...a) => fetch(...a), base: API_BASE, useTokens: APP_BUILD, tokens: tokensStore }));

let engine: SyncEngine | null = null;
export const syncEngine = (): SyncEngine =>
  (engine ??= new SyncEngine({
    adapters: createSyncAdapters({
      settings: settingsStore, favorites: favoritesStore, saved: savedStore, log: logStore, shopping: shoppingStore,
      savedRecipes: savedRecipesStore, myRecipes: myRecipesStore, cupboard: cupboardStore, compare: compareStore,
    }),
    meta: syncMetaStore,
    localStores: [waterStore, remindersStore],
    api: accountApi(),
    now: () => Date.now(),
  }));

// ------------------------------------------------------------------------------------------------ keeping in sync

const DEBOUNCE_MS = 2500;
const POLL_MS = 5 * 60 * 1000;
const FOCUS_MIN_GAP_MS = 20 * 1000;
let stopLoop: (() => void) | null = null;

/** Sync after the person changes something, when the app comes back to the front, when the network returns and every few minutes. */
function startLoop() {
  if (stopLoop || typeof window === "undefined") return;
  const e = syncEngine();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  const run = () => {
    last = Date.now();
    void e.syncNow();
  };
  const soon = () => {
    if (e.applying) return; // the engine's own write, not the person's
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  };
  const unsubscribers = [settingsStore, favoritesStore, savedStore, logStore, shoppingStore, savedRecipesStore, myRecipesStore, cupboardStore, compareStore].map((s) => s.subscribe(soon));
  const visible = () => {
    if (document.visibilityState === "visible" && Date.now() - last > FOCUS_MIN_GAP_MS) run();
  };
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", visible);
  const poll = setInterval(visible, POLL_MS);
  const off = e.subscribe(() => {
    if (e.status === "signedOut") void leave(false); // the server ended this session (signed out elsewhere or the account is gone)
  });
  stopLoop = () => {
    if (timer) clearTimeout(timer);
    unsubscribers.forEach((u) => u());
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", visible);
    clearInterval(poll);
    off();
    stopLoop = null;
  };
}

/** Someone is signed in on this device: remember who, start from the right place and sync. */
export function signedIn(user: AccountUser): void {
  userStore.set(user);
  syncEngine().prepareFor(user.id);
  startLoop();
  void syncEngine().syncNow();
}

/** Leave the account on this device. `tellServer`: also end the session there (not needed when the server already ended it). */
async function leave(tellServer: boolean): Promise<void> {
  stopLoop?.();
  if (tellServer) await accountApi().signOut();
  communityCacheStore.reset(); // friends and shared lists belong to the account, not to the device (docs/BACKEND.md "Community")
  householdStore.reset(); // the people the meal plan cooks for: another person may sign in next on this phone
  userStore.set(null);
}

/** The server says the session is over (a Community call came back "not signed in" and the session could not be renewed): go back to plain local data. */
export const sessionEnded = (): Promise<void> => leave(false);

/** Sign out. The data stays on this device. */
export const signOut = (): Promise<void> => leave(true);

/** Delete the account and everything synced for it. The data on this device stays, as plain device data. */
export async function deleteAccount(appleAuthorizationCode?: string): Promise<void> {
  await accountApi().deleteAccount(appleAuthorizationCode);
  stopLoop?.();
  syncEngine().forget();
  communityCacheStore.reset(); // the username, friends and lists were deleted with the account
  householdStore.reset();
  forgetInviteCode();
  userStore.set(null);
}

/** "Clear data on this device": also leaves the account here (otherwise the next sync would bring it all straight back, or worse, treat the
 *  clearing as the person deleting everything). Call this BEFORE emptying the stores. The synced data stays in the account. */
export async function leaveForClearing(): Promise<void> {
  communityCacheStore.reset(); // the copy of friends and shared lists goes whether or not someone is signed in
  forgetInviteCode(); // and a friend's code kept from an invite link, that nobody has used yet
  if (!userStore.get()) return;
  stopLoop?.();
  syncEngine().forget();
  await accountApi().signOut();
  userStore.set(null);
}

/** Read when this file loads, before the settings page tidies "?signin=ok" out of the address. */
const RETURNING = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signin") === "ok";

// While the app finds out who is signed in and nobody is known yet (just back from Google or Apple, or the iPhone app holds a session the device has no name
// for), the sign-in screen waits instead of flashing up (lib/mm/signInGate.ts).
let checking = typeof window !== "undefined" && !userStore.get() && (RETURNING || (APP_BUILD && (!!tokensStore.get() || hasNative())));
const checkingListeners = new Set<() => void>();
function doneChecking(): void {
  if (!checking) return;
  checking = false;
  checkingListeners.forEach((f) => f());
}

let booted = false;
/** On every launch: ask who is signed in. Offline keeps what we knew; a "no" means the session ended, so the device goes back to plain local data. */
export async function bootAccount(): Promise<void> {
  if (booted || typeof window === "undefined") return;
  booted = true;
  await restoreKeychainSession();
  // Someone who never signed in sends the server nothing: ask only if this device already knows an account, the iPhone app holds a session,
  // or the browser has just come back from Google or Apple sign-in (the callback adds ?signin=ok).
  if (!userStore.get() && !RETURNING && !(APP_BUILD && tokensStore.get())) return doneChecking();
  try {
    const user = await accountApi().session();
    if (user) signedIn(user);
    else if (userStore.get()) await leave(false);
  } catch {
    const known = userStore.get();
    if (known) startLoop(); // offline: stay signed in as far as we know and sync when the network is back
  } finally {
    doneChecking();
  }
}

// ------------------------------------------------------------------------------------------------ for screens

export function useAccountUser(): AccountUser | null {
  return useSyncExternalStore(userStore.subscribe, userStore.get, userStore.getServerSnapshot);
}

/** True while the app is still finding out who is signed in (see `checking` above). */
export function useAccountChecking(): boolean {
  return useSyncExternalStore(
    (fn) => {
      checkingListeners.add(fn);
      return () => checkingListeners.delete(fn);
    },
    () => checking,
    () => false,
  );
}

export function useSyncState(): { status: SyncStatus; lastSyncAt?: number } {
  const e = typeof window === "undefined" ? null : syncEngine();
  const status = useSyncExternalStore(
    (fn) => (e ? e.subscribe(fn) : () => undefined),
    () => (e ? e.status : "idle"),
    () => "idle" as SyncStatus,
  );
  const meta = useSyncExternalStore(syncMetaStore.subscribe, syncMetaStore.get, syncMetaStore.getServerSnapshot);
  return { status, lastSyncAt: meta.lastSyncAt };
}
