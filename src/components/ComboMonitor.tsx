"use client";

import { useEffect, useRef } from "react";
import {
  getCombinations, getWatchlist, getPortfolio, addNotification, getSettings, getMarketPlans,
  type Combination,
} from "@/lib/storage";
import { evalConditions } from "@/lib/comboEval";

// Send a real email when a combination matches (best-effort; needs the user's
// email set in Settings and RESEND_API_KEY on the server).
function emailCombo(subject: string, text: string) {
  try {
    const to = getSettings()?.alertEmail;
    if (!to) return;
    fetch("/api/alert-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text }),
    }).catch(() => {});
  } catch { /* best-effort */ }
}

// Background watcher: periodically scans the user's watchlist + portfolio against
// every SAVED combination. When a stock newly matches a combination it drops a
// notification — so a setup never gets missed, even while the user is elsewhere.
//
// One /api/screen call returns the raw metrics per symbol; every saved combo is
// then evaluated against those metrics client-side (no re-fetching per combo).

const SEEN_KEY = "sa_combo_seen";
const ATTACH_SEEN_KEY = "sa_combo_attach_seen";

function getSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); }
}
function putSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(s))); } catch {}
}
const getSeen = () => getSet(SEEN_KEY);
const setSeen = (s: Set<string>) => putSet(SEEN_KEY, s);

export default function ComboMonitor() {
  const busy = useRef(false);
  const lastRun = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (busy.current) return;
      lastRun.current = Date.now();
      const combos: Combination[] = getCombinations();
      const comboById = new Map(combos.map((c) => [c.id, c]));

      // Combinations the user explicitly attached to a Watchlist row or a Markets
      // row (comboId). These get a targeted message and pull their symbol into the
      // scan even if it's not otherwise in the watchlist/portfolio (e.g. an index).
      const attach: { symbol: string; comboId: string }[] = [];
      getWatchlist().forEach((w: any) => { if (w?.comboId) attach.push({ symbol: String(w.symbol || "").toUpperCase(), comboId: w.comboId }); });
      const plans = getMarketPlans();
      Object.entries(plans).forEach(([sym, p]: any) => { if (p?.comboId) attach.push({ symbol: String(sym).toUpperCase(), comboId: p.comboId }); });
      const liveAttach = attach.filter((a) => a.symbol && comboById.has(a.comboId));

      if (!combos.length && !liveAttach.length) return;

      const symbols = Array.from(new Set([
        ...getWatchlist().map((w: any) => String(w.symbol || "").toUpperCase()),
        ...getPortfolio().map((h: any) => String(h.symbol || "").toUpperCase()),
        ...liveAttach.map((a) => a.symbol),
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

        const rowBySym = new Map(rows.map((r) => [String(r.symbol).toUpperCase(), r]));
        const notify = (title: string, msg: string, symbol: string, name: string, tone: "info" | "success") => {
          addNotification({ type: tone, message: msg, symbol });
          try {
            if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(title, { body: name || symbol });
            }
          } catch { /* browser notifications are best-effort */ }
        };

        // (1) Explicit attachments — a targeted message, evaluated first so the
        // global scan can skip these pairs (no double-notify).
        const attachedPairs = new Set(liveAttach.map((a) => `${a.comboId}:${a.symbol}`));
        const prevA = getSet(ATTACH_SEEN_KEY);
        const nowA = new Set<string>();
        const freshA: { symbol: string; name: string; combo: Combination }[] = [];
        for (const a of liveAttach) {
          const combo = comboById.get(a.comboId);
          const r = rowBySym.get(a.symbol);
          if (!combo || !r) continue;
          if (!evalConditions(r, combo.conditions || {}).match) continue;
          const key = `${a.comboId}:${a.symbol}`;
          nowA.add(key);
          if (!prevA.has(key)) freshA.push({ symbol: a.symbol, name: r.name, combo });
        }
        freshA.slice(0, 8).forEach((m) => {
          const nm = m.combo.label || m.combo.name;
          notify(`🎯 ${m.symbol} matched your combo "${nm}"`, `${m.symbol} matched the "${nm}" combination you attached to it.`, m.symbol, m.name, "success");
        });
        putSet(ATTACH_SEEN_KEY, nowA);

        // (2) Global background scan — every saved combo vs watchlist/portfolio,
        // skipping any pair already covered by an explicit attachment above.
        const prev = getSeen();
        const nowMatching = new Set<string>();
        const fresh: { symbol: string; name: string; combo: Combination }[] = [];
        for (const combo of combos) {
          for (const r of rows) {
            const key = `${combo.id}:${String(r.symbol).toUpperCase()}`;
            if (attachedPairs.has(key)) continue; // handled by the targeted path
            if (!evalConditions(r, combo.conditions || {}).match) continue;
            nowMatching.add(key);
            if (!prev.has(key)) fresh.push({ symbol: r.symbol, name: r.name, combo });
          }
        }
        fresh.slice(0, 8).forEach((m) => {
          const nm = m.combo.label || m.combo.name;
          notify(`${m.symbol} matches "${nm}"`, `${m.symbol} now matches your "${nm}" combination.`, m.symbol, m.name, "info");
        });
        setSeen(nowMatching); // a stock that stops matching can alert again later

        // One consolidated email for all combo matches this scan (not one each).
        const emailLines = [
          ...freshA.slice(0, 8).map((m) => `🎯 ${m.symbol} matched your attached combo "${m.combo.label || m.combo.name}"`),
          ...fresh.slice(0, 8).map((m) => `${m.symbol} now matches "${m.combo.label || m.combo.name}"`),
        ];
        if (emailLines.length) {
          const subject = emailLines.length === 1 ? emailLines[0].slice(0, 100) : `StockAnalytix · ${emailLines.length} combinations matched`;
          const text = `${emailLines.length} combination match${emailLines.length > 1 ? "es" : ""}:\n\n`
            + emailLines.map((l, i) => `${i + 1}. ${l}`).join("\n")
            + `\n\n— StockAnalytix (research support only, not buy/sell advice)`;
          emailCombo(subject, text);
        }
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
