// Shared Excel/CSV import helpers used by both the Import Excel page and the
// Portfolio page. Parsing runs entirely in the browser (files never leave the
// device) via SheetJS.
import * as XLSX from "xlsx";

export type ExcelRow = {
  sNo: number;
  stockName: string;
  symbol: string; // best-effort ticker ("" if unknown)
  qty: number | null;
  price: number | null;
  marketValue: number | null;
  raw?: Record<string, any>;
};

export type ParsedSheet = {
  name: string;
  rows: ExcelRow[];
};

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Pattern-major: try each pattern across ALL headers before moving to the next
// pattern. So a specific column ("Average Cost") is preferred over a generic one
// ("Current Price") even when the generic column appears first in the sheet.
function pickColumn(headers: string[], patterns: RegExp[], exclude: RegExp[] = []) {
  for (const p of patterns) {
    for (let i = 0; i < headers.length; i++) {
      const h = norm(headers[i]);
      if (!h) continue;
      if (exclude.some((r) => r.test(h))) continue;
      if (p.test(h)) return i;
    }
  }
  return -1;
}

export function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[, ₹$%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Normalise one worksheet. Returns null when no usable header row is found
// (nothing is invented).
export function parseWorksheet(ws: XLSX.WorkSheet): ExcelRow[] | null {
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!grid.length) return null;

  // Pick the row with the MOST header-like cells (within the first 25), not just
  // the first row that clears a threshold — broker exports (ICICI, Zerodha…)
  // often have title/summary rows above the real table.
  let headerIdx = -1;
  let bestHits = 0;
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const cells = grid[i].map(norm);
    const hits = cells.filter((c) =>
      /name|stock|company|scrip|security|instrument|symbol|ticker|isin|qty|quantity|shares|units|holding|price|rate|value|amount|cost|avg|ltp|cmp/.test(
        c,
      ),
    ).length;
    if (hits > bestHits) {
      bestHits = hits;
      headerIdx = i;
    }
  }
  if (headerIdx === -1 || bestHits < 2) return null;

  const headers = grid[headerIdx].map((h) => String(h));
  const iName = pickColumn(
    headers,
    [/companyname/, /stockname/, /securityname/, /scripname/, /^name$/, /name/, /company/, /stock/, /scrip/, /security/, /instrument/],
    [/scripcode/, /symbolcode/, /isin/],
  );
  const iSymbol = pickColumn(headers, [
    /^symbol$/, /tradingsymbol/, /nsesymbol/, /bsesymbol/, /nsecode/, /bsecode/, /symbol/, /ticker/, /scripcode/,
  ]);
  const iQty = pickColumn(headers, [
    /^qty$/, /qtyavailable/, /holdingqty/, /netqty/, /qty/, /quantity/, /shares/, /units/, /^holding$/, /balance/,
  ]);
  // Prefer a purchase/average cost over a current/market price for buy price.
  const iPrice = pickColumn(headers, [
    /avgcost/, /averagecost/, /avgprice/, /averageprice/, /buyavg/, /buyprice/, /buyrate/, /costprice/, /purchaseprice/, /avgrate/, /^avg/, /^price$/, /price/, /rate/, /^cost/, /avg/,
  ]);
  // Prefer an at-cost / invested value: when there's no explicit price column,
  // the caller divides this by qty to get the BUY price, so a current market
  // value would set a wrong (today's) cost basis and hide real P&L.
  const iValue = pickColumn(headers, [
    /valueatcost/, /investedvalue/, /invested/, /costvalue/, /purchasevalue/, /buyvalue/, /marketvalue/, /mktvalue/, /currentvalue/, /^value$/, /value/, /amount/,
  ]);

  const rows: ExcelRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const stockName = String((iName >= 0 ? row[iName] : row[0]) ?? "").trim();
    const symbol = String((iSymbol >= 0 ? row[iSymbol] : "") ?? "").trim();
    if (!stockName && !symbol) continue;
    // Skip subtotal/total rows in broker exports — but only exact total-labels,
    // so a real company like "Total S.A." (norm "totalsa") is NOT dropped.
    const nm = norm(stockName);
    if (/^(grand|sub|net|sector|portfolio)?total$/.test(nm) || nm === "sum" || nm === "totalvalue") continue;

    const qty = iQty >= 0 ? toNum(row[iQty]) : null;
    const price = iPrice >= 0 ? toNum(row[iPrice]) : null;
    let marketValue = iValue >= 0 ? toNum(row[iValue]) : null;
    if (marketValue == null && qty != null && price != null) marketValue = qty * price;

    const raw: Record<string, any> = {};
    headers.forEach((h, i) => {
      if (h) raw[h] = row[i];
    });

    rows.push({ sNo: rows.length + 1, stockName: stockName || symbol, symbol, qty, price, marketValue, raw });
  }
  return rows.length ? rows : null;
}

