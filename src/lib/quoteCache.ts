import { getSupabaseAdmin } from "./supabaseAdmin";

// Durable last-known-good quote cache (Supabase `quote_cache` table).
//
// The quotes route already keeps an in-memory last-good map, but on Vercel
// serverless that map is per-instance and lost on every cold start — so a cold
// request for a symbol Yahoo is soft-failing on blanks out ("—"). This table
// survives cold starts: we read it to backfill blanks and write fresh quotes
// back so the next cold start is covered. Best-effort — every call is wrapped so
// a cache hiccup never breaks the endpoint. Service-role only (RLS on, no policy).
//
// ponytail: upserts every freshly-fetched quote per request; fine at personal
// scale. If write volume ever matters, throttle (skip unchanged / every N sec).

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // don't serve a quote older than a week

export async function loadDurableQuotes(symbols: string[]): Promise<Record<string, any>> {
  if (!symbols.length) return {};
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return {};
    const { data } = await sb.from("quote_cache").select("symbol,data,updated_at").in("symbol", symbols);
    const out: Record<string, any> = {};
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const row of data || []) {
      if (row?.updated_at && new Date(row.updated_at).getTime() < cutoff) continue;
      if (row?.data) out[row.symbol as string] = row.data;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveDurableQuotes(rows: { symbol: string; data: any }[]): Promise<void> {
  if (!rows.length) return;
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const now = new Date().toISOString();
    await sb.from("quote_cache").upsert(
      rows.map((r) => ({ symbol: r.symbol, data: r.data, updated_at: now })),
      { onConflict: "symbol" },
    );
  } catch {
    /* best effort — a failed cache write must never fail the quotes response */
  }
}
