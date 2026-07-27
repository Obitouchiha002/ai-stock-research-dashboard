"use client";

import React, { useState, useEffect } from "react";
import { Bell, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { getAlerts, saveAlert, deleteAlert } from "@/lib/storage";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    type: "Price Above",
    value: "",
    notes: "",
  });

  useEffect(() => {
    setAlerts(getAlerts());
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    saveAlert({ ...form, symbol: form.symbol.toUpperCase() });
    setAlerts(getAlerts());
    setShowAdd(false);
    setForm({ symbol: "", type: "Price Above", value: "", notes: "" });
  };

  const handleRemove = (id: string) => {
    deleteAlert(id);
    setAlerts(getAlerts());
  };

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-8 h-8 text-indigo-600" /> Alerts
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Set price and metric alerts.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" /> Create Alert
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="bg-white border border-slate-200 p-6 rounded-2xl mb-8 flex flex-col gap-4 max-w-2xl shadow-sm"
        >
          <h3 className="font-bold text-slate-800">New Alert</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Symbol
              </label>
              <input
                required
                type="text"
                placeholder="AAPL"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Attribute
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
              >
                <option>Price Above</option>
                <option>Price Below</option>
                <option>Final Score Above</option>
                <option>Risk Level</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Target Value
              </label>
              <input
                required
                type="text"
                placeholder="150"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="Buy point..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {alerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-500 font-medium shadow-sm">
          No alerts configured.
        </div>
      ) : (
        <div className="grid gap-4">
          {alerts.map((a: any) => (
            <div
              key={a.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-indigo-200 transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-black text-lg text-slate-900">
                    {a.symbol}
                  </div>
                  <div className="text-sm font-semibold text-slate-500">
                    {a.type} {a.value}
                  </div>
                  {a.notes && (
                    <div className="text-xs text-slate-400 mt-1">{a.notes}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded uppercase tracking-widest">
                  {a.status}
                </span>
                <button
                  onClick={() => handleRemove(a.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  title="Delete"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
