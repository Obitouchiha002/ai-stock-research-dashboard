// briefKit — shared data + HTML for the email briefs (morning / midday / evening
// / emergency). One place so every email looks and reads the same: India and US
// separated, big (>=7%) movers called out with the news behind them, your
// holdings + watchlist bundled, and the broad market overview. Research support
// only — never buy/sell advice.

import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export const MOVE_THRESHOLD = 7; // percent — a "big move" worth flagging

// ---- region -----------------------------------------------------------------
export type Region = "in" | "us";
export function regionOf(symbol: string): Region {
  const s = String(symbol || "").toUpperCase();
  return s.endsWith(".NS") || s.endsWith(".BO") ? "in" : "us";
}

// ---- html-safe formatting ---------------------------------------------------
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
export const fmt = (n: number, d = 2) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
export const cur$ = (c?: string | null) => (c === "INR" ? "₹" : c === "USD" ? "$" : c ? `${c} ` : "");
export function pctHtml(p?: number | null, bold = true) {
  if (p == null) return `<span style="color:#94a3b8">—</span>`;
  const up = p >= 0;
  return `<span style="color:${up ? "#059669" : "#e11d48"};${bold ? "font-weight:700" : ""}">${up ? "+" : ""}${fmt(p)}%</span>`;
}

// ---- data types -------------------------------------------------------------
export type Row = { symbol: string; name: string; price: number | null; changePct: number | null; currency: string | null; region: Region };
export type NewsItem = { title: string; url: string; source: string };

// ---- quotes (batched, self-fetch the PUBLIC alias) --------------------------
// Vercel Cron invokes the protected deployment URL, so callers pass the public
// production base; a big single call loses its tail to Yahoo throttling, so we
// batch + retry + sweep.
export async function fetchQuotes(base: string, syms: string[]): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  if (!base || !syms.length) return out;
  const post = async (batch: string[]) => {
    const r = await fetch(`${base}/api/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: batch }),
      cache: "no-store",
    });
    const j = await r.json();
    return (j.quotes || {}) as Record<string, any>;
  };
  for (let i = 0; i < syms.length; i += 20) {
    const batch = syms.slice(i, i + 20);
    for (let a = 0; a < 2; a++) {
      try {
        const q = await post(batch);
        let got = 0;
        for (const [k, v] of Object.entries(q)) {
          const key = k.toUpperCase();
          if ((v as any)?.price != null || !(key in out)) out[key] = v;
          if ((v as any)?.price != null) got++;
        }
        if (got >= batch.length * 0.6) break;
      } catch { /* retry */ }
    }
  }
  const missing = syms.filter((s) => out[s]?.price == null);
  if (missing.length) {
    try {
      const q = await post(missing.slice(0, 30));
      for (const [k, v] of Object.entries(q)) if ((v as any)?.price != null) out[k.toUpperCase()] = v;
    } catch { /* best effort */ }
  }
  return out;
}

// Build Rows for a set of {symbol,name} against a quotes map.
export function rowsFrom(items: { symbol: string; name?: string }[], quotes: Record<string, any>): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const it of items) {
    const symbol = String(it.symbol || "").toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const q = quotes[symbol];
    rows.push({
      symbol,
      name: q?.name || it.name || symbol,
      price: q?.price ?? null,
      changePct: q?.changePct ?? null,
      currency: q?.currency ?? (regionOf(symbol) === "in" ? "INR" : "USD"),
      region: regionOf(symbol),
    });
  }
  return rows;
}

// ---- market overview (self-fetch public alias) ------------------------------
export async function fetchMarket(base: string, market: Region): Promise<any | null> {
  try {
    const r = await fetch(`${base}/api/market-overview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ market }),
      cache: "no-store",
    });
    const j = await r.json();
    return j?.buckets || null;
  } catch {
    return null;
  }
}

// ---- news (Yahoo search — free, no key) --------------------------------------
// One or two recent headlines per symbol, for the stocks we're calling out.
export async function fetchNews(symbols: string[], perSymbol = 2, cap = 6): Promise<Record<string, NewsItem[]>> {
  const out: Record<string, NewsItem[]> = {};
  const list = symbols.slice(0, cap);
  await Promise.all(
    list.map(async (sym) => {
      try {
        const sr: any = await yahooFinance.search(sym, { newsCount: 8 }).catch(() => null);
        const raw: any[] = sr?.news || [];
        out[sym] = raw
          .map((a) => ({ title: a.title || "", url: a.link || "#", source: a.publisher || "" }))
          .filter((a) => a.title)
          .slice(0, perSymbol);
      } catch {
        out[sym] = [];
      }
    }),
  );
  return out;
}

