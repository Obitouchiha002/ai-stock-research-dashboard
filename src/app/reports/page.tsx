"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Search,
  Trash2,
  ExternalLink,
  Download,
  Clock,
} from "lucide-react";
import { getReports, deleteReport } from "@/lib/storage";

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setReports(getReports());
  }, []);

  const handleRemove = (id: string) => {
    deleteReport(id);
    setReports(getReports());
  };

  const filteredReports = reports
    .filter((item) => {
      return (
        item.symbol.toLowerCase().includes(search.toLowerCase()) ||
        item.name?.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => b.savedAt - a.savedAt);

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-8 h-8 text-indigo-600" /> Saved Reports
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Access your previously generated AI analysis records.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64"
            />
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            No saved reports
          </h3>
          <p className="text-slate-500 mb-6 font-medium">
            Run an analysis and click &quot;Save Report&quot; to store it here.
          </p>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
          >
            <Search className="w-4 h-4" /> Start Analyzing
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:shadow-md hover:border-indigo-200 transition-all group flex flex-col h-full"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 shrink-0">
                    {report.symbol.substring(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 leading-tight">
                      {report.symbol}
                    </h3>
                    <p className="text-xs text-slate-500 truncate max-w-[120px]">
                      {report.name}
                    </p>
                  </div>
                </div>
                <div
                  className={`text-xs font-bold px-2 py-1 rounded bg-slate-50 border border-slate-100 ${report.score >= 80 ? "text-emerald-600" : report.score >= 50 ? "text-amber-600" : "text-rose-600"}`}
                >
                  Score: {report.score}
                </div>
              </div>

              <div className="mb-6">
                <div className="text-sm font-semibold text-slate-800 mb-1">
                  {report.view || "N/A"}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{" "}
                  {new Date(report.savedAt).toLocaleString()}
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => window.print()}
                  className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRemove(report.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <Link
                    href={`/stock/${report.symbol}?reportId=${report.id}`}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-xs font-bold transition flex items-center gap-1"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
