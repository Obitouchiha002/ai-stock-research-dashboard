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
  User,
  LogOut,
  Download,
  Upload,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { getSettings, saveSettings, addNotification } from "@/lib/storage";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { downloadBackup, emailBackup, importBackup } from "@/lib/backup";
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

  // --- Account (Supabase login) + backup ---
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    const s = getSettings();
    setLocalSettings(s);
    const code = getSyncCode();
    setLinked(Boolean(code));
    setCodeInput(code);
    setLastSync(getLastSyncAt());
    const sb = getSupabase();
    if (sb) sb.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  const logout = async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setUserEmail(null);
    setBackupMsg({ kind: "info", text: "Logged out. Data is still safe on this device." });
  };

  const doDownload = () => {
    const n = downloadBackup();
    setBackupMsg({ kind: "ok", text: `Backup downloaded (${n} sections). Keep the file safe.` });
  };
  const doEmailBackup = async () => {
    setBackupBusy(true);
    setBackupMsg(null);
    const r = await emailBackup();
    setBackupBusy(false);
    setBackupMsg(r.ok
      ? { kind: "ok", text: `Backup emailed to ${r.to}. Check your inbox (JSON attached).` }
      : { kind: "err", text: r.error || "Could not email the backup." });
  };
  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const n = await importBackup(file);
      setBackupMsg({ kind: "ok", text: `Restored ${n} sections. Reloading…` });
      setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setBackupMsg({ kind: "err", text: err?.message || "Could not read that backup file." });
    }
  };

  const runSync = async () => {
    setSyncBusy(true);
    setSyncMsg(null);
    const r = await syncNow();
    setSyncBusy(false);
    setLastSync(getLastSyncAt());
    if (r.ok) {
      let text = "Synced ✓ Ab is ID se linked har device par yahi data (combined) milega.";
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
            <h3 className="text-lg font-bold text-slate-900">Login ID — sync across all devices</h3>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              Ek <b>ID</b> banao. Wahi ID har computer/phone par daalo — aapka portfolio, watchlist,
              Markets, alerts aur notes har device par same rahenge aur apne aap sync hote rahenge.
              Koi password nahi — bas ek ID yaad rakhni hai.
            </p>
          </div>
        </div>

        {!linked ? (
          <div className="mt-5 space-y-3">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
              Your Login ID
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. VANSH-KASHYAP (min 6 characters)"
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono font-semibold tracking-wide outline-none"
              />
              <button
                type="button"
                onClick={() => setCodeInput(generateCode())}
                className="px-4 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 transition"
              >
                <Wand2 className="w-4 h-4" /> Suggest one
              </button>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 font-medium leading-relaxed">
              <b>Important — do this on the PC that already has your data FIRST.</b> Set your ID here and
              turn on sync so that data uploads first. Then enter the <b>same ID</b> on your other devices.
              Everything <b>combines</b> — nothing already saved is ever deleted or overwritten.
            </div>
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
              Ye <b>ID</b> apne dusre devices par Settings → Login ID mein daalo (bilkul same). Data har
              device par apne aap merge hota rehta hai — har device ka data <b>combine</b> hota hai,
              kisi ka data delete/lose nahi hoga.
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

      {/* Account (real login) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Account — log in</h3>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              Real login (email + password). Ek account, har device par same data — apne aap sync.
            </p>
          </div>
        </div>
        {!supabaseConfigured() ? (
          <div className="mt-4 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3">
            Login abhi is deployment par configure nahi hai.
          </div>
        ) : userEmail ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Logged in</p>
              <p className="font-semibold text-slate-900 truncate">{userEmail}</p>
              <p className="text-xs text-slate-500 mt-0.5">Data is syncing to your account automatically.</p>
            </div>
            <button onClick={logout} className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition shrink-0">
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <Link href="/login" className="inline-flex px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 items-center gap-2 transition">
              <User className="w-4 h-4" /> Log in / Sign up
            </Link>
            <p className="text-xs text-slate-500 font-medium mt-2">
              Log in karte hi is device ka saara data apne aap tumhare account mein upload ho jayega — kuch nahi khoyega.
            </p>
          </div>
        )}
      </div>

      {/* Backup & restore */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-6">
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Backup &amp; restore</h3>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              Apne poore data ka backup lo (download ya email par). Zaroorat pade to file se wapas restore karo.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={doDownload} className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 flex items-center gap-2 transition">
            <Download className="w-4 h-4" /> Download backup
          </button>
          <button onClick={doEmailBackup} disabled={backupBusy} className="px-5 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2 transition">
            <Mail className={`w-4 h-4 ${backupBusy ? "animate-pulse" : ""}`} /> Email backup to me
          </button>
          <label className="px-5 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer">
            <Upload className="w-4 h-4" /> Restore from file
            <input type="file" accept="application/json,.json" onChange={doImport} className="hidden" />
          </label>
        </div>
        {backupMsg && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${
            backupMsg.kind === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : backupMsg.kind === "err" ? "bg-rose-50 text-rose-700 border border-rose-200"
            : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
            {backupMsg.text}
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
            <a href="mailto:vk1234888i@gmail.com" className="text-sm font-bold text-indigo-600 hover:underline break-all">vk1234888i@gmail.com</a>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-slate-500">
          For any query, feedback or collaboration, email{" "}
          <a href="mailto:vk1234888i@gmail.com" className="font-bold text-indigo-600 hover:underline">vk1234888i@gmail.com</a>.
        </p>
        {/* Author link kept for SEO but hidden from view. */}
        <a href="https://vanshkashyap.lzworth.in" rel="author" className="sr-only">Vansh Kashyap — portfolio</a>
      </div>
    </div>
  );
}
