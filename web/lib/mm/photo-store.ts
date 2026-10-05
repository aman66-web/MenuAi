import type { PhotoStore } from "./outbox";

// Report photos live in IndexedDB (localStorage is too small), keyed by outbox id, until sent.

const DB = "mm-photos";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
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

export const indexedDbPhotos: PhotoStore = {
  async put(id, blob) {
    await run("readwrite", (s) => s.put(blob, id));
  },
  async get(id) {
    return ((await run("readonly", (s) => s.get(id))) as Blob | undefined) ?? null;
  },
  async delete(id) {
    await run("readwrite", (s) => s.delete(id));
  },
};

/** Resize to ≤ 1,600 px and re-encode as JPEG at 0.7 quality (SPEC §12.1). Always < 5 MB in practice. */
export async function prepareReportPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
  if (!blob) throw new Error("Couldn't prepare that photo.");
  return blob;
}
