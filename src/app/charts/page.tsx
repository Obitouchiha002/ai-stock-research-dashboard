"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import {
  CandlestickChart,
  Search,
  Maximize2,
  Minimize2,
  RefreshCw,
  StickyNote,
  Trash2,
  Plus,
  TrendingUp,
  TrendingDown,
  Activity,
  X,
} from "lucide-react";
import { getNotesForSymbol, saveNote, deleteNote } from "@/lib/storage";
import StockNotes from "@/components/StockNotes";

const RANGES = [
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "5y", label: "5Y" },
  { key: "10y", label: "10Y" },
  { key: "max", label: "Max" },
];
const INTERVALS = [
  { key: "1h", label: "Hourly" },
  { key: "1d", label: "Daily" },
  { key: "1wk", label: "Weekly" },
  { key: "1mo", label: "Monthly" },
];

export default function ChartsPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [meta, setMeta] = useState<any>(null);
  const [range, setRange] = useState("1y");
  const [interval, setIntervalState] = useState("1d");
  const [ind, setInd] = useState({
    ma10: false,
    ma20: true,
    ma50: true,
    ma200: false,
    volume: true,
    rsi: false,
    adx: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fs, setFs] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [ohlc, setOhlc] = useState<any>(null);
  const [rsiHover, setRsiHover] = useState<any>(null);
  const [adxHover, setAdxHover] = useState<any>(null);

  // search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [showRes, setShowRes] = useState(false);

  // notes
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartElRef = useRef<HTMLDivElement>(null);
  const rsiElRef = useRef<HTMLDivElement>(null);
  const adxElRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const adxChartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const dataRef = useRef<any[]>([]);

  const loadNotes = useCallback((sym: string) => setNotes(getNotesForSymbol(sym)), []);

  // Fetch chart data
  const fetchChart = useCallback(async (sym: string, rng: string, intv: string) => {
    if (!sym) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, range: rng, interval: intv }),
      });
      const j = await res.json();
      if (!res.ok || j.error) {
        setError(j.error || "Could not load chart.");
        dataRef.current = [];
        setMeta(null);
      } else {
        dataRef.current = j.candles || [];
        setMeta(j);
      }
    } catch {
      setError("Could not load chart.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Open a symbol passed via ?symbol= (e.g. clicked from the Markets page).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("symbol");
    if (p) setSymbol(p.toUpperCase());
  }, []);

  useEffect(() => {
    fetchChart(symbol, range, interval);
    loadNotes(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range, interval]);

  // (Re)build the chart whenever data or indicator toggles change.
  useEffect(() => {
    const el = chartElRef.current;
    if (!el) return;
    // tear down any previous charts (main + sub-panels)
    [chartRef, rsiChartRef, adxChartRef].forEach((r) => {
      if (r.current) { try { r.current.remove(); } catch {} r.current = null; }
    });
    const candles = dataRef.current;
    if (!candles.length) return;

    const baseOpts = {
      layout: { background: { color: "#ffffff" }, textColor: "#334155", fontFamily: "inherit" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e5e9ef" },
      timeScale: {
        borderColor: "#e5e9ef",
        timeVisible: interval === "1h",
        secondsVisible: false,
        // Consistent axis labels: year at year ticks, short month name at month
        // ticks (fixes November showing as "11"), day number, and HH:MM for hourly.
        tickMarkFormatter: (time: any, tickMarkType: number) => {
          const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const d =
            typeof time === "number"
              ? new Date(time * 1000)
              : new Date(Date.UTC(time.year, (time.month || 1) - 1, time.day || 1));
          if (tickMarkType === 0) return String(d.getUTCFullYear()); // Year
          if (tickMarkType === 1) return MONTHS[d.getUTCMonth()]; // Month
          if (tickMarkType === 2) return String(d.getUTCDate()); // Day of month
          return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); // intraday
        },
      },
    };

    const chart = createChart(el, { width: el.clientWidth, height: el.clientHeight, ...baseOpts });

    const candle = chart.addCandlestickSeries({
      upColor: "#16a34a",
      downColor: "#e11d48",
      wickUpColor: "#16a34a",
      wickDownColor: "#e11d48",
      borderVisible: false,
    });
    candle.setData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })) as any);
    candleRef.current = candle;

    if (ind.volume) {
      const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, color: "#c7d2fe" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(
        candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? "rgba(22,163,74,0.35)" : "rgba(225,29,72,0.35)",
        })) as any,
      );
    }

    // Moving-average overlays (10 / 20 / 50 / 200). Keep a handle on each so
    // the crosshair readout can show its value at the hovered bar.
    const overlays: { label: string; color: string; series: any }[] = [];
    const addLine = (key: string, color: string, label: string) => {
      const s = chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      s.setData(candles.filter((c) => c[key] != null).map((c) => ({ time: c.time, value: c[key] })) as any);
      overlays.push({ label, color, series: s });
    };
    // Shared MA palette (matches Analyze Stock): 10=sky, 20=amber, 50=violet, 200=red.
    if (ind.ma10) addLine("sma10", "#0ea5e9", "MA 10");
    if (ind.ma20) addLine("sma20", "#f59e0b", "MA 20");
    if (ind.ma50) addLine("sma50", "#8b5cf6", "MA 50");
    if (ind.ma200) addLine("sma200", "#dc2626", "MA 200");

    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) { setOhlc(null); return; }
      const c: any = param.seriesData.get(candle);
      if (!c) { setOhlc(null); return; }
      // Read every overlaid MA at the hovered bar too.
      const mas = overlays
        .map((o) => {
          const d: any = param.seriesData.get(o.series);
          return d?.value != null ? { label: o.label, color: o.color, value: d.value } : null;
        })
        .filter(Boolean);
      setOhlc({ o: c.open, h: c.high, l: c.low, c: c.close, time: param.time, mas });
    });
    chartRef.current = chart;

    // --- RSI sub-panel (RSI line + signal line + 30/50/70 levels) ---
    if (ind.rsi && rsiElRef.current) {
      const rEl = rsiElRef.current;
      const rc = createChart(rEl, {
        width: rEl.clientWidth,
        height: rEl.clientHeight,
        ...baseOpts,
        timeScale: { ...baseOpts.timeScale, visible: false },
      });
      const rs = rc.addLineSeries({ color: "#7c3aed", lineWidth: 3, priceLineVisible: false, lastValueVisible: true });
      rs.setData(candles.filter((c) => c.rsi != null).map((c) => ({ time: c.time, value: c.rsi })) as any);
      // signal line (9-SMA of RSI)
      const rsig = rc.addLineSeries({ color: "#f59e0b", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      rsig.setData(candles.filter((c) => c.rsiSignal != null).map((c) => ({ time: c.time, value: c.rsiSignal })) as any);
      rs.createPriceLine({ price: 70, color: "#e11d48", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "70" } as any);
      rs.createPriceLine({ price: 50, color: "#cbd5e1", lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "50" } as any);
      rs.createPriceLine({ price: 30, color: "#16a34a", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "30" } as any);
      rc.subscribeCrosshairMove((param) => {
        const rv: any = param.seriesData?.get(rs);
        const sv: any = param.seriesData?.get(rsig);
        setRsiHover(rv?.value != null ? { rsi: rv.value, signal: sv?.value } : null);
      });
      rc.timeScale().fitContent();
      rsiChartRef.current = rc;
    }

    // --- ADX sub-panel (the classic 3 lines: ADX + +DI + -DI) ---
    if (ind.adx && adxElRef.current) {
      const aEl = adxElRef.current;
      const ac = createChart(aEl, {
        width: aEl.clientWidth,
        height: aEl.clientHeight,
        ...baseOpts,
        timeScale: { ...baseOpts.timeScale, visible: true },
      });
      // +DI (green) and -DI (red) show direction; ADX (indigo) shows strength.
      const pdi = ac.addLineSeries({ color: "#22c55e", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      pdi.setData(candles.filter((c) => c.plusDI != null).map((c) => ({ time: c.time, value: c.plusDI })) as any);
      const mdi = ac.addLineSeries({ color: "#ef4444", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      mdi.setData(candles.filter((c) => c.minusDI != null).map((c) => ({ time: c.time, value: c.minusDI })) as any);
      const as = ac.addLineSeries({ color: "#4f46e5", lineWidth: 3, priceLineVisible: false, lastValueVisible: true });
      as.setData(candles.filter((c) => c.adx != null).map((c) => ({ time: c.time, value: c.adx })) as any);
      as.createPriceLine({ price: 25, color: "#94a3b8", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "25" } as any);
      ac.subscribeCrosshairMove((param) => {
        const av: any = param.seriesData?.get(as);
        const pv: any = param.seriesData?.get(pdi);
        const mv: any = param.seriesData?.get(mdi);
        setAdxHover(av?.value != null || pv?.value != null ? { adx: av?.value, pdi: pv?.value, mdi: mv?.value } : null);
      });
      ac.timeScale().fitContent();
      adxChartRef.current = ac;
    }

    // Sync the time scales of all panes so zoom/pan stays aligned.
    const panes = [chart, rsiChartRef.current, adxChartRef.current].filter(Boolean) as IChartApi[];
    let syncing = false;
    const subs = panes.map((src) => {
      const handler = (r: any) => {
        if (syncing || !r) return;
        syncing = true;
        panes.forEach((dst) => { if (dst !== src) { try { dst.timeScale().setVisibleLogicalRange(r); } catch {} } });
        syncing = false;
      };
      src.timeScale().subscribeVisibleLogicalRangeChange(handler);
      return { src, handler };
    });

    // Resize all panes with their containers.
    const ro = new ResizeObserver(() => {
      try { if (chartElRef.current) chart.resize(chartElRef.current.clientWidth, chartElRef.current.clientHeight); } catch {}
      try { if (rsiChartRef.current && rsiElRef.current) rsiChartRef.current.resize(rsiElRef.current.clientWidth, rsiElRef.current.clientHeight); } catch {}
      try { if (adxChartRef.current && adxElRef.current) adxChartRef.current.resize(adxElRef.current.clientWidth, adxElRef.current.clientHeight); } catch {}
    });
    ro.observe(el);
    if (rsiElRef.current) ro.observe(rsiElRef.current);
    if (adxElRef.current) ro.observe(adxElRef.current);

    return () => {
      ro.disconnect();
      subs.forEach(({ src, handler }) => { try { src.timeScale().unsubscribeVisibleLogicalRangeChange(handler); } catch {} });
      [chartRef, rsiChartRef, adxChartRef].forEach((r) => { if (r.current) { try { r.current.remove(); } catch {} r.current = null; } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, ind]);

  // Fullscreen — CSS overlay (reliable, keeps the toolbar visible). ESC exits.
  const toggleFs = () => setFs((v) => !v);
  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFs(false);
    document.addEventListener("keydown", onKey);
    // resize the chart into the new space
    const t = setTimeout(() => chartRef.current?.timeScale().fitContent(), 120);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [fs]);

  // Search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const j = await (await fetch(`/api/search-stock?query=${encodeURIComponent(query)}`)).json();
        setResults((j.matches || []).slice(0, 8));
        setShowRes(true);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (sym: string) => {
    setSymbol(sym.toUpperCase());
    setQuery("");
    setResults([]);
    setShowRes(false);
  };

  const addNote = () => {
    if (!noteText.trim()) return;
    saveNote({ symbol, stockName: meta?.name || symbol, text: noteText.trim(), type: "text" });
    setNoteText("");
    loadNotes(symbol);
  };
  const removeNote = (id: string) => { deleteNote(id); loadNotes(symbol); };

  const cur = meta?.currency === "INR" ? "₹" : meta?.currency === "USD" ? "$" : "";
  const up = (meta?.changePct ?? 0) >= 0;

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CandlestickChart className="w-8 h-8 text-indigo-600" /> Chart Analytics
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Pro candlestick charts for US &amp; Indian stocks — full screen, indicators &amp; notes.
          </p>
        </div>
        {/* Search */}
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query && setShowRes(true)}
            onBlur={() => setTimeout(() => setShowRes(false), 200)}
            placeholder="Search symbol or company (US & Indian)…"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {showRes && results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  onMouseDown={() => pick(r.symbol)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2"
                >
                  <span className="font-bold text-slate-800 text-sm">{r.symbol}</span>
                  <span className="text-xs text-slate-500 truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={showNotes && !fs ? "grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start" : "block"}>
        {/* Chart panel — a single card holding header + toolbar + chart, so
            fullscreen keeps all the controls. Fixed height normally; fills the
            viewport when maximised. */}
        <div
          ref={wrapRef}
          className={`min-w-0 bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden ${
            fs
              ? "fixed inset-0 z-[200] rounded-none"
              : `rounded-2xl min-h-[300px] md:min-h-[520px] ${ind.rsi && ind.adx ? "h-[70vh] md:h-[90vh]" : ind.rsi || ind.adx ? "h-[62vh] md:h-[80vh]" : "h-[55vh] md:h-[70vh]"}`
          }`}
        >
          {/* Stock header + toolbar */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="text-xl font-black text-slate-900">{symbol}</span>
                {meta?.name && <span className="text-sm text-slate-500 truncate max-w-[220px]">{meta.name}</span>}
                {meta?.price != null && (
                  <span className="text-lg font-bold tabular-nums text-slate-800">
                    {cur}{Number(meta.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                )}
                {meta?.changePct != null && (
                  <span className={`inline-flex items-center gap-1 text-sm font-bold ${up ? "text-emerald-600" : "text-rose-600"}`}>
                    {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {up ? "+" : ""}{meta.changePct.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowNotes((v) => !v)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${showNotes ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-100"}`}
                  title="Toggle notes"
                >
                  <StickyNote className="w-3.5 h-3.5" /> Notes
                </button>
                <Link
                  href={`/analyze?symbol=${symbol}&tab=technical`}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-100 flex items-center gap-1"
                  title="Candlestick patterns, chart patterns, support & resistance"
                >
                  <CandlestickChart className="w-3.5 h-3.5" /> Patterns
                </Link>
                <Link href={`/analyze?symbol=${symbol}`} className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Analyze
                </Link>
                <button onClick={() => fetchChart(symbol, range, interval)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Refresh">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button onClick={toggleFs} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title={fs ? "Exit full screen (Esc)" : "Full screen"}>
                  {fs ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {RANGES.map((r) => (
                  <button key={r.key} onClick={() => setRange(r.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${range === r.key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {INTERVALS.map((iv) => (
                  <button key={iv.key} onClick={() => {
                    setIntervalState(iv.key);
                    // Snap to a range that suits the interval so the view isn't
                    // over-dense (hourly/1y) or too sparse (monthly/1mo).
                    // Monthly bars are meant for the long view — snap to the
                    // full lifetime graph.
                    const dr = ({ "1h": "1mo", "1d": "1y", "1wk": "2y", "1mo": "max" } as Record<string, string>)[iv.key];
                    if (dr) setRange(dr);
                  }}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${interval === iv.key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    {iv.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {([
                  ["ma10", "MA10", "text-sky-600"],
                  ["ma20", "MA20", "text-blue-600"],
                  ["ma50", "MA50", "text-amber-600"],
                  ["ma200", "MA200", "text-red-600"],
                  ["rsi", "RSI", "text-violet-600"],
                  ["adx", "ADX", "text-cyan-600"],
                  ["volume", "Vol", "text-slate-500"],
                ] as const).map(([k, label, color]) => (
                  <button key={k} onClick={() => setInd((p) => ({ ...p, [k]: !p[k as keyof typeof p] }))}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold border transition ${ind[k as keyof typeof ind] ? `bg-slate-50 border-slate-200 ${color}` : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chart area — main chart + optional RSI/ADX sub-panels */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Main price chart */}
            <div className="relative flex-1 min-h-0">
              {ohlc && (
                <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold bg-white/90 backdrop-blur px-2.5 py-1.5 rounded-lg border border-slate-100 max-w-[calc(100%-1.5rem)]">
                  <span className="text-slate-400">O <span className="text-slate-700">{cur}{ohlc.o?.toFixed(2)}</span></span>
                  <span className="text-slate-400">H <span className="text-emerald-600">{cur}{ohlc.h?.toFixed(2)}</span></span>
                  <span className="text-slate-400">L <span className="text-rose-600">{cur}{ohlc.l?.toFixed(2)}</span></span>
                  <span className="text-slate-400">C <span className="text-slate-900">{cur}{ohlc.c?.toFixed(2)}</span></span>
                  {(ohlc.mas || []).map((m: any) => (
                    <span key={m.label} className="flex items-center gap-1 text-slate-500">
                      <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      {m.label} <span className="text-slate-800">{cur}{Number(m.value).toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              )}
              {loading && !meta && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm z-10">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading chart…
                </div>
              )}
              {error ? (
                <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm">{error}</div>
              ) : (
                <div ref={chartElRef} className="w-full h-full" />
              )}
            </div>

            {/* RSI sub-panel */}
            {ind.rsi && !error && (
              <div className="shrink-0 border-t border-slate-100 relative">
                <div className="absolute top-1 left-3 z-10 flex items-center gap-2.5 text-[10px] font-black">
                  <span className="text-violet-600">RSI (14)</span>
                  <span className="text-amber-500 font-bold">— signal</span>
                  <span className="text-slate-400 font-medium">30 / 50 / 70</span>
                </div>
                <div className="relative">
                  <div className="absolute top-1 left-2 z-10 flex gap-3 text-[11px] font-bold bg-white/85 backdrop-blur px-2 py-0.5 rounded pointer-events-none">
                    <span className="text-slate-400">RSI <span className="text-violet-700">{rsiHover?.rsi != null ? rsiHover.rsi.toFixed(1) : "—"}</span></span>
                    <span className="text-slate-400">Signal <span className="text-amber-600">{rsiHover?.signal != null ? rsiHover.signal.toFixed(1) : "—"}</span></span>
                  </div>
                  <div ref={rsiElRef} className="w-full h-[120px]" />
                </div>
              </div>
            )}

            {/* ADX sub-panel */}
            {ind.adx && !error && (
              <div className="shrink-0 border-t border-slate-100 relative">
                <div className="absolute top-1 left-3 z-10 flex items-center gap-2.5 text-[10px] font-black">
                  <span className="text-indigo-600">ADX (14)</span>
                  <span className="text-green-600">+DI</span>
                  <span className="text-red-500">−DI</span>
                  <span className="text-slate-400 font-medium">25 = trend</span>
                </div>
                <div className="relative">
                  <div className="absolute top-1 left-2 z-10 flex gap-3 text-[11px] font-bold bg-white/85 backdrop-blur px-2 py-0.5 rounded pointer-events-none">
                    <span className="text-slate-400">ADX <span className="text-indigo-700">{adxHover?.adx != null ? adxHover.adx.toFixed(1) : "—"}</span></span>
                    <span className="text-slate-400">+DI <span className="text-emerald-600">{adxHover?.pdi != null ? adxHover.pdi.toFixed(1) : "—"}</span></span>
                    <span className="text-slate-400">−DI <span className="text-rose-600">{adxHover?.mdi != null ? adxHover.mdi.toFixed(1) : "—"}</span></span>
                  </div>
                  <div ref={adxElRef} className="w-full h-[130px]" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes column (collapsible, hidden in fullscreen) */}
        {showNotes && !fs && (
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-3 xl:sticky xl:top-4">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-indigo-600" /> Notes on {symbol}
              </h3>
              <button onClick={() => setShowNotes(false)} className="text-slate-300 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* full notes tool — text + voice recording + topic + category */}
            <StockNotes symbol={symbol} stockName={meta?.name || symbol} />
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-slate-400 italic">
        Candles &amp; indicators via Yahoo Finance. Research support only. Not buy/sell advice. Always verify data independently.
      </p>
    </div>
  );
}
