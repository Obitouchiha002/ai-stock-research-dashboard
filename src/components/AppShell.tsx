"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import GlobalNotes from "@/components/GlobalNotes";
import VoiceTyping from "@/components/VoiceTyping";
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
  ScanSearch,
  BookMarked,
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

// Phone bottom bar — the five most-used destinations.
const BOTTOM_TABS = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analyze", href: "/analyze", icon: Activity },
  { name: "Charts", href: "/charts", icon: CandlestickChart },
  { name: "Markets", href: "/markets", icon: Globe },
  { name: "Portfolio", href: "/portfolio", icon: Briefcase },
];

// Grouped into sections so a long list reads cleanly instead of one flat wall.
const NAV_GROUPS = [
  {
    label: "Research",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Analyze Stock", href: "/analyze", icon: Activity },
      { name: "Chart Analytics", href: "/charts", icon: CandlestickChart },
      { name: "Markets", href: "/markets", icon: Globe },
      { name: "Screener", href: "/screener", icon: Filter },
      { name: "Compare Stocks", href: "/compare", icon: ArrowLeftRight },
    ],
  },
  {
    label: "My Stocks",
    items: [
      { name: "Watchlist", href: "/watchlist", icon: Star },
      { name: "Portfolio", href: "/portfolio", icon: Briefcase },
      { name: "Trend Alerts", href: "/trend-alerts", icon: TrendingUp },
      { name: "Alerts", href: "/alerts", icon: Bell },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Market News", href: "/news", icon: Newspaper },
      { name: "Daily Digest", href: "/digest", icon: CalendarClock },
      { name: "AI Research Chat", href: "/ai-chat", icon: MessageSquare },
      { name: "Document Research", href: "/research", icon: ScanSearch },
    ],
  },
  {
    label: "Import & Notes",
    items: [
      { name: "Import Report", href: "/import", icon: Upload },
      { name: "Import Excel", href: "/sheets", icon: FileSpreadsheet },
      { name: "Prompt Library", href: "/prompts", icon: BookMarked },
      { name: "Master Notes", href: "/notes", icon: StickyNote },
      { name: "Saved Reports", href: "/reports", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [
      { name: "AI Usage", href: "/ai-usage", icon: Gauge },
      { name: "Settings", href: "/settings", icon: Settings },
      { name: "QA / Diagnostics", href: "/qa", icon: CheckSquare },
    ],
  },
];

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

  const pathname = usePathname();
  const router = useRouter();

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

      {/* Sidebar — off-canvas drawer on phones, static rail on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col
          transform transition-transform duration-300 md:static md:z-auto md:translate-x-0 md:transition-all
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          ${isCollapsed ? "md:w-20" : "md:w-64"}`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200">
          {(!isCollapsed || mobileOpen) && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="bg-indigo-600 p-1.5 rounded-lg flex-shrink-0">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-slate-900 tracking-tight whitespace-nowrap md:inline">
                StockAnalytix
              </span>
            </div>
          )}
          {isCollapsed && !mobileOpen && (
            <div
              className="bg-indigo-600 p-1.5 rounded-lg mx-auto flex-shrink-0 cursor-pointer hidden md:block"
              onClick={() => setIsCollapsed(false)}
            >
              <Activity className="w-5 h-5 text-white" />
            </div>
          )}
          {/* desktop collapse */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hidden md:block"
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
            className="p-1 rounded-md text-slate-400 hover:bg-slate-100 md:hidden"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 hide-scrollbar">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? "mt-5" : ""}>
              {/* Section header (or a thin divider when the rail is collapsed) */}
              {isCollapsed && !mobileOpen ? (
                gi > 0 && <div className="mx-2 mb-2 border-t border-slate-100" />
              ) : (
                <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.label}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (pathname === "/" && item.href === "/dashboard") ||
                    (pathname || "").startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center group gap-3 px-3 py-2.5 rounded-xl transition-all ${isActive ? "bg-indigo-50 text-indigo-600 font-bold" : "text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900"}`}
                      title={isCollapsed ? item.name : undefined}
                    >
                      <item.icon
                        className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}`}
                      />
                      {(!isCollapsed || mobileOpen) && <span className="truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 sm:px-6 w-full gap-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex-1 max-w-md relative hidden sm:block z-50">
            <form onSubmit={handleSearchSubmit}>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Global stock search e.g. AAPL..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (searchQuery) setSearchFocused(true);
                }}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                className="w-full bg-slate-100 border border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm rounded-full pl-10 pr-4 py-2 transition-all outline-none"
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

          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            {/* Market Selector */}
            <div className="hidden lg:flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
              {["US", "NSE", "BSE"].map((m) => (
                <button
                  key={m}
                  onClick={() => setMarket(m)}
                  className={`px-3 py-1 text-xs font-bold rounded-md ${market === m ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Timeframe Selector */}
            {pathname?.includes("analyze") && (
              <div className="hidden lg:flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
                {["1M", "3M", "6M", "1Y", "3Y"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeframe(t)}
                    className={`px-2 py-1 text-xs font-bold rounded-md ${timeframe === t ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors disabled:opacity-60"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <div className="relative">
              <button
                onClick={() => setNotifsOpen(!notifsOpen)}
                className="relative p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
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
              className="hidden sm:block p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-full transition-colors"
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
                className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200 hover:ring-2 ring-offset-1 ring-indigo-500 overflow-hidden"
              >
                {profilePhoto ? (
                  <img src={profilePhoto} alt={profileName} className="w-8 h-8 object-cover rounded-full" />
                ) : (
                  <div className="w-8 h-8 flex items-center justify-center bg-indigo-100">
                    <span className="text-xs font-bold text-indigo-700">{profileName.split(" ").map((n,i)=> i===0? n[0]:"")}</span>
                  </div>
                )}
              </button>

              {profileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setProfileOpen(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <div className="font-bold text-slate-900">{profileName}</div>
                      <div className="text-xs text-slate-500 mb-2">
                        {profilePhoto ? "Profile photo set" : "No photo"}
                      </div>
                      <div className="inline-block px-2 py-0.5 bg-gradient-to-r from-amber-200 to-amber-400 text-amber-900 text-[10px] font-black rounded-full uppercase tracking-wider">
                        Pro Plan
                      </div>
                    </div>
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-slate-500">
                          API Usage
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          4,520 / 10k
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: "45%" }}
                        ></div>
                      </div>
                    </div>
                    <div className="p-2">
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
    </div>
  );
}
