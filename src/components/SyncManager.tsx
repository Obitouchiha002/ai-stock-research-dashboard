"use client";

import { useEffect, useRef } from "react";
import { getSyncCode, syncNow } from "@/lib/sync";
import { addNotification } from "@/lib/storage";

const DROP_LABELS: Record<string, string> = {
  sa_excel_sheets: "imported Excel sheets",
  sa_research_projects: "research projects",
  sa_notes: "notes (voice notes are large)",
  sa_prompts: "prompt library",
};

// Silent background sync. If the user has linked a sync code, this keeps their
// devices in step: once on load, on a slow interval, and whenever they return
// to the tab. It never blocks the UI and swallows failures (offline, store
// down) — the next tick just tries again.
export default function SyncManager() {
  const busy = useRef(false);
  const warnedDrop = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (busy.current || !getSyncCode()) return;
      busy.current = true;
      try {
        const r = await syncNow();
        // If the bundle was too big and a key was shed from the cloud, tell the
        // user once — otherwise a background sync silently skips it forever.
        if (r.ok && r.dropped?.length && !warnedDrop.current) {
          warnedDrop.current = true;
          const names = r.dropped.map((k) => DROP_LABELS[k] || k).join(", ");
          addNotification({
            type: "info",
            message: `Cloud sync skipped some large data (${names}) — it stays on this device. Other data syncs normally.`,
          });
        }
        // Another device changed the shared data: refresh so the new data shows
        // live, without any manual "sync" tap. Guarded so it never interrupts.
        if (r.ok && r.changed) maybeRefresh();
      } finally {
        if (!cancelled) busy.current = false;
      }
    };

    // Reload only when it's safe: tab is visible, the user isn't typing, no
    // dialog is open, and not more than once per 45s (belt-and-suspenders so a
    // refresh can never loop). This shows freshly-synced data with no action.
    const maybeRefresh = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"],[aria-modal="true"]')) return;
      try {
        const now = Date.now();
        const last = Number(window.sessionStorage.getItem("sa_last_autoreload") || 0);
        if (now - last < 45_000) return;
        window.sessionStorage.setItem("sa_last_autoreload", String(now));
      } catch { /* sessionStorage blocked — still refresh */ }
      window.location.reload();
    };

    // First sync shortly after mount, then on a steady interval so devices stay
    // in step without any manual action — link the code once and forget it.
    const first = setTimeout(run, 2000);
    const interval = setInterval(run, 20_000);

    // Coming back to the tab is the moment another device's changes are most
    // likely waiting — sync immediately.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    // Reconnecting after being offline: push/pull whatever changed meanwhile.
    const onOnline = () => run();
    // Another tab on THIS device changed the shared data — pull it in soon.
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
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
