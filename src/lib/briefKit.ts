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

// Per-region portfolio totals, computed from holdings' shares × live price.
export type RegionTotal = { val: number; cost: number; dayPL: number };
export type PortfolioSummary = { in: RegionTotal; us: RegionTotal };

// Σ shares × live price per region, plus today's gain and cost basis.
export function portfolioSummary(
  holdings: { symbol: string; shares: number; buyPrice?: number }[],
  quotes: Record<string, any>,
): PortfolioSummary {
  const acc: PortfolioSummary = { in: { val: 0, cost: 0, dayPL: 0 }, us: { val: 0, cost: 0, dayPL: 0 } };
  for (const h of holdings) {
    const sym = String(h.symbol || "").toUpperCase();
    const q = quotes[sym];
    const shares = Number(h.shares) || 0;
    if (!q || q.price == null || !shares) continue;
    const r = acc[regionOf(sym)];
    const val = shares * q.price;
    const pct = q.changePct ?? 0;
    r.val += val;
    r.cost += shares * (Number(h.buyPrice) || 0);
    r.dayPL += val - val / (1 + pct / 100); // today's gain = value − yesterday's value
  }
  return acc;
}

// One-line sector strip for the email: the day's strongest & weakest sector per
// region. Symbols are app tickers (the quotes route resolves their live move).
export type SectorMove = { name: string; pct: number };
export type SectorBrief = { in?: { top?: SectorMove; bot?: SectorMove }; us?: { top?: SectorMove; bot?: SectorMove } };
export const SECTOR_SYMBOLS: { region: "in" | "us"; name: string; symbol: string }[] = [
  { region: "in", name: "Bank", symbol: "^NSEBANK" }, { region: "in", name: "IT", symbol: "^CNXIT" },
  { region: "in", name: "Auto", symbol: "^CNXAUTO" }, { region: "in", name: "FMCG", symbol: "^CNXFMCG" },
  { region: "in", name: "Pharma", symbol: "^CNXPHARMA" }, { region: "in", name: "Metal", symbol: "^CNXMETAL" },
  { region: "in", name: "Energy", symbol: "^CNXENERGY" }, { region: "in", name: "Realty", symbol: "NIFTYREAL.NS" },
  { region: "in", name: "Media", symbol: "^CNXMEDIA" }, { region: "in", name: "PSU Bank", symbol: "^CNXPSUBANK" },
  { region: "us", name: "Tech", symbol: "^SP500-45" }, { region: "us", name: "Financials", symbol: "^SP500-40" },
  { region: "us", name: "Health", symbol: "^SP500-35" }, { region: "us", name: "Staples", symbol: "^SP500-30" },
  { region: "us", name: "Industrials", symbol: "^SP500-20" }, { region: "us", name: "Materials", symbol: "^SP500-15" },
  { region: "us", name: "Utilities", symbol: "^SP500-55" }, { region: "us", name: "Real Estate", symbol: "^SP500-6020" },
];

// Top & bottom sector per region from a quotes map (symbol → { changePct }).
export function sectorMovers(quotes: Record<string, any>): SectorBrief {
  const forRegion = (region: "in" | "us") => {
    const rows = SECTOR_SYMBOLS.filter((s) => s.region === region)
      .map((s) => ({ name: s.name, pct: quotes[s.symbol.toUpperCase()]?.changePct }))
      .filter((x) => typeof x.pct === "number")
      .sort((a, b) => (b.pct as number) - (a.pct as number));
    return rows.length ? { top: rows[0] as SectorMove, bot: rows[rows.length - 1] as SectorMove } : undefined;
  };
  return { in: forRegion("in"), us: forRegion("us") };
}