// ---- html building blocks ---------------------------------------------------
export function box(bg: string, border: string, inner: string): string {
  return `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:12px 14px;margin:12px 0">${inner}</div>`;
}
export function h(title: string, sub = ""): string {
  return `<div style="margin:18px 0 6px;font-weight:800;color:#0f172a;font-size:15px">${title}${sub ? ` <span style="color:#94a3b8;font-weight:500;font-size:12px">${sub}</span>` : ""}</div>`;
}
const th = (t: string, a: "left" | "right" = "left") => `<th style="padding:7px 10px;font-weight:700;text-align:${a};color:#475569">${t}</th>`;
const td = (t: string, a: "left" | "right" = "left", extra = "") => `<td style="padding:7px 10px;text-align:${a};${extra}">${t}</td>`;

function rowLine(r: Row): string {
  return `<tr style="border-top:1px solid #e2e8f0">
    ${td(`<b style="color:#0f172a">${esc(r.name).slice(0, 30)}</b> <span style="color:#94a3b8;font-size:12px">${esc(r.symbol)}</span>`)}
    ${td(r.price != null ? `${cur$(r.currency)}${fmt(r.price)}` : "—", "right", "color:#334155")}
    ${td(pctHtml(r.changePct), "right")}
  </tr>`;
}

// The IMPORTANT view of a region's holdings: only the top few gainers and the
// top few losers — never the whole list (nobody reads 140 rows). The rest is a
// one-line "+N more, X up / Y down" so the full picture stays in the app.
export function moversTable(rows: Row[], upN = 5, downN = 5): string {
  const withPct = rows.filter((r) => r.changePct != null);
  if (!withPct.length) return "";
  const sorted = [...withPct].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const up = sorted.filter((r) => (r.changePct ?? 0) > 0).slice(0, upN);
  const down = sorted.filter((r) => (r.changePct ?? 0) < 0).reverse().slice(0, downN);
  const shownKeys = new Set([...up, ...down].map((r) => r.symbol));
  const restUp = withPct.filter((r) => (r.changePct ?? 0) > 0 && !shownKeys.has(r.symbol)).length;
  const restDown = withPct.filter((r) => (r.changePct ?? 0) < 0 && !shownKeys.has(r.symbol)).length;
  const flatCount = withPct.filter((r) => r.changePct === 0).length;

  const secUp = up.length ? `<tr style="background:#f0fdf4"><td colspan="3" style="padding:5px 10px;font-size:11px;font-weight:700;color:#059669">▲ GAINERS</td></tr>${up.map(rowLine).join("")}` : "";
  const secDown = down.length ? `<tr style="background:#fef2f2"><td colspan="3" style="padding:5px 10px;font-size:11px;font-weight:700;color:#e11d48">▼ LOSERS</td></tr>${down.map(rowLine).join("")}` : "";
  const more = restUp + restDown + flatCount;
  const foot = more
    ? `<tr><td colspan="3" style="padding:6px 10px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">+ ${more} more holdings (${restUp} up · ${restDown} down${flatCount ? ` · ${flatCount} flat` : ""}) — full list in the app</td></tr>`
    : "";
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
    <thead><tr style="background:#f1f5f9">${th("Your movers")}${th("Price", "right")}${th("Day", "right")}</tr></thead>
    <tbody>${secUp}${secDown}${foot}</tbody></table>`;
}

// Combinations that matched now, if the user has saved combos.
export function combosSection(matched: { symbol: string; label: string }[]): string {
  if (!matched.length) return "";
  const rows = matched
    .slice(0, 20)
    .map((m) => `<tr style="border-top:1px solid #e2e8f0">${td(`<b>${esc(m.symbol)}</b>`)}${td(`<span style="color:#4f46e5;font-weight:600">${esc(m.label)}</span>`)}</tr>`)
    .join("");
  return `${h("🧩 Combinations matched")}<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px"><tbody>${rows}</tbody></table>`;
}

