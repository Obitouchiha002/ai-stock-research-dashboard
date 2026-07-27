"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet as SheetIcon,
  Upload,
  Trash2,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
  Pencil,
  Check,
  X,
  Download,
} from "lucide-react";
import {
  getSheets,
  overwriteSheets,
  appendSheets,
  updateSheet,
  deleteSheet,
  type ExcelSheet,
  type SheetRow,
} from "@/lib/storage";
import { parseWorkbook, resolveSymbol, fetchQuotes } from "@/lib/excelImport";

const fmt = (n: number | null | undefined, cur = "") =>
  n == null ? "—" : `${cur}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function SheetsPage() {
  const [sheets, setSheets] = useState<ExcelSheet[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [pending, setPending] = useState<ExcelSheet[] | null>(null); // parsed, awaiting overwrite/append choice
  const [pendingFile, setPendingFile] = useState<string>("");
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [market, setMarket] = useState<"US" | "Indian">("Indian");
  const [renaming, setRenaming] = useState<string>("");
  const [renameText, setRenameText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    const s = getSheets();
    setSheets(s);
    setActiveId((cur) => (s.some((x) => x.id === cur) ? cur : s[0]?.id || ""));
  };
  useEffect(() => {
    reload();
  }, []);

  const active = sheets.find((s) => s.id === activeId);
  const cur = market === "Indian" ? "₹" : "$";

  // seq counter for unique ids without Date.now collisions in a loop
  const mkId = (i: number) => `${Date.now().toString(36)}-${i}-${Math.floor(performance.now())}`;

  const handleFile = async (file: File) => {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const parsed: ExcelSheet[] = parseWorkbook(buf).map((s, i) => ({
        id: mkId(i),
        name: s.name,
        sourceFile: file.name,
        rows: s.rows as SheetRow[],
        importedAt: Date.now(),
      }));
      if (parsed.length === 0) {
        setError(
          "No stock rows found. Make sure the sheet has a header row with columns like Stock Name, Qty and Price.",
        );
        return;
      }
      if (sheets.length > 0) {
        // Ask overwrite vs add-new.
        setPending(parsed);
        setPendingFile(file.name);
      } else {
        appendSheets(parsed);
        reload();
        setActiveId(getSheets()[0]?.id || "");
      }
    } catch (e: any) {
      setError("Could not read that file. Supported: .xlsx, .xls, .csv");
    }
  };

  const confirmImport = (mode: "overwrite" | "append") => {
    if (!pending) return;
    if (mode === "overwrite") overwriteSheets(pending);
    else appendSheets(pending);
    const first = pending[0];
    setPending(null);
    setPendingFile("");
    reload();
    // jump to a freshly imported sheet
    setTimeout(() => {
      const all = getSheets();
      const match = all.find((s) => s.name.startsWith(first.name));
      setActiveId(match?.id || all[0]?.id || "");
    }, 0);
  };

  const removeActive = () => {
    if (!active) return;
    deleteSheet(active.id);
    reload();
  };

  // Resolve a Yahoo symbol for a row, then batch-fetch live prices.
  const fetchLive = async () => {
    if (!active) return;
    setFetching(true);
    try {
      const rows = active.rows;
      const resolved = await Promise.all(rows.map((row) => resolveSymbol(row, market)));
      const quotes = await fetchQuotes(resolved);

      const newRows: SheetRow[] = rows.map((row, i) => {
        const sym = resolved[i];
        const q = sym ? quotes[sym] : null;
        const ltp = q?.price ?? null;
        let plValue: number | null = null;
        let plPct: number | null = null;
        if (ltp != null && row.price != null) {
          if (row.qty != null) plValue = (ltp - row.price) * row.qty;
          plPct = ((ltp - row.price) / row.price) * 100;
        }
        return { ...row, symbol: sym || row.symbol, ltp, plValue, plPct };
      });

      updateSheet(active.id, { rows: newRows });
      reload();
    } finally {
      setFetching(false);
    }
  };

  const saveRename = () => {
    if (renaming && renameText.trim()) updateSheet(renaming, { name: renameText.trim() });
    setRenaming("");
    setRenameText("");
    reload();
  };

  const totals = useMemo(() => {
    if (!active) return { mv: 0, pl: 0, hasPl: false };
    let mv = 0;
    let pl = 0;
    let hasPl = false;
    active.rows.forEach((r) => {
      if (r.marketValue != null) mv += r.marketValue;
      if (r.plValue != null) {
        pl += r.plValue;
        hasPl = true;
      }
    });
    return { mv, pl, hasPl };
  }, [active]);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-8 h-8 text-indigo-600" /> Import Excel
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Upload an Excel/CSV workbook. Every sheet becomes a tab, cross-checked with live prices.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(["Indian", "US"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className={`px-3 py-2 text-sm font-bold transition ${
                  market === m ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m === "Indian" ? "₹ India" : "$ US"}
              </button>
            ))}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition"
          >
            <Upload className="w-4 h-4" /> Import Sheet
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Overwrite vs Add-new prompt */}
      {pending && (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setPending(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 mb-1">Import “{pendingFile}”</h3>
            <p className="text-sm text-slate-500 mb-4">
              Found <b>{pending.length}</b> sheet{pending.length > 1 ? "s" : ""} ({pending.reduce((s, x) => s + x.rows.length, 0)} rows).
              You already have {sheets.length} sheet{sheets.length > 1 ? "s" : ""}. What should I do?
            </p>
            <div className="space-y-2">
              <button
                onClick={() => confirmImport("append")}
                className="w-full text-left px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition"
              >
                <div className="font-bold text-indigo-900">Add as new sheet{pending.length > 1 ? "s" : ""}</div>
                <div className="text-xs text-indigo-700">Keep everything and append the imported sheet(s).</div>
              </button>
              <button
                onClick={() => confirmImport("overwrite")}
                className="w-full text-left px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition"
              >
                <div className="font-bold text-rose-900">Overwrite everything</div>
                <div className="text-xs text-rose-700">Replace all existing sheets with this file.</div>
              </button>
              <button onClick={() => setPending(null)} className="w-full px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sheets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No sheets imported yet</h3>
          <p className="text-slate-500 mb-6 font-medium max-w-lg mx-auto">
            Import a portfolio/holdings Excel or CSV. Columns like <b>Stock Name</b>, <b>Qty</b> and <b>Price</b> are
            detected automatically. Multiple sheets in one file are all imported.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
          >
            <Upload className="w-4 h-4" /> Import Sheet
          </button>
        </div>
      ) : (
        <>
          {/* Sheet tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {sheets.map((s) => (
              <div key={s.id} className="flex items-center">
                {renaming === s.id ? (
                  <div className="flex items-center gap-1 bg-white border border-indigo-300 rounded-xl px-2 py-1">
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveRename()}
                      className="text-sm font-bold outline-none w-28"
                    />
                    <button onClick={saveRename} className="text-emerald-600"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setRenaming("")} className="text-slate-400"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveId(s.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                      activeId === s.id ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <SheetIcon className="w-3.5 h-3.5" />
                    {s.name}
                    <span className={`text-xs px-1.5 py-0.5 rounded-md ${activeId === s.id ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                      {s.rows.length}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {active && (
            <>
              {/* Sheet toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="text-sm text-slate-500 font-medium">
                  {active.sourceFile && <>From <b className="text-slate-700">{active.sourceFile}</b> · </>}
                  {active.rows.length} rows · Market Value <b className="text-slate-700">{fmt(totals.mv, cur)}</b>
                  {totals.hasPl && (
                    <> · P/L <b className={totals.pl >= 0 ? "text-emerald-600" : "text-rose-600"}>{totals.pl >= 0 ? "+" : ""}{fmt(totals.pl, cur)}</b></>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={fetchLive}
                    disabled={fetching}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} /> Fetch Live Prices
                  </button>
                  <button
                    onClick={() => { setRenaming(active.id); setRenameText(active.name); }}
                    className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Rename
                  </button>
                  <button
                    onClick={removeActive}
                    className="px-3 py-2 bg-white border border-slate-200 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide">S.No</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Stock Name</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Qty</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Price</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Market Value</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">LTP (Live)</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.rows.map((r) => {
                      const up = (r.plPct ?? 0) >= 0;
                      return (
                        <tr key={r.sNo} className="border-b border-slate-100 hover:bg-slate-50 transition">
                          <td className="p-3 text-slate-400 tabular-nums">{r.sNo}</td>
                          <td className="p-3 font-bold text-slate-900">
                            {r.stockName}
                            {r.symbol && r.symbol !== r.stockName && (
                              <span className="ml-2 text-xs text-slate-400 font-medium">{r.symbol}</span>
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums text-slate-700">{fmt(r.qty)}</td>
                          <td className="p-3 text-right tabular-nums text-slate-700">{fmt(r.price, cur)}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-slate-900">{fmt(r.marketValue, cur)}</td>
                          <td className="p-3 text-right tabular-nums text-slate-900">{fmt(r.ltp, cur)}</td>
                          <td className="p-3 text-right tabular-nums font-bold">
                            {r.plValue == null ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <span className={up ? "text-emerald-600" : "text-rose-600"}>
                                {up ? "+" : ""}{fmt(r.plValue, cur)}
                                {r.plPct != null && <span className="block text-[10px] font-medium">({up ? "+" : ""}{r.plPct.toFixed(2)}%)</span>}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-[11px] text-slate-400 italic flex items-center gap-1">
                <Download className="w-3 h-3" />
                Price/Market Value are read from your sheet as-is. LTP &amp; P/L are computed live via Yahoo Finance.
                Research support only. Not buy/sell advice. Always verify data independently.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
