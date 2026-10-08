"use client";

import { useEffect, useState } from "react";

// Dividends & splits for a US stock (EODHD). Renders nothing for India stocks
// (not in the plan) or stocks that pay no dividend and never split — so it only
// appears when it has something to say.
export default function DividendCard({ symbol }: { symbol: string }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/dividends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setD(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading || !d || d.supported === false) return null;
  if (!d.paysDividend && !(d.splits && d.splits.length)) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-4">
      <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">💰 Dividends &amp; Splits</h4>
      {d.paysDividend ? (
        <div className="flex flex-wrap gap-8 mb-4">
          <div>
            <div className="text-2xl font-black text-emerald-600">{d.dividendYield != null ? `${d.dividendYield}%` : "—"}</div>
            <div className="text-[11px] text-slate-400 font-semibold">Yield (TTM)</div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">${d.annual}</div>
            <div className="text-[11px] text-slate-400 font-semibold">Annual / share</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500 mb-3">No dividend paid.</div>
      )}

      {d.history?.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1.5">Recent payments</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
            {d.history.slice(0, 6).map((h: any) => (
              <span key={h.date} className="text-slate-600"><b className="text-slate-800 tabular-nums">${h.value}</b> <span className="text-slate-400">{h.date}</span></span>
            ))}
          </div>
        </div>
      )}

      {d.splits?.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1.5">Stock splits</div>
          <div className="flex flex-wrap gap-x-5 text-[12.5px]">
            {d.splits.map((s: any) => (
              <span key={s.date} className="text-slate-600"><b className="text-slate-800">{s.split}</b> <span className="text-slate-400">{s.date}</span></span>
            ))}
          </div>
        </div>
      )}
      <div className="text-[10px] text-slate-400 mt-3">EODHD · US stocks · research support only, not advice</div>
    </div>
  );
}