// Parse a whole workbook (all sheets). Sheets with no usable rows are skipped.
export function parseWorkbook(buf: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(buf, { type: "array" });
  const out: ParsedSheet[] = [];
  wb.SheetNames.forEach((name, i) => {
    const rows = parseWorksheet(wb.Sheets[name]);
    if (rows) out.push({ name: name || `Sheet ${i + 1}`, rows });
  });
  return out;
}

// Resolve a Yahoo symbol for a row (ticker used directly; a company name is
// looked up via the search API). market controls the .NS suffix + exchange
// preference. Runs in the browser.
export async function resolveSymbol(
  row: Pick<ExcelRow, "symbol" | "stockName">,
  market: "US" | "Indian",
): Promise<string> {
  let cand = (row.symbol || row.stockName || "").trim();
  if (!cand) return "";
  // Futures (GC=F, SI=F) and indices (^NSEI) are already Yahoo symbols — never
  // append .NS or run them through a name search.
  if (cand.includes("=") || cand.startsWith("^")) return cand.toUpperCase();
  const looksTicker = /^[A-Za-z0-9.\-&]+$/.test(cand) && cand.length <= 14;
  if (looksTicker) {
    if (market === "Indian" && !cand.includes(".")) cand += ".NS";
    return cand.toUpperCase();
  }
  try {
    const res = await fetch(`/api/search-stock?query=${encodeURIComponent(cand)}`);
    const j = await res.json();
    const matches: any[] = j.matches || [];
    const pref =
      market === "Indian"
        ? matches.find((m) => /\.(NS|BO)$/i.test(m.symbol)) || matches[0]
        : matches.find((m) => !/\.(NS|BO)$/i.test(m.symbol)) || matches[0];
    return pref?.symbol || "";
  } catch {
    return "";
  }
}

// Auto-detect a holding's market + resolved symbol, so a mixed Excel splits
// itself into the Indian and US tabs instead of dumping everything into the
// active tab. Rules, in order:
//   1. Symbol ends with .NS / .BO            -> Indian
//   2. Search finds an exact "<TICKER>.NS/.BO" listing (plain Indian ticker like
//      RELIANCE with no suffix, common in Zerodha/Groww exports) -> Indian
//   3. Exact plain-ticker match on a US exchange -> US
//   4. Otherwise infer from the best search match's suffix
//   5. Fallback (no suffix, no match) -> US
export async function resolveHolding(
  row: Pick<ExcelRow, "symbol" | "stockName">,
  hint?: "Indian Stocks" | "US Stocks",
): Promise<{ symbol: string; market: "Indian Stocks" | "US Stocks" }> {
  const cand = (row.symbol || row.stockName || "").trim();
  if (!cand) return { symbol: "", market: "US Stocks" };
  const up = cand.toUpperCase();

  // 0. futures / index symbols pass straight through (commodities, indices).
  if (up.includes("=") || up.startsWith("^")) return { symbol: up, market: "US Stocks" };

  // 1. explicit Indian suffix
  if (/\.(NS|BO)$/i.test(up)) return { symbol: up, market: "Indian Stocks" };

  try {
    const res = await fetch(`/api/search-stock?query=${encodeURIComponent(cand)}`);
    const j = await res.json();
    const matches: any[] = j.matches || [];

    // 2. plain Indian ticker (RELIANCE -> RELIANCE.NS)
    const indianExact = matches.find((m) => {
      const s = String(m.symbol || "").toUpperCase();
      return s === `${up}.NS` || s === `${up}.BO`;
    });
    if (indianExact) return { symbol: String(indianExact.symbol).toUpperCase(), market: "Indian Stocks" };

    // 3. exact US ticker
    const usExact = matches.find(
      (m) => String(m.symbol || "").toUpperCase() === up && !/\.(NS|BO)$/i.test(m.symbol),
    );
    if (usExact) return { symbol: up, market: "US Stocks" };

    // 4. ambiguous company name (e.g. "Infosys" lists both as INFY US-ADR and
    //    INFY.NS) — break the tie with the caller's hint (the chosen tab).
    if (hint === "Indian Stocks") {
      const ind = matches.find((m) => /\.(NS|BO)$/i.test(m.symbol));
      if (ind) return { symbol: String(ind.symbol).toUpperCase(), market: "Indian Stocks" };
    }
    if (hint === "US Stocks") {
      const us = matches.find((m) => m.type === "EQUITY" && !/\.(NS|BO)$/i.test(m.symbol));
      if (us) return { symbol: String(us.symbol).toUpperCase(), market: "US Stocks" };
    }

    // 5. best equity match -> infer from its suffix
    const best = matches.find((m) => m.type === "EQUITY") || matches[0];
    if (best?.symbol) {
      const s = String(best.symbol).toUpperCase();
      return { symbol: s, market: /\.(NS|BO)$/i.test(s) ? "Indian Stocks" : "US Stocks" };
    }
  } catch {
    /* ignore */
  }

  // 6. fallback — honour the caller's hint so a transient search failure keeps
  // an Indian import in the Indian tab (with a .NS suffix) instead of dumping
  // everything into US with an un-priceable bare ticker.
  if (hint === "Indian Stocks") {
    return { symbol: up.includes(".") ? up : `${up}.NS`, market: "Indian Stocks" };
  }
  return { symbol: up, market: "US Stocks" };
}

