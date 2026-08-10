"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle, FileText, Download, Sparkles, CheckCircle2, XCircle, Upload } from "lucide-react";
import { downloadExcel } from "@/lib/exportUtils";
import { getImportedReport } from "@/lib/storage";

const chip: Record<string, string> = {
  g: "text-emerald-700 bg-emerald-50 border-emerald-200",
  a: "text-amber-700 bg-amber-50 border-amber-200",
  r: "text-rose-700 bg-rose-50 border-rose-200",
  n: "text-slate-500 bg-slate-50 border-slate-200",
};
function st(label: string): "g" | "a" | "r" | "n" {
  const l = (label || "").toLowerCase();
  if (/(strong|accelerat|outperform|positive|leader|great|good|debt-free|uptrend|healthy|reasonable|improving|a\+|a-|^a$|pass)/.test(l)) return "g";
  if (/(mixed|neutral|watch|average|fair|stable|moderate|pullback|partial|^b|reasonable)/.test(l)) return "a";
  if (/(weak|negative|distribution|downtrend|expensive|poor|avoid|elevated|critical|fail|insufficient|^d|^e)/.test(l)) return "r";
  return "n";
}
function Chip({ label }: { label: any }) {
  const s = st(String(label));
  return <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${chip[s]}`}>{String(label ?? "—")}</span>;
}
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-indigo-600 text-white text-xs flex items-center justify-center">{n}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
function List({ items, tone = "slate" }: { items?: string[]; tone?: string }) {
  if (!items || items.length === 0) return <span className="text-xs text-slate-400 italic">—</span>;
  const dot = tone === "g" ? "bg-emerald-500" : tone === "r" ? "bg-rose-500" : tone === "a" ? "bg-amber-500" : "bg-indigo-400";
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dot} mt-1.5 shrink-0`} />
          {it}
        </li>
      ))}
    </ul>
  );
}

