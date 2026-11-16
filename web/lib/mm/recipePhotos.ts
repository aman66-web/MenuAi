// Make it at home: the photo someone took of the dish becomes the picture of the recipe they save (founder 2026-11-16: "The photo the user takes of the food they
// wanna make that's the thumbnail of the recipe"). A small copy (800 x 600 JPEG) is kept in IndexedDB on this device only, keyed by the saved recipe's id. It is
// never synced (the saved recipe itself syncs for a signed-in person, so another device shows the drawing instead), never sent anywhere, removed with the recipe,
// and removed by Settings > Clear data. Separate from the report photos' database (lib/mm/photo-store.ts) so neither needs a version upgrade.

const DB = "mm-recipe-photos";
const STORE = "photos";

// Opens at whatever version the database is; if it exists without the store (made by something else first), it is reopened one version up to add it.
function open(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(DB, version) : indexedDB.open(DB);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) { resolve(db); return; }
      const next = db.version + 1;
      db.close();
      open(next).then(resolve, reject);
    };
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Only recipes Pip made (ids "ai-…") can have a photo: the book's recipes never ask. */
export const mayHavePhoto = (id: string): boolean => id.startsWith("ai-");

export const recipePhotos = {
  async put(id: string, blob: Blob): Promise<void> {
    await run("readwrite", (s) => s.put(blob, id));
  },
  async get(id: string): Promise<Blob | null> {
    return ((await run("readonly", (s) => s.get(id))) as Blob | undefined) ?? null;
  },
  async delete(id: string): Promise<void> {
    await run("readwrite", (s) => s.delete(id));
  },
  async keys(): Promise<string[]> {
    return ((await run("readonly", (s) => s.getAllKeys())) as IDBValidKey[]).map(String);
  },
  async clear(): Promise<void> {
    await run("readwrite", (s) => s.clear());
  },
};

/** The ids that have a photo but no saved recipe any more (removed, or another person signed in on this phone): to delete. */
export function orphanedPhotos(photoIds: readonly string[], savedIds: readonly string[]): string[] {
  const keep = new Set(savedIds);
  return photoIds.filter((id) => !keep.has(id));
}
