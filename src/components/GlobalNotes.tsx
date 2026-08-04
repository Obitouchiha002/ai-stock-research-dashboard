"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { StickyNote, X, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import StockNotes from "@/components/StockNotes";
import { getLastAnalysisTab } from "@/lib/storage";

// Detect the stock the user is currently looking at, from the URL.
function detectSymbol(pathname: string | null, search: URLSearchParams | null): string {
  if (pathname?.startsWith("/stock/")) {
    const seg = pathname.split("/")[2];
    if (seg) return decodeURIComponent(seg).toUpperCase();
  }
  const q = search?.get("symbol");
  if (q) return q.toUpperCase();
  return "";
}

// Friendly page name from the route, used to auto-tag where a note was written.
const PAGE_LABELS: Record<string, string> = {
  analyze: "Analyze", stock: "Stock", charts: "Charts", watchlist: "Watchlist",
  portfolio: "Portfolio", markets: "Markets", dashboard: "Dashboard", screener: "Screener",
  compare: "Compare", news: "News", digest: "Daily Digest", research: "Research",
  "trend-alerts": "Trend Alerts", alerts: "Alerts", sheets: "Sheets", import: "Import",
  qa: "Q&A", prompts: "Prompts", notes: "Notes", settings: "Settings",
};
function detectPage(pathname: string | null): string {
  const seg = (pathname || "").split("/").filter(Boolean)[0] || "";
  return PAGE_LABELS[seg] || "";
}

export default function GlobalNotes() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("GENERAL");
  const [editingSym, setEditingSym] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();

  const autoPage = detectPage(pathname);
  // Section only makes sense on the analyze page, where the active tab mirrors
  // into getLastAnalysisTab(). Capitalise it for display.
  const rawTab = pathname?.startsWith("/analyze") ? getLastAnalysisTab() : "";
  const autoSection = rawTab ? rawTab.charAt(0).toUpperCase() + rawTab.slice(1) : "";

  // Keyboard shortcut: Cmd/Ctrl + J  (jot a note). Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When opening, prefill the symbol from the current page context.
  useEffect(() => {
    if (open) {
      const detected = detectSymbol(pathname, search);
      if (detected) setSymbol(detected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {/* Floating button (every page) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Quick Note (Cmd/Ctrl + J)"
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[90] w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 flex items-center justify-center transition-transform hover:scale-105 print:hidden"
        >
          <StickyNote className="w-5 h-5" />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-slate-50 z-[110] flex flex-col border-l border-slate-200 shadow-2xl"
            >
              <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <StickyNote className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="text-sm font-black text-slate-900">Quick Note</div>
                    <div className="text-[10px] text-slate-400">Saved to Master Notes · Cmd/Ctrl+J to toggle</div>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Symbol selector */}
              <div className="px-4 py-3 bg-white border-b border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    Note for: <button onClick={() => setEditingSym((v) => !v)} className="font-black text-indigo-600 hover:underline">{symbol === "GENERAL" ? "General" : symbol}</button>
                    {autoPage && <span className="text-[10px] font-bold text-slate-400">· on {autoPage}{autoSection ? ` (${autoSection})` : ""}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSymbol("GENERAL"); setEditingSym(false); }}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${symbol === "GENERAL" ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-indigo-600 border border-slate-200"}`}
                      title="Write a general note (stock auto-detected on save)"
                    >
                      General
                    </button>
                    {!editingSym && (
                      <button onClick={() => setEditingSym(true)} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600">change</button>
                    )}
                  </div>
                </div>
                {editingSym && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); setEditingSym(false); }}
                    className="mt-2 flex gap-2"
                  >
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        autoFocus
                        value={symbol === "GENERAL" ? "" : symbol}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase() || "GENERAL")}
                        placeholder="Symbol e.g. AAPL — or leave blank for GENERAL"
                        className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>
                    <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">OK</button>
                  </form>
                )}
              </div>

              {/* Composer + list (reuses StockNotes) */}
              <div className="flex-1 overflow-y-auto p-4">
                <StockNotes symbol={symbol || "GENERAL"} stockName={symbol || "GENERAL"} autoPage={autoPage} autoSection={autoSection} compact />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
