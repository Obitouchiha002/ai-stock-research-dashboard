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

function pickColumn(headers: string[], patterns: RegExp[], exclude: RegExp[] = []) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (!h) continue;
    if (exclude.some((r) => r.test(h))) continue;
    if (patterns.some((r) => r.test(h))) return i;
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

  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = grid[i].map(norm);
    const hits = cells.filter((c) =>
      /name|stock|company|scrip|symbol|ticker|qty|quantity|shares|price|rate|value|amount/.test(c),
    ).length;
    if (hits >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headers = grid[headerIdx].map((h) => String(h));
  const iName = pickColumn(
    headers,
    [/name/, /stock/, /company/, /scrip/, /security/, /instrument/],
    [/scripcode/, /symbolcode/],
  );
  const iSymbol = pickColumn(headers, [/^symbol$/, /symbol/, /ticker/, /nsecode/, /bsecode/, /scripcode/]);
  const iQty = pickColumn(headers, [/qty/, /quantity/, /shares/, /units/, /holding/]);
  const iPrice = pickColumn(headers, [/avgprice/, /buyprice/, /^price$/, /price/, /rate/, /cost/, /avg/]);
  const iValue = pickColumn(headers, [/marketvalue/, /mktvalue/, /currentvalue/, /^value$/, /value/, /amount/]);

  const rows: ExcelRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const stockName = String((iName >= 0 ? row[iName] : row[0]) ?? "").trim();
    const symbol = String((iSymbol >= 0 ? row[iSymbol] : "") ?? "").trim();
    if (!stockName && !symbol) continue;
    if (/^(total|grand total|sum)/i.test(stockName)) continue;

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

  // 6. fallback
  return { symbol: up, market: "US Stocks" };
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