// Market-overview bucket as a tiny "Symbol · price · change%" table.
export function bucketTable(title: string, rows: any[], n = 6): string {
  const body = (rows || [])
    .slice(0, n)
    .map(
      (r) => `<tr style="border-top:1px solid #e2e8f0">
        ${td(`<b>${esc(r.symbol)}</b> <span style="color:#94a3b8;font-size:12px">${esc((r.name || "").slice(0, 22))}</span>`)}
        ${td(r.price != null ? `${cur$(r.currency)}${fmt(r.price)}` : "—", "right", "color:#334155")}
        ${td(pctHtml(r.changePct), "right")}
      </tr>`,
    )
    .join("");
  if (!body) return "";
  return `${h(title)}<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:12px"><tbody>${body}</tbody></table>`;
}

// The highlighted "big moves & why" callout: each >=7% mover with its top news.
export function moversBox(movers: Row[], news: Record<string, NewsItem[]>): string {
  if (!movers.length) return "";
  const rows = [...movers]
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
    .map((m) => {
      const n = (news[m.symbol] || [])[0];
      const flag = m.region === "in" ? "🇮🇳" : "🇺🇸";
      const link = n
        ? `<div style="font-size:12px;margin-top:2px"><a href="${esc(n.url)}" style="color:#4f46e5;text-decoration:none">📰 ${esc(n.title).slice(0, 90)}</a>${n.source ? ` <span style="color:#94a3b8">· ${esc(n.source)}</span>` : ""}</div>`
        : `<div style="font-size:12px;margin-top:2px;color:#94a3b8">No fresh headline — check the stock.</div>`;
      return `<div style="padding:8px 0;border-top:1px solid #fde68a">
        <div><span>${flag}</span> <b style="color:#0f172a">${esc(m.name).slice(0, 30)}</b> <span style="color:#94a3b8;font-size:12px">${esc(m.symbol)}</span> &nbsp; ${pctHtml(m.changePct)} ${m.price != null ? `<span style="color:#64748b;font-size:12px">· ${cur$(m.currency)}${fmt(m.price)}</span>` : ""}</div>
        ${link}
      </div>`;
    })
    .join("");
  return box(
    "#fffbeb",
    "#fcd34d",
    `<div style="font-weight:800;color:#b45309;font-size:14px">⚡ Big moves today (≥${MOVE_THRESHOLD}%) — and the news behind them</div>${rows}`,
  );
}

// A short list of important headlines across the movers.
export function newsList(symbols: string[], news: Record<string, NewsItem[]>): string {
  const items: string[] = [];
  for (const s of symbols) {
    for (const n of news[s] || []) {
      items.push(
        `<li style="margin:4px 0"><a href="${esc(n.url)}" style="color:#4f46e5;text-decoration:none">${esc(n.title).slice(0, 100)}</a> <span style="color:#94a3b8;font-size:12px">${esc(n.source)} · ${esc(s)}</span></li>`,
      );
    }
  }
  if (!items.length) return "";
  return `${h("📰 Important headlines")}<ul style="margin:6px 0;padding-left:18px;font-size:13px;color:#334155">${items.slice(0, 10).join("")}</ul>`;
}

// ---- slot config ------------------------------------------------------------
export type Slot = "morning" | "midday" | "evening" | "emergency";
export const SLOT_META: Record<Slot, { emoji: string; name: string; sub: string; market: boolean; combos: boolean }> = {
  morning: { emoji: "☀️", name: "Morning Brief", sub: "Before the open — overnight movers & market setup", market: true, combos: false },
  midday: { emoji: "🕛", name: "Midday Brief", sub: "Your movers, combos & news so far", market: false, combos: true },
  evening: { emoji: "🌆", name: "Evening Brief", sub: "Full-day wrap — market, your movers & combos", market: true, combos: true },
  emergency: { emoji: "🚨", name: "Emergency Alert", sub: "A holding just moved sharply", market: false, combos: false },
};

export type BriefData = {
  india: Row[];
  us: Row[];
  movers: Row[];
  news: Record<string, NewsItem[]>;
  marketIN: any | null;
  marketUS: any | null;
  combos: { symbol: string; label: string }[];
};

const wrap = (inner: string) =>
  `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:660px;margin:auto;padding:6px 4px;color:#0f172a">${inner}</div>`;

