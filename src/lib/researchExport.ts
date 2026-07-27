"use client";

/**
 * Client-side export of a finished research report to PDF, DOCX or Excel.
 * Everything runs in the browser — the report never leaves the machine.
 */

import type { FinalReport } from "./researchTypes";

const stamp = (r: FinalReport) =>
  `${(r.title || "research-report").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60).toLowerCase()}-${r.generatedAt.slice(0, 10)}`;

const verdictOf = (r: FinalReport, id: string) =>
  r.verification.consensus.find((c) => c.id === id);

// ------------------------------------------------------------------- PDF ----

export async function exportReportPdf(r: FinalReport) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const width = W - M * 2;
  let y = M;

  const page = (need = 60) => {
    if (y + need > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, size: number, style: "normal" | "bold" = "normal", color = "#0f172a", gap = 6) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(s, width);
    for (const line of lines) {
      page(size + 6);
      doc.text(line, M, y);
      y += size + 4;
    }
    y += gap;
  };
  const heading = (s: string) => {
    page(46);
    y += 8;
    doc.setDrawColor("#e2e8f0");
    doc.line(M, y - 10, W - M, y - 10);
    text(s, 14, "bold", "#4338ca", 6);
  };

  text(r.title || "Research Report", 20, "bold", "#0f172a", 4);
  text(
    `Generated ${new Date(r.generatedAt).toLocaleString()}   ·   Analysed by ${r.analysedBy}   ·   Verified by ${r.verifiedBy.join(", ") || "—"}`,
    9,
    "normal",
    "#64748b",
    2,
  );
  text(`Sources: ${r.sources.map((s) => s.name).join(", ")}`, 9, "normal", "#64748b", 10);

  page(40);
  doc.setFillColor("#eef2ff");
  doc.roundedRect(M, y - 4, width, 30, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#3730a3");
  doc.text(
    `Cross-model corroboration score: ${r.verification.score}%   ·   ${r.analysis.claims.length} claims checked`,
    M + 12,
    y + 15,
  );
  y += 40;

  heading("Summary");
  text(r.analysis.summary || "—", 10);

  if (r.analysis.keyFindings.length) {
    heading("Key findings");
    r.analysis.keyFindings.forEach((f, i) => text(`${i + 1}.  ${f}`, 10, "normal", "#0f172a", 2));
    y += 4;
  }

  if (r.analysis.figures.length) {
    heading("Figures stated in the source");
    r.analysis.figures.forEach((f) => text(`•  ${f.label}: ${f.value}   (${f.source})`, 10, "normal", "#0f172a", 2));
    y += 4;
  }

  heading("Claims & multi-model verification");
  r.analysis.claims.forEach((c, i) => {
    const v = verdictOf(r, c.id);
    page(90);
    text(`${i + 1}.  ${c.claim}`, 10.5, "bold", "#0f172a", 2);
    if (v) {
      const color =
        v.majority === "Supported" ? "#047857"
        : v.majority === "Contradicted" ? "#be123c"
        : v.majority === "Partly supported" ? "#b45309"
        : "#475569";
      text(
        `Verdict: ${v.majority}  ·  ${Math.round(v.agreement)}% reviewer agreement  ·  avg confidence ${Math.round(v.avgConfidence)}%${v.disputed ? "  ·  DISPUTED" : ""}`,
        9,
        "bold",
        color,
        2,
      );
      Object.entries(v.byProvider).forEach(([p, d]) =>
        text(`    ${p}: ${d.verdict} (${d.confidence}%) — ${d.note}`, 8.5, "normal", "#475569", 1),
      );
    }
    if (c.evidence) text(`    Evidence: “${c.evidence}”  (${c.source})`, 8.5, "normal", "#64748b", 2);
    y += 6;
  });

  if (r.analysis.gaps.length) {
    heading("Gaps — not covered by the source");
    r.analysis.gaps.forEach((g) => text(`•  ${g}`, 10, "normal", "#0f172a", 2));
    y += 4;
  }
  if (r.analysis.questions.length) {
    heading("Open questions");
    r.analysis.questions.forEach((q) => text(`•  ${q}`, 10, "normal", "#0f172a", 2));
    y += 4;
  }

  heading("Disclaimer");
  text(r.disclaimer, 9, "normal", "#64748b");

  doc.save(`${stamp(r)}.pdf`);
}

// ------------------------------------------------------------------ DOCX ----

