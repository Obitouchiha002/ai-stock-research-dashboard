// src/lib/sync.ts
//
// Cross-device sync built on a single "sync code". Everything the app stores
// lives in localStorage (see storage.ts); this module bundles those keys, pushes
// them to a shared cloud store keyed by the code, and — on another device with
// the same code — pulls and MERGES them back.
//
// Merge, not overwrite: two devices are unioned so nothing a user entered on
// either side is ever lost (their original complaint). Deletions do not
// propagate in this simple model — a removed item on one device can reappear
// from the other; the user can remove it again. Losing data is worse than a
// stray re-appearance, so union wins.

const isBrowser = typeof window !== "undefined";

const CODE_KEY = "sa_sync_code";
const META_KEY = "sa_sync_meta"; // { lastSyncAt }
// A tiny snapshot (per list: the item keys we last synced) used as the "base"
// for a 3-way merge, so a delete on any device is honoured instead of being
// resurrected by the union. Device-local — never synced.
const SHADOW_KEY = "sa_sync_shadow";

// Device-local or ephemeral keys that should never travel between devices.
const EXCLUDE = new Set<string>([
  CODE_KEY,
  META_KEY,
  SHADOW_KEY,
  "sa_last_analysis", // large, transient cache of the last analyze result
  "sa_last_analysis_tab",
  "sa_speech_lang", // per-device input preference
  "sa_trend_states", // dedup bookkeeping for a device's own alert scans
  "sa_daily_digest", // recomputed on demand
  "sa_research_active", // which project is open on THIS device
  "sa_notifications", // per-device toast log
]);

export function normCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

export function getSyncCode(): string {
  if (!isBrowser) return "";
  return window.localStorage.getItem(CODE_KEY) || "";
}

export function setSyncCode(code: string): string {
  const c = normCode(code);
  if (isBrowser && c) window.localStorage.setItem(CODE_KEY, c);
  return c;
}

export function clearSyncCode() {
  if (!isBrowser) return;
  window.localStorage.removeItem(CODE_KEY);
  window.localStorage.removeItem(META_KEY);
}

// A friendly, hard-to-mistype code: SA-XXXX-XXXX using unambiguous characters
// (no 0/O, 1/I/L). Not a security token — just a shared handle.
export function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `SA-${pick(4)}-${pick(4)}`;
}

export function getLastSyncAt(): number {
  if (!isBrowser) return 0;
  try {
    return Number(JSON.parse(window.localStorage.getItem(META_KEY) || "{}").lastSyncAt) || 0;
  } catch {
    return 0;
  }
}
function setLastSyncAt(t: number) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify({ lastSyncAt: t }));
  } catch {}
}

// ---- bundle read/write ----------------------------------------------------

function readBundle(): Record<string, any> {
  const out: Record<string, any> = {};
  if (!isBrowser) return out;
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith("sa_") || EXCLUDE.has(k)) continue;
    const raw = window.localStorage.getItem(k);
    if (raw == null) continue;
    try {
      out[k] = JSON.parse(raw);
    } catch {
      // non-JSON value — skip; it isn't structured app data.
    }
  }
  return out;
}

function writeBundle(bundle: Record<string, any>) {
  if (!isBrowser) return;
  for (const [k, v] of Object.entries(bundle || {})) {
    if (!k.startsWith("sa_") || EXCLUDE.has(k)) continue;
    try {
      window.localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // quota — skip this key rather than aborting the whole apply.
    }
  }
}

// ---- merge ----------------------------------------------------------------

const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);

// Natural identity of a list item, so the same record from two devices collapses
// to one instead of duplicating.
function itemKey(item: any): string {
  if (item && typeof item === "object") {
    if (item.id != null) return `id:${item.id}`;
    if (item.symbol != null && item.category != null)
      return `sc:${item.symbol}|${item.category}`;
    if (item.symbol != null) return `s:${item.symbol}`;
    // NB: don't key append-only log rows (AI usage) by feature|at alone — one
    // action logs several provider rows sharing the same `at`, and collapsing
    // them by feature|at would delete all but one. Fall through to the full-row
    // key so distinct rows survive and only exact duplicates dedupe.
  }
  return `j:${JSON.stringify(item)}`;
}

// Best-effort "last touched" time from whatever timestamp a record carries.
function ts(item: any): number {
  if (!item || typeof item !== "object") return 0;
  return (
    Number(
      item.updatedAt ??
        item.savedAt ??
        item.addedAt ??
        item.createdAt ??
        item.searchedAt ??
        item.at ??
        0,
    ) || 0
  );
}

// 3-way list merge. `baseKeys` = the item keys present at the last sync. An item
// missing on one side is a genuine DELETE only if it existed at base; if it was
// never at base it's a fresh ADD on the other side and is kept. This is what
// makes deletes stick instead of being resurrected by the union.
function mergeList(baseKeys: string[], ours: any[], theirs: any[]): any[] {
  const base = new Set(baseKeys || []);
  const ourMap = new Map<string, any>();
  const theirMap = new Map<string, any>();
  for (const it of ours || []) ourMap.set(itemKey(it), it);
  for (const it of theirs || []) theirMap.set(itemKey(it), it);
  const out: any[] = [];
  for (const k of new Set([...ourMap.keys(), ...theirMap.keys()])) {
    const inO = ourMap.has(k);
    const inT = theirMap.has(k);
    if (inO && inT) {
      const a = ourMap.get(k);
      const b = theirMap.get(k);
      out.push(ts(a) >= ts(b) ? a : b); // clash → most recently touched wins
    } else if (inO) {
      if (!base.has(k)) out.push(ourMap.get(k)); // added here (else deleted there)
    } else {
      if (!base.has(k)) out.push(theirMap.get(k)); // added there (else deleted here)
    }
  }
  return out;
}

