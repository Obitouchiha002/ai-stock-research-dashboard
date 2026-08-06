"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  Briefcase,
  X,
  ShieldAlert,
  Target,
  TrendingUp,
  TrendingDown,
  Check,
} from "lucide-react";
import {
  getPriceAlerts,
  savePriceAlert,
  deletePriceAlert,
  updatePriceAlert,
  getPortfolio,
  getSettings,
  saveSettings,
  type PriceAlert,
  type AlertLevelKey,
} from "@/lib/storage";

// The five levels a user can set, with how each reads and its accent.
const LEVEL_DEFS: {
  key: AlertLevelKey;
  label: string;
  hint: string;
  side: "below" | "above";
  tint: string;
  chip: string;
  Icon: any;
}[] = [
  { key: "sl", label: "Stop-Loss", hint: "your exit level", side: "below", tint: "text-rose-600", chip: "bg-rose-50 text-rose-700 border-rose-200", Icon: ShieldAlert },
  { key: "s1", label: "Support", hint: "buyers stepped in", side: "below", tint: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: TrendingDown },
  { key: "r1", label: "Resistance R1", hint: "first ceiling", side: "above", tint: "text-amber-600", chip: "bg-amber-50 text-amber-700 border-amber-200", Icon: TrendingUp },
  { key: "r2", label: "Resistance R2", hint: "next ceiling", side: "above", tint: "text-orange-600", chip: "bg-orange-50 text-orange-700 border-orange-200", Icon: TrendingUp },
  { key: "target", label: "Target", hint: "your objective", side: "above", tint: "text-indigo-600", chip: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Target },
];

