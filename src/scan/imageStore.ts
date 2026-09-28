/*
 * Temporary on-device storage for menu photos (IndexedDB).
 * - explicit capture only; local by default
 * - short TTL (30 min) and purged on app start; "Delete scan" removes it immediately
 * - never included in research exports, never uploaded except the one extraction
 *   request the user explicitly consents to
 * Falls back to an in-memory map when IndexedDB is unavailable (private mode etc.).
 */

export type ScanStatus = "captured" | "analyzing" | "extracted" | "failed";

export interface ScanRecord {
  scanSessionId: string;
  restaurantId?: string;
  imageBlob: Blob;
  createdAt: number;
  expiresAt: number;
  status: ScanStatus;
}

export const SCAN_TTL_MS = 30 * 60 * 1000;
const DB = "macrotable-scans";
const STORE = "scans";
const memory = new Map<string, ScanRecord>();

export const isExpired = (r: Pick<ScanRecord, "expiresAt">, now = Date.now()) => now >= r.expiresAt;

export function newScanRecord(imageBlob: Blob, restaurantId?: string, now = Date.now()): ScanRecord {
  return {
    scanSessionId: `scan-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    restaurantId,
    imageBlob,
    createdAt: now,
    expiresAt: now + SCAN_TTL_MS,
    status: "captured",
  };
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "scanSessionId" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
      t.oncomplete = () => db.close();
    } catch {
      resolve(undefined);
    }
  });
}

export async function saveScan(rec: ScanRecord): Promise<void> {
  memory.set(rec.scanSessionId, rec);
  await tx("readwrite", (s) => s.put(rec));
}

export async function getScan(id: string): Promise<ScanRecord | undefined> {
  const r = (await tx<ScanRecord>("readonly", (s) => s.get(id))) ?? memory.get(id);
  if (r && isExpired(r)) {
    await deleteScan(id);
    return undefined;
  }
  return r;
}

export async function updateScanStatus(id: string, status: ScanStatus): Promise<void> {
  const r = await getScan(id);
  if (r) await saveScan({ ...r, status });
}

export async function deleteScan(id: string): Promise<void> {
  memory.delete(id);
  await tx("readwrite", (s) => s.delete(id));
}

export async function listScans(): Promise<ScanRecord[]> {
  const all = (await tx<ScanRecord[]>("readonly", (s) => s.getAll())) ?? [...memory.values()];
  return all.filter((r) => !isExpired(r)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Remove expired scans (called on app start). */
export async function purgeExpiredScans(now = Date.now()): Promise<number> {
  const all = (await tx<ScanRecord[]>("readonly", (s) => s.getAll())) ?? [...memory.values()];
  const expired = all.filter((r) => isExpired(r, now));
  for (const r of expired) await deleteScan(r.scanSessionId);
  return expired.length;
}

export async function deleteAllScans(): Promise<void> {
  memory.clear();
  await tx("readwrite", (s) => s.clear());
}
