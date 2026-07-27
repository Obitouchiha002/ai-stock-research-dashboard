"use client";

import React, { useState } from "react";
import { Loader2, AlertTriangle, CalendarRange, FlaskConical, TrendingUp, TrendingDown } from "lucide-react";

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
function Unavailable({ note }: { note: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      {note}
    </div>
  );
}

// green/red intensity by value
function heatBg(v: number | null) {
  if (v === null) return "bg-slate-50 text-slate-400";
  const a = Math.min(1, Math.abs(v) / 6);
  if (v >= 0) return "";
  return "";
}
function heatStyle(v: number | null): React.CSSProperties {
  if (v === null) return { background: "#f8fafc" };
  const a = Math.min(0.85, 0.15 + Math.abs(v) / 8);
  return v >= 0
    ? { background: `rgba(16,185,129,${a})` }
    : { background: `rgba(244,63,94,${a})` };
}

const edgeColor: Record<string, string> = {
  "Positive historical edge": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Negative historical edge": "bg-rose-50 text-rose-700 border-rose-200",
  "Mixed / no clear edge": "bg-amber-50 text-amber-700 border-amber-200",
  "Insufficient samples": "bg-slate-50 text-slate-400 border-slate-200",
};

export default function AnalyticsTab({ symbol, market }: { symbol: string; market: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [a, setA] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, market }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analytics failed");
      setA(json.analytics);
    } catch (e: any) {
      setError(e.message || "Analytics failed.");
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => {
    if (symbol) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="font-medium text-sm">Running historical analytics…</p>
      </div>
    );
  if (error)
    return (
      <div className="max-w-xl mx-auto">
        <Unavailable note={error} />
        <button onClick={load} className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold">Retry</button>
      </div>
    );
  if (!a) return null;

  const s = a.seasonality;
  const b = a.backtest;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {a.disclaimer}
      </div>

      {/* SEASONALITY */}
      <Card
        title="Seasonality — Average Monthly Return"
        icon={<CalendarRange className="w-4 h-4" />}
        badge={s.available ? `Best ${s.best} · Worst ${s.worst}` : undefined}
      >
        {s.available ? (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
              {s.months.map((m: any) => (
                <div key={m.month} className="rounded-lg p-2 text-center border border-slate-100" style={heatStyle(m.avgReturn)}>
                  <div className="text-[10px] font-bold text-slate-600">{m.month}</div>
                  <div className="text-[11px] font-black text-slate-800">{m.display}</div>
                  <div className="text-[8px] font-bold text-slate-500">{m.winDisplay} up</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">{s.note}</p>
          </>
        ) : (
          <Unavailable note={s.note} />
        )}
      </Card>

      {/* BACKTEST / SIGNAL EDGE */}
      <Card title="Signal Edge — Historical Backtest" icon={<FlaskConical className="w-4 h-4" />} badge={b.available ? `${b.historyDays} sessions` : undefined}>
        {b.available ? (
          <>
            <p className="text-[11px] text-slate-400 -mt-2 mb-3">
              For each historical signal, the table shows the forward return 5 / 10 / 20 trading days later, the win rate, and best/worst case. Descriptive history — not a forecast.
            </p>
            <div className="space-y-3">
              {b.signals.map((sig: any) => (
                <div key={sig.key} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-xs font-black text-slate-800">{sig.name}</div>
                      <div className="text-[10px] text-slate-400">{sig.desc} · {sig.occurrences} occurrences</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${edgeColor[sig.edge] || edgeColor["Insufficient samples"]}`}>
                      {sig.edge}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-400 text-left">
                          <th className="py-1 font-bold">Horizon</th>
                          <th className="py-1 font-bold text-right">Avg Return</th>
                          <th className="py-1 font-bold text-right">Win Rate</th>
                          <th className="py-1 font-bold text-right">Best</th>
                          <th className="py-1 font-bold text-right">Worst</th>
                          <th className="py-1 font-bold text-right">Samples</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sig.horizons.map((h: any) => (
                          <tr key={h.horizon} className="border-t border-slate-50">
                            <td className="py-1 font-medium text-slate-600">{h.horizon}d</td>
                            <td className={`py-1 text-right font-bold ${h.avg === null ? "text-slate-400" : h.avg >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {h.avg === null ? "—" : (h.avg >= 0 ? "+" : "") + h.avg + "%"}
                            </td>
                            <td className="py-1 text-right font-bold text-slate-700">{h.win === null ? "—" : h.win + "%"}</td>
                            <td className="py-1 text-right text-emerald-600">{h.best === null ? "—" : "+" + h.best + "%"}</td>
                            <td className="py-1 text-right text-rose-600">{h.worst === null ? "—" : h.worst + "%"}</td>
                            <td className="py-1 text-right text-slate-500">{h.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-slate-400 italic">{b.note}</p>
          </>
        ) : (
          <Unavailable note={b.note} />
        )}
      </Card>
    </div>
  );
}
