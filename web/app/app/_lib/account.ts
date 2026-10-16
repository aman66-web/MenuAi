"use client";

import { useSyncExternalStore } from "react";
import { API_BASE, APP_BUILD } from "@/lib/mm/config";
import { cleanUser, createAccountApi, sanitizeStoredSession, type AccountApi, type AccountUser, type StoredSession } from "@/lib/mm/account";
import { createStore } from "@/lib/mm/persist";
import { EMPTY_META, SyncEngine, sanitizeMeta, type SyncStatus } from "@/lib/mm/sync";
import { createSyncAdapters } from "@/lib/mm/syncStores";
import { compareStore, cupboardStore, favoritesStore, logStore, myRecipesStore, remindersStore, savedRecipesStore, savedStore, settingsStore, shoppingStore, waterStore } from "@/lib/mm/stores";

// Sign-in and sync for the running app (docs/ACCOUNTS_SYNC.md). Signing in is optional: with no account none of this does anything and
// everything stays on the device. The cached "who" (mm.v1.account) is only for showing the name; the real session is the server's
// (http-only cookies on the website; the iPhone app's own copy in mm.v1.session).

const isUser = (u: unknown): u is AccountUser =>
  typeof u === "object" && u !== null && typeof (u as AccountUser).id === "string" && (typeof (u as AccountUser).email === "string" || (u as AccountUser).email === null);

export const userStore = createStore<AccountUser | null>("mm.v1.account", null, { sanitize: (raw) => (isUser(raw) ? cleanUser(raw) : null) });
const tokensStore = createStore<StoredSession | null>("mm.v1.session", null, { sanitize: sanitizeStoredSession });
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
  userStore.set(null);
}

/** Sign out. The data stays on this device. */
export const signOut = (): Promise<void> => leave(true);

/** Delete the account and everything synced for it. The data on this device stays, as plain device data. */
export async function deleteAccount(appleAuthorizationCode?: string): Promise<void> {
  await accountApi().deleteAccount(appleAuthorizationCode);
  stopLoop?.();
  syncEngine().forget();
  userStore.set(null);
}

/** "Clear data on this device": also leaves the account here (otherwise the next sync would bring it all straight back, or worse, treat the
 *  clearing as the person deleting everything). Call this BEFORE emptying the stores. The synced data stays in the account. */
export async function leaveForClearing(): Promise<void> {
  if (!userStore.get()) return;
  stopLoop?.();
  syncEngine().forget();
  await accountApi().signOut();
  userStore.set(null);
}

/** Read when this file loads, before the settings page tidies "?signin=ok" out of the address. */
const RETURNING = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signin") === "ok";

let booted = false;
/** On every launch: ask who is signed in. Offline keeps what we knew; a "no" means the session ended, so the device goes back to plain local data. */
export async function bootAccount(): Promise<void> {
  if (booted || typeof window === "undefined") return;
  booted = true;
  // Someone who never signed in sends the server nothing: ask only if this device already knows an account, the iPhone app holds a session,
  // or the browser has just come back from Google or Apple sign-in (the callback adds ?signin=ok).
  if (!userStore.get() && !RETURNING && !(APP_BUILD && tokensStore.get())) return;
  try {
    const user = await accountApi().session();
    if (user) signedIn(user);
    else if (userStore.get()) await leave(false);
  } catch {
    const known = userStore.get();
    if (known) startLoop(); // offline: stay signed in as far as we know and sync when the network is back
  }
}

// ------------------------------------------------------------------------------------------------ for screens

export function useAccountUser(): AccountUser | null {
  return useSyncExternalStore(userStore.subscribe, userStore.get, userStore.getServerSnapshot);
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
