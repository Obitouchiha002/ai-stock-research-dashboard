"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileCode2, Upload, Eye, Trash2, Download, ExternalLink, Search, X, Loader2, ClipboardPaste, Save,
} from "lucide-react";
import {
  addHtmlReport, listHtmlReports, getHtmlReport, deleteHtmlReport, updateHtmlReportMeta,
  type ReportMeta,
} from "@/lib/htmlReports";

const genId = () => Date.now().toString() + Math.random().toString(36).slice(2, 6);

// Which market a report belongs to — lets the user file Indian / US / Crypto
// reports separately and search within one market.
const HTML_MARKETS = ["Indian", "US", "Global", "Crypto", "Other"] as const;
const MARKET_STYLE: Record<string, string> = {
  Indian: "text-emerald-700 bg-emerald-50 border-emerald-200",
  US: "text-blue-700 bg-blue-50 border-blue-200",
  Global: "text-violet-700 bg-violet-50 border-violet-200",
  Crypto: "text-amber-700 bg-amber-50 border-amber-200",
  Other: "text-slate-600 bg-slate-100 border-slate-200",
};

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function timeAgo(t: number) {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}
// Best-effort ticker from a filename ("AAPL_report.html" -> AAPL).
function guessSymbol(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const m = base.toUpperCase().match(/\b([A-Z]{1,6}(?:\.[A-Z]{2})?)\b/);
  return m ? m[1] : "";
}

