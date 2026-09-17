"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Single browser Supabase client — real login (Auth) + a central database that
// keeps every device in sync. The anon key is a public client key; Row-Level
// Security on the server ensures each user only ever reads/writes their own data.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!URL || !ANON) return null;
  if (!_client) {
    _client = createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return _client;
}

export const supabaseConfigured = () => Boolean(URL && ANON);
