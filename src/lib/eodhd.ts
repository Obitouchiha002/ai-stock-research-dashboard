// EODHD (eodhd.com) data client. Reads EODHD_API_KEY from the environment and
// falls back to the public "demo" token (works only for AAPL.US / a few tickers)
// so the pipe can be verified before a paid key is added.
// Symbol format: US → "AAPL.US", India → "RELIANCE.NSE" / ".BSE".

const BASE = "https://eodhd.com/api";
const key = () => process.env.EODHD_API_KEY || "demo";

// True only when a real (non-demo) key is configured — features gate on this so
// the free/demo limits are never hit accidentally in production.
export const eodhdConfigured = () => {
  const k = process.env.EODHD_API_KEY;
  return !!k && k !== "demo";
};
export const eodhdKeyKind = () => (process.env.EODHD_API_KEY ? (process.env.EODHD_API_KEY === "demo" ? "demo" : "configured") : "none");

// Map a plain/app symbol to EODHD's convention.
export function toEodhd(symbol: string, market?: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.includes(".")) {
    if (s.endsWith(".NS")) return s.replace(/\.NS$/, ".NSE");
    if (s.endsWith(".BO")) return s.replace(/\.BO$/, ".BSE");
    return s; // already suffixed (e.g. .US / .NSE)
  }
  return /Indian/i.test(market || "") ? `${s}.NSE` : `${s}.US`;
}

async function getJson(path: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}api_token=${encodeURIComponent(key())}&fmt=json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`EODHD ${res.status}`);
  return res.json();
}

export const eodhdRealTime = (sym: string) => getJson(`/real-time/${sym}`);
export const eodhdFundamentals = (sym: string) => getJson(`/fundamentals/${sym}`);
export const eodhdEod = (sym: string, from?: string) => getJson(`/eod/${sym}${from ? `?from=${from}` : ""}`);
// All symbols listed on an exchange (e.g. "US", "NSE") — the basis of a true full-universe scan.
export const eodhdExchangeSymbols = (exchange: string) => getJson(`/exchange-symbol-list/${exchange}`);
// Bulk end-of-day for a whole exchange in ONE call (the fast scan).
export const eodhdBulkEod = (exchange: string) => getJson(`/eod-bulk-last-day/${exchange}`);

// ---- app-symbol → EODHD mapping (for the candle/history pipe) ---------------
// What this plan serves: global INDICES (incl. NSE sectoral — the big win, since
// Yahoo has no history for them) and US/global STOCKS. NSE/BSE individual stocks
// are NOT in the All-World plan, so those return null → caller keeps using Yahoo.
//
// Index codes mostly transform cleanly (^CNXAUTO → CNXAUTO.INDX,
// NIFTY_HEALTHCARE.NS → NIFTYHEALTHCARE.INDX); a few NSE ones don't and need an
// override (verified against EODHD's INDX symbol list).
const INDEX_OVERRIDES: Record<string, string> = {
  NIFTYPVTBANK: "NIFPVTBNK",
  CNXPSUBANK: "NIFTYPSU",
  NIFTYSMLCAP250: "NISM250",
};

export function isIndexSymbol(symbol: string): boolean {
  return /^\^/.test(symbol) || /NIFTY|CNX|SP500|SP600/i.test(symbol) || /^\^(MID|RUT|VIX|GSPC|DJI|IXIC)/.test(symbol);
}

// Map an app symbol to its EODHD ticker + kind, or null when EODHD can't serve it.
export function appToEodhd(symbol: string): { sym: string; kind: "index" | "us" } | null {
  const s = String(symbol || "").trim().toUpperCase();
  if (!s) return null;
  if (isIndexSymbol(s)) {
    const bare = s.replace(/^\^/, "").replace(/\.(NS|BO)$/i, "").replace(/_/g, "");
    return { sym: `${INDEX_OVERRIDES[bare] || bare}.INDX`, kind: "index" };
  }
  if (s.endsWith(".NS") || s.endsWith(".BO")) return null; // NSE/BSE stock → Yahoo
  if (s.includes(".")) return null; // already-suffixed non-US → Yahoo
  return { sym: `${s}.US`, kind: "us" };
}

export type EodhdCandle = { open: number; high: number; low: number; close: number; volume: number };

// Daily (or 1h intraday) candles from EODHD, mapped to the app's OHLC shape.
export async function eodhdCandles(
  eodhdSym: string,
  opts: { interval: "1d" | "1h"; from?: string },
): Promise<EodhdCandle[]> {
  const n = (v: any) => (typeof v === "number" ? v : Number(v));
  let rows: any[] = [];
  if (opts.interval === "1h") {
    const fromTs = opts.from ? Math.floor(new Date(opts.from).getTime() / 1000) : undefined;
    const j = await getJson(`/intraday/${eodhdSym}?interval=1h${fromTs ? `&from=${fromTs}` : ""}`);
    rows = Array.isArray(j) ? j : [];
  } else {
    const j = await getJson(`/eod/${eodhdSym}${opts.from ? `?from=${opts.from}` : ""}`);
    rows = Array.isArray(j) ? j : [];
  }
  return rows
    .map((r: any) => ({ open: n(r.open), high: n(r.high), low: n(r.low), close: n(r.close), volume: n(r.volume ?? 0) }))
    .filter((c) => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low));
}
