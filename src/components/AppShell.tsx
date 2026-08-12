"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import GlobalNotes from "@/components/GlobalNotes";
import VoiceTyping from "@/components/VoiceTyping";
import PriceAlertMonitor from "@/components/PriceAlertMonitor";
import SyncManager from "@/components/SyncManager";
import ComboMonitor from "@/components/ComboMonitor";
import DevMarkup from "@/components/DevMarkup";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Star,
  Filter,
  ArrowLeftRight,
  Briefcase,
  FileText,
  Bell,
  Newspaper,
  StickyNote,
  BookOpen,
  ScanSearch,
  BookMarked,
  SlidersHorizontal,
  FileCode2,
  Upload,
  FileSpreadsheet,
  CalendarClock,
  CandlestickChart,
  Gauge,
  Globe,
  TrendingUp,
  Menu,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Search,
  RefreshCw,
  Moon,
  Sun,
  User,
  X,
  Check,
  CheckSquare,
} from "lucide-react";
import { useGlobal } from "@/context/GlobalContext";
import {
  getNotifications,
  markNotificationRead,
  clearAllNotifications,
  getWatchlist,
  getReports,
  getAlerts,
} from "@/lib/storage";

// Headline indices for the dark topbar ticker — switches with the market.
const TICKER_INDIA = [
  { symbol: "^NSEI", label: "NIFTY 50" },
  { symbol: "^BSESN", label: "SENSEX" },
  { symbol: "^NSEBANK", label: "BANK NIFTY" },
  { symbol: "NIFTY_MIDCAP_100.NS", label: "NIFTY MIDCAP" },
  { symbol: "^CNXSC", label: "NIFTY SMALLCAP" },
  { symbol: "^INDIAVIX", label: "INDIA VIX" },
];
const TICKER_US = [
  { symbol: "^DJI", label: "DOW" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^RUT", label: "RUSSELL 2K" },
  { symbol: "DX-Y.NYB", label: "DOLLAR" },
  { symbol: "^VIX", label: "VIX" },
];

// Phone bottom bar — the five most-used destinations.
const BOTTOM_TABS = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analyze", href: "/analyze", icon: Activity },
  { name: "Charts", href: "/charts", icon: CandlestickChart },
  { name: "Markets", href: "/markets", icon: Globe },
  { name: "Portfolio", href: "/portfolio", icon: Briefcase },
];

// The short, everyday primary nav — what a normal user actually opens daily.
// Everything advanced lives one click away under "More tools" so the rail
// reads as ~7 items instead of an overwhelming wall of 22.
const PRIMARY_NAV = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analyze Stock", href: "/analyze", icon: Activity },
  { name: "Chart Analytics", href: "/charts", icon: CandlestickChart },
  { name: "Markets", href: "/markets", icon: Globe },
  { name: "Watchlist", href: "/watchlist", icon: Star },
  { name: "Portfolio", href: "/portfolio", icon: Briefcase },
];

// Power-user destinations, still grouped, revealed under "More tools".
const MORE_GROUPS = [
  {
    label: "Research tools",
    items: [
      { name: "Combinations", href: "/combos", icon: SlidersHorizontal },
      { name: "Compare Stocks", href: "/compare", icon: ArrowLeftRight },
      { name: "AI Research", href: "/ai-chat", icon: MessageSquare },
    ],
  },
  {
    label: "Alerts & digest",
    items: [
      { name: "Trend Alerts", href: "/trend-alerts", icon: TrendingUp },
      { name: "Price Alerts", href: "/alerts", icon: Bell },
      { name: "Daily Digest", href: "/digest", icon: CalendarClock },
    ],
  },
  {
    label: "Workspace",
    items: [
      { name: "Notebook", href: "/notebook", icon: BookOpen },
      { name: "Prompt Library", href: "/prompts", icon: BookMarked },
      { name: "HTML Reports", href: "/html-reports", icon: FileCode2 },
      { name: "AI Usage", href: "/ai-usage", icon: Gauge },
    ],
  },
];

