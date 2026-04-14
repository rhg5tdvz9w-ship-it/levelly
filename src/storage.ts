import type { DNAEntry, FrameExtraction } from "./types";

// ─── IndexedDB frame cache ─────────────────────────────────────────────────────
// localStorage has a 5MB quota — base64 frames overflow it silently.
// IndexedDB has no meaningful size limit and persists across refreshes.
export const IDB_NAME = "levelly-frames", IDB_STORE = "frames", IDB_VERSION = 1;
export function openFrameDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE, { keyPath: "id" });
    req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
    req.onerror = () => rej(req.error);
  });
}
export async function saveFramesToIDB(lib: DNAEntry[]): Promise<void> {
  try {
    const db = await openFrameDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    lib.forEach(e => {
      const frames = e.auto_frames?.filter((f: FrameExtraction) => f.image_data);
      if (frames && frames.length > 0) store.put({ id: e.id, frames });
    });
  } catch {}
}
export async function mergeFramesFromIDB(entries: DNAEntry[]): Promise<DNAEntry[]> {
  try {
    const db = await openFrameDB();
    return new Promise((res) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const st = tx.objectStore(IDB_STORE);
      const out: DNAEntry[] = [];
      let pending = entries.length;
      if (!pending) { res(entries); return; }
      entries.forEach(e => {
        const req = st.get(e.id);
        req.onsuccess = () => {
          const cached = req.result?.frames as FrameExtraction[] | undefined;
          if (cached?.length) {
            const imgMap = new Map(cached.map((f: FrameExtraction) => [f.timestamp_seconds, f.image_data]));
            out.push({ ...e, auto_frames: (e.auto_frames || []).map(f => ({ ...f, image_data: imgMap.get(f.timestamp_seconds) ?? f.image_data })) });
          } else out.push(e);
          if (--pending === 0) res(out);
        };
        req.onerror = () => { out.push(e); if (--pending === 0) res(out); };
      });
    });
  } catch { return entries; }
}

