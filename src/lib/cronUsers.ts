import { getSupabaseAdmin } from "./supabaseAdmin";

// Gather every user the scheduled emails should consider, from BOTH sources so
// nobody is missed during (and after) the migration to accounts:
//   1. Supabase user_data rows  — logged-in accounts (the new, permanent home)
//   2. Upstash sync:index       — legacy sync-code devices
// Deduped by recipient email (Supabase wins), so the same person is emailed once.

const STORE_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const STORE_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

async function redis(command: (string | number)[]): Promise<any> {
  const res = await fetch(STORE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${STORE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store ${res.status}`);
  return res.json();
}

export type CronUser = { email: string; bundle: any };

export async function getAllCronUsers(): Promise<CronUser[]> {
  const byEmail = new Map<string, any>();

  // 1) Supabase accounts.
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      // Map auth user-id -> email, so we can fall back to the login email when a
      // user hasn't set a separate alert email.
      const authEmails: Record<string, string> = {};
      try {
        const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        for (const u of list?.users || []) if (u.id && u.email) authEmails[u.id] = u.email.toLowerCase();
      } catch { /* listing optional */ }

      const { data } = await sb.from("user_data").select("user_id, bundle");
      for (const row of data || []) {
        const bundle = (row as any).bundle || {};
        const email = String(bundle?.sa_settings?.alertEmail || authEmails[(row as any).user_id] || "")
          .trim()
          .toLowerCase();
        if (email && !byEmail.has(email)) byEmail.set(email, bundle);
      }
    } catch { /* Supabase optional — fall through to legacy */ }
  }

  // 2) Legacy Upstash sync-code bundles.
  if (STORE_URL && STORE_TOKEN) {
    try {
      const codesRes = await redis(["SMEMBERS", "sync:index"]);
      const codes: string[] = Array.isArray(codesRes?.result) ? codesRes.result : [];
      for (const code of codes) {
        try {
          const bRes = await redis(["GET", `sync:${code}`]);
          const raw = bRes?.result;
          if (!raw) continue;
          const bundle = (typeof raw === "string" ? JSON.parse(raw) : raw)?.bundle || {};
          const email = String(bundle?.sa_settings?.alertEmail || "").trim().toLowerCase();
          if (email && !byEmail.has(email)) byEmail.set(email, bundle);
        } catch { /* skip one bad bundle */ }
      }
    } catch { /* legacy optional */ }
  }

  return Array.from(byEmail.entries()).map(([email, bundle]) => ({ email, bundle }));
}
