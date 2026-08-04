"use client";

import { useEffect, useRef } from "react";
import {
  getCombinations, getWatchlist, getPortfolio, addNotification,
  type Combination,
} from "@/lib/storage";
import { evalConditions } from "@/lib/comboEval";

// Background watcher: periodically scans the user's watchlist + portfolio against
// every SAVED combination. When a stock newly matches a combination it drops a
// notification — so a setup never gets missed, even while the user is elsewhere.
//
// One /api/screen call returns the raw metrics per symbol; every saved combo is
// then evaluated against those metrics client-side (no re-fetching per combo).

const SEEN_KEY = "sa_combo_seen";

function getSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function setSeen(s: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(s))); } catch {}
}

export default function ComboMonitor() {
  const busy = useRef(false);
  const lastRun = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (busy.current) return;
      lastRun.current = Date.now();
      const combos: Combination[] = getCombinations();
      if (!combos.length) return;
      const symbols = Array.from(new Set([
        ...getWatchlist().map((w: any) => String(w.symbol || "").toUpperCase()),
        ...getPortfolio().map((h: any) => String(h.symbol || "").toUpperCase()),
      ].filter(Boolean)));
      if (!symbols.length) return;

      busy.current = true;
      try {
        // Conditions only trigger the (optional) heavy fetches — earnings and
        // full-history ATH/ATL — for whichever saved combos need them. We then
        // evaluate every combo ourselves from the returned raw metrics.
        const trigger = {
          earningsUp: combos.some((c) => c.conditions?.earningsUp),
          atAth: combos.some((c) => c.conditions?.atAth),
          atAtl: combos.some((c) => c.conditions?.atAtl),
        };
        const res = await fetch("/api/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols, conditions: trigger }),
        });
        const j = await res.json();
        if (cancelled || !res.ok) return;
        const rows: any[] = (j.results || []).filter((r: any) => r.ok);

        const prev = getSeen();
        const nowMatching = new Set<string>();
        const fresh: { symbol: string; name: string; combo: Combination }[] = [];
        for (const combo of combos) {
          for (const r of rows) {
            if (!evalConditions(r, combo.conditions || {}).match) continue;
            const key = `${combo.id}:${r.symbol}`;
            nowMatching.add(key);
            if (!prev.has(key)) fresh.push({ symbol: r.symbol, name: r.name, combo });
          }
        }
        // Notify newly-matched (cap the burst so we never flood the bell).
        fresh.slice(0, 8).forEach((m) => {
          addNotification({
            type: "info",
            message: `${m.symbol} now matches your "${m.combo.label || m.combo.name}" combination.`,
          });
        });
        setSeen(nowMatching); // a stock that stops matching can alert again later
      } catch {
        /* transient — next tick retries */
      } finally {
        if (!cancelled) busy.current = false;
      }
    };

    const first = setTimeout(run, 6000);          // shortly after load
    const interval = setInterval(run, 30 * 60_000); // then every 30 min
    // On return to the tab, catch up — but at most once every 10 min.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun.current > 10 * 60_000) run();
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
