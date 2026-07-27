"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  TrendingUp,
  AlertTriangle,
  Printer,
  Activity,
  ShieldAlert,
  ChevronRight,
  ArrowUpRight,
  Zap,
  Save,
  Plus,
  Target,
  PieChart,
  Download,
  Bookmark,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { createChart, CrosshairMode, IChartApi, ISeriesApi } from "lightweight-charts";
import {
  getReports,
  saveToWatchlist,
  saveReport,
  addNotification,
} from "@/lib/storage";
import { motion, AnimatePresence } from "motion/react";

export default function StockDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const symbol = Array.isArray(params.symbol)
    ? params.symbol[0]
    : params.symbol;
  const reportId = searchParams.get("reportId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [chartType, setChartType] = useState("Area");
  const [showSMA, setShowSMA] = useState(true);
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const lwChart = React.useRef<IChartApi | null>(null);
  const candleSeries = React.useRef<ISeriesApi<'Candlestick'> | null>(null);
  const smaSeries = React.useRef<ISeriesApi<'Line'> | null>(null);
  const [barSpacing, setBarSpacing] = useState(6);
  const [liveMode, setLiveMode] = useState(false);

  useEffect(() => {
    if (!symbol) return;

    if (reportId) {
      const reports = getReports();
      const savedReport = reports.find(
        (r) => r.id === reportId && r.symbol === symbol,
      );
      if (savedReport && savedReport.data) {
        setData(savedReport.data);
        setLoading(false);
        return;
      }
    }

    // Fetch fresh analysis
    const fetchAnalysis = async () => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: symbol }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to analyze stock");
        setData(json);
      } catch (err: any) {
        setError(err.message || "An error occurred during analysis.");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [symbol, reportId]);

  const handleToggleWatchlist = () => {
    if (!data) return;
    saveToWatchlist({
      symbol: data.stock.ticker,
      name: data.stock.name,
      exchange: data.stock.exchange,
      currentPrice: data.stock.currentPrice,
      change: data.pricePerformance.oneDay,
      score: data.final.totalScore,
      view: data.final.bias,
      risk: data.risk.riskLevel,
    });
    addNotification({
      type: "success",
      message: `${data.stock.ticker} added to Watchlist.`,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 50) return "text-amber-500";
    return "text-rose-500";
  };

  // Lightweight-charts: initialize & update when needed
  useEffect(() => {
    if (chartType !== "Candlestick") {
      // remove existing chart if any
      if (lwChart.current) {
        try {
          lwChart.current.remove();
        } catch (e) {}
        lwChart.current = null;
        candleSeries.current = null;
        smaSeries.current = null;
      }
      return;
    }

    if (!chartRef.current || !data?.chartData) return;

    // cleanup previous
    if (lwChart.current) {
      try {
        lwChart.current.remove();
      } catch (e) {}
      lwChart.current = null;
    }

    const container = chartRef.current;
    const chart = createChart(container, {
      layout: { background: { color: "#ffffff" }, textColor: "#0f172a" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e6edf3" },
      timeScale: { borderColor: "#e6edf3", barSpacing },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { axisPressedMouseMove: { time: true, price: false }, mouseWheel: true, pinch: true },
    });

    candleSeries.current = chart.addCandlestickSeries({
      upColor: "#16a34a",
      downColor: "#ef4444",
      wickUpColor: "#16a34a",
      wickDownColor: "#ef4444",
      borderVisible: false,
      wickVisible: true,
    });

    const cdata = (data.chartData || []).map((d: any) => ({
      time: d.date,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
    }));
    candleSeries.current.setData(cdata);

    if (showSMA) {
      smaSeries.current = chart.addLineSeries({ color: "#ff0066", lineWidth: 2 });
      const smaData = (data.chartData || [])
        .map((d: any) => ({ time: d.date, value: d.sma50 || null }))
        .filter((p: any) => p.value !== null);
      smaSeries.current.setData(smaData as any);
    }

    lwChart.current = chart;
    // fit content and respond to resize
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      if (!chartRef.current) return;
      try {
        chart.resize(chartRef.current.clientWidth, chartRef.current.clientHeight);
      } catch (e) {}
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      try {
        chart.remove();
      } catch (e) {}
      lwChart.current = null;
      candleSeries.current = null;
      smaSeries.current = null;
    };
  }, [chartType, data?.chartData, barSpacing, showSMA]);

  // keep a mutable ref of latest candle array for live updates
  const latestCandlesRef = React.useRef<any[]>([]);
  useEffect(() => {
    if (data?.chartData) latestCandlesRef.current = data.chartData;
  }, [data?.chartData]);

  // Live polling for latest quote when liveMode enabled
  useEffect(() => {
    if (!liveMode) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const q = await res.json();
        if (cancelled) return;
        if (!q || !q.price) return;

        const time = q.time ? new Date(q.time).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        const price = Number(q.price);

        // update last candle or append
        const arr = latestCandlesRef.current || [];
        const last = arr[arr.length - 1];
        if (!last || last.date !== time) {
          // new candle
          const newCandle = { time, open: price, high: price, low: price, close: price };
          try {
            candleSeries.current?.update({ time, open: price, high: price, low: price, close: price } as any);
          } catch (e) {}
          latestCandlesRef.current = [...arr, { date: time, open: price, high: price, low: price, close: price }];
        } else {
          // update existing candle
          const updated = {
            time,
            open: last.open || last.close || price,
            high: Math.max(last.high || price, price),
            low: Math.min(last.low || price, price),
            close: price,
          };
          try {
            candleSeries.current?.update(updated as any);
          } catch (e) {}
          latestCandlesRef.current[arr.length - 1] = { date: time, ...updated };
        }
      } catch (e) {
        // ignore
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      cancelled = true;
    };
  }, [liveMode, symbol]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-16 text-center animate-pulse max-w-sm w-full">
          <div className="h-10 w-10 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            Loading Detail...
          </h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-center gap-3 max-w-2xl mx-auto">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 shadow-sm print:shadow-none mb-8">
        <div className="max-w-screen-2xl mx-auto px-4 py-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 uppercase tracking-widest">
                  {data.stock.sector || "EQUITY"}
                </span>
                <span className="text-xs font-bold px-2 py-1 rounded bg-indigo-50 text-indigo-600 uppercase tracking-widest">
                  {data.stock.exchange}:{data.stock.ticker}
                </span>
              </div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                {data.stock.name}
                <span className="text-xl font-semibold text-slate-400">
                  ({data.stock.currency})
                </span>
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-6 w-full lg:w-auto">
              <div className="text-right flex-1 lg:flex-none">
                <div className="text-sm font-semibold text-slate-500 mb-1">
                  Current Price
                </div>
                <div className="text-3xl font-black text-slate-800 font-mono tracking-tight flex justify-end gap-2 items-baseline">
                  {data.stock.currency === "INR" ? "₹" : "$"}
                  {data.stock.currentPrice}
                  <span
                    className={`text-lg font-bold ${data.pricePerformance.oneDay?.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {data.pricePerformance.oneDay}
                  </span>
                </div>
              </div>

              <div className="h-12 w-px bg-slate-200 hidden md:block"></div>

              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold text-slate-500">
                    Final Score
                  </div>
                  <div className="text-xl font-bold text-slate-800">
                    {data.final.bias}
                  </div>
                </div>
                <div className="relative w-14 h-14">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="40%"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      className="text-slate-100"
                    />
                    <circle
                      cx="50%"
                      cy="50%"
                      r="40%"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray="251.2"
                      strokeDashoffset={
                        251.2 - (data.final.totalScore / 100) * 251.2
                      }
                      className={getScoreColor(data.final.totalScore)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-base font-black text-slate-800">
                    {data.final.totalScore}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 mt-8">
            <div className="flex gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">
              {[
                "overview",
                "technicals",
                "fundamentals",
                "valuation",
                "news",
                "risk",
              ].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-bold rounded-lg capitalize transition-colors relative whitespace-nowrap ${activeTab === tab ? "text-indigo-700 bg-indigo-50" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="detailtab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="hidden sm:flex gap-2 print:hidden">
              <button
                onClick={handleToggleWatchlist}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2 transition-colors"
              >
                <Bookmark className="w-4 h-4" /> Watchlist
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 shadow-sm flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" /> PDF Report
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-400 uppercase">
                    Market Cap
                  </div>
                  <div className="text-xl font-bold mt-1 text-slate-800">
                    {data.stock.marketCap}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-400 uppercase">
                    P/E Ratio
                  </div>
                  <div className="text-xl font-bold mt-1 text-slate-800">
                    {data.fundamental.pe}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-400 uppercase">
                    1Y Return
                  </div>
                  <div
                    className={`text-xl font-bold mt-1 ${data.pricePerformance.oneYear?.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {data.pricePerformance.oneYear}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" /> Price Chart
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  {[
                    { key: "Candlestick", label: "Candlestick" },
                    { key: "Area", label: "Area" },
                    { key: "Line", label: "Line" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setChartType(t.key)}
                      className={`px-3 py-1 rounded-md text-sm font-semibold ${chartType === t.key ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "bg-white text-slate-600 border border-slate-100"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setChartType((c) => (c === "Candlestick" ? c : "Candlestick"))}
                    className="ml-2 px-3 py-1 rounded-md text-sm font-semibold bg-white text-slate-600 border border-slate-100"
                  >
                    {/* placeholder to align */}
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setLiveMode((s) => !s)}
                      className={`px-3 py-1 rounded-md text-sm font-semibold ${liveMode ? "bg-rose-50 text-rose-700 border border-rose-100" : "bg-white text-slate-600 border border-slate-100"}`}
                    >
                      {liveMode ? "Live: ON" : "Live: OFF"}
                    </button>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  {chartType === "Area" && (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.chartData || []}
                        margin={{ top: 5, right: 0, left: -25, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="colorColor"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#4f46e5"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#4f46e5"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={30}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => val.toFixed(0)}
                        />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="#4f46e5"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorColor)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                  {chartType === "Line" && (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.chartData || []} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} />
                        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(val) => val.toFixed(0)} />
                        <RechartsTooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                        <Line type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {chartType === "Candlestick" && (
                    <div className="w-full h-full relative">
                      <div className="absolute top-3 right-3 z-10 flex gap-2">
                        <button
                          onClick={() => {
                            const next = Math.max(1, barSpacing - 1);
                            setBarSpacing(next);
                            lwChart.current?.applyOptions({ timeScale: { barSpacing: next } });
                          }}
                          className="px-2 py-1 bg-white border rounded text-sm"
                        >
                          Zoom In
                        </button>
                        <button
                          onClick={() => {
                            const next = Math.min(50, barSpacing + 1);
                            setBarSpacing(next);
                            lwChart.current?.applyOptions({ timeScale: { barSpacing: next } });
                          }}
                          className="px-2 py-1 bg-white border rounded text-sm"
                        >
                          Zoom Out
                        </button>
                        <button
                          onClick={() => {
                            setBarSpacing(6);
                            lwChart.current?.applyOptions({ timeScale: { barSpacing: 6 } });
                            lwChart.current?.timeScale().fitContent();
                          }}
                          className="px-2 py-1 bg-white border rounded text-sm"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => setShowSMA((s) => !s)}
                          className="px-2 py-1 bg-white border rounded text-sm"
                        >
                          {showSMA ? "Hide SMA" : "Show SMA"}
                        </button>
                      </div>
                      <div ref={chartRef} className="w-full h-full" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-500" /> AI Executive
                  Summary
                </h3>
                <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {data.final.aiReport?.quickSummary ||
                    "AI Summary unavailable."}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider text-emerald-700">
                  Key Positives
                </h4>
                <ul className="text-sm text-slate-600 space-y-2 list-disc pl-4 marker:text-emerald-500">
                  {data.final.aiReport?.keyPositives?.map(
                    (p: string, i: number) => <li key={i}>{p}</li>,
                  ) || <li>None listed.</li>}
                </ul>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider text-rose-700">
                  Key Risks
                </h4>
                <ul className="text-sm text-slate-600 space-y-2 list-disc pl-4 marker:text-rose-500">
                  {data.final.aiReport?.keyRisks?.map(
                    (r: string, i: number) => <li key={i}>{r}</li>,
                  ) || <li>None listed.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab !== "overview" && (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
            <div className="text-slate-400 font-medium max-w-sm mx-auto">
              Detailed {activeTab} information is currently being integrated
              into this unified view. Return to Overview or Analyze Space for
              full data.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
