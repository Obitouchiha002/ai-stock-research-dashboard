"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Save as SaveIcon,
  Cloud,
  RefreshCcw,
  Copy,
  Check,
  Power,
  Wand2,
} from "lucide-react";
import { getSettings, saveSettings, addNotification } from "@/lib/storage";
import {
  getSyncCode,
  setSyncCode as persistSyncCode,
  clearSyncCode,
  generateCode,
  syncNow,
  getLastSyncAt,
  normCode,
} from "@/lib/sync";
import { useGlobal } from "@/context/GlobalContext";

function timeAgo(t: number): string {
  if (!t) return "never";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SettingsPage() {
  const { theme, setTheme, profileName, profilePhoto, setProfile } = useGlobal();
  const [settings, setLocalSettings] = useState<any>({});

  // --- Cloud sync (multi-device) ---
  const [codeInput, setCodeInput] = useState("");
  const [linked, setLinked] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const [copied, setCopied] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  useEffect(() => {
    const s = getSettings();
    setLocalSettings(s);
    const code = getSyncCode();
    setLinked(Boolean(code));
    setCodeInput(code);
    setLastSync(getLastSyncAt());
  }, []);

  const runSync = async () => {
    setSyncBusy(true);
    setSyncMsg(null);
    const r = await syncNow();
    setSyncBusy(false);
    setLastSync(getLastSyncAt());
    if (r.ok) {
      let text = "Synced. Ab is code se linked har device par yahi data milega.";
      if (r.dropped?.length) text += ` (Kuch bahut bade items skip hue: ${r.dropped.join(", ")}.)`;
      setSyncMsg({ kind: "ok", text });
    } else {
      setSyncMsg({
        kind: "err",
        text: r.notConfigured
          ? "Server par cloud store abhi setup nahi hai — Upstash Redis (KV) store + env vars add karne honge."
          : r.error || "Sync fail hua. Thodi der baad try karein.",
      });
    }
  };

  const turnOnSync = async () => {
    let c = normCode(codeInput);
    if (c.length < 6) c = generateCode();
    persistSyncCode(c);
    setCodeInput(c);
    setLinked(true);
    await runSync();
  };

  const turnOffSync = () => {
    clearSyncCode();
    setLinked(false);
    setSyncMsg({ kind: "info", text: "Sync band kar diya. Data is device par safe hai." });
  };

  const copyCode = () => {
    try {
      navigator.clipboard.writeText(getSyncCode());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(settings);
    // apply theme and profile to global context
    if (settings.theme) setTheme(settings.theme === "dark" ? "dark" : "light");
    if (settings.profileName || settings.profilePhoto) {
      setProfile(settings.profileName || profileName, settings.profilePhoto || profilePhoto);
    }
    addNotification({
      type: "success",
      message: "Settings saved successfully.",
    });
  };

  return (
    <div className="max-w-screen-md mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-8 h-8 text-indigo-600" /> Settings
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          Configure your platform preferences.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8"
      >
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">
            Analysis Defaults
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Preferred Market
              </label>
              <select
                value={settings.market || "US"}
                onChange={(e) =>
                  setLocalSettings({ ...settings, market: e.target.value })
                }
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
              >
                <option>US</option>
                <option>NSE</option>
                <option>BSE</option>
                <option>Global</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Default Timeframe
              </label>
              <select
                value={settings.timeframe || "1Y"}
                onChange={(e) =>
                  setLocalSettings({ ...settings, timeframe: e.target.value })
                }
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
              >
                <option>1M</option>
                <option>3M</option>
                <option>6M</option>
                <option>1Y</option>
                <option>3Y</option>
                <option>5Y</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Investor Profile
              </label>
              <select
                value={settings.profile || "Short-term Investor"}
                onChange={(e) =>
                  setLocalSettings({ ...settings, profile: e.target.value })
                }
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
              >
                <option>Trader</option>
                <option>Short-term Investor</option>
                <option>Long-term Investor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Risk Tolerance
              </label>
              <select
                value={settings.riskTolerance || "Moderate"}
                onChange={(e) =>
                  setLocalSettings({
                    ...settings,
                    riskTolerance: e.target.value,
                  })
                }
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
              >
                <option>Conservative</option>
                <option>Moderate</option>
                <option>Aggressive</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">
            App Preferences
          </h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoSave || false}
                onChange={(e) =>
                  setLocalSettings({ ...settings, autoSave: e.target.checked })
                }
                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="font-semibold text-slate-700">
                Auto-save Analysis Reports
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications || false}
                onChange={(e) =>
                  setLocalSettings({
                    ...settings,
                    notifications: e.target.checked,
                  })
                }
                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="font-semibold text-slate-700">
                Enable UI Notifications
              </span>
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">
            Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={settings.profileName || ''}
                onChange={(e) => setLocalSettings({ ...settings, profileName: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Profile Photo URL
              </label>
              <input
                type="text"
                value={settings.profilePhoto || ''}
                onChange={(e) => setLocalSettings({ ...settings, profilePhoto: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2 transition"
            >
              <SaveIcon className="w-4 h-4" /> Save Settings
            </button>
          </div>
        </div>
      </form>

      {/* Cloud Sync — link this data to your other devices with one code */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Cloud Sync — multi-device</h3>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              Ek code banao. Wahi code dusre computer/phone par daalo — aapka portfolio,
              watchlist, alerts aur notes wahan bhi aa jaayenge, aur aage apne aap sync rahenge.
            </p>
          </div>
        </div>

        {!linked ? (
          <div className="mt-5 space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
              Sync code
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. SA-4KQ7-9WPM"
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono font-semibold tracking-wide outline-none"
              />
              <button
                type="button"
                onClick={() => setCodeInput(generateCode())}
                className="px-4 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 transition"
              >
                <Wand2 className="w-4 h-4" /> Generate
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Naya device? Pehle wale computer wala <b>same code</b> yahan daalo. Naya sync
              shuru kar rahe ho? <b>Generate</b> dabao aur code note kar lo.
            </p>
            <button
              type="button"
              onClick={turnOnSync}
              disabled={syncBusy}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2 transition"
            >
              {syncBusy ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
              Turn on sync
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">
                  Sync is on
                </p>
                <p className="font-mono font-bold text-slate-900 text-lg truncate">{getSyncCode()}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Last synced {timeAgo(lastSync)}
                </p>
              </div>
              <button
                type="button"
                onClick={copyCode}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Ye code apne dusre devices par Settings → Cloud Sync mein daalo. Data apne aap
              merge hota hai — kisi bhi device ka data delete/lose nahi hoga.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runSync}
                disabled={syncBusy}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2 transition"
              >
                <RefreshCcw className={`w-4 h-4 ${syncBusy ? "animate-spin" : ""}`} />
                Sync now
              </button>
              <button
                type="button"
                onClick={turnOffSync}
                className="px-5 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition"
              >
                <Power className="w-4 h-4" /> Turn off
              </button>
            </div>
          </div>
        )}

        {syncMsg && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${
              syncMsg.kind === "ok"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : syncMsg.kind === "err"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-slate-50 text-slate-600 border border-slate-200"
            }`}
          >
            {syncMsg.text}
          </div>
        )}
      </div>

      {/* Developer */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Developer</h3>
        <p className="text-sm text-slate-500 font-medium mb-4">This app is designed &amp; built by the developer below.</p>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shrink-0">VK</div>
          <div className="min-w-0">
            <div className="font-black text-slate-900">Vansh Kashyap</div>
            <a href="https://vanshkashyap.lzworth.in" target="_blank" rel="author noopener" className="text-sm font-bold text-indigo-600 hover:underline break-all">vanshkashyap.lzworth.in</a>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-slate-500">
          For any query, feedback or collaboration, please{" "}
          <a href="https://vanshkashyap.lzworth.in" target="_blank" rel="noopener" className="font-bold text-indigo-600 hover:underline">contact Vansh Kashyap</a>.
        </p>
      </div>
    </div>
  );
}