// Commodity names -> Yahoo futures symbols. Yahoo's name search returns ETFs or
// futures inconsistently for "silver"/"gold", so map the common ones explicitly.
export const COMMODITY_MAP: Record<string, string> = {
  // Yahoo has no spot metal feed (XAGUSD=X etc. return nothing), so metals map
  // to their liquid futures contracts.
  GOLD: "GC=F", XAU: "GC=F",
  SILVER: "SI=F", XAG: "SI=F",
  PLATINUM: "PL=F", XPT: "PL=F",
  PALLADIUM: "PA=F", XPD: "PA=F",
  CRUDE: "CL=F", CRUDEOIL: "CL=F", OIL: "CL=F", WTI: "CL=F",
  BRENT: "BZ=F",
  NATURALGAS: "NG=F", NATGAS: "NG=F", GAS: "NG=F",
  COPPER: "HG=F",
  CORN: "ZC=F", WHEAT: "ZW=F", SOYBEAN: "ZS=F", SOYBEANS: "ZS=F",
  SUGAR: "SB=F", COFFEE: "KC=F", COTTON: "CT=F", COCOA: "CC=F",
  ALUMINIUM: "ALI=F", ALUMINUM: "ALI=F",
};

// Turn a commodity input into a Yahoo symbol. Already-valid symbols (SI=F, an
// index, a -USD pair) pass through; a known name/pair maps to its futures
// contract; anything else is assumed to already be a ticker.
export function resolveCommodity(input: string): string {
  const up = String(input || "").trim().toUpperCase();
  if (!up) return "";
  if (up.includes("=") || up.startsWith("^") || up.endsWith("-USD")) return up;
  const key = up.replace(/[^A-Z]/g, "");
  if (COMMODITY_MAP[key]) return COMMODITY_MAP[key];
  // Spot-pair forms like XAGUSD / XAUUSD / GOLDUSD -> strip the trailing USD and
  // retry against the map.
  const noUsd = key.replace(/USD$/, "");
  if (noUsd && COMMODITY_MAP[noUsd]) return COMMODITY_MAP[noUsd];
  const stripped = key.replace(/FUTURES?|SPOT|COMEX|MCX|NYMEX/g, "");
  if (COMMODITY_MAP[stripped]) return COMMODITY_MAP[stripped];
  return up;
}

// Crypto names/tickers -> Yahoo "<COIN>-USD" pairs.
export const CRYPTO_MAP: Record<string, string> = {
  BITCOIN: "BTC-USD", BTC: "BTC-USD",
  ETHEREUM: "ETH-USD", ETHER: "ETH-USD", ETH: "ETH-USD",
  SOLANA: "SOL-USD", SOL: "SOL-USD",
  RIPPLE: "XRP-USD", XRP: "XRP-USD",
  DOGECOIN: "DOGE-USD", DOGE: "DOGE-USD",
  CARDANO: "ADA-USD", ADA: "ADA-USD",
  BNB: "BNB-USD", BINANCECOIN: "BNB-USD",
  POLYGON: "MATIC-USD", MATIC: "MATIC-USD",
  LITECOIN: "LTC-USD", LTC: "LTC-USD",
  TRON: "TRX-USD", TRX: "TRX-USD",
  POLKADOT: "DOT-USD", DOT: "DOT-USD",
  AVALANCHE: "AVAX-USD", AVAX: "AVAX-USD",
};

export function resolveCrypto(input: string): string {
  const up = String(input || "").trim().toUpperCase();
  if (!up) return "";
  if (up.endsWith("-USD") || up.includes("=")) return up;
  const key = up.replace(/[^A-Z0-9]/g, "");
  if (CRYPTO_MAP[key]) return CRYPTO_MAP[key];
  // Strip spaces/punctuation so a stray "BTC USD" doesn't become an invalid
  // "BTC USD-USD"; unknown coins still get the -USD pair form.
  return `${key || up}-USD`;
}

export async function fetchQuotes(symbols: string[]): Promise<Record<string, any>> {
  const uniq = Array.from(new Set(symbols.filter(Boolean)));
  if (!uniq.length) return {};
  try {
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: uniq }),
    });
    const j = await res.json();
    return j.quotes || {};
  } catch {
    return {};
  }
}
