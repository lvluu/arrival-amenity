// Remembers the last few opened reports on this device; the home screen lists them and the user picks one.
// IndexedDB, not localStorage: a report PDF is binary and can pass localStorage's ~5 MB limit.
// A report is keyed by the SHA-256 of its bytes, so opening the same PDF again is the same entry (it only moves to the top).
const DB = "arrival-fruit";
const STORE = "reports";
const LEGACY_KEY = "last"; // older builds kept one report under this key
export const KEEP = 10;

export interface SavedReport {
  id: string;
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

export async function reportId(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function valid(r: unknown): r is Omit<SavedReport, "id"> & { id?: string } {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return typeof o.name === "string" && o.bytes instanceof Uint8Array && typeof o.savedAt === "number";
}

export async function saveReport(name: string, bytes: Uint8Array): Promise<SavedReport> {
  const id = await reportId(bytes);
  const saved = { id, name, bytes, savedAt: Date.now() };
  await run("readwrite", (s) => s.put(saved, id));
  const all = await listReports();
  for (const old of all.slice(KEEP)) await deleteReport(old.id);
  return saved;
}

// Newest first. Adopts a report an older build saved under "last".
export async function listReports(): Promise<SavedReport[]> {
  const legacy: unknown = await run("readonly", (s) => s.get(LEGACY_KEY));
  if (valid(legacy)) {
    await saveReportAt(legacy.name, legacy.bytes, legacy.savedAt);
    await deleteReport(LEGACY_KEY);
  }
  const [keys, values] = await Promise.all([
    run("readonly", (s) => s.getAllKeys()),
    run("readonly", (s) => s.getAll()),
  ]);
  return values
    .flatMap((v, i) => (valid(v) ? [{ ...v, id: String(keys[i]) }] : []))
    .sort((a, b) => b.savedAt - a.savedAt);
}

async function saveReportAt(name: string, bytes: Uint8Array, savedAt: number) {
  const id = await reportId(bytes);
  await run("readwrite", (s) => s.put({ id, name, bytes, savedAt }, id));
}

export const deleteReport = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);
export const clearReports = () => run("readwrite", (s) => s.clear()).then(() => undefined);
