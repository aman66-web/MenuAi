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
import { withoutArrival } from "@/lib/mm/homePages";
import { forgetAccountAccess } from "@/lib/payments/accountAccess";
import { compareStore, cupboardStore, earlierPlansStore, favoritesStore, homePagesStore, logStore, mealPlanStore, myRecipesStore, recentStore, remindersStore, savedRecipesStore, savedStore, settingsStore, shoppingStore, waterStore, householdStore } from "@/lib/mm/stores";

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
    // what stays on this device but belongs to whoever uses it: a different person signing in here starts with these empty (privacy page)
    localStores: [waterStore, remindersStore, mealPlanStore, earlierPlansStore, householdStore, recentStore],
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

/** The sync that the latest sign-in started (it never throws: a failure only leaves the status at "offline" or "error"). */
let signInSync: Promise<void> = Promise.resolve();
/** The latest sign-in emptied this device's stores, because a different person had signed in here before (SyncEngine.prepareFor). */
let signInCleared = false;

/** Someone is signed in on this device: remember who, start from the right place and sync. */
export function signedIn(user: AccountUser): void {
  const before = syncMetaStore.get().userId;
  signInCleared = before !== undefined && before !== user.id;
  userStore.set(user);
  syncEngine().prepareFor(user.id);
  startLoop();
  signInSync = syncEngine().syncNow();
}

/**
 * Resolves once the sync that signing in started has finished, or after `ms` (offline, a slow connection), whichever is first. The welcome screens wait on it after
 * their sign-in step (the onboarding meeting of 19 November, question 1): an account already set up has brought its own settings by then (they win over anything
 * typed on this phone, lib/mm/sync.ts reconcileValue), and a new account has none.
 */
export function signInSettled(ms = 6000): Promise<void> {
  return Promise.race([signInSync, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

/**
 * After signInSettled, for lib/mm/signInGate.ts afterSignIn: whether that sign-in emptied this device's stores (`cleared`), and whether the settings have been
 * synced with the account since (`settingsSynced`; after an emptying, only the account's own settings can have been, since an emptied phone has none worth sending).
 */
export function signInOutcome(): { cleared: boolean; settingsSynced: boolean } {
  return { cleared: signInCleared, settingsSynced: (syncMetaStore.get().values.settings?.t ?? 0) > 0 };
}

/** What belongs to the account just left, not to the phone: removed when signing out or deleting the account (the privacy page says so). */
function forgetAccountsOwn(): void {
  householdStore.reset(); // the people the meal plan cooks for: another person may sign in next on this phone
  mealPlanStore.reset(); // the week's plan and the earlier ones are made for those people
  earlierPlansStore.reset();
  homePagesStore.set(withoutArrival(homePagesStore.get())); // Home's Start here card and toast from the welcome screens belong to the account just left
  forgetAccountAccess(); // the account's free week or gift of Premium (a bought one stays: lib/payments/accountAccess.ts)
}

/** Leave the account on this device. `tellServer`: also end the session there (not needed when the server already ended it). */
async function leave(tellServer: boolean): Promise<void> {
  stopLoop?.();
  syncEngine().stop(); // a sync still waiting on the server writes nothing more
  if (tellServer) await accountApi().signOut();
  tokensStore.set(null); // the iPhone app's session (and its Keychain copy) goes too, so the next launch doesn't ask with it again
  communityCacheStore.reset(); // friends and shared lists belong to the account, not to the device (docs/BACKEND.md "Community")
  forgetAccountsOwn();
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
  forgetAccountsOwn(); // and the meal plan and the people in it go too
  forgetInviteCode();
  userStore.set(null);
}

/** "Clear data on this device": also leaves the account here (otherwise the next sync would bring it all straight back, or worse, treat the
 *  clearing as the person deleting everything). Call this BEFORE emptying the stores. The synced data stays in the account. */
export async function leaveForClearing(): Promise<void> {
  communityCacheStore.reset(); // the copy of friends and shared lists goes whether or not someone is signed in
  forgetInviteCode(); // and a friend's code kept from an invite link, that nobody has used yet
  stopLoop?.();
  // Always, even signed out: a sync still running writes nothing into the stores about to be emptied, and the link to an account signed out of earlier is
  // forgotten too (kept, the same person signing in again would have the emptied stores taken as everything deleted, and deleted from the account).
  syncEngine().forget();
  if (!userStore.get()) return;
  await accountApi().signOut();
  tokensStore.set(null);
  userStore.set(null);
}

/** Read when this file loads, before the settings page tidies "?signin=ok" out of the address. */
const RETURNING = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signin") === "ok";

// The website's Apple and Google sign-in leaves the page and comes back to its path and query, but a browser never sends the part after "#" (where a shared
// shopping list is), so SignIn.tsx keeps it in this tab's session storage before leaving; it is put back here, as this file loads, before the page reads it.
export const SIGN_IN_HASH_KEY = "mm.signInHash";

/** Note this page's "#..." before leaving for Apple or Google (website only). */
export function keepHashForSignIn(): void {
  try {
    if (window.location.hash) sessionStorage.setItem(SIGN_IN_HASH_KEY, JSON.stringify({ path: window.location.pathname, hash: window.location.hash }));
    else sessionStorage.removeItem(SIGN_IN_HASH_KEY);
  } catch {
    // storage blocked: the page opens without its "#..."
  }
}

function restoreHashAfterSignIn(): void {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("signin")) return;
  try {
    const raw = sessionStorage.getItem(SIGN_IN_HASH_KEY);
    sessionStorage.removeItem(SIGN_IN_HASH_KEY);
    const kept = raw ? (JSON.parse(raw) as { path?: unknown; hash?: unknown }) : null;
    if (!kept || kept.path !== window.location.pathname || typeof kept.hash !== "string" || !/^#[\s\S]{1,8000}$/.test(kept.hash) || window.location.hash) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${kept.hash}`);
  } catch {
    // storage blocked or a note that doesn't read: leave the address as it is
  }
}
restoreHashAfterSignIn();

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
  // The question has no time limit of its own, and a weak signal could leave the whole app on "Loading…" (the meeting of 21 November 2026, Violet #23): after
  // 8 seconds the screens open (the sign-in screen when nobody is known yet), and a late answer that someone is signed in still opens the app (signedIn below).
  const giveUp = setTimeout(doneChecking, 8000);
  const before = userStore.get()?.id ?? null;
  try {
    const user = await accountApi().session();
    // someone signed in on the sign-in screen while this waited: that sign-in stands (a late "nobody" must not sign them out again)
    if ((userStore.get()?.id ?? null) !== before) return;
    if (user) signedIn(user);
    else if (userStore.get()) await leave(false);
  } catch {
    const known = userStore.get();
    if (known) startLoop(); // offline: stay signed in as far as we know and sync when the network is back
    // the iPhone app holds a session it couldn't ask about (no signal): ask once more when the signal is back, unless someone has signed in by then
    else if (tokensStore.get()) window.addEventListener("online", () => {
      if (userStore.get()) return;
      booted = false;
      void bootAccount();
    }, { once: true });
  } finally {
    clearTimeout(giveUp);
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
