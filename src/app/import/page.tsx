"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { Upload, FileText, Loader2, AlertTriangle, CheckCircle2, XCircle, Sparkles, GitCompare, Clock, TrendingUp, TrendingDown, StickyNote, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { saveNote, saveImportedReport, saveAlert, saveMomentumWatch, addNotification, logAiUsageDetailed } from "@/lib/storage";
import { Zap, Bell, Send } from "lucide-react";

// Safe display: AI sometimes returns an object where a string was expected.
// Never let a raw object reach React (it throws "Objects are not valid as a child").
function S(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(S).join(", ");
  if (typeof v === "object") {
    if ("metric" in v) return `${v.metric ?? ""}: imported ${v.imported ?? "?"} vs ours ${v.ours ?? "?"}${v.verdict ? " — " + v.verdict : ""}`;
    return Object.values(v).map((x) => S(x)).filter(Boolean).join(" · ");
  }
  return String(v);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-black text-slate-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function ImportPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [rawReport, setRawReport] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(f);
  };

  const analyze = async () => {
    if (text.trim().length < 80) { setError("Paste a report first (at least a few lines)."); return; }
    setRawReport(text);
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/import-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportText: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setResult(json.result);
      logAiUsageDetailed("Import Report", json.usage ?? { tokens: json.aiTokens });
      setChat([]);
      setTracked(false);
      // Permanently enrich the stock with this imported report.
      const r = json.result;
      const symbol = r?.resolvedSymbol || r?.imported?.symbolGuess;
      if (symbol) {
        saveImportedReport({
          symbol,
          company: r.imported?.company || symbol,
          source: r.imported?.source || "Imported report",
          asOf: r.imported?.asOf || "",
          imported: r.imported,
          ourData: r.ourData,
          freshness: r.freshness,
          comparison: r.comparison,
        });
      }
    } catch (e: any) {
      setError(e.message || "Import failed.");
    } finally {
      setLoading(false);
    }
  };

  const im = result?.imported;
  const ours = result?.ourData;
  const cmp = result?.comparison;
  const fr = result?.freshness;
  const sym = result?.resolvedSymbol || im?.symbolGuess || "";

  const saveToNotes = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`📄 Imported report (${im?.source || "third-party"}${fr?.asOf ? ", " + S(fr.asOf) : ""})`);
    if (cmp?.stillValid) lines.push(`Still valid: ${S(cmp.stillValid)} — ${S(cmp.validityReason)}`);
    if (im?.verdict) lines.push(`Report verdict: ${S(im.verdict)}`);
    if (cmp?.whatChangedSinceReport?.length) lines.push(`Changed since: ${cmp.whatChangedSinceReport.map(S).join("; ")}`);
    if (im?.trackNext?.length) lines.push(`Track next: ${im.trackNext.map(S).join("; ")}`);
    saveNote({ symbol: sym || "GENERAL", stockName: S(im?.company) || sym || "GENERAL", type: "text", text: lines.join("\n") });
    setSavedMsg("Saved to Master Notes ✓");
    setTimeout(() => setSavedMsg(""), 2500);
  };

  const trackThesis = () => {
    if (!sym) return;
    // Save the report's track-next items as alerts/notifications + start a 15-day watch.
    (im?.trackNext || []).slice(0, 6).forEach((t: any) => {
      saveAlert({ symbol: sym, condition: "research_watch", value: 0, description: `[Report] ${S(t)}` });
    });
    if (ours) {
      saveMomentumWatch({
        symbol: sym, stockName: S(im?.company) || sym, startDate: new Date().toISOString(),
        startPrice: ours.price, momentumScore: null, trend: ours.momentumView,
        rsi: null, adx: null, sectorStrength: ours.priceStrength, newsSentiment: "Neutral",
      });
    }
    addNotification({ message: `Tracking thesis for ${sym} from imported report (${(im?.trackNext || []).length} triggers + 15-day watch).`, type: "info" });
    setTracked(true);
  };

  const askChat = async (q?: string) => {
    const question = (q ?? chatInput).trim();
    if (!question || chatLoading) return;
    setChatInput("");
    setChat((c) => [...c, { role: "user", content: question }]);
    setChatLoading(true);
    try {
      const ctx = JSON.stringify({ report: im, ourLiveData: ours, freshness: fr, crossCheck: cmp });
      const prompt = `You are a research assistant. Answer the user's question about a stock using the imported third-party REPORT and our LIVE computed data below. Research language only. NO buy/sell advice. NO prediction. If they disagree, say so. Be concise.\n\nDATA: ${ctx}\n\nQuestion: ${question}`;
      const res = await fetch("/api/gemini/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const j = await res.json();
      setChat((c) => [...c, { role: "ai", content: j.text || j.error || "No answer." }]);
    } catch {
      setChat((c) => [...c, { role: "ai", content: "Couldn't answer right now." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const validityColor = (v: string) => {
    const l = (v || "").toLowerCase();
    if (l.startsWith("yes")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (l.startsWith("partial")) return "bg-amber-50 text-amber-700 border-amber-200";
    if (l.startsWith("no")) return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  return (
    <div className="max-w-screen-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Upload className="w-8 h-8 text-indigo-600" /> Import Report
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          Paste or upload your own MarketSmith / Market Mojo / broker report. AI extracts the data and cross-checks it against our live computed data.
        </p>
      </div>

      {!result && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the full report here (HTML or text)… e.g. your MarketSmith CANSLIM note."
            rows={10}
            className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-200 outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept=".html,.htm,.txt" onChange={onFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
                <FileText className="w-3.5 h-3.5" /> Upload .html / .txt
              </button>
              {text && <button onClick={() => setText("")} className="text-xs text-slate-400 hover:text-rose-600 font-bold">Clear</button>}
            </div>
            <button onClick={analyze} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Analyze Report
              <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID</span>
            </button>
          </div>
          {error && <div className="mt-2 text-xs text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{error}</div>}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm font-medium">Extracting data &amp; cross-checking with live data…</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">
              {S(im?.company) || "Imported Report"} {im?.symbolGuess ? <span className="text-sm text-slate-400">({S(im.symbolGuess)})</span> : null}
            </h2>
            <div className="flex items-center gap-3">
              {rawReport && (
                <button onClick={() => setShowHtml(true)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
                  <FileText className="w-3.5 h-3.5" /> View Original Report
                </button>
              )}
              <button onClick={() => { setResult(null); }} className="text-xs font-bold text-indigo-600 hover:underline">Import another</button>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {result.disclaimer}
          </div>

          {/* ===== REPORT HEALTH CHECK (the real value) ===== */}
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
            <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" /> Report Health Check
            </h3>

            {/* Freshness strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Report Age</div>
                <div className="text-lg font-black text-slate-800">{fr?.daysOld != null ? `${fr.daysOld}d old` : "—"}</div>
                <div className="text-[10px] text-slate-400">{fr?.asOf ? S(fr.asOf) : "date n/a"}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Price Then</div>
                <div className="text-lg font-black text-slate-800">{fr?.reportPrice ?? "—"}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Price Now</div>
                <div className="text-lg font-black text-slate-800">{fr?.livePrice ?? "—"}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Move Since</div>
                <div className={`text-lg font-black flex items-center gap-1 ${fr?.priceChangePct == null ? "text-slate-400" : fr.priceChangePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {fr?.priceChangePct != null && (fr.priceChangePct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />)}
                  {fr?.priceChangePct != null ? `${fr.priceChangePct >= 0 ? "+" : ""}${fr.priceChangePct.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>

            {/* Still valid verdict */}
            {cmp?.stillValid && (
              <div className={`rounded-xl border p-3 mb-2 ${validityColor(S(cmp.stillValid))}`}>
                <div className="text-[10px] font-black uppercase tracking-wide mb-0.5">Is this report still valid?</div>
                <div className="text-base font-black">{S(cmp.stillValid)}</div>
                <div className="text-xs mt-1 text-slate-600">{S(cmp.validityReason)}</div>
              </div>
            )}
            {cmp?.whatChangedSinceReport?.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] font-black uppercase text-slate-400 mb-1">What changed since the report</div>
                <ul className="space-y-1 text-xs text-slate-600">{cmp.whatChangedSinceReport.map((c: any, i: number) => <li key={i}>• {S(c)}</li>)}</ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
              <button onClick={saveToNotes} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700">
                <StickyNote className="w-3.5 h-3.5" /> Save Key Points to Notes
              </button>
              {sym && (
                <button onClick={trackThesis} disabled={tracked} className="px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-amber-50 disabled:opacity-60">
                  <Bell className="w-3.5 h-3.5" /> {tracked ? "Thesis Tracked ✓" : "Track this Thesis"}
                </button>
              )}
              {sym && (
                <Link href={`/analyze?symbol=${encodeURIComponent(sym)}`} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
                  <ExternalLink className="w-3.5 h-3.5" /> Open Live Analysis
                </Link>
              )}
              {savedMsg && <span className="text-xs font-bold text-emerald-600 self-center">{savedMsg}</span>}
            </div>
          </div>

          {/* CROSS-CHECK (validation) */}
          {ours ? (
            <Card title="Cross-Check — Imported Report vs Our Live Data">
              {cmp?.combinedSummary && <p className="text-sm text-slate-700 mb-3">{S(cmp.combinedSummary)}</p>}
              {cmp?.dataValidation?.length > 0 && (
                <div className="overflow-x-auto mb-3">
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-slate-400 text-left"><th className="py-1">Metric</th><th className="py-1">Imported</th><th className="py-1">Our Computed</th><th className="py-1">Read</th></tr></thead>
                    <tbody>
                      {cmp.dataValidation.map((d: any, i: number) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="py-1.5 font-bold text-slate-700">{S(d.metric)}</td>
                          <td className="py-1.5 text-slate-600">{S(d.imported)}</td>
                          <td className="py-1.5 text-slate-600">{S(d.ours)}</td>
                          <td className="py-1.5">{S(d.verdict)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                {cmp?.agreements?.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <div className="text-[10px] font-black uppercase text-emerald-700 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Agreements (validated)</div>
                    <ul className="space-y-1 text-xs text-slate-600">{cmp.agreements.map((a: any, i: number) => <li key={i}>• {S(a)}</li>)}</ul>
                  </div>
                )}
                {cmp?.discrepancies?.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                    <div className="text-[10px] font-black uppercase text-rose-700 mb-1 flex items-center gap-1"><XCircle className="w-3 h-3" />Discrepancies (investigate)</div>
                    <ul className="space-y-1 text-xs text-slate-600">{cmp.discrepancies.map((a: any, i: number) => <li key={i}>• {S(a)}</li>)}</ul>
                  </div>
                )}
              </div>
              {cmp?.finalView && <div className="mt-3 bg-indigo-50 rounded-xl p-3 text-xs font-semibold text-indigo-800">{S(cmp.finalView)}</div>}
            </Card>
          ) : (
            <Card title="Our Live Data Cross-Check">
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <GitCompare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                Could not resolve the stock symbol from the report to cross-check with live data. The extracted report data is shown below.
              </div>
            </Card>
          )}

          {/* ===== WHAT OUR ANALYSIS ADDS (not in the report) ===== */}
          {ours?.uniqueInsights && (
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5">
              <h3 className="text-sm font-black text-slate-800 mb-1 flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600" /> What Our Analysis Adds
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">Insights the imported report does NOT contain — computed from live data.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {ours.uniqueInsights.backtest && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Backtest Edge (history)</div>
                    <div className="text-xs text-slate-700"><b>{S(ours.uniqueInsights.backtest.signal)}</b></div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {ours.uniqueInsights.backtest.occurrences}× historically → 20d avg <b className={ours.uniqueInsights.backtest.avg20 >= 0 ? "text-emerald-600" : "text-rose-600"}>{ours.uniqueInsights.backtest.avg20 != null ? (ours.uniqueInsights.backtest.avg20 >= 0 ? "+" : "") + ours.uniqueInsights.backtest.avg20 + "%" : "—"}</b>, win {ours.uniqueInsights.backtest.win20}% · <span className="font-bold">{S(ours.uniqueInsights.backtest.edge)}</span>
                    </div>
                  </div>
                )}
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Seasonality</div>
                  <div className="text-[11px] text-slate-600">Best month: <b className="text-emerald-600">{S(ours.uniqueInsights.seasonalityBest) || "—"}</b></div>
                  <div className="text-[11px] text-slate-600">Worst month: <b className="text-rose-600">{S(ours.uniqueInsights.seasonalityWorst) || "—"}</b></div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Alpha / Beta (regression)</div>
                  <div className="text-[11px] text-slate-600">Beta <b>{S(ours.uniqueInsights.beta)}</b> · Alpha <b>{S(ours.uniqueInsights.alpha)}</b> (vs index)</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Live Momentum</div>
                  <div className="text-[11px] text-slate-600">{S(ours.momentumView)} · Price strength {S(ours.priceStrength)}</div>
                </div>
              </div>
            </div>
          )}

          {/* ===== CHAT WITH THE REPORT ===== */}
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
            <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" /> Ask About This Report
            </h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {["Is this report still valid?", "Biggest risk now?", "Where does our data disagree?", "What changed since the report?"].map((q) => (
                <button key={q} onClick={() => askChat(q)} className="text-[10px] font-semibold px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-indigo-50">{q}</button>
              ))}
            </div>
            {chat.length > 0 && (
              <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
                {chat.map((m, i) => (
                  <div key={i} className={`text-xs rounded-xl px-3 py-2 ${m.role === "user" ? "bg-indigo-600 text-white ml-auto max-w-[85%]" : "bg-slate-100 text-slate-700 max-w-[90%]"}`}>
                    {S(m.content)}
                  </div>
                ))}
                {chatLoading && <div className="text-xs text-slate-400">Thinking…</div>}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); askChat(); }} className="relative">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask anything about this report + live data…" className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 outline-none" />
              <button type="submit" disabled={chatLoading || !chatInput.trim()} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Send className="w-4 h-4" /></button>
            </form>
          </div>

          {/* EXTRACTED DATA (secondary — collapsible) */}
          <button onClick={() => setShowRaw((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 px-1">
            {showRaw ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {showRaw ? "Hide" : "Show"} raw extracted data from the report
          </button>
          {showRaw && (<>
          <Card title="Extracted Ratings">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {(im?.ratings || []).map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1.5 font-medium text-slate-500">{S(r.name)}</td>
                      <td className="py-1.5 font-bold text-slate-800">{S(r.value)}</td>
                      <td className="py-1.5 text-right text-slate-500">{S(r.read)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {im?.valuation && <p className="mt-2 text-[11px] text-slate-500"><b>Valuation:</b> {S(im.valuation)}</p>}
          </Card>

          {im?.quarterly?.length > 0 && (
            <Card title="Quarterly Growth (from report)">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-slate-400 text-left"><th className="py-1">Quarter</th><th className="py-1 text-right">EPS</th><th className="py-1 text-right">EPS %</th><th className="py-1 text-right">Sales</th><th className="py-1 text-right">Sales %</th></tr></thead>
                  <tbody>
                    {im.quarterly.map((q: any, i: number) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="py-1 font-medium text-slate-600">{S(q.quarter)}</td>
                        <td className="py-1 text-right">{S(q.eps)}</td>
                        <td className="py-1 text-right font-bold">{S(q.epsChg)}</td>
                        <td className="py-1 text-right">{S(q.sales)}</td>
                        <td className="py-1 text-right font-bold">{S(q.salesChg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {im?.positives?.length > 0 && (
              <Card title="Positives (from report)">
                <ul className="space-y-1 text-xs text-slate-600">{im.positives.map((p: any, i: number) => <li key={i} className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />{S(p)}</li>)}</ul>
              </Card>
            )}
            {im?.redFlags?.length > 0 && (
              <Card title="Red Flags (from report)">
                <ul className="space-y-1 text-xs text-slate-600">{im.redFlags.map((p: any, i: number) => <li key={i} className="flex gap-2"><XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />{S(p)}</li>)}</ul>
              </Card>
            )}
          </div>

          {im?.verdict && (
            <Card title="Report Verdict (as-stated)">
              <p className="text-sm text-slate-700">{S(im.verdict)}</p>
              {im?.trackNext?.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">{im.trackNext.map((t: any, i: number) => <li key={i}>• {S(t)}</li>)}</ul>
              )}
            </Card>
          )}
          </>)}
        </div>
      )}

      {/* Original report viewer (renders the pasted HTML) */}
      {showHtml && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowHtml(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> Original Imported Report
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([rawReport], { type: "text/html" });
                    window.open(URL.createObjectURL(blob), "_blank");
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-100"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                </button>
                <button onClick={() => setShowHtml(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200">Close</button>
              </div>
            </div>
            <iframe
              srcDoc={rawReport}
              title="Original imported report"
              sandbox="allow-same-origin"
              className="flex-1 w-full bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
