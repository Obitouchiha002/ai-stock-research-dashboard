"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  SlidersHorizontal, Play, Save, Trash2, Bookmark, Check, X, Loader2,
  Star, Briefcase, Activity, Sparkles, Plus,
} from "lucide-react";
import {
  getWatchlist, getPortfolio, saveToWatchlist, inferCategory,
  savePortfolioHolding, inferPortfolioMarket,
  getCombinations, saveCombination, deleteCombination,
  type Combination, type ScreenConditions,
} from "@/lib/storage";
import { RULE_METRICS } from "@/lib/comboEval";

const genId = () => Date.now().toString() + Math.random().toString(36).slice(2, 6);
const OP_UI = [
  { v: ">", l: ">" }, { v: ">=", l: "≥" }, { v: "<", l: "<" }, { v: "<=", l: "≤" }, { v: "=", l: "=" },
];

// The condition blocks a combination can be built from.
const COND_META: { key: keyof ScreenConditions; label: string; hint: string }[] = [
  { key: "maStack", label: "Moving-average stack", hint: "Pick the levels — e.g. Price > 10 > 20 > 50" },
  { key: "above200", label: "Above 200-DMA", hint: "Long-term uptrend" },
  { key: "golden", label: "Golden cross (50 > 200 DMA)", hint: "Trend confirmation" },
  { key: "adx", label: "Trend strength (ADX)", hint: "How strong the trend is" },
  { key: "rsiStrong", label: "RSI strength", hint: "Momentum strong" },
  { key: "nearHigh", label: "Near 52-week high", hint: "Breakout zone" },
  { key: "near52wLow", label: "Near 52-week low", hint: "Bounce / value zone" },
  { key: "atAth", label: "At all-time high", hint: "New lifetime peak" },
  { key: "atAtl", label: "At all-time low", hint: "Lifetime low" },
  { key: "nearSupport", label: "Near support", hint: "Near recent 3-month low" },
  { key: "nearResistance", label: "Near resistance", hint: "Near recent 3-month high" },
  { key: "earningsUp", label: "Earnings growth (EPS YoY +)", hint: "Quarterly EPS growing" },
  { key: "priceRule", label: "Price vs a level", hint: "Price above / below a value" },
];

// Short badge labels for the results table.
const SHORT: Record<string, string> = {
  maStack: "MA stack", above200: "Above 200", golden: "Golden", adx: "ADX", rsiStrong: "RSI",
  nearHigh: "52w high", near52wLow: "52w low", atAth: "ATH", atAtl: "ATL",
  nearSupport: "Support", nearResistance: "Resistance", earningsUp: "Earnings", priceRule: "Price", rules: "Rules",
};

// The MA-stack levels the user can chain (canonical order).
const STACK_LEVELS = [
  { v: "price", label: "Price" },
  { v: "10", label: "10" },
  { v: "20", label: "20" },
  { v: "50", label: "50" },
  { v: "200", label: "200" },
];
const stackPreview = (levels: string[]) =>
  STACK_LEVELS.filter((l) => levels.includes(l.v)).map((l) => l.label).join(" > ");

// A sensible default combo, ready to run.
const DEFAULT_COND: ScreenConditions = { maStack: true, stackLevels: ["price", "10", "20", "50", "200"], nearHigh: true, nearPct: 5, rsiStrong: true, rsiMin: 55, earningsUp: true };

