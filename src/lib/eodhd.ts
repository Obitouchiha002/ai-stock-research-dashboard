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
