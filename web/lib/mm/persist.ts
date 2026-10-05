// A tiny external store backed by localStorage, for use with React's useSyncExternalStore.
// Storage can be missing or throw (private windows, blocked site data), so every access is guarded and
// the app keeps working from memory.

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Store<T> {
  get(): T;
  /** Snapshot used during server rendering: always the defaults. */
  getServerSnapshot(): T;
  set(next: T): void;
  update(fn: (current: T) => T): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export interface StoreOptions<T> {
  sanitize: (raw: unknown) => T;
  storage?: KeyValueStorage | null;
}

const VERSION = 1;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function createStore<T>(key: string, fallback: T, options: StoreOptions<T>): Store<T> {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const listeners = new Set<() => void>();
  let current: T = fallback;
  let loaded = false;
  let listening = false;

  function read(): T {
    try {
      const text = storage?.getItem(key);
      if (!text) return fallback;
      const envelope = JSON.parse(text) as { v?: number; data?: unknown };
      return envelope.v === VERSION ? options.sanitize(envelope.data) : fallback;
    } catch {
      return fallback;
    }
  }

  function emit() {
    for (const l of [...listeners]) l();
  }

  function ensureLoaded() {
    if (!loaded) {
      current = read();
      loaded = true;
    }
  }

  function listenToOtherTabs() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;
      current = read();
      loaded = true;
      emit();
    });
  }

  const store: Store<T> = {
    get() {
      ensureLoaded();
      return current;
    },
    getServerSnapshot: () => fallback,
    set(next) {
      current = next;
      loaded = true;
      try {
        storage?.setItem(key, JSON.stringify({ v: VERSION, data: next }));
      } catch {
        // Quota or blocked storage: keep going from memory.
      }
      emit();
    },
    update(fn) {
      store.set(fn(store.get()));
    },
    reset() {
      store.set(fallback);
      try {
        storage?.removeItem(key);
      } catch {
        // ignore
      }
    },
    subscribe(listener) {
      listenToOtherTabs();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

let askedForPersistence = false;
/**
 * Ask the browser not to evict our data (iPhone Safari can clear site data for sites it hasn't seen in about a week).
 * Called when the user first saves or logs something worth keeping; best effort and silent where unsupported.
 */
export function requestPersistentStorage(): void {
  if (askedForPersistence || typeof navigator === "undefined" || !navigator.storage?.persist) return;
  askedForPersistence = true;
  void navigator.storage.persist().catch(() => undefined);
}