export default function HtmlReportsPage() {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState("");
  const [uploadMarket, setUploadMarket] = useState<string>("Indian");
  const [marketFilter, setMarketFilter] = useState<string>("All");

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteSym, setPasteSym] = useState("");
  const [pasteMarket, setPasteMarket] = useState<string>("Indian");
  const [pasteHtml, setPasteHtml] = useState("");

  const [preview, setPreview] = useState<{ name: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => { try { setReports(await listHtmlReports()); } catch { /* idb blocked */ } finally { setLoading(false); } };
  useEffect(() => { reload(); }, []);

  const onFiles = async (fl: FileList | null) => {
    const files = fl ? Array.from(fl) : [];
    if (!files.length) return;
    setBusy(true); setBanner("");
    let added = 0, skipped = 0;
    for (const f of files) {
      try {
        const html = await f.text();
        if (!html.trim()) { skipped++; continue; }
        await addHtmlReport(
          { id: genId(), name: f.name, symbol: guessSymbol(f.name), market: uploadMarket, size: html.length, addedAt: Date.now() },
          html,
        );
        added++;
      } catch { skipped++; }
    }
    await reload();
    setBusy(false);
    setBanner(`Added ${added} report${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}.`);
  };

  const savePaste = async () => {
    const html = pasteHtml.trim();
    if (!html) return;
    setBusy(true);
    try {
      const name = (pasteName.trim() || "Pasted report") + (/\.html?$/i.test(pasteName) ? "" : ".html");
      await addHtmlReport({ id: genId(), name, symbol: pasteSym.trim().toUpperCase(), market: pasteMarket, size: html.length, addedAt: Date.now() }, html);
      setPasteHtml(""); setPasteName(""); setPasteSym(""); setPasteOpen(false);
      await reload();
    } finally { setBusy(false); }
  };

  const openPreview = async (r: ReportMeta) => {
    setPreviewLoading(true);
    setPreview({ name: r.name, html: "" });
    try {
      const html = await getHtmlReport(r.id);
      setPreview({ name: r.name, html });
    } catch {
      setPreview({ name: r.name, html: "<p style='font-family:sans-serif;padding:2rem'>Could not load this report.</p>" });
    } finally { setPreviewLoading(false); }
  };

  const openNewTab = async (r: ReportMeta) => {
    const html = await getHtmlReport(r.id);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
  };
  const download = async (r: ReportMeta) => {
    const html = await getHtmlReport(r.id);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = /\.html?$/i.test(r.name) ? r.name : `${r.name}.html`;
    a.click();
  };
  const remove = async (r: ReportMeta) => { await deleteHtmlReport(r.id); reload(); };
  // Edit a report's user fields (name / symbol / details / tags), persist + update.
  const patchMeta = (r: ReportMeta, patch: Partial<ReportMeta>) => {
    updateHtmlReportMeta(r.id, patch);
    setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (marketFilter !== "All" && (r.market || "Other") !== marketFilter) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s)
        || (r.symbol || "").toLowerCase().includes(s)
        || (r.details || "").toLowerCase().includes(s)
        || (r.tags || []).some((t) => t.toLowerCase().includes(s));
    });
  }, [reports, search, marketFilter]);

  const marketCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reports) m[r.market || "Other"] = (m[r.market || "Other"] || 0) + 1;
    return m;
  }, [reports]);

  const totalSize = reports.reduce((a, r) => a + r.size, 0);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileCode2 className="w-8 h-8 text-indigo-600" /> HTML Reports
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Store your own HTML stock reports and preview them here. {reports.length > 0 && <span className="text-slate-400">· {reports.length} saved · {fmtSize(totalSize)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start items-center">
          <input ref={fileRef} type="file" accept=".html,.htm" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Market</span>
            <select value={uploadMarket} onChange={(e) => setUploadMarket(e.target.value)}
              className="font-bold text-slate-700 bg-transparent outline-none cursor-pointer">
              {HTML_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <button onClick={() => setPasteOpen((v) => !v)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4" /> Paste
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload HTML
          </button>
        </div>
      </div>

      {banner && (
        <div className="mb-4 rounded-lg px-4 py-2.5 text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-between">
          <span>{banner}</span><button onClick={() => setBanner("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Paste form */}
      {pasteOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Report name (e.g. AAPL MarketSmith)" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-200" />
            <input value={pasteSym} onChange={(e) => setPasteSym(e.target.value.toUpperCase())} placeholder="Symbol (optional)" className="sm:w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" />
            <select value={pasteMarket} onChange={(e) => setPasteMarket(e.target.value)} className="sm:w-36 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer">
              {HTML_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <textarea value={pasteHtml} onChange={(e) => setPasteHtml(e.target.value)} rows={5} placeholder="Paste the report's HTML source here…" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setPasteOpen(false); setPasteHtml(""); }} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">Cancel</button>
            <button onClick={savePaste} disabled={!pasteHtml.trim() || busy} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Save</button>
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {/* Filter by market — click Indian / US to see only that market's reports. */}
          <div className="flex flex-wrap gap-1.5">
            {(["All", ...HTML_MARKETS] as string[]).map((m) => {
              const n = m === "All" ? reports.length : (marketCounts[m] || 0);
              const active = marketFilter === m;
              return (
                <button key={m} onClick={() => setMarketFilter(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                  {m} <span className={active ? "text-indigo-200" : "text-slate-400"}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${marketFilter === "All" ? "all reports" : marketFilter} by name, symbol, details…`} className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <FileCode2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No HTML reports yet</h3>
          <p className="text-slate-500 mb-6 font-medium">Upload your saved HTML stock reports (MarketSmith, broker exports, etc.) to keep and preview them in one place.</p>
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"><Upload className="w-4 h-4" /> Upload HTML</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-500 font-medium py-12">No reports match your search.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="sa-table">
              <thead>
                <tr>
                  <th className="w-12">S.No</th>
                  <th>Company / Report</th>
                  <th>Market</th>
                  <th>Details</th>
                  <th>Tags</th>
                  <th className="whitespace-nowrap">Date</th>
                  <th className="text-right">Preview / Link</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id}>
                    <td className="text-slate-400 tabular-nums">{idx + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileCode2 className="w-4 h-4 text-indigo-500 shrink-0" />
                        <input value={r.name} onChange={(e) => patchMeta(r, { name: e.target.value })}
                          className="font-black text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-200 min-w-[12rem] max-w-[280px]" />
                      </div>
                      <input value={r.symbol || ""} onChange={(e) => patchMeta(r, { symbol: e.target.value.toUpperCase() })} placeholder="+ symbol"
                        className="ml-6 mt-1 w-24 text-[11px] font-black text-indigo-700 bg-indigo-50/60 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-slate-400 placeholder:font-medium" />
                    </td>
                    <td>
                      <select value={r.market || "Other"} onChange={(e) => patchMeta(r, { market: e.target.value })}
                        className={`text-[11px] font-bold rounded-lg border px-2 py-1 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-200 ${MARKET_STYLE[r.market || "Other"]}`}>
                        {HTML_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td>
                      <input value={r.details || ""} onChange={(e) => patchMeta(r, { details: e.target.value })} placeholder="add details…"
                        className="text-[13px] bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-200 w-full min-w-[10rem]" />
                      <span className="text-[10px] text-slate-400 ml-1">{fmtSize(r.size)}</span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1 min-w-[9rem]">
                        {(r.tags || []).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5">
                            {t}<button onClick={() => patchMeta(r, { tags: (r.tags || []).filter((x) => x !== t) })} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                        <input placeholder="+ tag"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = e.target as HTMLInputElement; const v = el.value.trim(); if (v) { patchMeta(r, { tags: Array.from(new Set([...(r.tags || []), v])) }); el.value = ""; } } }}
                          className="w-16 text-[11px] bg-transparent outline-none border-b border-transparent focus:border-slate-300 placeholder:text-slate-400" />
                      </div>
                    </td>
                    <td className="text-slate-500 text-[13px] whitespace-nowrap">{new Date(r.addedAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPreview(r)} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Preview</button>
                        <button onClick={() => openNewTab(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Open in new tab"><ExternalLink className="w-4 h-4" /></button>
                        <button onClick={() => download(r)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Download"><Download className="w-4 h-4" /></button>
                        <button onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-slate-400 italic">
        Stored on this device (IndexedDB) — your report files never leave your computer. Research support only.
      </p>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="text-sm font-black text-slate-800 flex items-center gap-2 min-w-0"><FileCode2 className="w-4 h-4 text-indigo-600 shrink-0" /> <span className="truncate">{preview.name}</span></div>
              <button onClick={() => setPreview(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">Close</button>
            </div>
            {previewLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <iframe srcDoc={preview.html} title={preview.name} sandbox="allow-same-origin" className="flex-1 w-full bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