export async function exportReportDocx(r: FinalReport) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const P = (t: string, opts: any = {}) =>
    new Paragraph({ children: [new TextRun({ text: t, ...opts })], spacing: { after: 120 }, ...(opts.bullet ? { bullet: { level: 0 } } : {}) });
  const H = (t: string) =>
    new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 140 } });

  const kids: any[] = [
    new Paragraph({ text: r.title || "Research Report", heading: HeadingLevel.TITLE }),
    P(
      `Generated ${new Date(r.generatedAt).toLocaleString()} · Analysed by ${r.analysedBy} · Verified by ${r.verifiedBy.join(", ") || "—"}`,
      { italics: true, size: 18, color: "64748B" },
    ),
    P(`Sources: ${r.sources.map((s) => s.name).join(", ")}`, { size: 18, color: "64748B" }),
    P(`Cross-model corroboration score: ${r.verification.score}% · ${r.analysis.claims.length} claims checked`, {
      bold: true,
      color: "3730A3",
    }),
    H("Summary"),
    P(r.analysis.summary || "—"),
  ];

  if (r.analysis.keyFindings.length) {
    kids.push(H("Key findings"));
    r.analysis.keyFindings.forEach((f) => kids.push(P(f, { bullet: true })));
  }
  if (r.analysis.figures.length) {
    kids.push(H("Figures stated in the source"));
    r.analysis.figures.forEach((f) => kids.push(P(`${f.label}: ${f.value} (${f.source})`, { bullet: true })));
  }

  kids.push(H("Claims & multi-model verification"));
  r.analysis.claims.forEach((c, i) => {
    const v = verdictOf(r, c.id);
    kids.push(P(`${i + 1}. ${c.claim}`, { bold: true }));
    if (v) {
      kids.push(
        P(
          `Verdict: ${v.majority} · ${Math.round(v.agreement)}% agreement · avg confidence ${Math.round(v.avgConfidence)}%${v.disputed ? " · DISPUTED" : ""}`,
          {
            bold: true,
            color:
              v.majority === "Supported" ? "047857"
              : v.majority === "Contradicted" ? "BE123C"
              : v.majority === "Partly supported" ? "B45309"
              : "475569",
          },
        ),
      );
      Object.entries(v.byProvider).forEach(([p, d]) =>
        kids.push(P(`${p}: ${d.verdict} (${d.confidence}%) — ${d.note}`, { size: 18, color: "475569" })),
      );
    }
    if (c.evidence) kids.push(P(`Evidence: “${c.evidence}” (${c.source})`, { italics: true, size: 18, color: "64748B" }));
  });

  if (r.analysis.gaps.length) {
    kids.push(H("Gaps — not covered by the source"));
    r.analysis.gaps.forEach((g) => kids.push(P(g, { bullet: true })));
  }
  if (r.analysis.questions.length) {
    kids.push(H("Open questions"));
    r.analysis.questions.forEach((q) => kids.push(P(q, { bullet: true })));
  }

  kids.push(H("Disclaimer"), P(r.disclaimer, { italics: true, color: "64748B" }));

  const blob = await Packer.toBlob(new Document({ sections: [{ children: kids }] }));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${stamp(r)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------- XLSX -----

export async function exportReportXlsx(r: FinalReport) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const providers = r.verifiedBy;

  const overview = [
    ["Title", r.title],
    ["Generated", new Date(r.generatedAt).toLocaleString()],
    ["Analysed by", r.analysedBy],
    ["Verified by", providers.join(", ") || "—"],
    ["Sources", r.sources.map((s) => s.name).join(", ")],
    ["Corroboration score (%)", r.verification.score],
    ["Claims checked", r.analysis.claims.length],
    [],
    ["Summary", r.analysis.summary],
    [],
    ["Verification summary", r.verification.summary],
    [],
    ["Disclaimer", r.disclaimer],
  ];
  const wsO = XLSX.utils.aoa_to_sheet(overview);
  wsO["!cols"] = [{ wch: 26 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsO, "Overview");

  const header = [
    "#", "Claim", "Importance", "Majority verdict", "Agreement %", "Avg confidence %", "Disputed",
    ...providers.flatMap((p) => [`${p} verdict`, `${p} conf %`, `${p} note`]),
    "Evidence", "Source",
  ];
  const rows = r.analysis.claims.map((c, i) => {
    const v = verdictOf(r, c.id);
    return [
      i + 1, c.claim, c.importance,
      v?.majority || "—",
      v ? Math.round(v.agreement) : "",
      v ? Math.round(v.avgConfidence) : "",
      v?.disputed ? "YES" : "",
      ...providers.flatMap((p) => {
        const d = v?.byProvider[p];
        return [d?.verdict || "—", d?.confidence ?? "", d?.note || ""];
      }),
      c.evidence, c.source,
    ];
  });
  const wsC = XLSX.utils.aoa_to_sheet([header, ...rows]);
  wsC["!cols"] = [
    { wch: 5 }, { wch: 70 }, { wch: 11 }, { wch: 17 }, { wch: 13 }, { wch: 16 }, { wch: 10 },
    ...providers.flatMap(() => [{ wch: 17 }, { wch: 10 }, { wch: 60 }]),
    { wch: 70 }, { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsC, "Claims");

  const extras = [
    ["Key findings"], ...r.analysis.keyFindings.map((f) => ["", f]), [],
    ["Figures", "Value", "Source"], ...r.analysis.figures.map((f) => [f.label, f.value, f.source]), [],
    ["Gaps"], ...r.analysis.gaps.map((g) => ["", g]), [],
    ["Open questions"], ...r.analysis.questions.map((q) => ["", q]),
  ];
  const wsE = XLSX.utils.aoa_to_sheet(extras);
  wsE["!cols"] = [{ wch: 34 }, { wch: 90 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, wsE, "Findings");

  XLSX.writeFile(wb, `${stamp(r)}.xlsx`);
}
