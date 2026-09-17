"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase";
import { supabaseSyncNow } from "@/lib/supabaseSync";

// Silent auto-sync for logged-in users, backed by Supabase. Mirrors the old
// SyncManager but keyed to the account instead of a sync code: on load, on a
// steady interval, on tab focus / reconnect, and whenever another logged-in tab
// changes the data. When a sync brings genuinely new data, the page refreshes
// (guarded) so it shows live — no manual action ever needed.
export default function SupabaseSyncManager() {
  const busy = useRef(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    let loggedIn = false;

    const run = async () => {
      if (busy.current || !loggedIn) return;
      busy.current = true;
      try {
        const r = await supabaseSyncNow();
        if (r.ok && r.changed) maybeRefresh();
      } finally {
        if (!cancelled) busy.current = false;
      }
    };

    const maybeRefresh = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"],[aria-modal="true"]')) return;
      try {
        const now = Date.now();
        const last = Number(window.sessionStorage.getItem("sa_last_autoreload") || 0);
        if (now - last < 45_000) return;
        window.sessionStorage.setItem("sa_last_autoreload", String(now));
      } catch { /* still refresh */ }
      window.location.reload();
    };

    // Track auth state; sync right after login.
    sb.auth.getSession().then(({ data }) => { loggedIn = Boolean(data.session); if (loggedIn) run(); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      loggedIn = Boolean(session);
      if (loggedIn) run();
    });

    const first = setTimeout(run, 2000);
    const interval = setInterval(run, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    const onOnline = () => run();
    let stTimer: ReturnType<typeof setTimeout> | null = null;
    const onStorage = (e: StorageEvent) => {
      if (e.key && !e.key.startsWith("sa_")) return;
      if (stTimer) clearTimeout(stTimer);
      stTimer = setTimeout(run, 1500);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
      if (stTimer) clearTimeout(stTimer);
      sub?.subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
