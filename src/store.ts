// Remembers the last opened report on this device so the app reopens it at start.
// IndexedDB, not localStorage: a report PDF is binary and can pass localStorage's ~5 MB limit.
const DB = "arrival-fruit";
const STORE = "reports";
const KEY = "last";

export interface SavedReport {
  name: string;
  bytes: Uint8Array;
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveReport = (r: SavedReport) => run("readwrite", (s) => s.put(r, KEY)).then(() => undefined);
export const clearReport = () => run("readwrite", (s) => s.delete(KEY));

export async function loadReport(): Promise<SavedReport | null> {
  const r: unknown = await run("readonly", (s) => s.get(KEY));
  if (typeof r !== "object" || r === null) return null;
  const { name, bytes, savedAt } = r as Partial<SavedReport>;
  return typeof name === "string" && bytes instanceof Uint8Array && typeof savedAt === "number"
    ? { name, bytes, savedAt }
    : null;
}