function regionSection(flag: string, label: string, holdings: Row[], market: any | null, showMarket: boolean): string {
  if (!holdings.length && !(showMarket && market)) return "";
  const mkt = showMarket && market
    ? bucketTable("🚀 Market — top gainers", market.gainers, 5) + bucketTable("🔻 Market — top losers", market.losers, 5)
    : "";
  const hold = holdings.length ? moversTable(holdings) : "";
  return `<div style="margin-top:16px"><div style="font-size:16px;font-weight:800;color:#4f46e5">${flag} ${label}</div>${hold}${mkt}</div>`;
}

export function buildBrief(slot: Slot, data: BriefData, dateStr: string): { subject: string; html: string } {
  const meta = SLOT_META[slot];
  const showMarket = meta.market;
  const moverSyms = data.movers.map((m) => m.symbol);

  const header = `<div style="display:flex;align-items:baseline;gap:10px">
    <h2 style="color:#4f46e5;margin:0">${meta.emoji} ${meta.name}</h2>
    <span style="color:#94a3b8;font-size:12px">${esc(meta.sub)} · ${esc(dateStr)}</span>
  </div>`;

  // One-line at-a-glance: how the book is leaning + how many big moves.
  const all = [...data.india, ...data.us].filter((r) => r.changePct != null);
  const upN = all.filter((r) => (r.changePct ?? 0) > 0).length;
  const downN = all.filter((r) => (r.changePct ?? 0) < 0).length;
  const counts = `<p style="color:#64748b;font-size:12px;margin:4px 0 0">🇮🇳 ${data.india.length} · 🇺🇸 ${data.us.length} tracked · <b style="color:#059669">${upN} up</b> / <b style="color:#e11d48">${downN} down</b>${data.movers.length ? ` · <b style="color:#b45309">${data.movers.length} big (≥${MOVE_THRESHOLD}%)</b>` : ""}. Only what matters — full detail in the app.</p>`;

  const parts = [
    header,
    counts,
    moversBox(data.movers, data.news),
    regionSection("🇮🇳", "India (NSE / BSE)", data.india, data.marketIN, showMarket),
    regionSection("🇺🇸", "United States", data.us, data.marketUS, showMarket),
    meta.combos ? combosSection(data.combos) : "",
    newsList(moverSyms, data.news),
    `<p style="color:#94a3b8;font-size:11px;margin-top:18px;line-height:1.5">Prices &amp; day-change are live. Research support only — not buy/sell advice. A ≥${MOVE_THRESHOLD}% move often signals fresh news; headlines are auto-pulled, verify independently.</p>`,
  ].filter(Boolean);

  const moverTag = data.movers.length ? ` · ${data.movers.length} big move${data.movers.length > 1 ? "s" : ""}` : "";
  return {
    subject: `${meta.emoji} ${meta.name} — StockAnalytix · ${dateStr}${moverTag}`,
    html: wrap(parts.join("")),
  };
}

// Emergency email: focused on the stocks that just crossed the threshold.
export function buildEmergency(movers: Row[], news: Record<string, NewsItem[]>, dateStr: string): { subject: string; html: string } {
  const meta = SLOT_META.emergency;
  const inner = [
    `<div style="display:flex;align-items:baseline;gap:10px"><h2 style="color:#e11d48;margin:0">${meta.emoji} ${meta.name}</h2><span style="color:#94a3b8;font-size:12px">${esc(dateStr)}</span></div>`,
    `<p style="color:#64748b;font-size:12px;margin:4px 0 0">A stock you hold or watch just moved ≥${MOVE_THRESHOLD}%.</p>`,
    moversBox(movers, news),
    newsList(movers.map((m) => m.symbol), news),
    `<p style="color:#94a3b8;font-size:11px;margin-top:16px;line-height:1.5">Auto-triggered on a sharp move. Research support only — not buy/sell advice. Verify independently.</p>`,
  ].filter(Boolean);
  const names = movers.slice(0, 3).map((m) => `${m.symbol} ${m.changePct != null && m.changePct >= 0 ? "+" : ""}${m.changePct != null ? fmt(m.changePct) : "?"}%`).join(", ");
  return { subject: `🚨 Emergency — ${names}${movers.length > 3 ? ` +${movers.length - 3} more` : ""} · ${dateStr}`, html: wrap(inner.join("")) };
}