export default function ResearchNoteTab({ symbol, market }: { symbol: string; market: string }) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState<any | null>(null);
  const [imported, setImported] = useState<any | null>(null);
  React.useEffect(() => { setImported(getImportedReport(symbol)); }, [symbol]);

  // withAi=false → fast computed note (no slow LLM calls); true → add the AI narrative.
  const load = async (withAi = false) => {
    if (withAi) setAiLoading(true); else setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/research-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, market, skipAi: !withAi }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Research note failed");
      setNote(json.note);
    } catch (e: any) {
      setError(e.message || "Research note failed.");
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  };
  React.useEffect(() => {
    if (symbol) load(false); // instant computed load; AI is on-demand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const exportExcel = () => {
    if (!note) return;
    const s = note.sections;
    downloadExcel(
      `ResearchNote_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}`,
      `${note.name} — CANSLIM Research Note`,
      [
        { title: "Snapshot", rows: [["Parameter", "Value"], ...note.snapshot.map((r: any) => [r[0], r[1]])] },
        { title: "CAN SLIM", rows: [["Code", "Criterion", "Status", "Value"], ...(s.canSlim?.criteria || []).map((c: any) => [c.code, c.name, c.status, c.value])] },
        { title: "Quarterly EPS", rows: [["Quarter", "EPS", "QoQ", "YoY"], ...(s.quarterlyEps?.quarters || []).map((q: any) => [q.quarter, q.epsDisplay, q.qoq, q.yoy])] },
        { title: "Multi-Year Financials", rows: [["Year", "Revenue", "Earnings"], ...(s.multiYear?.years || []).map((y: any) => [y.year, y.revenueDisplay, y.earningsDisplay])] },
      ],
    );
  };

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="font-medium text-sm">Loading research…</p>
        <p className="text-xs text-slate-400 mt-1">momentum · evaluation · analytics</p>
      </div>
    );
  if (error)
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {error}
        </div>
        <button onClick={() => load(false)} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Retry</button>
      </div>
    );
  if (!note) return null;

  const s = note.sections;
  const ai = note.ai || {};

  // Excel-style: everything is a Metric | Value table; blank rows and any table
  // that ends up all-blank are hidden so empty data never wastes space.
  const isBlank = (v: any) => {
    const t = v == null ? "" : String(v).trim();
    return t === "" || ["—", "-", "N/A", "n/a", "na", "NaN", "null", "undefined", "Data not available", "Data Unavailable", "Data insufficient"].includes(t);
  };
  const groups: { title: string; rows: [string, any, string?][] }[] = [
    { title: "Snapshot", rows: (note.snapshot || []).map((r: any) => [r[0], r[1], r[2]] as [string, any, string?]) },
    { title: "Scorecard", rows: [
      ["Composite Rating", s.composite?.rating != null ? `${s.composite.rating} / 100` : null],
      ["Composite View", s.composite?.label],
      ["CAN SLIM Score", s.canSlim?.scorePct != null ? `${s.canSlim.scorePct} (${s.canSlim.passes}/7 pass)` : null],
      ["Price Strength", s.priceStrength?.rating],
      ["Acc/Dis Grade", s.accDis?.grade],
      ["SMR Grade", s.smr?.grade],
      ["Sector Rank", s.sectorRank?.label],
    ] },
    { title: "Technicals", rows: [
      ["Trend", s.technical?.trend],
      ["RSI (14)", s.technical?.rsi != null ? `${s.technical.rsi}${s.technical.rsiLabel ? ` (${s.technical.rsiLabel})` : ""}` : null],
      ["ADX (14)", s.technical?.adx != null ? `${s.technical.adx}${s.technical.adxLabel ? ` (${s.technical.adxLabel})` : ""}` : null],
      ["Volume", s.technical?.volumeSignal],
      ["Support", s.technical?.support?.[0]?.toFixed?.(2)],
      ["Resistance", s.technical?.resistance?.[1]?.toFixed?.(2)],
      ["Extension Risk", s.technical?.extensionRisk?.riskLevel],
      ["MTF Alignment", s.technical?.alignmentLabel],
    ] },
    { title: "Company", rows: [
      ["Sector", note.sector], ["Industry", note.industry], ["Market Cap", s.company?.marketCap], ["Beta", s.company?.beta],
    ] },
    { title: "Quality (SMR)", rows: [
      ["Sales Growth", s.smr?.metrics?.salesGrowth], ["Operating Margin", s.smr?.metrics?.operatingMargin],
      ["Net Margin", s.smr?.metrics?.netMargin], ["ROE", s.smr?.metrics?.roe], ["Debt / Equity", s.qualityRatios?.metrics?.debtEquity],
    ] },
    { title: "Ownership", rows: [
      ["Institutions %", s.ownership?.institutionsPercent], ["Insiders %", s.ownership?.insidersPercent],
      ["Institutions Count", s.ownership?.institutionsCount], ["Trend", s.ownership?.label],
    ] },
  ].map((g) => ({ ...g, rows: g.rows.filter((r: [string, any, string?]) => !isBlank(r[1])) })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" /> {note.name}
            <span className="text-sm font-medium text-slate-400">({note.symbol})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            CANSLIM Research Note · {note.sector} · {new Date(note.generatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} disabled={aiLoading} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {note.ai ? "Refresh AI note" : "Generate AI note"}
            <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID</span>
          </button>
          <button onClick={exportExcel} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {note.disclaimer}
      </div>

      {/* Enriched: imported third-party report exists for this stock */}
      {imported && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-black text-violet-700 flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Imported report linked to this stock
            </div>
            <Link href="/import" className="text-[11px] font-bold text-violet-600 hover:underline">Re-import / update</Link>
          </div>
          <div className="text-[11px] text-slate-500 mb-2">
            {imported.source}{imported.asOf ? ` · ${imported.asOf}` : ""} · imported {new Date(imported.savedAt).toLocaleDateString()}
          </div>
          <div className="flex flex-wrap gap-2">
            {(imported.imported?.ratings || []).slice(0, 6).map((r: any, i: number) => (
              <span key={i} className="text-[11px] bg-white border border-violet-200 rounded-lg px-2 py-1">
                <span className="text-slate-400">{typeof r.name === "string" ? r.name : ""}: </span>
                <b className="text-slate-700">{typeof r.value === "string" || typeof r.value === "number" ? r.value : ""}</b>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 italic">Third-party data shown alongside our computed analysis. Verify against original report.</p>
        </div>
      )}

      {/* Excel-style metric tables — one value per row, blanks hidden */}
      <div className="grid md:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
              <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">{g.title}</h3>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {g.rows.map(([label, value, status], i) => {
                  const dot = status === "g" ? "bg-emerald-500" : status === "a" ? "bg-amber-500" : status === "r" ? "bg-rose-500" : null;
                  return (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2 text-slate-500 font-medium">{label}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-800 tabular-nums">
                        <span className="inline-flex items-center gap-2 justify-end">
                          {String(value)}
                          {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* CAN SLIM checklist */}
      {(s.canSlim?.criteria || []).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-500">CAN SLIM checklist</h3>
            <span className="text-[11px] font-bold text-slate-500">{s.canSlim.passes}/7 pass · {s.canSlim.summaryLabel}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-bold text-slate-400 uppercase bg-slate-50/60 border-b border-slate-100">
                  <th className="text-left px-4 py-2 w-10">#</th><th className="text-left px-3 py-2">Criterion</th><th className="text-left px-3 py-2">Actual value</th><th className="text-right px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {s.canSlim.criteria.map((c: any) => {
                  const st = c.status;
                  const cls = st === "Pass" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : st === "Fail" ? "text-rose-700 bg-rose-50 border-rose-200" : st === "Watch" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-400 bg-slate-50 border-slate-200";
                  return (
                    <tr key={c.code} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2"><span className="w-6 h-6 rounded bg-slate-100 text-slate-700 font-black text-[12px] flex items-center justify-center">{c.code}</span></td>
                      <td className="px-3 py-2 font-bold text-slate-800">{c.name}</td>
                      <td className="px-3 py-2 text-slate-600">{isBlank(c.value) ? "—" : c.value}</td>
                      <td className="px-4 py-2 text-right"><span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${cls}`}>{st}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quarterly + multi-year financials */}
      <div className="grid md:grid-cols-2 gap-4">
        {(s.quarterlyEps?.available || s.quarterlySales?.available) ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
              <h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">Quarterly growth</h3>
            </div>
            <div className="flex flex-wrap gap-4 p-4">
              <QTable title="EPS" section={s.quarterlyEps} vkey="epsDisplay" />
              <QTable title="Sales" section={s.quarterlySales} vkey="revenueDisplay" />
            </div>
          </div>
        ) : null}
        {s.multiYear?.available && (s.multiYear.years || []).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200 flex items-center gap-2"><span className="w-1.5 h-4 rounded-full bg-indigo-500" /><h3 className="text-[12px] font-black uppercase tracking-wide text-slate-600">Multi-year financials</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] font-bold text-slate-400 uppercase bg-slate-50/60 border-b border-slate-100"><th className="text-left px-4 py-2">Year</th><th className="text-right px-3 py-2">Revenue</th><th className="text-right px-4 py-2">Earnings</th></tr></thead>
                <tbody>
                  {s.multiYear.years.map((y: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-slate-600">{y.year}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{y.revenueDisplay}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-800 tabular-nums">{y.earningsDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* AI note — only when generated */}
      {note.ai && !note.ai.error && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-indigo-700 flex items-center gap-2 mb-2"><FileText className="w-4 h-4" /> AI note</h3>
          {ai.bottomLine?.investabilityView && <p className="text-sm text-slate-700 font-medium mb-3">{ai.bottomLine.investabilityView}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <ListBlock title="Positives" items={ai.keyPositives || ai.positives} tone="emerald" />
            <ListBlock title="Red flags" items={ai.redFlags || ai.keyRisks} tone="rose" />
            <ListBlock title="What to track" items={ai.whatToTrackNext} tone="sky" />
            <ListBlock title="Data gaps" items={ai.dataLimitations} tone="amber" />
          </div>
          {ai.finalView && <div className="mt-3 bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-xs font-semibold text-indigo-800">{ai.finalView}</div>}
        </div>
      )}
      {note.ai?.error && <div className="text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{note.ai.error}</div>}

      <div className="text-center text-[10px] text-slate-400 italic pb-4">{note.disclaimer}</div>
    </div>
  );
}

function ObjTable({ rows, cols }: { rows?: any[]; cols: [string, string][] }) {
  if (!rows || rows.length === 0) return <span className="text-xs text-slate-400 italic">Data not available.</span>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-400 text-left">
            {cols.map(([, label]) => <th key={label} className="py-1 font-bold">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-50 align-top">
              {cols.map(([key], ci) => (
                <td key={key} className={`py-1.5 pr-3 ${ci === 0 ? "font-bold text-slate-700" : "text-slate-600"}`}>{String(r?.[key] ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QTable({ title, section, vkey }: { title: string; section: any; vkey: string }) {
  if (!section?.available || !(section.quarters?.length)) return null;
  return (
    <div className="flex-1 min-w-[220px] rounded-xl border border-slate-100 overflow-hidden">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-600 bg-slate-50 border-b border-slate-100 px-3 py-1.5">{title}</div>
      <table className="w-full text-[11px]">
        <thead><tr className="text-slate-400 text-left border-b border-slate-100"><th className="py-1.5 px-3">Qtr</th><th className="py-1.5 px-2 text-right">{title}</th><th className="py-1.5 px-2 text-right">QoQ</th><th className="py-1.5 px-3 text-right">YoY</th></tr></thead>
        <tbody>
          {section.quarters.map((q: any, i: number) => (
            <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/60">
              <td className="py-1.5 px-3 text-slate-600">{q.quarter}</td>
              <td className="py-1.5 px-2 text-right font-bold text-slate-800 tabular-nums">{q[vkey]}</td>
              <td className={`py-1.5 px-2 text-right font-bold tabular-nums ${String(q.qoq).startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{q.qoq}</td>
              <td className={`py-1.5 px-3 text-right font-bold tabular-nums ${q.yoy === "Data Unavailable" ? "text-slate-400" : String(q.yoy).startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{q.yoy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return (
    <div className={`rounded-xl p-3 border ${tones[tone] || tones.sky}`}>
      <div className="text-[10px] font-black uppercase tracking-wide mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => <li key={i} className="text-xs leading-snug">• {it}</li>)}
      </ul>
    </div>
  );
}
