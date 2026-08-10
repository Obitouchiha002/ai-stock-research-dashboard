"use client";

import React, { useState } from "react";
import {
  Award,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Gauge,
  TrendingUp,
  ShieldCheck,
  Activity,
  Sparkles,
  Download,
  Loader2,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts";
import { downloadExcel } from "@/lib/exportUtils";

const INSUFFICIENT = "Data insufficient";

const statusMeta: Record<string, { color: string; Icon: any }> = {
  Pass: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  Watch: { color: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertTriangle },
  Fail: { color: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
  "Data insufficient": { color: "bg-slate-50 text-slate-400 border-slate-200", Icon: MinusCircle },
};

function gradeColor(g: string): string {
  if (g === "A" || g === "A+") return "text-emerald-600";
  if (g === "B") return "text-sky-600";
  if (g === "C") return "text-amber-600";
  if (g === "D" || g === "E") return "text-rose-600";
  return "text-slate-400";
}

function Card({ title, icon, children, badge }: { title: string; icon: React.ReactNode; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">{icon}</span>
          {title}
        </h3>
        {badge && <span className="text-xs font-bold text-slate-500">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  const v = value === undefined || value === null || value === "" ? INSUFFICIENT : String(value);
  const muted = v === INSUFFICIENT || v === "Data Unavailable";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={`text-xs font-bold ${muted ? "text-slate-400 italic" : "text-slate-800"}`}>{v}</span>
    </div>
  );
}

export default function EvaluationTab({ symbol, market }: { symbol: string; market: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ev, setEv] = useState<any | null>(null);
  const [ai, setAi] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    setAi(null);
    try {
      const res = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, market }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Evaluation failed");
      setEv(json.evaluation);
    } catch (e: any) {
      setError(e.message || "Evaluation failed.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (symbol) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const runAi = async () => {
    if (!ev) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEval: true, evaluation: ev }),
      });
      const json = await res.json();
      setAi(json.aiEval);
    } catch (e: any) {
      setAi({ error: e.message || "AI evaluation failed." });
    } finally {
      setAiLoading(false);
    }
  };

  const exportData = () => {
    if (!ev) return;
    const blob = new Blob([JSON.stringify({ ...ev, aiEvaluation: ai || "Not generated" }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Evaluation_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (!ev) return;
    const h = ev.headline || {};
    const sections = [
      {
        title: "Evaluation Summary",
        rows: [
          ["Metric", "Value"],
          ["Composite Rating", `${h.compositeRating ?? "—"} / 100 (${h.compositeLabel})`],
          ["CAN SLIM Score", `${h.canSlimScore ?? "—"} (${h.canSlimPasses} pass)`],
          ["Acc/Dis Grade", h.accDisGrade],
          ["SMR Grade", h.smrGrade],
          ["Beta", h.beta],
          ["Alpha", h.alpha],
        ],
      },
      {
        title: "CAN SLIM Checklist",
        rows: [["Code", "Criterion", "Status", "Value"], ...(ev.canSlim?.criteria || []).map((c: any) => [c.code, c.name, c.status, c.value])],
      },
      {
        title: "Composite Breakdown",
        rows: [["Component", "Weight", "Points", "Note"], ...(ev.composite?.breakdown || []).map((b: any) => [b.component, b.weight, b.points, b.note])],
      },
      {
        title: "Quality (SMR)",
        rows: [["Metric", "Value"], ...Object.entries(ev.smr?.metrics || {}).map(([k, v]) => [k, v as string])],
      },
      {
        title: "Multi-Year Fundamentals",
        rows: [["Year", "Revenue", "Earnings"], ...(ev.multiYear?.years || []).map((y: any) => [y.year, y.revenueDisplay, y.earningsDisplay])],
      },
    ];
    downloadExcel(
      `Evaluation_${(symbol || "stock").replace(/\W/g, "_")}_${new Date().toISOString().split("T")[0]}`,
      `${ev.name || symbol} — Stock Evaluation`,
      sections,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="font-medium text-sm">Building stock evaluation…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          {error}
        </div>
        <button onClick={load} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Retry</button>
      </div>
    );
  }
  if (!ev) return null;

  const h = ev.headline;
  const yearData = (ev.multiYear?.years || []).map((y: any) => ({
    name: String(y.year).slice(-4),
    revenue: y.revenue,
    earnings: y.earnings,
  }));

  // Decision drivers derived from the CAN SLIM checks (no AI needed).
  const crit: any[] = ev.canSlim?.criteria || [];
  const strengths = crit.filter((c) => c.status === "Pass");
  const watchouts = crit.filter((c) => c.status === "Watch" || c.status === "Fail");
  const missing = crit.filter((c) => c.status === "Data insufficient" || c.status === "No data");
  const rating: number | null = h.compositeRating ?? null;
  const headline = rating == null ? "Evaluation snapshot"
    : rating >= 80 ? "Strong profile"
    : rating >= 60 ? "Solid, with gaps to confirm"
    : rating >= 40 ? "Mixed signals" : "Weak profile";
  const subcopy = `${ev.canSlim?.passes ?? 0} of ${crit.length} CAN SLIM checks pass; ${(ev.canSlim?.watches ?? 0) + (ev.canSlim?.fails ?? 0)} to confirm, ${ev.canSlim?.insufficient ?? missing.length} without data.`;
  const ringColor = rating == null ? "#94a3b8" : rating >= 70 ? "#079455" : rating >= 45 ? "#b54708" : "#d92d20";
  const ringPct = rating != null ? Math.max(0, Math.min(100, rating)) : 0;
  const C = 2 * Math.PI * 34;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">AI stock evaluation</p>
          <h2 className="text-xl font-black text-slate-900 truncate">{symbol} evaluation snapshot</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={runAi} disabled={aiLoading} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI Evaluation
            <span className="text-[9px] font-black text-amber-200 bg-amber-500/30 px-1.5 py-0.5 rounded">PAID</span>
          </button>
          <button onClick={exportData} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button onClick={exportExcel} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {ev.disclaimer}
      </div>

      {/* Verdict panel — score ring + drivers */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 grid lg:grid-cols-[1.05fr_1fr] gap-5">
        <div>
          <div className="flex items-center gap-4">
            <div className="relative w-[92px] h-[92px] shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#eef2f7" strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none" stroke={ringColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ringPct / 100)} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black text-slate-900">{rating ?? "—"}</span>
              </div>
            </div>
            <div className="min-w-0">
              <span className="inline-block text-[11px] font-black uppercase tracking-wide text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{h.compositeLabel}</span>
              <h3 className="text-lg font-black text-slate-900 leading-snug mt-1">{headline}</h3>
              <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">{subcopy}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { label: "CAN SLIM", value: h.canSlimScore ?? "—", sub: `${h.canSlimPasses} pass` },
              { label: "Data coverage", value: `${ev.composite?.coverage ?? "—"}%`, sub: "of signals" },
              { label: "Composite", value: `${rating ?? "—"}`, sub: "/ 100" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{m.label}</div>
                <div className="text-[15px] font-black text-slate-900">{m.value} <span className="text-[11px] font-bold text-slate-400">{m.sub}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2 content-start">
          {[
            { title: "Strengths", items: strengths, tone: "emerald", tag: `${strengths.length} strong` },
            { title: "Watchouts", items: watchouts, tone: "amber", tag: `${watchouts.length} watch` },
            { title: "Missing signals", items: missing, tone: "slate", tag: `${missing.length} gaps` },
          ].filter((d) => d.items.length > 0).map((d) => (
            <div key={d.title} className={`rounded-xl border p-3 ${d.tone === "emerald" ? "border-emerald-100 bg-emerald-50/40" : d.tone === "amber" ? "border-amber-100 bg-amber-50/40" : "border-slate-100 bg-slate-50/60"}`}>
              <h4 className="text-xs font-black text-slate-800 flex items-center gap-2 mb-1.5">
                {d.title}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${d.tone === "emerald" ? "text-emerald-700 bg-emerald-100" : d.tone === "amber" ? "text-amber-700 bg-amber-100" : "text-slate-500 bg-slate-200"}`}>{d.tag}</span>
              </h4>
              <ul className="space-y-1">
                {d.items.slice(0, 3).map((c: any) => (
                  <li key={c.code} className="text-[12px] text-slate-600 leading-snug">• {c.detail || c.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* AI evaluation result */}
      {ai && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
          <h3 className="text-sm font-black text-indigo-700 flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" /> AI Stock Evaluation
          </h3>
          {ai.error ? (
            <div className="text-xs text-slate-500">{ai.error}</div>
          ) : (
            <div className="space-y-3 text-sm text-slate-700">
              {ai.evaluationSummary && <p className="font-medium">{ai.evaluationSummary}</p>}
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["CAN SLIM", ai.canSlimView],
                  ["Earnings", ai.earningsView],
                  ["Price Strength", ai.priceStrengthView],
                  ["Demand", ai.demandView],
                  ["Group & Market", ai.groupMarketView],
                  ["Quality", ai.qualityView],
                ].filter(([, v]) => v).map(([t, v]) => (
                  <div key={t as string} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">{t}</div>
                    <div className="text-xs leading-relaxed">{v as string}</div>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <ListBlock title="Key Strengths" items={ai.keyStrengths} tone="emerald" />
                <ListBlock title="Key Weaknesses" items={ai.keyWeaknesses} tone="rose" />
                <ListBlock title="Data Limitations" items={ai.dataLimitations} tone="amber" />
                <ListBlock title="What To Track Next" items={ai.whatToTrackNext} tone="sky" />
              </div>
              {ai.finalEvaluationView && (
                <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 text-xs font-semibold text-indigo-800">{ai.finalEvaluationView}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Checklist + Score breakdown */}
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
        {/* CAN SLIM checklist as a scan-friendly table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Checklist</p>
              <h3 className="text-base font-black text-slate-800">CAN SLIM factors</h3>
            </div>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">{ev.canSlim.summaryLabel}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-2 w-10">Item</th>
                  <th className="text-left px-3 py-2">Factor</th>
                  <th className="text-left px-3 py-2">Actual value</th>
                  <th className="text-right px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {ev.canSlim.criteria.map((c: any) => {
                  const meta = statusMeta[c.status] || statusMeta["Data insufficient"];
                  return (
                    <tr key={c.code} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5"><span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-black text-[13px] flex items-center justify-center">{c.code}</span></td>
                      <td className="px-3 py-2.5 font-bold text-slate-800">{c.name}</td>
                      <td className="px-3 py-2.5 text-[13px] text-slate-600">{c.detail}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${meta.color}`}>
                          <meta.Icon className="w-3 h-3" /> {c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11px] text-slate-400 border-t border-slate-100">
            {ev.canSlim.passes} pass · {ev.canSlim.watches} watch · {ev.canSlim.fails} fail · {ev.canSlim.insufficient} no data. CAN SLIM® is William O&apos;Neil&apos;s growth framework; each row shows one computed value.
          </p>
        </div>

        {/* Score breakdown as bars */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Composite</p>
              <h3 className="text-base font-black text-slate-800">Score breakdown</h3>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">{ev.composite.rating ?? "—"} / 100</span>
          </div>
          <div className="p-5 space-y-3.5">
            {ev.composite.breakdown.map((b: any) => {
              const pts = parseFloat(String(b.points).replace(/[^\d.-]/g, ""));
              const wt = parseFloat(String(b.weight).replace(/[^\d.-]/g, ""));
              const pct = b.available && Number.isFinite(pts) && wt ? Math.max(0, Math.min(100, (pts / wt) * 100)) : 0;
              return (
                <div key={b.component}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="font-semibold text-slate-600">{b.component}</span>
                    <span className={`font-bold ${b.available ? "text-slate-800" : "text-slate-400 italic"}`}>{b.available ? b.points : "No data"}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${!b.available ? "bg-amber-300" : pct >= 85 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-[12px] mb-1"><span className="font-semibold text-slate-600">Data coverage</span><strong className="text-indigo-600">{ev.composite.coverage}%</strong></div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${ev.composite.coverage || 0}%` }} /></div>
            </div>
            <p className="text-[10px] text-slate-400 italic">{ev.composite.note}</p>
          </div>
        </div>
      </div>

      {/* Quality + Fundamentals */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* SMR + Acc/Dis */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Quality &amp; demand</p>
              <h3 className="text-base font-black text-slate-800">SMR &amp; accumulation</h3>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-xl bg-slate-50 border border-slate-100 py-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">SMR grade</div>
                <div className={`text-2xl font-black ${gradeColor(ev.smr.grade)}`}>{ev.smr.grade}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 py-2.5 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Acc/Dis grade</div>
                <div className={`text-2xl font-black ${gradeColor(ev.accDis.grade)}`}>{ev.accDis.grade}</div>
              </div>
            </div>
            <Stat label="Sales Growth" value={ev.smr.metrics.salesGrowth} />
            <Stat label="Operating Margin" value={ev.smr.metrics.operatingMargin} />
            <Stat label="Net Margin" value={ev.smr.metrics.netMargin} />
            <Stat label="ROE" value={ev.smr.metrics.roe} />
            <Stat label="Demand Rating" value={ev.accDis.rating} />
            <p className="mt-2 text-[10px] text-slate-400 italic">{ev.smr.detail}</p>
          </div>
        </div>

        {/* Multi-year fundamentals */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Fundamentals</p>
              <h3 className="text-base font-black text-slate-800">Revenue &amp; earnings trend</h3>
            </div>
            {ev.multiYear.available && <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-lg px-2 py-1">Rev CAGR {ev.multiYear.revCagr3y != null ? ev.multiYear.revCagr3y.toFixed(1) + "%" : "n/a"}</span>}
          </div>
          <div className="p-5">
            {ev.multiYear.available && yearData.length > 0 ? (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={yearData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: any) => Number(v).toLocaleString()} />
                      <Bar dataKey="revenue" name="Revenue" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
                      <Line dataKey="earnings" name="Earnings" stroke="#6366f1" strokeWidth={2} dot />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-slate-400 text-left"><th className="py-1 font-bold">Year</th><th className="py-1 font-bold text-right">Revenue</th><th className="py-1 font-bold text-right">Earnings</th></tr></thead>
                    <tbody>
                      {ev.multiYear.years.map((y: any, i: number) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="py-1 font-medium text-slate-600">{y.year}</td>
                          <td className="py-1 text-right font-bold text-slate-800">{y.revenueDisplay}</td>
                          <td className="py-1 text-right font-bold text-slate-800">{y.earningsDisplay}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ev.multiYear.note && <div className="mt-2 text-[10px] text-slate-400 italic">{ev.multiYear.note}</div>}
              </>
            ) : (
              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                {ev.multiYear.note}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced — Alpha / Beta (collapsible) */}
      <details className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group">
        <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Advanced</p>
            <h3 className="text-base font-black text-slate-800">Alpha &amp; beta details</h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-lg px-2 py-1">{ev.alphaBeta.indexName}</span>
        </summary>
        <div className="px-5 pb-5 pt-1 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3"><div className="text-[10px] font-bold text-slate-400 uppercase">Beta</div><div className="text-lg font-black text-slate-800">{ev.alphaBeta.beta}</div></div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3"><div className="text-[10px] font-bold text-slate-400 uppercase">Alpha</div><div className="text-lg font-black text-slate-800">{ev.alphaBeta.alpha}</div></div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">{ev.alphaBeta.detail}</p>
        </div>
      </details>
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
    <div className={`rounded-xl p-3 border ${tones[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-wide mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => <li key={i} className="text-xs leading-snug">• {it}</li>)}
      </ul>
    </div>
  );
}