// 2-way object/scalar merge (objects rarely need delete semantics).
function mergeValue(local: any, cloud: any): any {
  if (isObj(local) && isObj(cloud)) {
    const out: Record<string, any> = { ...cloud };
    for (const k of Object.keys(local)) {
      out[k] = k in cloud ? mergeValue(local[k], cloud[k]) : local[k];
    }
    return out;
  }
  return local === undefined ? cloud : local;
}

// Merge the whole bundle against the last-synced base snapshot.
export function mergeBundle(
  shadow: Record<string, string[]>,
  localB: Record<string, any>,
  cloudB: Record<string, any>,
): Record<string, any> {
  const keys = new Set([...Object.keys(localB || {}), ...Object.keys(cloudB || {})]);
  const out: Record<string, any> = {};
  for (const k of keys) {
    if (!(k in localB)) out[k] = cloudB[k];
    else if (!(k in cloudB)) out[k] = localB[k];
    else if (Array.isArray(localB[k]) && Array.isArray(cloudB[k]))
      out[k] = mergeList(shadow?.[k] || [], localB[k], cloudB[k]);
    else out[k] = mergeValue(localB[k], cloudB[k]);
  }
  return out;
}

// The base snapshot we persist: for each list key, just the item keys (tiny).
function computeShadow(bundle: Record<string, any>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(bundle || {})) {
    if (Array.isArray(v)) out[k] = v.map(itemKey);
  }
  return out;
}
function readShadow(): Record<string, string[]> {
  if (!isBrowser) return {};
  try {
    return JSON.parse(window.localStorage.getItem(SHADOW_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function writeShadow(bundle: Record<string, any>) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(SHADOW_KEY, JSON.stringify(computeShadow(bundle)));
  } catch {}
}

// Trim the payload to fit the store's size limit, dropping the biggest keys
// first (usually imported Excel sheets or research PDFs) and reporting them.
function fitForUpload(bundle: Record<string, any>): {
  bundle: Record<string, any>;
  dropped: string[];
} {
  const LIMIT = 950_000;
  const b: Record<string, any> = { ...bundle };
  const dropped: string[] = [];
  const size = (o: any) => JSON.stringify(o).length;
  while (size(b) > LIMIT) {
    let biggest = "";
    let max = 0;
    for (const k of Object.keys(b)) {
      const s = JSON.stringify(b[k]).length;
      if (s > max) {
        max = s;
        biggest = k;
      }
    }
    if (!biggest) break;
    delete b[biggest];
    dropped.push(biggest);
  }
  return { bundle: b, dropped };
}

// ---- network --------------------------------------------------------------

async function api(action: string, code: string, extra: Record<string, any> = {}) {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, code, ...extra }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(j?.error || `sync failed (${res.status})`), {
      notConfigured: j?.notConfigured,
      status: res.status,
    });
  }
  return j;
}

export type SyncResult = {
  ok: boolean;
  dropped?: string[];
  error?: string;
  notConfigured?: boolean;
  changed?: boolean; // true when this device's stored data actually changed
};

// Order-insensitive, content-sensitive fingerprint of a bundle: object keys
// sorted, and each list sorted by item identity (so reordering is invisible but
// a changed/added/removed item shows up). Used only to detect "did anything
// actually change for this device" after a merge.
function stableFingerprint(b: Record<string, any>): string {
  const norm: Record<string, any> = {};
  for (const k of Object.keys(b || {}).sort()) {
    const v = b[k];
    if (Array.isArray(v)) {
      norm[k] = v
        .map((it) => ({ __k: itemKey(it), it }))
        .sort((a, z) => (a.__k < z.__k ? -1 : a.__k > z.__k ? 1 : 0))
        .map((x) => x.it);
    } else {
      norm[k] = v;
    }
  }
  return JSON.stringify(norm);
}

// Pull -> merge into local -> push the merged result. Safe to call repeatedly.
export async function syncNow(): Promise<SyncResult> {
  if (!isBrowser) return { ok: false };
  const code = getSyncCode();
  if (!code) return { ok: false, error: "No sync code set." };
  try {
    const pulled = await api("pull", code);
    const cloudB = pulled?.bundle || {};
    const localB = readBundle();
    const base = readShadow();
    const merged = mergeBundle(base, localB, cloudB);
    // Did the merge actually bring in anything new for THIS device? Compared with
    // an order-insensitive fingerprint (lists sorted by item identity) so a mere
    // reordering never counts as a change — otherwise an auto-refresh could loop.
    let changed = false;
    try {
      changed = stableFingerprint(localB) !== stableFingerprint(merged);
    } catch {
      changed = true; // if we can't tell, assume yes and let the UI re-read
    }
    writeBundle(merged);
    // The merged state becomes the new base for the next 3-way merge on this
    // device — so a delete made after this point is detected against it.
    writeShadow(merged);

    const { bundle: up, dropped } = fitForUpload(merged);
    await api("push", code, { bundle: up, updatedAt: Date.now() });

    setLastSyncAt(Date.now());
    // Let open pages know their localStorage changed so they can re-read/refresh.
    try {
      window.dispatchEvent(new CustomEvent("sa-synced", { detail: { changed } }));
    } catch {}
    return { ok: true, dropped: dropped.length ? dropped : undefined, changed };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), notConfigured: e?.notConfigured };
  }
}
