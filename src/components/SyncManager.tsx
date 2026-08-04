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
      } finally {
        if (!cancelled) busy.current = false;
      }
    };

    // First sync shortly after mount, then every 30s.
    const first = setTimeout(run, 2500);
    const interval = setInterval(run, 30_000);

    // Coming back to the tab is the moment another device's changes are most
    // likely waiting — sync immediately.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
