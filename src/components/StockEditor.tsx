"use client";

import React, { useEffect, useState } from "react";
import { X, Plus, Trash2, Save } from "lucide-react";
import type { StockTrigger } from "@/lib/storage";

// Shared per-stock editor popup used by Markets / Watchlist / Portfolio. Rows are
// read-only until the user opens this; here they set levels (SL/R/T1/T2), remarks
// and MULTIPLE alert triggers (e.g. one to Buy, another to Sell), then Save.
export type EditorValue = {
  sl?: string; r?: string; t1?: string; t2?: string;
  remarks?: string;
  triggers?: StockTrigger[];
  color?: string; // "" | green | red | yellow (trend mark)
  updatedAt?: number;
};

const COLOR_OPTS = [
  { v: "", label: "None", dot: "bg-white border-2 border-slate-300" },
  { v: "green", label: "Uptrend", dot: "bg-emerald-500" },
  { v: "red", label: "Downtrend", dot: "bg-rose-500" },
  { v: "yellow", label: "Sideways", dot: "bg-amber-500" },
];

const OPS = [
  { v: ">", l: ">" }, { v: ">=", l: "≥" }, { v: "<", l: "<" }, { v: "<=", l: "≤" }, { v: "=", l: "=" },
];
const ACTIONS = ["Buy", "Sell", "Book profit", "Add more", "Watch"];
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function StockEditor({
  open, symbol, name, price, currency, value, levelsLabel, showColor, onClose, onSave, onDelete,
}: {
  open: boolean;
  symbol: string;
  name?: string;
  price?: number | null;
  currency?: string;
  value: EditorValue;
  levelsLabel?: string;
  showColor?: boolean;
  onClose: () => void;
  onSave: (v: EditorValue) => void;
  onDelete?: () => void;
}) {
  const [v, setV] = useState<EditorValue>(value);
  // Re-seed local state each time the editor opens for a (possibly different) row.
  useEffect(() => {
    if (open) setV({ ...value, triggers: (value.triggers || []).map((t) => ({ ...t })) });
  }, [open, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const set = (k: keyof EditorValue, val: string) => setV((s) => ({ ...s, [k]: val }));
  const triggers = v.triggers || [];
  const addTrig = () => setV((s) => ({ ...s, triggers: [...(s.triggers || []), { id: genId(), op: ">", val: "", action: "Buy" }] }));
  const updTrig = (id: string, patch: Partial<StockTrigger>) => setV((s) => ({ ...s, triggers: (s.triggers || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const delTrig = (id: string) => setV((s) => ({ ...s, triggers: (s.triggers || []).filter((t) => t.id !== id) }));
  const save = () => { onSave({ ...v, updatedAt: Date.now() }); onClose(); };
  const cur = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";

  const LEVELS: [keyof EditorValue, string, string][] = [
    ["sl", "SL", "text-rose-600"], ["r", "R", "text-slate-500"],
    ["t1", "T1", "text-emerald-600"], ["t2", "T2", "text-emerald-600"],
  ];

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="font-black text-slate-900">{symbol}</div>
            {name && <div className="text-[12px] text-slate-500 truncate max-w-[16rem]">{name}</div>}
          </div>
          <div className="flex items-center gap-3">
            {price != null && <span className="font-bold tabular-nums text-slate-800">{cur}{Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Trend / colour mark (only where the row is colour-coded) */}
          {showColor && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Trend mark</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_OPTS.map((o) => (
                  <button key={o.v} onClick={() => set("color", o.v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-bold transition ${(v.color || "") === o.v ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                    <span className={`w-3 h-3 rounded-full ${o.dot}`} /> {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Levels */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{levelsLabel || "Levels"}</label>
            <div className="grid grid-cols-4 gap-2">
              {LEVELS.map(([k, lab, cls]) => (
                <div key={k}>
                  <div className={`text-[10px] font-black uppercase ${cls} mb-0.5`}>{lab}</div>
                  <input value={(v as any)[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder="—"
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
              ))}
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Remarks</label>
            <input value={v.remarks || ""} onChange={(e) => set("remarks", e.target.value)} placeholder="notes…"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>

          {/* Triggers (multiple — buy / sell separately) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide">Alert triggers</label>
              <span className="text-[10px] text-slate-400">buy/sell alag; range ke liye min bharo</span>
            </div>
            <div className="space-y-1.5">
              {triggers.length === 0 && (
                <p className="text-[12px] text-slate-400 text-center py-2 border border-dashed border-slate-200 rounded-lg">No triggers yet — add one below.</p>
              )}
              {triggers.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2">
                  {/* optional lower bound → makes it a range e.g. 140 < CMP < 150 */}
                  <input type="number" value={t.lo ?? ""} onChange={(e) => updTrig(t.id, { lo: e.target.value })} placeholder="min"
                    title="Optional lower bound — leave empty for a single condition"
                    className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-indigo-200" />
                  <select value={t.loOp || "<"} onChange={(e) => updTrig(t.id, { loOp: e.target.value })}
                    disabled={t.lo == null || String(t.lo) === ""}
                    className="px-1 py-1 bg-white border border-slate-200 rounded text-[13px] font-black outline-none disabled:opacity-40">
                    {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <span className="text-[12px] font-black text-slate-500">CMP</span>
                  <select value={t.op} onChange={(e) => updTrig(t.id, { op: e.target.value })} className="px-1 py-1 bg-white border border-slate-200 rounded text-[13px] font-black outline-none">
                    {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <input type="number" value={t.val} onChange={(e) => updTrig(t.id, { val: e.target.value })} placeholder="value"
                    className="w-20 px-2 py-1 bg-white border border-slate-200 rounded text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-indigo-200" />
                  <span className="text-slate-400">→</span>
                  <select value={t.action || "Buy"} onChange={(e) => updTrig(t.id, { action: e.target.value })} className="px-2 py-1 bg-white border border-slate-200 rounded text-[12px] font-bold text-slate-700 outline-none flex-1 min-w-[5rem]">
                    {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <button onClick={() => delTrig(t.id)} className="text-slate-300 hover:text-rose-600 shrink-0"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button onClick={addTrig} className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-[12px] font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition">
              <Plus className="w-4 h-4" /> Add trigger
            </button>
          </div>

          {v.updatedAt && <div className="text-[11px] text-slate-400">Last updated: {new Date(v.updatedAt).toLocaleString()}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 sticky bottom-0 bg-white">
          {onDelete ? (
            <button onClick={() => { onDelete(); onClose(); }} className="px-3 py-1.5 text-[13px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-[13px] font-bold text-slate-500 hover:text-slate-800">Cancel</button>
            <button onClick={save} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 flex items-center gap-1.5">
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper: read/write triggers stored as a JSON string on a plan/item field.
export const parseTriggers = (raw: any): StockTrigger[] => {
  if (Array.isArray(raw)) return raw;
  try { const a = JSON.parse(raw || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
};
