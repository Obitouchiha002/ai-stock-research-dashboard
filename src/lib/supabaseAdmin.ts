import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service_role key. It bypasses Row-Level
// Security, so it MUST never be imported into client code — only cron/API routes
// that run on the server. Used to read every user's data bundle when building the
// scheduled email briefs.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!URL || !SERVICE_ROLE) return null;
  if (!_admin) {
    _admin = createClient(URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export const supabaseAdminConfigured = () => Boolean(URL && SERVICE_ROLE);
