"use client";

import { getSupabase } from "./supabase";
import { readBundle, writeBundle, readShadow, writeShadow, mergeBundle, stableFingerprint } from "./sync";

// Supabase-backed sync — the permanent replacement for the sync-code system.
// When the user is logged in, their whole data bundle lives in one row of the
// `user_data` table (keyed by their auth id). Every device reads/writes that same
// row, so data is always the same everywhere. Merge (not overwrite) is reused
// from sync.ts, so nothing already saved is lost on the first upload or ever.

const TABLE = "user_data";

export async function isLoggedIn(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  return Boolean(data.session);
}

export type SbSyncResult = { ok: boolean; changed?: boolean; error?: string };

// Pull the user's row → merge into local → push the merged bundle back.
export async function supabaseSyncNow(): Promise<SbSyncResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase not configured" };
  const { data: auth } = await sb.auth.getUser();
  const user = auth?.user;
  if (!user) return { ok: false, error: "Not logged in" };

  try {
    const { data: row, error: selErr } = await sb
      .from(TABLE)
      .select("bundle")
      .eq("user_id", user.id)
      .maybeSingle();
    if (selErr) return { ok: false, error: selErr.message };

    const cloudB = (row?.bundle as Record<string, any>) || {};
    const localB = readBundle();
    const base = readShadow();
    const merged = mergeBundle(base, localB, cloudB);

    let changed = false;
    try {
      changed = stableFingerprint(localB) !== stableFingerprint(merged);
    } catch {
      changed = true;
    }

    writeBundle(merged);
    writeShadow(merged);

    const { error: upErr } = await sb
      .from(TABLE)
      .upsert({ user_id: user.id, bundle: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (upErr) return { ok: false, error: upErr.message };

    try {
      window.dispatchEvent(new CustomEvent("sa-synced", { detail: { changed } }));
    } catch { /* no-op */ }
    return { ok: true, changed };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
