"use client";

import { useEffect, useRef } from "react";
import {
  getPriceAlerts,
  updatePriceAlert,
  addNotification,
  getSettings,
  type AlertLevelKey,
  type PriceAlert,
} from "@/lib/storage";

// Send a real email for a triggered alert (best-effort; needs the user's email
// set in Settings and RESEND_API_KEY on the server).
function emailAlert(subject: string, text: string) {
  try {
    const to = getSettings()?.alertEmail;
    if (!to) return;
    fetch("/api/alert-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text }),
    }).catch(() => {});
  } catch { /* best-effort */ }
}

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

        // Collect every trigger this cycle → ONE consolidated email at the end.
        const emailBatch: string[] = [];

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
            emailBatch.push(msg);

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

          // Custom condition alert (e.g. price > 160). Fires once, re-armable.
          if (a.condition && !a.conditionTriggered) {
            const isPct = a.condition.metric === "changePct";
            const mv = isPct ? q?.changePct : price;
            if (mv != null) {
              const { op, value } = a.condition;
              const cmp1 = (x: number, o: string, y: number) =>
                o === ">" ? x > y : o === "<" ? x < y : o === ">=" ? x >= y : o === "<=" ? x <= y : Math.abs(x - y) <= Math.abs(y) * 0.001;
              // Range support: an optional lower bound (lo loOp CMP) AND-ed with CMP op value.
              const loOk = a.condition.lo == null || cmp1(a.condition.lo, a.condition.loOp || "<", mv);
              const hit = loOk && cmp1(mv, op, value);
              if (hit) {
                const shown = isPct ? `${fmt(mv)}%` : `${cur}${fmt(mv)}`;
                const target = isPct ? `${value}%` : `${cur}${fmt(value)}`;
                const cmsg = `${a.symbol}: ${isPct ? "Day change" : "Price"} ${op} ${target} — now ${shown}.${a.name ? ` (${a.name})` : ""}`;
                addNotification({ type: "info", message: cmsg, symbol: a.symbol });
                emailBatch.push(cmsg);
                try {
                  if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
                    new Notification(`${a.symbol} · condition met`, { body: `${isPct ? "Day change" : "Price"} ${op} ${target} — now ${shown}` });
                  }
                } catch { /* best-effort */ }
                updatePriceAlert(a.id, { conditionTriggered: true });
              }
            }
          }
        }

        // One clean email for the whole cycle (not one per trigger).
        if (emailBatch.length) {
          const subject = emailBatch.length === 1
            ? emailBatch[0].split("—")[0].trim().slice(0, 100)
            : `StockAnalytix · ${emailBatch.length} price alerts triggered`;
          const text = `${emailBatch.length} alert${emailBatch.length > 1 ? "s" : ""} triggered:\n\n`
            + emailBatch.map((l, i) => `${i + 1}. ${l}`).join("\n")
            + `\n\n— StockAnalytix (research support only, not buy/sell advice)`;
          emailAlert(subject, text);
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
