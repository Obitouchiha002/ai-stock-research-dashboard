// Local store for the user's own HTML stock reports. HTML files can be large
// and there can be many, so this uses IndexedDB (hundreds of MB) rather than
// localStorage (~5 MB). Metadata and content live in separate object stores so
// the list loads fast without pulling every file's HTML into memory.

const DB_NAME = "sa_html_reports";
const DB_VERSION = 1;

export type ReportMeta = {
  id: string;
  name: string;
  symbol?: string;
  details?: string; // user notes
  tags?: string[]; // user labels
  size: number; // bytes of HTML
  addedAt: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      if (!db.objectStoreNames.contains("content")) db.createObjectStore("content", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addHtmlReport(meta: ReportMeta, html: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["meta", "content"], "readwrite");
    tx.objectStore("meta").put(meta);
    tx.objectStore("content").put({ id: meta.id, html });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listHtmlReports(): Promise<ReportMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("meta").objectStore("meta").getAll();
    req.onsuccess = () => resolve(((req.result as ReportMeta[]) || []).sort((a, b) => b.addedAt - a.addedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function getHtmlReport(id: string): Promise<string> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("content").objectStore("content").get(id);
    req.onsuccess = () => resolve((req.result as any)?.html || "");
    req.onerror = () => reject(req.error);
  });
}

export async function updateHtmlReportMeta(id: string, patch: Partial<ReportMeta>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction("meta", "readwrite").objectStore("meta");
    const get = store.get(id);
    get.onsuccess = () => {
      const cur = get.result as ReportMeta | undefined;
      if (!cur) return resolve();
      store.put({ ...cur, ...patch });
    };
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

export async function deleteHtmlReport(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["meta", "content"], "readwrite");
    tx.objectStore("meta").delete(id);
    tx.objectStore("content").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