const MORE_HREFS = MORE_GROUPS.flatMap((g) => g.items.map((i) => i.href));

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false); // off-canvas drawer on phones
  const [searchQuery, setSearchQuery] = useState("");
  const { market, setMarket, timeframe, setTimeframe, triggerRefresh, theme, setTheme, profileName, profilePhoto, setProfile } = useGlobal();
  const [themeLocal, setThemeLocal] = useState(theme);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<
    Record<string, string | number | boolean>[]
  >([]);
  const [searchResults, setSearchResults] = useState<Record<string, string>[]>(
    [],
  );
  const [searchFocused, setSearchFocused] = useState(false);
  // Sidebar market-status widget: IST clock + NSE/BSE open status.
  const [istTime, setIstTime] = useState("");
  const [marketOpen, setMarketOpen] = useState(false);

  // IST clock + NSE/BSE open status (Mon–Fri, 09:15–15:30 IST; holidays aside).
  useEffect(() => {
    const tick = () => {
      const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const mins = ist.getHours() * 60 + ist.getMinutes();
      const day = ist.getDay();
      setIstTime(ist.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }));
      setMarketOpen(day >= 1 && day <= 5 && mins >= 555 && mins <= 930);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const pathname = usePathname();
  const router = useRouter();

  const isItemActive = (href: string) =>
    pathname === href ||
    (pathname === "/" && href === "/dashboard") ||
    (pathname || "").startsWith(`${href}/`);

  // "More tools" starts open only if the current page lives inside it, so the
  // active item is always visible without forcing the whole list open.
  const inMore = MORE_HREFS.some((h) => isItemActive(h));
  const [moreOpen, setMoreOpen] = useState(inMore);
  useEffect(() => {
    if (inMore) setMoreOpen(true);
  }, [inMore]);

  const renderNavItem = (item: { name: string; href: string; icon: any }) => {
    const isActive = isItemActive(item.href);
    return (
      <Link
        key={item.name}
        href={item.href}
        className={`flex items-center group gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive ? "bg-white/10 text-white font-bold" : "text-slate-300 font-medium hover:bg-white/5 hover:text-white"}`}
        title={isCollapsed ? item.name : undefined}
      >
        <item.icon
          className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-amber-400" : "text-slate-400 group-hover:text-slate-200"}`}
        />
        {(!isCollapsed || mobileOpen) && <span className="truncate">{item.name}</span>}
      </Link>
    );
  };

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    setNotifications(getNotifications());
    // Refresh notifications occasionally
    const interval = setInterval(
      () => setNotifications(getNotifications()),
      5000,
    );
    return () => clearInterval(interval);
  }, []);

  const handleSearchChange = (val: string) => {
    const q = val.toUpperCase();
    setSearchQuery(q);

    if (q.length > 0) {
      const dbWatch = getWatchlist()
        .filter(
          (i) => i.symbol.includes(q) || i.name?.toUpperCase().includes(q),
        )
        .map((i) => ({ ...i, type: "Watchlist" }));
      const dbRep = getReports()
        .filter(
          (i) => i.symbol.includes(q) || i.name?.toUpperCase().includes(q),
        )
        .map((i) => ({ ...i, type: "Report" }));
      const dbAlert = getAlerts()
        .filter((i) => i.symbol.includes(q))
        .map((i) => ({ ...i, type: "Alert" }));

      setSearchResults([...dbWatch, ...dbRep, ...dbAlert].slice(0, 8));
      setSearchFocused(true);
    } else {
      setSearchResults([]);
      setSearchFocused(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/analyze?symbol=${encodeURIComponent(searchQuery)}`);
      setSearchQuery("");
      setSearchFocused(false);
    }
  };

  const navigateToResult = (res: any) => {
    if (res.type === "Report")
      router.push(`/stock/${res.symbol}?reportId=${res.id}`);
    else if (res.type === "Watchlist") router.push(`/stock/${res.symbol}`);
    else if (res.type === "Alert") router.push(`/alerts`);

    setSearchQuery("");
    setSearchFocused(false);
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    setThemeLocal(next);
  };

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    triggerRefresh(); // notify any listeners
    // Re-fetch the current page's data (client pages fetch on mount).
    setTimeout(() => {
      if (typeof window !== "undefined") window.location.reload();
    }, 350);
  };

  return (
    <div
      className={`flex h-screen overflow-hidden bg-slate-50 text-slate-800 font-sans ${theme === "dark" ? "dark text-slate-100 bg-slate-900" : ""}`}
    >
      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — dark navy rail (broker-grade). Off-canvas on phones. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 border-r border-white/5 bg-gradient-to-b from-[#0d1638] to-[#0a1029] text-slate-300 flex flex-col
          transform transition-transform duration-300 md:static md:z-auto md:translate-x-0 md:transition-all
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          ${isCollapsed ? "md:w-20" : "md:w-64"}`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
          {(!isCollapsed || mobileOpen) && (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-xl flex-shrink-0 grid place-items-center bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-500/30">
                <CandlestickChart className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[19px] font-black text-white tracking-tight whitespace-nowrap md:inline">
                Stock<span className="text-amber-400">Analytix</span>
              </span>
            </div>
          )}
          {isCollapsed && !mobileOpen && (
            <div
              className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-500/30 mx-auto flex-shrink-0 cursor-pointer hidden md:grid"
              onClick={() => setIsCollapsed(false)}
            >
              <CandlestickChart className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
          )}
          {/* desktop collapse */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md text-slate-400 hover:bg-white/10 hover:text-white hidden md:block"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
          {/* mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 flex flex-col overflow-y-auto py-4 px-3 hide-scrollbar">
          {/* Primary action — the one thing this app is for */}
          <Link
            href="/analyze"
            title={isCollapsed && !mobileOpen ? "New Analysis" : undefined}
            className={`mb-3 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/25 hover:bg-indigo-700 transition-all ${
              isCollapsed && !mobileOpen ? "w-11 h-11 mx-auto" : "px-4 py-2.5"
            }`}
          >
            <Activity className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
            {(!isCollapsed || mobileOpen) && <span>New Analysis</span>}
          </Link>

          {/* Everyday essentials — always visible */}
          <div className="space-y-1">{PRIMARY_NAV.map(renderNavItem)}</div>

          {!isCollapsed || mobileOpen ? (
            /* Expanded rail: everything visible in one flat, grouped list. */
            <div className="mt-3 space-y-4">
              {MORE_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {group.label}
                  </div>
                  <div className="space-y-1">{group.items.map(renderNavItem)}</div>
                </div>
              ))}
            </div>
          ) : (
            /* Collapsed icon rail: advanced items sit below a divider as icons */
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
              {MORE_GROUPS.flatMap((g) => g.items).map(renderNavItem)}
            </div>
          )}

          {/* Spacer pushes the feature card to the bottom so the rail never
              looks half-empty. */}
          <div className="flex-1 min-h-[16px]" />

          {(!isCollapsed || mobileOpen) && (
            <Link
              href="/ai-chat"
              className="group block rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-4 text-white shadow-sm shadow-indigo-500/25"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-[13px] font-black">AI Research</span>
              </div>
              <p className="text-[11px] text-indigo-100 mt-1.5 leading-snug">
                Chat, load a stock, or attach a document — one clean assistant.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-black bg-white/15 group-hover:bg-white/25 rounded-lg px-2.5 py-1.5 transition-colors">
                Try it <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          )}
        </nav>

        {/* Pinned footer — market status + settings anchor the bottom */}
        <div className="border-t border-white/5 p-3 space-y-1">
          {(!isCollapsed || mobileOpen) && (
            <div className="mb-2 rounded-xl bg-white/5 border border-white/5 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Market Status</span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-black ${marketOpen ? "text-emerald-400" : "text-slate-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${marketOpen ? "bg-emerald-400" : "bg-slate-500"}`} />
                  {marketOpen ? "Open" : "Closed"}
                </span>
              </div>
              <div className="text-[11px] font-bold text-slate-500 mt-1 tabular-nums">NSE · BSE · {istTime} IST</div>
            </div>
          )}
          {renderNavItem({ name: "Settings", href: "/settings", icon: Settings })}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-white/5 bg-gradient-to-r from-[#0d1638] to-[#0a1029] flex items-center gap-3 px-3 sm:px-5 w-full">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-1 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="relative flex-1 max-w-md hidden sm:block z-50">
            <form onSubmit={handleSearchSubmit}>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search stocks…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (searchQuery) setSearchFocused(true);
                }}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                className="w-full bg-white/10 border border-white/10 text-white placeholder:text-slate-400 focus:bg-white/15 focus:border-white/20 focus:ring-2 focus:ring-white/10 text-sm rounded-full pl-10 pr-4 py-2 transition-all outline-none"
              />
            </form>
            {searchFocused && searchResults.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                <ul>
                  {searchResults.map((res, i) => (
                    <li
                      key={i}
                      onClick={() => navigateToResult(res)}
                      className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                          {res.symbol.substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900 group-hover:text-indigo-600">
                            {res.symbol}
                          </div>
                          <div className="text-xs text-slate-500">
                            {res.name || "Saved entity"}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 rounded">
                        {res.type}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 ml-auto md:ml-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-60"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <div className="relative">
              <button
                onClick={() => setNotifsOpen(!notifsOpen)}
                className="relative p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {notifications.some((n: any) => !n.read) && (
                  <span className="absolute top-1 right-2 w-2 h-2 bg-rose-500 rounded-full"></span>
                )}
              </button>

              {notifsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setNotifsOpen(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-[400px]">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="font-bold text-slate-900">
                        Notifications
                      </div>
                      <button
                        onClick={() => {
                          clearAllNotifications();
                          setNotifications([]);
                        }}
                        className="text-xs font-semibold text-slate-500 hover:text-rose-600"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto w-full hide-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm font-medium">
                          No new notifications
                        </div>
                      ) : (
                        notifications.map((n: any) => (
                          <div
                            key={n.id}
                            className={`p-4 border-b border-slate-100 ${n.read ? "opacity-60" : "bg-white"}`}
                          >
                            <div className="flex gap-3">
                              <div
                                className={`mt-0.5 rounded-full p-1.5 h-fit ${n.type === "success" ? "bg-emerald-50 text-emerald-600" : n.type === "error" ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}
                              >
                                {n.type === "success" ? (
                                  <Check className="w-3 h-3" />
                                ) : n.type === "error" ? (
                                  <X className="w-3 h-3" />
                                ) : (
                                  <Bell className="w-3 h-3" />
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm text-slate-800 font-medium">
                                  {n.message}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {new Date(n.createdAt).toLocaleTimeString()}
                                </p>
                              </div>
                              {!n.read && (
                                <button
                                  onClick={() => {
                                    markNotificationRead(n.id);
                                    setNotifications(getNotifications());
                                  }}
                                  className="text-[10px] text-indigo-600 font-bold hover:underline h-fit"
                                >
                                  Mark Read
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={toggleTheme}
              className="hidden sm:block p-2 text-slate-300 hover:text-amber-400 hover:bg-white/10 rounded-full transition-colors"
              title="Theme"
            >
              {theme === "light" ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold hover:ring-2 ring-offset-2 ring-offset-[#0a1029] ring-amber-400/60 overflow-hidden shrink-0"
              >
                {profilePhoto ? (
                  <img src={profilePhoto} alt={profileName} className="w-8 h-8 object-cover rounded-full" />
                ) : (
                  <span className="text-xs font-black text-white">{(profileName || "U").charAt(0).toUpperCase()}</span>
                )}
              </button>

              {profileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setProfileOpen(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden shrink-0">
                        {profilePhoto ? (
                          <img src={profilePhoto} alt={profileName} className="w-10 h-10 object-cover rounded-full" />
                        ) : (
                          <span className="text-sm font-black text-indigo-700">{(profileName || "U").charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{profileName || "Your profile"}</div>
                        <Link
                          href="/settings"
                          onClick={() => setProfileOpen(false)}
                          className="text-xs font-semibold text-indigo-600 hover:underline"
                        >
                          Edit profile
                        </Link>
                      </div>
                    </div>
                    <div className="p-2">
                      <Link
                        href="/ai-usage"
                        onClick={() => setProfileOpen(false)}
                        className="block px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg"
                      >
                        AI Usage
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="block px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg"
                      >
                        Settings
                      </Link>
                      <button
                        onClick={() => setProfileOpen(false)}
                        className="w-full text-left px-4 py-2 text-sm text-rose-600 font-medium hover:bg-rose-50 rounded-lg"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 md:pb-20 bg-slate-50 relative hide-scrollbar text-slate-800">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar — quick access, app-like */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 flex justify-around items-stretch pb-[env(safe-area-inset-bottom)]">
        {BOTTOM_TABS.map((t) => {
          const isActive = pathname === t.href || (pathname || "").startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition ${
                isActive ? "text-indigo-600" : "text-slate-400"
              }`}
            >
              <t.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-bold">{t.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Global quick-notes (every page) — FAB + Cmd/Ctrl+J */}
      <Suspense fallback={null}>
        <GlobalNotes />
        <VoiceTyping />
      </Suspense>
      {/* Background watcher — fires notifications when price hits a set level */}
      <PriceAlertMonitor />
      <SyncManager />
      <ComboMonitor />
      {/* Developer markup tool (hidden — unlock with Ctrl/Cmd+Shift+D): content-
          anchored sticky notes + voice notes + pen marks, saved per page */}
      <DevMarkup />
    </div>
  );
}