export default function CombosPage() {
  const [cond, setCond] = useState<ScreenConditions>(DEFAULT_COND);
  const [name, setName] = useState("My combination");
  const [label, setLabel] = useState("RR");
  const [combos, setCombos] = useState<Combination[]>([]);

  const [useWL, setUseWL] = useState(true);
  const [usePF, setUsePF] = useState(true);
  const [customText, setCustomText] = useState("");

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [meta, setMeta] = useState<{ capped?: boolean; scanned?: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { setCombos(getCombinations()); }, []);

  const [addOpen, setAddOpen] = useState(false);
  const toggle = (k: keyof ScreenConditions) => setCond((c) => ({ ...c, [k]: !c[k] }));
  const enabledCount = COND_META.filter((m) => cond[m.key]).length;
  const numI = "w-12 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-right text-[12px] outline-none focus:ring-2 focus:ring-indigo-200";

  // The inline control for an enabled condition (thresholds / levels).
  const renderControl = (key: keyof ScreenConditions) => {
    switch (key) {
      case "maStack":
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {STACK_LEVELS.map((l) => {
              const sel = curLevels.includes(l.v);
              return (
                <button key={l.v} onClick={() => toggleLevel(l.v)}
                  className={`px-2 py-0.5 rounded text-[11px] font-black transition ${sel ? "bg-indigo-600 text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-indigo-300"}`}>
                  {l.label}
                </button>
              );
            })}
            <span className="text-[11px] font-bold text-slate-500 ml-1">{curLevels.length >= 2 ? stackPreview(curLevels) : "pick 2+"}</span>
          </div>
        );
      case "adx":
        return <span className="text-[12px] text-slate-500 flex items-center gap-1">≥ <input type="number" value={cond.adxMin ?? 20} onChange={(e) => setCond((c) => ({ ...c, adxMin: Number(e.target.value) }))} className={numI} /></span>;
      case "rsiStrong":
        return <span className="text-[12px] text-slate-500 flex items-center gap-1">≥ <input type="number" value={cond.rsiMin ?? 55} onChange={(e) => setCond((c) => ({ ...c, rsiMin: Number(e.target.value) }))} className={numI} /></span>;
      case "nearHigh":
        return <span className="text-[12px] text-slate-500 flex items-center gap-1">within <input type="number" value={cond.nearPct ?? 5} onChange={(e) => setCond((c) => ({ ...c, nearPct: Number(e.target.value) }))} className={numI} />%</span>;
      case "near52wLow":
        return <span className="text-[12px] text-slate-500 flex items-center gap-1">within <input type="number" value={cond.nearLowPct ?? 5} onChange={(e) => setCond((c) => ({ ...c, nearLowPct: Number(e.target.value) }))} className={numI} />%</span>;
      case "nearSupport":
        return <span className="text-[12px] text-slate-500 flex items-center gap-1">within <input type="number" value={cond.supportPct ?? 3} onChange={(e) => setCond((c) => ({ ...c, supportPct: Number(e.target.value) }))} className={numI} />%</span>;
      case "nearResistance":
        return <span className="text-[12px] text-slate-500 flex items-center gap-1">within <input type="number" value={cond.resistancePct ?? 3} onChange={(e) => setCond((c) => ({ ...c, resistancePct: Number(e.target.value) }))} className={numI} />%</span>;
      case "priceRule":
        return (
          <span className="flex items-center gap-1 text-[12px]">
            <select value={cond.priceOp ?? ">"} onChange={(e) => setCond((c) => ({ ...c, priceOp: e.target.value as ">" | "<" }))} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[12px] font-bold outline-none">
              <option value=">">above</option>
              <option value="<">below</option>
            </select>
            <input type="number" value={cond.priceVal ?? ""} onChange={(e) => setCond((c) => ({ ...c, priceVal: Number(e.target.value) }))} placeholder="value" className="w-20 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-right text-[12px] outline-none focus:ring-2 focus:ring-indigo-200" />
          </span>
        );
      default:
        return null;
    }
  };

  // Add/remove a level from the MA stack, keeping the canonical order.
  const toggleLevel = (v: string) => setCond((c) => {
    const set = new Set(c.stackLevels ?? ["price", "10", "20", "50", "200"]);
    if (set.has(v)) set.delete(v); else set.add(v);
    return { ...c, stackLevels: STACK_LEVELS.map((l) => l.v).filter((x) => set.has(x)) };
  });
  const curLevels = cond.stackLevels ?? ["price", "10", "20", "50", "200"];

  // Custom rules ("design your own").
  const rules = cond.rules || [];
  const addRule = () => setCond((c) => ({ ...c, rules: [...(c.rules || []), { id: genId(), left: "price", op: ">" as const, rightType: "value" as const, rightVal: 0, join: "and" as const }] }));
  const updateRule = (id: string, patch: any) => setCond((c) => ({ ...c, rules: (c.rules || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeRule = (id: string) => setCond((c) => ({ ...c, rules: (c.rules || []).filter((r) => r.id !== id) }));

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); };

  const gatherSymbols = (): string[] => {
    const set = new Set<string>();
    if (useWL) getWatchlist().forEach((w: any) => w.symbol && set.add(String(w.symbol).toUpperCase()));
    if (usePF) getPortfolio().forEach((h: any) => h.symbol && set.add(String(h.symbol).toUpperCase()));
    customText.split(/[\s,;\n]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).forEach((s) => set.add(s));
    return Array.from(set);
  };

  const run = async () => {
    setErr("");
    const symbols = gatherSymbols();
    if (!symbols.length) { setErr("Pick a universe — add your Watchlist/Portfolio or paste some symbols."); return; }
    if (enabledCount === 0 && rules.length === 0) { setErr("Add at least one condition or rule."); return; }
    setRunning(true); setResults(null); setMeta(null);
    try {
      const res = await fetch("/api/screen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, conditions: cond }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Scan failed");
      setResults(j.results || []);
      setMeta({ capped: j.capped, scanned: j.scanned });
    } catch (e: any) {
      setErr(e?.message || "Scan failed. Try again.");
    } finally { setRunning(false); }
  };

  const saveCombo = () => {
    saveCombination({ id: genId(), name: name.trim() || "Combination", label: label.trim(), conditions: cond, createdAt: Date.now(), updatedAt: Date.now() });
    setCombos(getCombinations());
    flash("Combination saved");
  };
  const loadCombo = (c: Combination) => { setCond(c.conditions); setName(c.name); setLabel(c.label || ""); flash(`Loaded “${c.name}”`); };
  const delCombo = (id: string) => { deleteCombination(id); setCombos(getCombinations()); };

  const addWL = (r: any) => { saveToWatchlist({ symbol: r.symbol, name: r.name, category: inferCategory(r.symbol) }); flash(`${r.symbol} → Watchlist`); };
  const addPF = (r: any) => {
    savePortfolioHolding({ symbol: r.symbol, name: r.name, market: inferPortfolioMarket(r.symbol), shares: 1, buyPrice: r.price, currentPrice: r.price });
    flash(`${r.symbol} → Portfolio (edit qty there)`);
  };

  const matches = useMemo(() => (results || []).filter((r) => r.ok && r.match), [results]);
  const shown = showAll ? (results || []).filter((r) => r.ok) : matches;
  const money = (r: any) => `${r.currency === "INR" ? "₹" : "$"}${Number(r.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <SlidersHorizontal className="w-8 h-8 text-indigo-600" /> Combinations
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          Build your own condition combo, scan your stocks live, and add the matches to a watchlist or portfolio.
        </p>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-lg">{toast}</div>}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Builder */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-slate-800">Conditions <span className="text-slate-400 font-bold text-sm">(all must match)</span></h3>
              <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{enabledCount} on</span>
            </div>
            {enabledCount === 0 ? (
              <p className="text-[13px] text-slate-400 py-4 text-center border-2 border-dashed border-slate-200 rounded-xl">No conditions yet — click “Add condition” below to start.</p>
            ) : (
              <div className="space-y-1.5">
                {COND_META.filter((m) => cond[m.key]).map((m) => (
                  <div key={m.key} className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2">
                    <span className="text-[13px] font-bold text-slate-800 whitespace-nowrap">{m.label}</span>
                    <div className="flex-1 min-w-0">{renderControl(m.key)}</div>
                    <button onClick={() => toggle(m.key)} className="text-slate-300 hover:text-rose-600 shrink-0" title="Remove condition"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Add condition */}
            <div className="relative mt-2">
              <button onClick={() => setAddOpen((v) => !v)} className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-200 rounded-lg text-[13px] font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition">
                <Plus className="w-4 h-4" /> Add condition
              </button>
              {addOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
                  <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 max-h-72 overflow-y-auto">
                    {COND_META.filter((m) => !cond[m.key]).length === 0 ? (
                      <p className="text-[12px] text-slate-400 p-2 text-center">All conditions added.</p>
                    ) : (
                      COND_META.filter((m) => !cond[m.key]).map((m) => (
                        <button key={m.key} onClick={() => { toggle(m.key); setAddOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 transition">
                          <div className="text-[13px] font-bold text-slate-800">{m.label}</div>
                          <div className="text-[11px] text-slate-400">{m.hint}</div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Save combo */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[10rem]">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <div className="w-24">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Label</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="RR" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-indigo-700 text-center outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <button onClick={saveCombo} className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>

          {/* Design your own rules */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-black text-slate-800">Design your own rules</h3>
              <span className="text-[11px] font-bold text-slate-400">{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Compare any metric to a value or another metric — e.g. <b>Price ≥ 200-DMA</b>, <b>RSI &lt; 30</b>. Combine with AND / OR.</p>
            <div className="space-y-1.5">
              {rules.map((r, i) => (
                <div key={r.id}>
                  {i > 0 && (
                    <div className="flex justify-center my-1">
                      <div className="flex rounded-lg bg-slate-100 p-0.5">
                        {(["and", "or"] as const).map((j) => (
                          <button key={j} onClick={() => updateRule(r.id, { join: j })} className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase transition ${(r.join || "and") === j ? "bg-white text-indigo-700 shadow-sm" : "text-slate-400"}`}>{j}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                    <select value={r.left} onChange={(e) => updateRule(r.id, { left: e.target.value })} className="px-2 py-1 bg-white border border-slate-200 rounded text-[12px] font-semibold outline-none focus:ring-2 focus:ring-indigo-200">
                      {RULE_METRICS.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
                    </select>
                    <select value={r.op} onChange={(e) => updateRule(r.id, { op: e.target.value })} className="px-2 py-1 bg-white border border-slate-200 rounded text-[13px] font-black outline-none focus:ring-2 focus:ring-indigo-200">
                      {OP_UI.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                    <select value={r.rightType} onChange={(e) => updateRule(r.id, { rightType: e.target.value, ...(e.target.value === "metric" && !r.rightMetric ? { rightMetric: "dma50" } : {}) })} className="px-2 py-1 bg-white border border-slate-200 rounded text-[12px] font-semibold outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="value">value</option>
                      <option value="metric">metric</option>
                    </select>
                    {r.rightType === "metric" ? (
                      <select value={r.rightMetric || "dma50"} onChange={(e) => updateRule(r.id, { rightMetric: e.target.value })} className="px-2 py-1 bg-white border border-slate-200 rounded text-[12px] font-semibold outline-none focus:ring-2 focus:ring-indigo-200">
                        {RULE_METRICS.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
                      </select>
                    ) : (
                      <input type="number" value={r.rightVal ?? ""} onChange={(e) => updateRule(r.id, { rightVal: Number(e.target.value) })} placeholder="value" className="w-24 px-2 py-1 bg-white border border-slate-200 rounded text-right text-[12px] outline-none focus:ring-2 focus:ring-indigo-200" />
                    )}
                    <button onClick={() => removeRule(r.id)} className="ml-auto text-slate-300 hover:text-rose-600" title="Remove rule"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addRule} className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-200 rounded-lg text-[13px] font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition">
              <Plus className="w-4 h-4" /> Add rule
            </button>
          </div>

          {/* Universe + Run */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-black text-slate-800 mb-3">Scan universe</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {[{ on: useWL, set: setUseWL, label: "My Watchlist" }, { on: usePF, set: setUsePF, label: "My Portfolio" }].map((u) => (
                <button key={u.label} onClick={() => u.set(!u.on)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${u.on ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
                  {u.on && <Check className="w-3.5 h-3.5 inline mr-1" />}{u.label}
                </button>
              ))}
            </div>
            <textarea value={customText} onChange={(e) => setCustomText(e.target.value)} rows={2} placeholder="…or paste extra symbols (AAPL, RELIANCE.NS, MSFT)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-none mb-3" />
            <div className="flex items-center gap-3">
              <button onClick={run} disabled={running} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {running ? "Scanning…" : "Run scan"}
              </button>
              <span className="text-[11px] text-slate-400">Live technicals · up to 40 stocks per scan</span>
            </div>
            {err && <div className="mt-2 text-[12px] text-rose-600 font-medium">{err}</div>}
          </div>

          {/* Results */}
          {results && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  {matches.length} match{matches.length === 1 ? "" : "es"}
                  {label && matches.length > 0 && <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{label}</span>}
                </h3>
                {(results.filter((r) => r.ok).length > matches.length) && (
                  <button onClick={() => setShowAll((v) => !v)} className="text-[12px] font-bold text-slate-500 hover:text-indigo-600">
                    {showAll ? "Show matches only" : `Show all ${results.filter((r) => r.ok).length} scanned`}
                  </button>
                )}
              </div>
              {meta?.capped && <p className="text-[11px] text-amber-600 mb-2">Universe was larger than 40 — only the first 40 were scanned.</p>}
              {shown.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">No stocks matched this combination.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="text-slate-400 text-[11px] uppercase tracking-wide border-b border-slate-200">
                        <th className="py-2 pr-2">Stock</th>
                        <th className="py-2 px-2 text-right">Price</th>
                        <th className="py-2 px-2 text-right">RSI</th>
                        <th className="py-2 px-2 text-right">% off high</th>
                        <th className="py-2 px-2">Signals</th>
                        <th className="py-2 pl-2 text-right">Add</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.symbol} className={`border-b border-slate-100 ${r.match ? "" : "opacity-60"}`}>
                          <td className="py-2 pr-2">
                            <Link href={`/analyze?symbol=${r.symbol}`} className="font-black text-slate-900 hover:text-indigo-600">{r.symbol}</Link>
                            <div className="text-[11px] text-slate-400 max-w-[160px] truncate">{r.name}</div>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums font-bold text-slate-800">{money(r)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.rsi ?? "—"}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{r.pctFromHigh != null ? `${r.pctFromHigh}%` : "—"}</td>
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(r.passed || {}).map(([k, ok]) => (
                                <span key={k} className={`text-[9px] font-black px-1.5 py-0.5 rounded ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
                                  {SHORT[k] || k}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 pl-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => addWL(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Add to Watchlist"><Star className="w-4 h-4" /></button>
                              <button onClick={() => addPF(r)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Add to Portfolio"><Briefcase className="w-4 h-4" /></button>
                              <Link href={`/analyze?symbol=${r.symbol}`} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Analyze"><Activity className="w-4 h-4" /></Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saved combos */}
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-black text-slate-800 mb-1 flex items-center gap-2"><Bookmark className="w-4 h-4 text-indigo-600" /> Saved combinations</h3>
            <p className="text-[11px] text-emerald-600 font-semibold mb-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Auto-watched in the background — you&apos;ll get a notification when your Watchlist/Portfolio stocks match.
            </p>
            {combos.length === 0 ? (
              <p className="text-[13px] text-slate-400">None yet — build one and hit Save.</p>
            ) : (
              <div className="space-y-2">
                {combos.map((c) => (
                  <div key={c.id} className="group flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 hover:border-indigo-300 transition">
                    <button onClick={() => loadCombo(c)} className="flex-1 min-w-0 text-left">
                      <div className="text-[13px] font-bold text-slate-800 truncate flex items-center gap-1.5">
                        {c.label && <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{c.label}</span>}
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-400">{Object.keys(c.conditions).filter((k) => (c.conditions as any)[k] === true).length} conditions</div>
                    </button>
                    <button onClick={() => delCombo(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 px-1">
            Signals are computed from live daily prices. “Earnings growth” uses the latest quarterly EPS YoY where available. Research only — not buy/sell advice.
          </p>
        </div>
      </div>
    </div>
  );
}
