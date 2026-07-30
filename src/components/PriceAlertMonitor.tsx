"use client";

import { useEffect, useRef } from "react";
import {
  getPriceAlerts,
  updatePriceAlert,
  addNotification,
  type AlertLevelKey,
  type PriceAlert,
} from "@/lib/storage";

// How each level fires. "up" = price rising through it, "down" = price falling to it.
const LEVELS: {
  key: AlertLevelKey;
  dir: "up" | "down";
  label: string;
  tone: "success" | "error" | "info";
}[] = [
  { key: "target", dir: "up", label: "Target", tone: "success" },
  { key: "r2", dir: "up", label: "Resistance R2", tone: "success" },
  { key: "r1", dir: "up", label: "Resistance R1", tone: "success" },
  { key: "sl", dir: "down", label: "Stop-Loss", tone: "error" },
  { key: "s1", dir: "down", label: "Support", tone: "info" },
];

const fmt = (n: number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Background watcher for price-level alerts. Polls live quotes for every stock
 * that has an alert, and when the price reaches a level the user set, it fires
 * an in-app notification (and a browser notification if allowed). Messages are
 * factual crossings of the user's OWN levels — never buy/sell advice.
 */
export default function PriceAlertMonitor() {
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (busy.current) return;
      const alerts = getPriceAlerts().filter((a) => a.status !== "paused");
      const symbols = Array.from(new Set(alerts.map((a) => a.symbol).filter(Boolean)));
      if (!symbols.length) return;

      busy.current = true;
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols }),
        });
        const j = await res.json();
        const quotes: Record<string, any> = j.quotes || {};
        if (cancelled) return;

        for (const a of alerts) {
          const q = quotes[a.symbol];
          const price = q?.price;
          if (price == null) continue;
          const cur = q?.currency === "INR" ? "₹" : "$";
          // Only the keys that fired THIS tick — merged onto the live triggered
          // at write time so a concurrent "Re-arm" isn't clobbered.
          const firedNow: Record<string, boolean> = {};

          for (const lv of LEVELS) {
            const target = a.levels?.[lv.key];
            if (target == null || a.triggered?.[lv.key]) continue;
            const hit = lv.dir === "up" ? price >= target : price <= target;
            if (!hit) continue;

            firedNow[lv.key] = true;

            const msg = `${a.symbol} reached your ${lv.label} (${cur}${fmt(
              target,
            )}) — now ${cur}${fmt(price)}.`;
            addNotification({ type: lv.tone, message: msg, symbol: a.symbol });

            // OS notification only when the tab is backgrounded — otherwise the
            // in-app notification already covers it (no duplicate pop-up).
            try {
              if (
                typeof document !== "undefined" &&
                document.hidden &&
                typeof Notification !== "undefined" &&
                Notification.permission === "granted"
              ) {
                new Notification(`${a.symbol} · ${lv.label} reached`, {
                  body: `${cur}${fmt(target)} — now ${cur}${fmt(price)}`,
                });
              }
            } catch {
              /* browser notifications are best-effort */
            }
          }

          if (Object.keys(firedNow).length) {
            // Re-read the live alert so we merge onto its current triggered
            // (survives a re-arm that happened during the await above).
            const live = getPriceAlerts().find((x) => x.id === a.id);
            updatePriceAlert(a.id, { triggered: { ...(live?.triggered || {}), ...firedNow } });
          }
        }
      } catch {
        /* transient fetch failure — try again next tick */
      } finally {
        busy.current = false;
      }
    };

    // First check shortly after mount, then poll steadily.
    const first = setTimeout(check, 4000);
    const interval = setInterval(check, 45000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  return null;
}
