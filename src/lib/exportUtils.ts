/**
 * Lightweight Excel / Word export with no external dependencies.
 * Builds an HTML table and downloads it as .xls / .doc — both open natively in
 * Microsoft Excel / Word (and Google Sheets / Docs). Good enough for tabular
 * research reports without pulling in a heavy spreadsheet library.
 */

type Section = { title: string; rows: (string | number)[][] };

function esc(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(reportTitle: string, sections: Section[]): string {
  let body = `<h1 style="font-family:Arial">${esc(reportTitle)}</h1>`;
  body += `<p style="font-family:Arial;color:#555">Generated ${new Date().toLocaleString()} — Research support only. Not buy/sell advice.</p>`;
  for (const sec of sections) {
    body += `<h2 style="font-family:Arial;color:#4f46e5">${esc(sec.title)}</h2>`;
    body += `<table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;font-family:Arial;font-size:12px">`;
    for (const row of sec.rows) {
      body += "<tr>" + row.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>";
    }
    body += "</table><br/>";
  }
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

function triggerDownload(content: string, mime: string, filename: string) {
  const blob = new Blob(["﻿", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadExcel(filenameBase: string, reportTitle: string, sections: Section[]) {
  triggerDownload(
    buildHtml(reportTitle, sections),
    "application/vnd.ms-excel",
    `${filenameBase}.xls`,
  );
}

export function downloadWord(filenameBase: string, reportTitle: string, sections: Section[]) {
  triggerDownload(
    buildHtml(reportTitle, sections),
    "application/msword",
    `${filenameBase}.doc`,
  );
}
