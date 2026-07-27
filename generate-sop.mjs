/**
 * Standard Operating Procedure (SOP) generator for StockAnalytix MVP.
 * Run:  node generate-sop.mjs   ->  StockAnalytix_SOP.pdf
 */
import { jsPDF } from "jspdf";
import fs from "fs";

const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
const W = pdf.internal.pageSize.getWidth();
const H = pdf.internal.pageSize.getHeight();
const M = 48;
const CW = W - M * 2;
let y = M;

const INDIGO = [79, 70, 229];
const INDIGO_L = [224, 231, 255];
const DARK = [17, 24, 39];
const SLATE = [51, 65, 85];
const GRAY = [100, 116, 139];
const LIGHT = [241, 245, 249];
const GREEN = [16, 185, 129];
const GREEN_L = [209, 250, 229];
const RED = [225, 29, 72];
const RED_L = [254, 226, 226];
const AMBER = [217, 119, 6];
const AMBER_L = [254, 243, 199];
const WHITE = [255, 255, 255];

const tc = (c) => pdf.setTextColor(c[0], c[1], c[2]);
const fc = (c) => pdf.setFillColor(c[0], c[1], c[2]);
const dc = (c) => pdf.setDrawColor(c[0], c[1], c[2]);
const font = (s = "normal", z = 10) => { pdf.setFont("helvetica", s); pdf.setFontSize(z); };

let pageNo = 0;
const footer = () => {
  pageNo++;
  font("normal", 7.5); tc(GRAY);
  pdf.text("StockAnalytix MVP — Standard Operating Procedure (SOP)", M, H - 22);
  pdf.text(`Page ${pageNo}`, W - M, H - 22, { align: "right" });
  dc([226, 232, 240]); pdf.setLineWidth(0.5); pdf.line(M, H - 32, W - M, H - 32);
};
const ensure = (n) => { if (y + n > H - 50) { footer(); pdf.addPage(); y = M; } };

const h1 = (n, t) => {
  ensure(46); fc(INDIGO); pdf.roundedRect(M, y, CW, 30, 4, 4, "F");
  tc(WHITE); font("bold", 14); pdf.text(`${n}.  ${t}`, M + 12, y + 20); y += 44;
};
const h2 = (t) => {
  ensure(26); tc(INDIGO); font("bold", 11.5); pdf.text(t, M, y + 10);
  dc(INDIGO); pdf.setLineWidth(1.1); pdf.line(M, y + 15, M + 24, y + 15); y += 26;
};
const para = (t) => {
  font("normal", 10); tc(SLATE);
  pdf.splitTextToSize(t, CW).forEach((ln) => { ensure(15); pdf.text(ln, M, y + 9); y += 14.5; });
  y += 5;
};
const steps = (items) => {
  font("normal", 10);
  items.forEach((it, i) => {
    ensure(16); fc(INDIGO); pdf.circle(M + 9, y + 5, 8, "F");
    tc(WHITE); font("bold", 8.5); pdf.text(String(i + 1), M + 9, y + 8, { align: "center" });
    tc(SLATE); font("normal", 10);
    const lines = pdf.splitTextToSize(it, CW - 28);
    lines.forEach((ln, li) => { ensure(14.5); pdf.text(ln, M + 26, y + 8); y += 14; });
    y += 3;
  });
  y += 4;
};
const bullets = (items, color = INDIGO) => {
  font("normal", 10);
  items.forEach((it) => {
    const bold = it.startsWith("**"); const txt = it.replace(/\*\*/g, "");
    ensure(15); fc(color); pdf.circle(M + 3, y + 4.5, 1.8, "F");
    tc(bold ? DARK : SLATE); font(bold ? "bold" : "normal", 10);
    pdf.splitTextToSize(txt, CW - 14).forEach((ln) => { ensure(14.5); pdf.text(ln, M + 12, y + 8); y += 14; });
  });
  y += 5;
};
const callout = (title, text, bg, fg) => {
  font("normal", 9.5); const lines = pdf.splitTextToSize(text, CW - 24);
  const bh = 22 + lines.length * 12.5 + 8; ensure(bh + 6);
  fc(bg); pdf.roundedRect(M, y, CW, bh, 4, 4, "F"); fc(fg); pdf.rect(M, y, 4, bh, "F");
  tc(fg); font("bold", 10); pdf.text(title, M + 14, y + 16);
  tc(SLATE); font("normal", 9.5); lines.forEach((ln, i) => pdf.text(ln, M + 14, y + 30 + i * 12.5));
  y += bh + 10;
};
const table = (rows, widths) => {
  font("normal", 9);
  rows.forEach((r, ri) => {
    ensure(20); const head = ri === 0;
    fc(head ? DARK : ri % 2 === 0 ? LIGHT : WHITE); pdf.rect(M, y, CW, 19, "F");
    tc(head ? WHITE : DARK); font(head ? "bold" : "normal", 9);
    let x = M + 6;
    r.forEach((c, ci) => {
      const w = CW * widths[ci];
      pdf.splitTextToSize(String(c), w - 8).slice(0, 2).forEach((ln, li) => pdf.text(ln, x, y + 12 + li * 0));
      x += w;
    });
    y += 19;
  });
  y += 6;
};