export type BriefData = {
  india: Row[];
  us: Row[];
  movers: Row[];
  news: Record<string, NewsItem[]>;
  marketIN: any | null;
  marketUS: any | null;
  combos: { symbol: string; label: string }[];
  portfolio?: PortfolioSummary;
  sectors?: SectorBrief;
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

// Compact top gainers + losers for one market cell (≤6 rows): symbol · price · day%.
function miniRows(rows: Row[]): string {
  const withPct = rows.filter((r) => r.changePct != null).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const pick = [...withPct.filter((r) => (r.changePct ?? 0) > 0).slice(0, 3), ...withPct.filter((r) => (r.changePct ?? 0) < 0).slice(-3).reverse()];
  if (!pick.length) return `<div style="color:#94a3b8;font-size:11px;padding:3px 0">No holdings tracked</div>`;
  return `<table style="width:100%;border-collapse:collapse">${pick
    .map((r) => `<tr>
      <td style="padding:3px 0;font-size:12px"><b style="color:#0f172a">${esc(r.symbol)}</b></td>
      <td style="padding:3px 6px;text-align:right;font-size:11px;color:#64748b;white-space:nowrap">${r.price != null ? `${cur$(r.currency)}${fmt(r.price)}` : ""}</td>
      <td style="padding:3px 0;text-align:right;font-size:12px;white-space:nowrap">${pctHtml(r.changePct)}</td>
    </tr>`)
    .join("")}</table>`;
}

// One quadrant box of the 2×2 dashboard, with a coloured top accent per section.
function quad(title: string, sub: string, inner: string, accent = "#4f46e5"): string {
  return `<td width="50%" valign="top" style="padding:5px"><div style="border:1px solid #e2e8f0;border-top:3px solid ${accent};border-radius:12px;padding:11px 13px;background:#fff">
    <div style="font-weight:800;font-size:13px;color:#0f172a">${title}${sub ? ` <span style="font-size:10px;font-weight:600;color:#94a3b8">${sub}</span>` : ""}</div>
    <div style="margin-top:7px">${inner}</div></div></td>`;
}

// The headline number a holder actually wants: what the book is worth right now
// and how much it made/lost today — one cell per region (₹ India, $ US).
function portfolioBar(p?: PortfolioSummary): string {
  if (!p) return "";
  const cell = (flag: string, cur: string, t: RegionTotal) => {
    if (t.val <= 0) return "";
    const prev = t.val - t.dayPL;
    const pct = prev > 0 ? (t.dayPL / prev) * 100 : 0;
    const up = t.dayPL >= 0, c = up ? "#059669" : "#e11d48";
    return `<td width="50%" valign="top" style="padding:10px 14px">
      <div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:.5px">${flag} PORTFOLIO</div>
      <div style="font-size:18px;font-weight:900;color:#0f172a;margin-top:1px">${cur}${fmt(t.val, 0)}</div>
      <div style="font-size:11.5px;color:${c};font-weight:700;margin-top:1px">${up ? "▲" : "▼"} ${cur}${fmt(Math.abs(t.dayPL), 0)} today (${up ? "+" : ""}${fmt(pct)}%)</div>
    </td>`;
  };
  const inC = cell("🇮🇳", "₹", p.in), usC = cell("🇺🇸", "$", p.us);
  if (!inC && !usC) return "";
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px"><tr>${inC || `<td width="50%"></td>`}${usC || `<td width="50%"></td>`}</tr></table>`;
}

// The whole brief as ONE compact dashboard in a 2×2 grid — no long scrolling:
//   [portfolio value bar]
//   [🇮🇳 India movers] [🇺🇸 US movers]
//   [⚡ Big moves ≥7%] [📰 Headlines]
export function buildDashboard(slot: Slot, data: BriefData, dateStr: string): { subject: string; html: string } {
  const meta = SLOT_META[slot];
  const cnt = (rows: Row[], up: boolean) => rows.filter((r) => up ? (r.changePct ?? 0) > 0 : (r.changePct ?? 0) < 0).length;

  const bigRows = [...data.movers].sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0)).slice(0, 6);
  const big = bigRows.length
    ? `<table style="width:100%;border-collapse:collapse">${bigRows.map((m) => {
        const n = (data.news[m.symbol] || [])[0];
        return `<tr><td style="padding:3px 0;font-size:12px">${m.region === "in" ? "🇮🇳" : "🇺🇸"} <b>${esc(m.symbol)}</b>${n ? `<div style="font-size:9.5px;color:#94a3b8">${esc(n.title).slice(0, 38)}</div>` : ""}</td><td style="padding:3px 0;text-align:right;font-size:12px;vertical-align:top">${pctHtml(m.changePct)}</td></tr>`;
      }).join("")}</table>`
    : `<div style="color:#94a3b8;font-size:11px">No ≥${MOVE_THRESHOLD}% moves today</div>`;

  const news: string[] = [];
  for (const m of data.movers) for (const nw of (data.news[m.symbol] || [])) news.push(`<li style="margin:3px 0;font-size:11.5px"><a href="${esc(nw.url)}" style="color:#4f46e5;text-decoration:none">${esc(nw.title).slice(0, 52)}</a></li>`);
  let q4 = news.length ? `<ul style="margin:0;padding-left:15px">${news.slice(0, 6).join("")}</ul>` : "";
  if (!q4) {
    const g = ((data.marketIN?.gainers || data.marketUS?.gainers || []) as any[]).slice(0, 5);
    q4 = g.length
      ? `<table style="width:100%;border-collapse:collapse">${g.map((r) => `<tr><td style="padding:2.5px 0;font-size:12px"><b>${esc(r.symbol)}</b></td><td style="padding:2.5px 0;text-align:right;font-size:12px">${pctHtml(r.changePct)}</td></tr>`).join("")}</table>`
      : `<div style="color:#94a3b8;font-size:11px">No fresh headlines</div>`;
  }

  const header = `<div style="background:linear-gradient(135deg,#0a1029,#1e2a5a);border-radius:14px;padding:14px 18px;margin-bottom:8px">
    <div style="font-size:18px;font-weight:900;color:#fff">${meta.emoji} ${esc(meta.name)}</div>
    <div style="font-size:11.5px;color:#c7d2fe;margin-top:2px">${esc(dateStr)} · 🇮🇳 ${data.india.length} · 🇺🇸 ${data.us.length} · ${data.movers.length} big move${data.movers.length === 1 ? "" : "s"}</div>
  </div>`;

  const grid = `<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>
    ${quad("🇮🇳 India", `${cnt(data.india, true)}▲ ${cnt(data.india, false)}▼`, miniRows(data.india), "#059669")}
    ${quad("🇺🇸 US", `${cnt(data.us, true)}▲ ${cnt(data.us, false)}▼`, miniRows(data.us), "#2563eb")}
  </tr><tr>
    ${quad(`⚡ Big moves ≥${MOVE_THRESHOLD}%`, "", big, "#d97706")}
    ${quad("📰 Headlines", "", q4, "#4f46e5")}
  </tr></table>`;

  // Important lines below the grid: today's standout gainer/loser + overall mood.
  const all = [...data.india, ...data.us].filter((r) => r.changePct != null);
  let highlights = "";
  if (all.length) {
    const srt = [...all].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    const top = srt[0], bot = srt[srt.length - 1];
    const upN = all.filter((r) => (r.changePct ?? 0) > 0).length;
    const downN = all.filter((r) => (r.changePct ?? 0) < 0).length;
    const mood = upN > downN ? ["Leaning up", "#059669"] : downN > upN ? ["Leaning down", "#e11d48"] : ["Mixed", "#64748b"];
    const cell = (cap: string, body: string) => `<td width="33%" valign="top" style="padding:9px 11px;font-size:12px;color:#334155">
      <div style="font-size:9px;color:#94a3b8;font-weight:700;letter-spacing:.5px;margin-bottom:2px">${cap}</div>${body}</td>`;
    highlights = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-top:4px"><tr>
      ${cell("TOP GAINER", `🏆 <b>${esc(top.symbol)}</b> ${pctHtml(top.changePct)}`)}
      ${cell("TOP LOSER", `🧊 <b>${esc(bot.symbol)}</b> ${pctHtml(bot.changePct)}`)}
      ${cell("SENTIMENT", `<b style="color:${mood[1]}">${mood[0]}</b> · ${upN}▲ ${downN}▼`)}
    </tr></table>`;
  }

  // One compact sector line — day's strongest ▲ / weakest ▼ per region.
  const sct = data.sectors;
  const side = (r: "in" | "us") => {
    const s = sct?.[r];
    if (!s || (!s.top && !s.bot)) return "";
    const flag = r === "in" ? "🇮🇳" : "🇺🇸";
    const t = s.top ? `▲ ${esc(s.top.name)} ${pctHtml(s.top.pct, false)}` : "";
    const b = s.bot && s.bot !== s.top ? ` ▼ ${esc(s.bot.name)} ${pctHtml(s.bot.pct, false)}` : "";
    return `${flag} ${t}${b}`;
  };
  const inSide = side("in"), usSide = side("us");
  const sectorLine = (inSide || usSide)
    ? `<div style="margin-top:6px;font-size:11.5px;color:#334155;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px">🔥 <b>Sectors</b> — ${inSide}${inSide && usSide ? " &nbsp;·&nbsp; " : ""}${usSide}</div>`
    : "";

  const comboLine = data.combos.length
    ? `<div style="margin-top:6px;font-size:11.5px;color:#4338ca;background:#eef2ff;border-radius:10px;padding:8px 12px">🧩 <b>${data.combos.length} combo${data.combos.length > 1 ? "s" : ""} matched</b> — ${esc(data.combos.slice(0, 4).map((c) => c.symbol).join(", "))}${data.combos.length > 4 ? ` +${data.combos.length - 4} more` : ""}</div>`
    : "";

  const cta = `<div style="text-align:center;margin-top:12px"><a href="https://stockanalytix.vercel.app" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;font-size:12px;padding:9px 22px;border-radius:9px">Open StockAnalytix →</a></div>`;

  return {
    subject: `${meta.emoji} ${meta.name} — StockAnalytix · ${dateStr}`,
    html: wrap(header + portfolioBar(data.portfolio) + grid + highlights + sectorLine + comboLine + cta + `<p style="color:#94a3b8;font-size:10.5px;margin-top:12px;text-align:center">Live day-change · research support only, not advice. A ≥${MOVE_THRESHOLD}% move often signals fresh news.</p>`),
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
