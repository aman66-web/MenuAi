// Make it at home: the photo someone took of the dish becomes the picture of the recipe they save (founder 2026-11-16: "The photo the user takes of the food they
// wanna make that's the thumbnail of the recipe"). A small copy (the whole photo, at least 800 x 600 where it shows) is kept in IndexedDB on this device only,
// keyed by the saved recipe's id. It is never synced (the saved recipe itself syncs for a signed-in person, so another device shows the drawing instead), never
// sent anywhere, removed with the recipe, and removed by Settings > Clear data. Separate from the report photos' database (lib/mm/photo-store.ts).
// Founder 2026-11-20: the person can move their photo (tap it, drag, Done) to choose which part shows. Only that choice is kept (a position, below), beside the
// photo in its own store; the photo itself is never changed.

const DB = "mm-recipe-photos";
const STORE = "photos";
/** Which part of each photo shows (PhotoPosition), keyed by the recipe's id. */
const PLACES = "positions";
const STORES = [STORE, PLACES] as const;

// Opens at whatever version the database is; if it exists without one of the stores (made before positions were kept), it is reopened one version up to add it.
function open(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(DB, version) : indexedDB.open(DB);
    req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
    req.onsuccess = () => {
      const db = req.result;
      if (STORES.every((s) => db.objectStoreNames.contains(s))) { resolve(db); return; }
      const next = db.version + 1;
      db.close();
      open(next).then(resolve, reject);
    };
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store: (typeof STORES)[number] = STORE): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Only recipes Pip made (ids "ai-…") can have a photo: the book's recipes never ask. */
export const mayHavePhoto = (id: string): boolean => id.startsWith("ai-");

/** Which part of a photo shows where it is cropped to fit (a card, the top of the recipe): CSS object-position in per cent, 0 to 100 each way; 50, 50 is the middle. */
export interface PhotoPosition {
  x: number;
  y: number;
}
export const PHOTO_CENTRE: PhotoPosition = { x: 50, y: 50 };

const clamp = (v: number) => Math.min(100, Math.max(0, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** A kept position read back, or null when it isn't one (each figure is held between 0 and 100). */
export function cleanPosition(raw: unknown): PhotoPosition | null {
  if (!raw || typeof raw !== "object") return null;
  const { x, y } = raw as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x: round1(clamp(x)), y: round1(clamp(y)) } : null;
}

/** The CSS object-position for a kept position (undefined: the middle, the browser's own). */
export const objectPosition = (p: PhotoPosition | null | undefined): string | undefined => (p ? `${p.x}% ${p.y}%` : undefined);

interface Size { w: number; h: number }

/** How far a photo of `natural` size, filling a `box` (object-fit: cover), runs past the box each way, in pixels: how far it can be moved. */
export function photoRoom(box: Size, natural: Size): Size {
  if (!(box.w > 0 && box.h > 0 && natural.w > 0 && natural.h > 0)) return { w: 0, h: 0 };
  const scale = Math.max(box.w / natural.w, box.h / natural.h);
  return { w: Math.max(0, natural.w * scale - box.w), h: Math.max(0, natural.h * scale - box.h) };
}

/** Where a drag of `dx`, `dy` pixels from `start` puts the photo: it follows the finger (dragging right shows more of its left side) and never leaves a gap. */
export function dragPosition(start: PhotoPosition, dx: number, dy: number, box: Size, natural: Size): PhotoPosition {
  const room = photoRoom(box, natural);
  const along = (p: number, d: number, r: number) => (r >= 1 ? clamp(p - (d / r) * 100) : p);
  return { x: round1(along(start.x, dx, room.w)), y: round1(along(start.y, dy, room.h)) };
}

export const recipePhotos = {
  async put(id: string, blob: Blob): Promise<void> {
    await run("readwrite", (s) => s.put(blob, id));
  },
  async get(id: string): Promise<Blob | null> {
    return ((await run("readonly", (s) => s.get(id))) as Blob | undefined) ?? null;
  },
  async putPosition(id: string, p: PhotoPosition): Promise<void> {
    const clean = cleanPosition(p);
    if (clean) await run("readwrite", (s) => s.put(clean, id), PLACES);
  },
  async getPosition(id: string): Promise<PhotoPosition | null> {
    return cleanPosition(await run("readonly", (s) => s.get(id), PLACES));
  },
  /** The photo and where it was moved to. */
  async delete(id: string): Promise<void> {
    await run("readwrite", (s) => s.delete(id));
    await run("readwrite", (s) => s.delete(id), PLACES);
  },
  /** Every id with a photo or a kept position. */
  async keys(): Promise<string[]> {
    const all = [...((await run("readonly", (s) => s.getAllKeys())) as IDBValidKey[]), ...((await run("readonly", (s) => s.getAllKeys(), PLACES)) as IDBValidKey[])];
    return [...new Set(all.map(String))];
  },
  async clear(): Promise<void> {
    await run("readwrite", (s) => s.clear());
    await run("readwrite", (s) => s.clear(), PLACES);
  },
};

/** The ids that have a photo but no saved recipe any more (removed, or another person signed in on this phone): to delete. */
export function orphanedPhotos(photoIds: readonly string[], savedIds: readonly string[]): string[] {
  const keep = new Set(savedIds);
  return photoIds.filter((id) => !keep.has(id));
}
