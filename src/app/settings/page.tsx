"use client";

import React, { useState, useEffect } from "react";
import { Settings, Save as SaveIcon } from "lucide-react";
import { getSettings, saveSettings, addNotification } from "@/lib/storage";
import { useGlobal } from "@/context/GlobalContext";

export default function SettingsPage() {
  const { theme, setTheme, profileName, profilePhoto, setProfile } = useGlobal();
  const [settings, setLocalSettings] = useState<any>({});

  useEffect(() => {
    const s = getSettings();
    setLocalSettings(s);
  }, []);

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
    </div>
  );
}
