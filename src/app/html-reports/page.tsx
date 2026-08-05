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

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteSym, setPasteSym] = useState("");
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
          { id: genId(), name: f.name, symbol: guessSymbol(f.name), size: html.length, addedAt: Date.now() },
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
      await addHtmlReport({ id: genId(), name, symbol: pasteSym.trim().toUpperCase(), size: html.length, addedAt: Date.now() }, html);
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
  const setSymbol = async (r: ReportMeta, sym: string) => {
    await updateHtmlReportMeta(r.id, { symbol: sym.toUpperCase() });
    setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, symbol: sym.toUpperCase() } : x)));
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return reports.filter((r) => !s || r.name.toLowerCase().includes(s) || (r.symbol || "").toLowerCase().includes(s));
  }, [reports, search]);

  const totalSize = reports.reduce((a, r) => a + r.size, 0);

  return (
    <div className="max-w-screen-lg mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileCode2 className="w-8 h-8 text-indigo-600" /> HTML Reports
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Store your own HTML stock reports and preview them here. {reports.length > 0 && <span className="text-slate-400">· {reports.length} saved · {fmtSize(totalSize)}</span>}
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <input ref={fileRef} type="file" accept=".html,.htm" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
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
          </div>
          <textarea value={pasteHtml} onChange={(e) => setPasteHtml(e.target.value)} rows={5} placeholder="Paste the report's HTML source here…" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setPasteOpen(false); setPasteHtml(""); }} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">Cancel</button>
            <button onClick={savePaste} disabled={!pasteHtml.trim() || busy} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Save</button>
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or symbol…" className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full" />
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
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0"><FileCode2 className="w-5 h-5 text-indigo-600" /></div>
                <div className="min-w-0 flex-1">
                  <button onClick={() => openPreview(r)} className="text-left font-black text-slate-900 truncate hover:text-indigo-600 w-full">{r.name}</button>
                  <div className="flex items-center gap-2 mt-1">
                    <input value={r.symbol || ""} onChange={(e) => setSymbol(r, e.target.value)} placeholder="+ symbol"
                      className="w-24 text-[11px] font-black text-indigo-700 bg-indigo-50/60 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-slate-400 placeholder:font-medium" />
                    <span className="text-[11px] text-slate-400">{fmtSize(r.size)} · {timeAgo(r.addedAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => openPreview(r)} className="flex-1 px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center justify-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Preview</button>
                <button onClick={() => openNewTab(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Open in new tab"><ExternalLink className="w-4 h-4" /></button>
                <button onClick={() => download(r)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Download"><Download className="w-4 h-4" /></button>
                <button onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
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
