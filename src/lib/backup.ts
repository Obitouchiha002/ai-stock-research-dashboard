"use client";

import { readBundle, writeBundle } from "./sync";

// Download every bit of the user's saved data as one JSON file (a safe backup
// they keep). Returns how many sections were included.
export function downloadBackup(): number {
  const bundle = readBundle();
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stockanalytix-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return Object.keys(bundle).length;
}

// Email the same JSON backup to the owner's inbox (kept as an attachment).
export async function emailBackup(): Promise<{ ok: boolean; error?: string; to?: string }> {
  try {
    const bundle = readBundle();
    const res = await fetch("/api/backup-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, error: e?.message || "failed" };
  }
}

// Restore a previously downloaded backup file. Merges into local data (writeBundle
// only sets sa_ keys), so it never wipes anything unrelated.
export async function importBackup(file: File): Promise<number> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || typeof data !== "object") throw new Error("Not a valid backup file.");
  writeBundle(data);
  return Object.keys(data).length;
}