// ===== COVER =====
fc(DARK); pdf.rect(0, 0, W, H, "F");
fc(INDIGO); pdf.rect(0, 0, W, 8, "F"); pdf.rect(0, H - 8, W, 8, "F");
fc(INDIGO); pdf.roundedRect(M, 150, 54, 54, 10, 10, "F");
tc(WHITE); font("bold", 30); pdf.text("S", M + 27, 190, { align: "center" });
tc(WHITE); font("bold", 32); pdf.text("StockAnalytix MVP", M, 268);
tc([165, 180, 252]); font("normal", 15); pdf.text("Standard Operating Procedure (SOP)", M, 296);
font("bold", 15); tc(WHITE); pdf.text("Operations · Research Workflow · Maintenance", M, 352);
font("normal", 11); tc([148, 163, 184]);
pdf.splitTextToSize("Step-by-step procedures for setting up, running, using, maintaining and troubleshooting the StockAnalytix research platform.", CW).forEach((ln, i) => pdf.text(ln, M, 380 + i * 16));
font("normal", 10); tc([148, 163, 184]);
pdf.text(`Document version 1.0  ·  Generated: ${new Date().toLocaleString()}`, M, H - 78);
pdf.text("Owner: Project maintainer   ·   Review cycle: as features change", M, H - 60);
pdf.addPage(); y = M;

// ===== 1. PURPOSE & SCOPE =====
h1("1", "Purpose & Scope");
para("This SOP defines the standard procedures for operating StockAnalytix MVP — an AI-powered stock research platform. It covers setup, the daily research workflow, importing third-party reports, notes/tracking, AI configuration, maintenance/QA, troubleshooting and compliance guardrails.");
h2("Applies to");
bullets([
  "Anyone running or maintaining the application locally.",
  "Analysts using the app for stock research and note-taking.",
  "Developers extending features (build/verify procedure).",
]);
callout("Golden rule", "StockAnalytix is research support only. It never gives buy/sell advice or guaranteed predictions. Every output carries a disclaimer and must be independently verified before any decision.", AMBER_L, AMBER);
footer(); pdf.addPage(); y = M;

// ===== 2. SETUP & STARTUP =====
h1("2", "Setup & Startup Procedure");
h2("2.1 First-time setup");
steps([
  "Open a terminal in the project folder.",
  "Run `npm install` to install dependencies.",
  "Open `.env.local` and paste the three AI keys (no space after `=`): GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY.",
  "Save `.env.local`.",
]);
h2("2.2 Start the app");
steps([
  "Development: run `npm run dev` → open http://localhost:3000.",
  "Production (faster, no recompile lag): run `npm run build` then `npm start`.",
  "After ANY change to `.env.local`, restart the server so new keys load.",
]);
callout("Key format check", "Keys must be pasted directly after '=' with NO leading space. Gemini key worked despite an unusual prefix; Groq starts with 'gsk_'; OpenAI starts with 'sk-'. A space after '=' is the most common cause of 'AI disabled'.", INDIGO_L, INDIGO);
footer(); pdf.addPage(); y = M;