const num = (v: any): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number, cur = "") =>
  `${cur}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyForm = { symbol: "", sl: "", s1: "", r1: "", r2: "", target: "", fromPortfolio: false };

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [formCmp, setFormCmp] = useState<{ price: number; cur: string } | null>(null);
  const [notifPerm, setNotifPerm] = useState<string>("default");
  const [alertEmail, setAlertEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  useEffect(() => { setAlertEmail(getSettings()?.alertEmail || ""); }, []);
  const saveEmail = () => { saveSettings({ alertEmail: alertEmail.trim() }); setEmailSaved(true); setTimeout(() => setEmailSaved(false), 1800); };

  const reload = () => setAlerts(getPriceAlerts());

  useEffect(() => {
    reload();
    setPortfolio(getPortfolio());
    if (typeof Notification !== "undefined") setNotifPerm(Notification.permission);
  }, []);

  // Live quotes for every alerted symbol — powers CMP + distance + status.
  const symbols = Array.from(new Set(alerts.map((a) => a.symbol).filter(Boolean)));
  const symbolsKey = symbols.join(",");
  const loadQuotes = useCallback(async () => {
    if (!symbolsKey) return;
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: symbolsKey.split(",") }),
      });
      const j = await res.json();
      setQuotes(j.quotes || {});
    } catch {
      /* keep last */
    }
  }, [symbolsKey]);

  useEffect(() => {
    loadQuotes();
    const i = setInterval(loadQuotes, 30000);
    // Reflect monitor-fired triggers coming from the background.
    const r = setInterval(reload, 20000);
    return () => {
      clearInterval(i);
      clearInterval(r);
    };
  }, [loadQuotes]);

  // Fetch the live price for the symbol being entered, to anchor the levels.
  const fetchFormCmp = useCallback(async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return setFormCmp(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [s] }),
      });
      const j = await res.json();
      const q = j.quotes?.[s];
      if (q?.price != null) setFormCmp({ price: q.price, cur: q.currency === "INR" ? "₹" : "$" });
      else setFormCmp(null);
    } catch {
      setFormCmp(null);
    }
  }, []);

  const openForm = (prefill?: { symbol: string; refPrice?: number; fromPortfolio?: boolean }) => {
    setForm({ ...emptyForm, symbol: prefill?.symbol || "", fromPortfolio: !!prefill?.fromPortfolio });
    setFormCmp(null);
    setShowForm(true);
    if (prefill?.symbol) fetchFormCmp(prefill.symbol);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const levels = { sl: num(form.sl), s1: num(form.s1), r1: num(form.r1), r2: num(form.r2), target: num(form.target) };
    if (!form.symbol.trim() || !Object.values(levels).some((v) => v != null)) return;
    savePriceAlert({
      symbol: form.symbol.trim().toUpperCase(),
      refPrice: formCmp?.price ?? null,
      levels,
      triggered: {},
      fromPortfolio: form.fromPortfolio,
    });
    setShowForm(false);
    setForm({ ...emptyForm });
    setFormCmp(null);
    reload();
  };

  const handleDelete = (id: string) => {
    deletePriceAlert(id);
    reload();
  };
  const rearm = (a: PriceAlert) => {
    updatePriceAlert(a.id, { triggered: {}, conditionTriggered: false });
    reload();
  };

  // Custom condition alert (e.g. price > 160).
  const [condForm, setCondForm] = useState({ symbol: "", metric: "price", op: ">", value: "" });
  const createCondition = () => {
    const v = Number(condForm.value);
    if (!condForm.symbol.trim() || !Number.isFinite(v)) return;
    savePriceAlert({
      symbol: condForm.symbol.trim().toUpperCase(),
      condition: { metric: condForm.metric as "price" | "changePct", op: condForm.op as ">" | "<" | ">=" | "<=" | "=", value: v },
      status: "active",
    });
    setCondForm({ symbol: "", metric: "price", op: ">", value: "" });
    reload();
  };

  const requestNotif = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  };

  // Portfolio symbols not already alerted — quick-link chips.
  const linkable = portfolio.filter((h) => !alerts.some((a) => a.symbol === h.symbol));

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-8 h-8 text-indigo-600" /> Price Alerts
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Set your own levels — stop-loss, support, resistance, target. We watch the live price and
            ping you the moment it reaches one.
          </p>
        </div>
        <div className="flex gap-2">
          {notifPerm !== "granted" && (
            <button
              onClick={requestNotif}
              className="px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 flex items-center gap-1.5 transition"
              title="Get instant pop-up alerts even when the tab is in the background"
            >
              <BellRing className="w-4 h-4" /> Enable pop-ups
            </button>
          )}
          <button
            onClick={() => openForm()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition shadow-sm shadow-indigo-600/25"
          >
            <Plus className="w-4 h-4" /> New Alert
          </button>
        </div>
      </div>

      {/* Link from portfolio */}
      {linkable.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-indigo-600" />
            <span className="text-[12px] font-black uppercase tracking-wider text-slate-500">
              Add from your portfolio
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {linkable.map((h) => (
              <button
                key={h.id}
                onClick={() => openForm({ symbol: h.symbol, refPrice: h.buyPrice, fromPortfolio: true })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition"
              >
                <Plus className="w-3.5 h-3.5" /> {h.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-slate-800 text-lg">New price alert</h3>
            <button type="button" onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
            <div className="flex-1">
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">Symbol</label>
              <input
                required
                type="text"
                placeholder="AAPL, RELIANCE.NS"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                onBlur={(e) => fetchFormCmp(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 font-bold outline-none"
              />
            </div>
            <div className="shrink-0 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 min-w-[130px]">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Current price</div>
              <div className="text-lg font-black text-slate-900 tabular-nums">
                {formCmp ? fmt(formCmp.price, formCmp.cur) : "—"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {LEVEL_DEFS.map((lv) => (
              <div key={lv.key}>
                <label className={`block text-[11px] font-black uppercase tracking-wider mb-1 ${lv.tint}`}>
                  {lv.label}
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder={lv.side === "below" ? "below CMP" : "above CMP"}
                  value={(form as any)[lv.key]}
                  onChange={(e) => setForm({ ...form, [lv.key]: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 font-bold tabular-nums outline-none"
                />
                <div className="text-[10.5px] text-slate-400 mt-1">{lv.hint}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 mt-5">
            <p className="text-[11.5px] text-slate-400 italic">
              Fill any levels you care about. We notify on a reach — this is your plan, not buy/sell advice.
            </p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">
                Cancel
              </button>
              <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">
                Save alert
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Email alerts recipient */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
        <h3 className="text-sm font-black text-slate-800 mb-1">📧 Email alerts</h3>
        <p className="text-[11px] text-slate-400 mb-3">Get a real email the moment an alert triggers. Works while the app is open in a tab.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="you@email.com"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200 w-64" />
          <button onClick={saveEmail} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1.5">
            {emailSaved ? <><Check className="w-4 h-4" /> Saved</> : "Save email"}
          </button>
          {alertEmail && <span className="text-[11px] text-emerald-600 font-semibold">Alerts will be emailed to {alertEmail}</span>}
        </div>
      </div>

      {/* Custom condition alert — e.g. price > 160 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6">
        <h3 className="text-sm font-black text-slate-800 mb-1">Custom condition alert</h3>
        <p className="text-[11px] text-slate-400 mb-3">Get notified when a condition becomes true — e.g. <b>Price &gt; 160</b> or <b>Day change &lt; -3%</b>.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={condForm.symbol} onChange={(e) => setCondForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))} placeholder="Symbol e.g. AAPL"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200 w-40" />
          <select value={condForm.metric} onChange={(e) => setCondForm((f) => ({ ...f, metric: e.target.value }))} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200">
            <option value="price">Price (CMP)</option>
            <option value="changePct">Day change %</option>
          </select>
          <select value={condForm.op} onChange={(e) => setCondForm((f) => ({ ...f, op: e.target.value }))} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 min-w-[9rem]">
            <option value=">">{"> above"}</option>
            <option value=">=">{"≥ at least"}</option>
            <option value="<">{"< below"}</option>
            <option value="<=">{"≤ at most"}</option>
            <option value="=">{"= equals"}</option>
          </select>
          <input type="number" value={condForm.value} onChange={(e) => setCondForm((f) => ({ ...f, value: e.target.value }))} placeholder="value"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-right outline-none focus:ring-2 focus:ring-indigo-200 w-28" />
          <button onClick={createCondition} disabled={!condForm.symbol.trim() || condForm.value === ""} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-bold">No alerts yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Add a stock and set your levels — or pull one straight from your portfolio above.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {alerts.map((a) => {
            const q = quotes[a.symbol];
            const price = q?.price ?? null;
            const cur = q?.currency === "INR" ? "₹" : "$";
            const up = (q?.changePct ?? 0) >= 0;
            const setLevels = LEVEL_DEFS.filter((lv) => a.levels?.[lv.key] != null);
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[17px] font-black text-slate-900">{a.symbol}</span>
                      {a.fromPortfolio && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          <Briefcase className="w-3 h-3" /> Portfolio
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-[15px] font-black text-slate-900 tabular-nums">
                        {price != null ? fmt(price, cur) : "…"}
                      </span>
                      {q?.changePct != null && (
                        <span className={`text-[12px] font-bold tabular-nums ${up ? "text-emerald-600" : "text-rose-600"}`}>
                          {up ? "+" : ""}{q.changePct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      href={`/charts?symbol=${encodeURIComponent(a.symbol)}`}
                      className="px-2.5 py-1.5 text-[12px] font-bold text-slate-500 hover:text-indigo-700 hover:bg-slate-50 rounded-lg transition"
                    >
                      Chart
                    </Link>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete alert"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {setLevels.map((lv) => {
                    const val = a.levels[lv.key] as number;
                    const hit = a.triggered?.[lv.key];
                    const dist = price != null && price !== 0 ? ((val - price) / price) * 100 : null;
                    const Icon = lv.Icon;
                    return (
                      <div
                        key={lv.key}
                        className={`rounded-xl border px-3 py-2.5 ${hit ? "border-slate-300 bg-slate-50" : lv.chip}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide ${hit ? "text-slate-500" : lv.tint}`}>
                            <Icon className="w-3 h-3" /> {lv.label}
                          </span>
                          {hit && (
                            <span className="inline-flex items-center gap-0.5 text-[9.5px] font-black text-slate-500">
                              <Check className="w-3 h-3" /> hit
                            </span>
                          )}
                        </div>
                        <div className="text-[15px] font-black text-slate-900 tabular-nums mt-0.5">{fmt(val)}</div>
                        {dist != null && !hit && (
                          <div className="text-[10.5px] font-bold text-slate-400 tabular-nums">
                            {dist >= 0 ? "+" : ""}{dist.toFixed(1)}% away
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {a.condition && (
                  <div className="px-3.5 pb-3.5 -mt-1">
                    <div className={`rounded-xl border px-3 py-2.5 ${a.conditionTriggered ? "border-slate-300 bg-slate-50" : "border-indigo-200 bg-indigo-50/50"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wide text-indigo-600">Custom condition</span>
                        {a.conditionTriggered && <span className="inline-flex items-center gap-0.5 text-[9.5px] font-black text-emerald-600"><Check className="w-3 h-3" /> met</span>}
                      </div>
                      <div className="text-[14px] font-black text-slate-900 mt-0.5">
                        {a.condition.metric === "changePct" ? "Day change" : "Price"} {a.condition.op} {a.condition.metric === "changePct" ? `${a.condition.value}%` : `${cur}${fmt(a.condition.value)}`}
                      </div>
                    </div>
                  </div>
                )}

                {(Object.values(a.triggered || {}).some(Boolean) || a.conditionTriggered) && (
                  <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11.5px] text-slate-500">{a.conditionTriggered ? "Condition met." : "Some levels were reached."}</span>
                    <button onClick={() => rearm(a)} className="text-[12px] font-black text-indigo-600 hover:underline">
                      Re-arm
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-[12px] text-slate-400 italic">
        Alerts fire when the live price reaches a level you set — reflecting your own plan. Prices via Yahoo
        Finance (may be delayed ~15 min). Research support only. Not buy/sell advice.
      </p>
    </div>
  );
}