// ===== 3. RESEARCH WORKFLOW =====
h1("3", "Standard Research Workflow");
para("The core daily procedure for researching a stock.");
steps([
  "Go to Analyze Stock (sidebar) and search a symbol (e.g. AAPL, RELIANCE.NS). Pick market US / NSE / BSE in the top bar if needed.",
  "Review the Overview, Technical, Fundamentals, Valuation and Risk tabs for the computed snapshot.",
  "Open the Momentum tab for the momentum score, graphs, scenarios and (optionally) start a 15-Day Watch.",
  "Open the Evaluation tab for the CAN SLIM checklist, composite rating, Acc/Dis & SMR grades and Alpha/Beta.",
  "Open the Analytics tab for seasonality and the historical backtest signal-edge.",
  "Open the Research tab to generate the full CANSLIM research note; export to Excel/PDF as needed.",
  "Use the Notes tab to record text/voice observations for this stock.",
  "Run AI deep dives where useful (Momentum Deep Dive, AI Stock Evaluation, AI Research Note).",
]);
callout("Research language only", "When interpreting outputs, use research framing — 'momentum improving', 'watch for confirmation', 'extended', 'avoid chasing'. Never read any output as a recommendation to buy or sell.", AMBER_L, AMBER);
footer(); pdf.addPage(); y = M;

// ===== 4. IMPORT REPORT =====
h1("4", "Import Report Procedure");
para("Use this to make a static third-party report (MarketSmith / Market Mojo / broker) LIVE and actionable. Only import reports you are entitled to (your own subscription). Do NOT scrape paywalled sites.");
steps([
  "Open Import Report (sidebar).",
  "Paste the report (HTML or text) OR upload a .html / .txt file.",
  "Click 'Analyze Report' (allow 30–60s — it runs AI extraction + live cross-check).",
  "Read the Report Health Check: age, price move since the report, and the AI 'Is this still valid?' verdict.",
  "Review the Cross-Check (report vs our live data) and 'What Our Analysis Adds' (backtest, seasonality, alpha/beta).",
  "Use 'View Original Report' to see the rendered source alongside the analysis.",
  "Optionally: 'Save Key Points to Notes', 'Track this Thesis' (alerts + 15-day watch), or chat with the report.",
  "The imported data is auto-saved and appears as a banner on that stock's Research tab.",
]);
footer(); pdf.addPage(); y = M;

// ===== 5. NOTES & TRACKING =====
h1("5", "Notes & Tracking Procedure");
h2("5.1 Notes (text & voice)");
steps([
  "On any stock's Analyze page, open the Notes tab (or use Master Notes in the sidebar).",
  "Type a note (Cmd/Ctrl+Enter to save) or click 'Voice Note' to record (max ~90s).",
  "All notes are saved per stock with a timestamp and viewable in Master Notes.",
]);
h2("5.2 15-Day Watch");
steps([
  "On the Momentum tab, click 'Start 15-Day Momentum Watch' to save a baseline.",
  "Re-open later to see baseline-vs-current changes and run 'Analyze What Changed'.",
]);
callout("Voice note storage", "Voice notes are stored in the browser (localStorage), capped ~90s for size. Microphone permission is required on first use. Clearing browser data removes notes.", LIGHT, GRAY);
footer(); pdf.addPage(); y = M;

// ===== 6. AI CONFIG =====
h1("6", "AI Provider Configuration");
para("All AI features route through a single resilient client with tiered routing and automatic fallback.");
table([
  ["Task type", "Provider order"],
  ["Reasoning-heavy (research note, evaluation, import cross-check, what-changed)", "OpenAI → Gemini → Groq"],
  ["Light (chat, news summaries)", "Groq → Gemini → OpenAI"],
], [0.62, 0.38]);
bullets([
  "Each provider retries transient errors (503 / overload / 429) and falls back across models, then to the next provider.",
  "Optional model overrides: GEMINI_MODEL, GROQ_MODEL, OPENAI_MODEL (e.g. set OPENAI_MODEL=gpt-4o for stronger reasoning).",
  "Web-grounded deep research uses Gemini Google Search (quota-limited on free keys; degrades gracefully).",
]);
footer(); pdf.addPage(); y = M;

// ===== 7. MAINTENANCE & QA =====
h1("7", "Maintenance & QA Procedure");
h2("7.1 Before considering any change 'done'");
steps([
  "Run `npx tsc --noEmit` — confirm no NEW type errors over the baseline (the project tolerates a known baseline via ignoreBuildErrors).",
  "Run `npx next build` — confirm all pages generate successfully.",
  "If a dev server is running, stop it before building (dev + build share the .next folder).",
]);
h2("7.2 Functional QA");
steps([
  "Open QA / Diagnostics (sidebar) and click 'Run Tests'.",
  "All Route, Momentum, Evaluation, Analytics and Timeframe tests should Pass.",
  "Provider-missing data appears as Warning (not Fail) — this is expected and acceptable.",
]);
callout("Warnings are OK", "Some QA items are Warnings by design (e.g. a newly-listed stock with <1 month of hourly data, or a legacy symbol). These reflect honest data limitations, not bugs.", GREEN_L, GREEN);
footer(); pdf.addPage(); y = M;

// ===== 8. TROUBLESHOOTING =====
h1("8", "Troubleshooting Guide");
const tb = [
  ["AI 'disabled' / not working", "Check .env.local keys have NO space after '='; restart server."],
  ["AI 503 'high demand'", "Handled automatically (retry + Gemini→Groq / OpenAI fallback). Retry if all busy."],
  ["Fundamentals show 'Data unavailable'", "Data now comes from Yahoo; some India-specific fields (FII/DII) are genuinely unavailable."],
  ["PDF was blank", "Resolved — PDF is built programmatically (jsPDF), not a DOM screenshot."],
  ["Analyze is slow / 50s+", "First call after a code change recompiles (dev only). Warm calls are 2–4s."],
  ["Import report timed out", "It runs 2 AI calls + full compute; allow 30–60s. Retry once."],
  ["Build fails on /api/.. page data", "A dev server is conflicting; stop it, delete .next, rebuild."],
];
table([["Symptom", "Action"], ...tb], [0.4, 0.6]);
footer(); pdf.addPage(); y = M;

// ===== 9. COMPLIANCE & GUARDRAILS =====
h1("9", "Compliance & Guardrails");
h2("Always");
bullets([
  "Use research language only — no buy/sell/hold recommendation.",
  "Keep the mandatory disclaimer on every report and AI output.",
  "Show a clean 'Data unavailable' state with a reason when a value is genuinely missing — never invent data.",
  "Only import reports you are entitled to (your own subscription). No scraping of paywalled/login sites.",
], GREEN);
h2("Never");
bullets([
  "Never present any output as a guaranteed prediction or price target recommendation.",
  "Never fabricate proprietary third-party ratings — show our own computed equivalents, clearly labelled.",
  "Never store third-party API keys in client code or commit .env.local.",
], RED);
footer(); pdf.addPage(); y = M;

// ===== 10. QUICK REFERENCE =====
h1("10", "Quick Reference");
table([
  ["Action", "Where"],
  ["Analyze a stock", "Sidebar → Analyze Stock → search symbol"],
  ["Momentum score & watch", "Analyze → Momentum tab"],
  ["CAN SLIM evaluation", "Analyze → Evaluation tab"],
  ["Backtest & seasonality", "Analyze → Analytics tab"],
  ["Full CANSLIM research note", "Analyze → Research tab"],
  ["Notes (text/voice)", "Analyze → Notes tab, or Master Notes"],
  ["Import a 3rd-party report", "Sidebar → Import Report"],
  ["Ask AI about a stock", "Sidebar → AI Research Chat"],
  ["Run health checks", "Sidebar → QA / Diagnostics"],
], [0.45, 0.55]);
y += 8;
fc(INDIGO); pdf.roundedRect(M, y, CW, 44, 5, 5, "F");
tc(WHITE); font("bold", 12); pdf.text("StockAnalytix MVP — SOP v1.0", M + 14, y + 19);
tc([199, 210, 254]); font("normal", 9.5);
pdf.text("Research support only. Not buy/sell advice. No guaranteed prediction. Always verify independently.", M + 14, y + 34);
y += 58;
footer();

const out = "StockAnalytix_SOP.pdf";
fs.writeFileSync(out, Buffer.from(pdf.output("arraybuffer")));
console.log("Wrote", out, "(" + pageNo + " pages)");
