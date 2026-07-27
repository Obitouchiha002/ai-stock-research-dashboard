/**
 * Standalone documentation generator for StockAnalytix MVP.
 * Not part of the app — run with:  node generate-documentation.mjs
 * Produces: StockAnalytix_Documentation.pdf
 */
import { jsPDF } from "jspdf";
import fs from "fs";

const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
const W = pdf.internal.pageSize.getWidth();
const H = pdf.internal.pageSize.getHeight();
const M = 48;
const CW = W - M * 2;
let y = M;

// palette
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
const SKY = [14, 165, 233];
const WHITE = [255, 255, 255];

const tc = (c) => pdf.setTextColor(c[0], c[1], c[2]);
const fc = (c) => pdf.setFillColor(c[0], c[1], c[2]);
const dc = (c) => pdf.setDrawColor(c[0], c[1], c[2]);
const font = (style = "normal", size = 10) => {
  pdf.setFont("helvetica", style);
  pdf.setFontSize(size);
};

let pageNo = 0;
const footer = () => {
  pageNo++;
  font("normal", 7.5);
  tc(GRAY);
  pdf.text("StockAnalytix MVP — Build Documentation", M, H - 22);
  pdf.text(`Page ${pageNo}`, W - M, H - 22, { align: "right" });
  dc([226, 232, 240]);
  pdf.setLineWidth(0.5);
  pdf.line(M, H - 32, W - M, H - 32);
};
const ensure = (need) => {
  if (y + need > H - 50) {
    footer();
    pdf.addPage();
    y = M;
  }
};

const h1 = (n, title) => {
  ensure(46);
  fc(INDIGO);
  pdf.roundedRect(M, y, CW, 30, 4, 4, "F");
  tc(WHITE);
  font("bold", 14);
  pdf.text(`${n}.  ${title}`, M + 12, y + 20);
  y += 44;
};
const h2 = (title) => {
  ensure(28);
  tc(INDIGO);
  font("bold", 11.5);
  pdf.text(title, M, y + 10);
  dc(INDIGO);
  pdf.setLineWidth(1.2);
  pdf.line(M, y + 15, M + 26, y + 15);
  y += 26;
};
const para = (text) => {
  font("normal", 10);
  tc(SLATE);
  pdf.splitTextToSize(text, CW).forEach((ln) => {
    ensure(15);
    pdf.text(ln, M, y + 9);
    y += 14.5;
  });
  y += 6;
};
const bullets = (items, color = INDIGO) => {
  font("normal", 10);
  items.forEach((it) => {
    const bold = it.startsWith("**");
    const txt = it.replace(/\*\*/g, "");
    ensure(15);
    fc(color);
    pdf.circle(M + 3, y + 4.5, 1.8, "F");
    tc(bold ? DARK : SLATE);
    font(bold ? "bold" : "normal", 10);
    pdf.splitTextToSize(txt, CW - 16).forEach((ln, li) => {
      ensure(14.5);
      pdf.text(ln, M + 12, y + 8);
      y += 14;
    });
  });
  y += 6;
};
const callout = (title, text, bg, fg) => {
  font("normal", 9.5);
  const lines = pdf.splitTextToSize(text, CW - 24);
  const boxH = 22 + lines.length * 12.5 + 8;
  ensure(boxH + 6);
  fc(bg);
  pdf.roundedRect(M, y, CW, boxH, 4, 4, "F");
  fc(fg);
  pdf.rect(M, y, 4, boxH, "F");
  tc(fg);
  font("bold", 10);
  pdf.text(title, M + 14, y + 16);
  tc(SLATE);
  font("normal", 9.5);
  lines.forEach((ln, i) => pdf.text(ln, M + 14, y + 30 + i * 12.5));
  y += boxH + 10;
};

// problem / solution card
const probCard = (problem, solution) => {
  font("normal", 9.5);
  const pL = pdf.splitTextToSize(problem, CW - 90);
  const sL = pdf.splitTextToSize(solution, CW - 90);
  const rows = Math.max(pL.length, sL.length);
  const boxH = 20 + rows * 12 + 10;
  ensure(boxH + 8);
  // problem row
  fc(RED_L);
  pdf.roundedRect(M, y, CW, boxH / 2, 3, 3, "F");
  tc(RED);
  font("bold", 8.5);
  pdf.text("PROBLEM", M + 10, y + 14);
  tc(SLATE);
  font("normal", 9.5);
  pL.forEach((ln, i) => pdf.text(ln, M + 78, y + 14 + i * 12));
  y += boxH / 2 + 3;
  // solution row
  fc(GREEN_L);
  pdf.roundedRect(M, y, CW, boxH / 2, 3, 3, "F");
  tc(GREEN);
  font("bold", 8.5);
  pdf.text("FIX", M + 10, y + 14);
  tc(SLATE);
  font("normal", 9.5);
  sL.forEach((ln, i) => pdf.text(ln, M + 78, y + 14 + i * 12));
  y += boxH / 2 + 12;
};

// simple box for diagrams
const box = (x, bx, w, h, label, fill, txt = DARK, sub = "") => {
  fc(fill);
  pdf.roundedRect(x, bx, w, h, 4, 4, "F");
  tc(txt);
  font("bold", 9);
  pdf.text(label, x + w / 2, bx + (sub ? h / 2 - 2 : h / 2 + 3), { align: "center" });
  if (sub) {
    font("normal", 7);
    pdf.text(sub, x + w / 2, bx + h / 2 + 10, { align: "center" });
  }
};
const arrowDown = (x, y1, y2) => {
  dc(GRAY);
  pdf.setLineWidth(1);
  pdf.line(x, y1, x, y2);
  pdf.triangle(x - 3, y2 - 4, x + 3, y2 - 4, x, y2, "F");
};

// ============================== COVER ==============================
fc(DARK);
pdf.rect(0, 0, W, H, "F");
fc(INDIGO);
pdf.rect(0, 0, W, 8, "F");
pdf.rect(0, H - 8, W, 8, "F");
// logo mark
fc(INDIGO);
pdf.roundedRect(M, 150, 54, 54, 10, 10, "F");
tc(WHITE);
font("bold", 30);
pdf.text("S", M + 27, 190, { align: "center" });
tc(WHITE);
font("bold", 34);
pdf.text("StockAnalytix MVP", M, 270);
tc([165, 180, 252]);
font("normal", 15);
pdf.text("AI-Powered Stock Research & Momentum Platform", M, 298);
font("bold", 16);
tc(WHITE);
pdf.text("Complete Build Documentation", M, 360);
font("normal", 11);
tc([148, 163, 184]);
pdf.splitTextToSize(
  "How the application was designed and built, the engineering problems faced, and how each was solved — step by step.",
  CW,
).forEach((ln, i) => pdf.text(ln, M, 388 + i * 16));
font("normal", 10);
tc([148, 163, 184]);
pdf.text(`Generated: ${new Date().toLocaleString()}`, M, H - 80);
pdf.text("Next.js 15  •  React 19  •  TypeScript  •  Gemini + Groq AI  •  Yahoo Finance", M, H - 60);
pdf.addPage();
y = M;

// ============================== TOC ==============================
h1("", "Table of Contents");
y -= 30;
font("bold", 16);
tc(DARK);
pdf.text("Table of Contents", M, y + 10);
y += 34;
const toc = [
  "1.  Executive Summary",
  "2.  Technology Stack",
  "3.  System Architecture",
  "4.  Data Flow",
  "5.  Features Built",
  "6.  Step-by-Step Build Journey",
  "7.  Problems Faced & Solutions",
  "8.  AI Reliability (Gemini + Groq)",
  "9.  Testing & QA",
  "10. How to Run the App",
  "11. Project Structure",
  "12. Conclusion & Future Work",
];
toc.forEach((t) => {
  font("normal", 11);
  tc(SLATE);
  pdf.text(t, M + 6, y + 8);
  y += 22;
});
footer();
pdf.addPage();
y = M;

// ============================== 1. SUMMARY ==============================
h1("1", "Executive Summary");
para(
  "StockAnalytix MVP is an AI-powered stock research terminal for investors and traders. It lets a user search any US or Indian stock and instantly view a multi-tab research workspace: technical analysis, fundamentals, valuation, a deep Momentum Analysis module, a CAN SLIM-style Evaluation module, live market news, AI-written research reports, interactive charts, and downloadable PDF reports.",
);
para(
  "The application is built on real market data from Yahoo Finance and uses large language models (Google Gemini with a Groq fallback) to generate research-language insights. It deliberately avoids buy/sell advice and price predictions — every AI output uses research framing and carries a mandatory disclaimer.",
);
h2("Highlights");
bullets([
  "**10 analysis tabs** per stock: Overview, Top-Down, Chart, Technical, Fundamentals, Valuation, Momentum, Evaluation, News, Risk.",
  "**Momentum module** with 15+ sections, a weighted score, time-series graphs, a 15-Day Watch tracker, a scenario engine, and an AI deep dive.",
  "**Evaluation module** with the CAN SLIM checklist, composite rating, Acc/Dis & SMR grades, and regression-based Alpha/Beta.",
  "**Resilient AI**: Gemini primary with retry + model fallback, automatically failing over to Groq.",
  "**Live news** (market + per-stock) and **professional PDF** export.",
]);
footer();
pdf.addPage();
y = M;

// ============================== 2. TECH STACK ==============================
h1("2", "Technology Stack");
para("The app is a single Next.js application (App Router) with API routes acting as the backend. No separate server is required.");
const stack = [
  ["Framework", "Next.js 15 (App Router, Turbopack)"],
  ["UI", "React 19, TypeScript, Tailwind CSS v4"],
  ["Charts", "Recharts + lightweight-charts"],
  ["Indicators", "technicalindicators (RSI, ADX, SMA, EMA, MACD)"],
  ["Market data", "yahoo-finance2 (quotes, charts, fundamentals, news)"],
  ["AI", "Google Gemini (@google/genai) + Groq (OpenAI-compatible) fallback"],
  ["PDF", "jsPDF (programmatic, vector text)"],
  ["State", "React Context + browser localStorage"],
];
font("normal", 10);
stack.forEach(([k, v], i) => {
  ensure(22);
  fc(i % 2 === 0 ? LIGHT : WHITE);
  pdf.rect(M, y, CW, 22, "F");
  tc(DARK);
  font("bold", 9.5);
  pdf.text(k, M + 8, y + 14);
  tc(SLATE);
  font("normal", 9.5);
  pdf.text(v, M + 150, y + 14);
  y += 22;
});
y += 8;
callout(
  "Why Yahoo Finance (not Finnhub)?",
  "The app originally pulled fundamentals from Finnhub, which needs a paid API key. Without it, many fields showed 'Data unavailable'. We migrated fundamentals to Yahoo's quoteSummary, which provides ROE, margins, debt, cash flow and sector data for free.",
  AMBER_L,
  AMBER,
);
footer();
pdf.addPage();
y = M;

// ============================== 3. ARCHITECTURE ==============================
h1("3", "System Architecture");
para("A layered architecture: the browser renders React pages, which call Next.js API routes. Routes orchestrate data services, which call Yahoo Finance and the AI providers.");
// diagram
const cx = M + CW / 2;
let dy = y + 4;
box(M + CW / 2 - 110, dy, 220, 30, "Browser (React 19 pages)", INDIGO_L, DARK, "Analyze • Dashboard • News • QA");
arrowDown(cx, dy + 30, dy + 50);
dy += 50;
box(M + CW / 2 - 110, dy, 220, 30, "Next.js API Routes", INDIGO, WHITE, "/api/analyze • /api/momentum • /api/evaluation • /api/news");
arrowDown(cx, dy + 30, dy + 50);
dy += 50;
// services row (3 boxes)
const sw = (CW - 24) / 3;
box(M, dy, sw, 34, "Services", LIGHT, DARK, "momentum • evaluation • chart • market");
box(M + sw + 12, dy, sw, 34, "AI Client", LIGHT, DARK, "retry + fallback");
box(M + 2 * (sw + 12), dy, sw, 34, "Indicators", LIGHT, DARK, "RSI/ADX/MA");
arrowDown(M + sw / 2, dy + 34, dy + 54);
arrowDown(M + sw + 12 + sw / 2, dy + 34, dy + 54);
dy += 54;
// providers
box(M, dy, (CW - 12) / 2, 30, "Yahoo Finance", GREEN_L, DARK, "prices • fundamentals • news");
box(M + (CW - 12) / 2 + 12, dy, (CW - 12) / 2, 30, "Gemini  +  Groq", AMBER_L, DARK, "LLM research text");
y = dy + 48;
para("Each API route is self-contained and fault-tolerant: a single missing data module or an overloaded AI model never crashes the whole response — it degrades to a clean fallback state.");
footer();
pdf.addPage();
y = M;

// ============================== 4. DATA FLOW ==============================
h1("4", "Data Flow — Analyzing a Stock");
para("When a user analyzes a stock, the pipeline runs in parallel where possible:");
const flow = [
  ["1", "User enters a symbol", "e.g. AAPL or RELIANCE.NS; market = US / NSE / BSE"],
  ["2", "Symbol resolution", "normalizeSymbol + Yahoo quote/search (.NS / .BO suffixes)"],
  ["3", "Parallel data fetch", "chart history, quoteSummary fundamentals, news, multi-timeframe"],
  ["4", "Compute layer", "trend, RSI, MACD, MAs, scores, top-down market context"],
  ["5", "AI report", "Gemini/Groq writes research views (tailored to profile + risk)"],
  ["6", "Response → tabs", "page renders 10 tabs; Momentum/Evaluation fetch on demand"],
];
flow.forEach(([n, t, d]) => {
  ensure(34);
  fc(INDIGO);
  pdf.circle(M + 10, y + 12, 9, "F");
  tc(WHITE);
  font("bold", 10);
  pdf.text(n, M + 10, y + 15, { align: "center" });
  tc(DARK);
  font("bold", 10);
  pdf.text(t, M + 28, y + 9);
  tc(GRAY);
  font("normal", 9);
  pdf.text(d, M + 28, y + 22);
  if (n !== "6") {
    dc([203, 213, 225]);
    pdf.setLineWidth(0.8);
    pdf.line(M + 10, y + 21, M + 10, y + 30);
  }
  y += 34;
});
y += 4;
callout(
  "Performance win",
  "The top-down market context originally re-ran a full multi-timeframe analysis (3 heavy chart fetches) for both the index AND the sector — 6 extra fetches per request. Removing this redundancy cut analyze time from ~53 seconds to 2–4 seconds.",
  GREEN_L,
  GREEN,
);
footer();
pdf.addPage();
y = M;

// ============================== 5. FEATURES ==============================
h1("5", "Features Built");
const features = [
  ["Stock Search & Dashboard", "Global search, recent searches, market overview, personalized greeting."],
  ["Multi-Timeframe Charts", "Hourly / Daily / Weekly with MAs, RSI, ADX, support/resistance, patterns."],
  ["Advanced Chart Interaction", "Zoom in/out buttons, mouse-wheel & trackpad zoom, drag-free data window, fullscreen."],
  ["Momentum Analysis Module", "Snapshot, price strength, buyer demand, sector rank, EPS/sales trends, forward PE, ownership, quality ratios, dilution, cash flow, short-term setup, weighted score."],
  ["Momentum Graphs", "Time-series momentum line, price strength, buyer demand, RSI/ADX, extension risk."],
  ["15-Day Momentum Watch", "Save a baseline snapshot; track price/RSI/ADX/score changes over 15 trading days; AI 'what changed'."],
  ["Scenario Engine", "Bullish / pullback / weakening conditional scenarios with trigger & confirmation signals."],
  ["Stock Evaluation (CAN SLIM)", "7-point CAN SLIM checklist, composite rating, Acc/Dis & SMR grades, regression Alpha/Beta, multi-year fundamentals."],
  ["Live News", "Market news (no watchlist needed) + per-stock news with sentiment, category & impact tags; AI news summary."],
  ["AI Research Reports", "Executive summary + per-section views, tailored to investor profile & risk tolerance."],
  ["Professional PDF Export", "Vector PDF report with cover, scores, all sections, and disclaimer."],
  ["QA / Diagnostics", "Automated tests across routes, data, momentum, evaluation, and timeframe coverage."],
];
features.forEach(([t, d]) => {
  font("bold", 10.5);
  const dLines = pdf.splitTextToSize(d, CW - 16);
  const boxH = 16 + dLines.length * 12 + 8;
  ensure(boxH + 6);
  fc(LIGHT);
  pdf.roundedRect(M, y, CW, boxH, 3, 3, "F");
  fc(INDIGO);
  pdf.rect(M, y, 3, boxH, "F");
  tc(DARK);
  pdf.text(t, M + 12, y + 15);
  tc(SLATE);
  font("normal", 9.5);
  dLines.forEach((ln, i) => pdf.text(ln, M + 12, y + 28 + i * 12));
  y += boxH + 8;
});
footer();
pdf.addPage();
y = M;

// ============================== 6. BUILD JOURNEY ==============================
h1("6", "Step-by-Step Build Journey");
para("The app was built and extended in clear phases. Each phase was type-checked and verified with a production build before moving on.");
const phases = [
  ["Phase A — Momentum module", "Built the momentum engine (lib/momentumService), a momentum API, a 16-section Momentum tab, and wired it into the analyze page, AI report, PDF and QA."],
  ["Phase B — Chart range fix", "Widened hourly (1mo), daily (6mo), weekly (1yr) ranges, added daily→weekly aggregation, and per-timeframe metadata."],
  ["Phase C — Live momentum workspace", "Added time-series graphs, a 15-Day Watch tracker, a scenario engine, AI 'what changed', and a data-coverage card."],
  ["Phase D — Evaluation module", "Built the CAN SLIM checklist, composite rating, Acc/Dis & SMR grades, Alpha/Beta regression, multi-year fundamentals, and an AI evaluation."],
  ["Phase E — AI reliability", "Wrong model name fixed; added retry, model fallback, and a Groq provider fallback so AI never dies on a 503."],
  ["Phase F — Data & news", "Migrated fundamentals to Yahoo; rebuilt the News page (market + per-stock) with sentiment/category tags and AI summary."],
  ["Phase G — UX fixes", "Working refresh, dark mode, market selector; profile name on dashboard; toolbar dropdowns wired into the report."],
  ["Phase H — Charts & PDF", "Chart zoom/fullscreen; programmatic jsPDF report to fix blank PDFs."],
];
phases.forEach(([t, d]) => {
  h2(t);
  para(d);
});

h2("Estimated Development Effort & Timeline");
para("Approximate focused-engineering effort per area. These are ESTIMATES of equivalent build effort (design + code + test + verify), not precise wall-clock — the project was built iteratively across multiple sessions with AI assistance.");
const effort = [
  ["Area", "Est. Effort"],
  ["Phase A — Momentum module (engine, API, 16-section tab)", "~12 hrs"],
  ["Phase B — Chart range fix + weekly aggregation", "~2 hrs"],
  ["Phase C — Live momentum (graphs, 15-day watch, scenarios)", "~8 hrs"],
  ["Phase D — Evaluation (CAN SLIM, composite, alpha/beta)", "~8 hrs"],
  ["Phase E — AI reliability (retry, Groq + OpenAI tiered routing)", "~5 hrs"],
  ["Phase F — Yahoo fundamentals migration + live news", "~4 hrs"],
  ["Phase G — UX fixes (dark mode, refresh, market, profile)", "~3 hrs"],
  ["Phase H — Chart zoom/fullscreen + programmatic PDF", "~4 hrs"],
  ["Analytics (backtest signal-edge, seasonality)", "~4 hrs"],
  ["Research Note (15-section CANSLIM report + web research)", "~7 hrs"],
  ["Notes (text + voice, master + sub)", "~3 hrs"],
  ["Import Report (super-report, enrich, track, chat, HTML view)", "~9 hrs"],
  ["AI Q&A Chat + Portfolio Review + Excel export", "~4 hrs"],
  ["Testing, QA harness & build verification (throughout)", "~6 hrs"],
  ["TOTAL (estimated)", "~79 hrs (≈ 70–95 hrs)"],
];
font("normal", 9.5);
effort.forEach((r, i) => {
  ensure(20);
  const isHead = i === 0;
  const isTotal = i === effort.length - 1;
  fc(isHead ? [30, 41, 59] : isTotal ? INDIGO_L : i % 2 === 0 ? LIGHT : WHITE);
  pdf.rect(M, y, CW, 19, "F");
  tc(isHead ? WHITE : DARK);
  font(isHead || isTotal ? "bold" : "normal", 9.5);
  pdf.text(r[0], M + 8, y + 13);
  pdf.text(r[1], W - M - 8, y + 13, { align: "right" });
  y += 19;
});
y += 6;
para("Note: with AI-assisted development the actual elapsed time was far shorter; the figures above express equivalent engineering effort for planning/handover purposes.");
footer();
pdf.addPage();
y = M;

// ============================== 7. PROBLEMS ==============================
h1("7", "Problems Faced & Solutions");
para("The most significant engineering problems encountered during the build, and how each was resolved.");
const probs = [
  ["Invalid AI model name 'gemini-3.5-flash' caused every AI call to fail.", "Switched to the valid 'gemini-2.5-flash', made it env-overridable, and added model fallbacks."],
  ["API keys broke because of a space after '=' in .env.local (KEY= value).", "Trimmed the leading space; documented 'no space after =' for both Gemini and Groq keys."],
  ["Gemini returned 503 'high demand' on heavy JSON requests, breaking AI features.", "Added retry-with-backoff, model fallback, and an automatic Groq fallback provider."],
  ["Analyze took ~53 seconds per stock.", "Removed redundant nested multi-timeframe fetches in the top-down context; trimmed chart ranges. Now 2–4s."],
  ["Fundamentals/Valuation/Risk tabs showed 'Data unavailable'.", "Root cause: Finnhub was keyless. Migrated fundamentals to Yahoo quoteSummary (ROE, margins, debt, sector)."],
  ["Valuation tab displayed 'undefined'.", "Field mismatch — the page read valuation.view but the API only sent valuation.label. Added the view field."],
  ["News tab was always empty.", "News came from keyless Finnhub. Added a Yahoo news fallback with sentiment scoring."],
  ["PDF download produced a blank page.", "Tailwind v4 oklch() colors break DOM-screenshot libraries. Rebuilt the PDF programmatically with jsPDF (vector text)."],
  ["Top-bar refresh, dark mode and market selector did nothing.", "Wired refresh to reload data, retrofitted dark-mode CSS, and synced the market selector to global state (incl. BSE→India)."],
  ["Dashboard greeting was hardcoded to 'John'.", "Connected it to the global profile name from settings."],
  ["TypeScript union-narrowing & timeframe-range issues in chart service.", "Typed service results as any where appropriate and added explicit timeframe metadata + weekly aggregation."],
];
probs.forEach(([p, s]) => probCard(p, s));
footer();
pdf.addPage();
y = M;

// ============================== 8. AI RELIABILITY ==============================
h1("8", "AI Reliability — Gemini + Groq");
para("All AI features route through a single resilient client (lib/aiClient). It tries Gemini first with retries and model fallback, then automatically fails over to Groq.");
let ay = y + 4;
box(M, ay, CW, 28, "Request (prompt)", INDIGO_L, DARK);
arrowDown(M + CW / 2, ay + 28, ay + 46);
ay += 46;
box(M, ay, CW, 30, "Gemini 2.5-flash  →  2.0-flash  →  flash-latest", INDIGO, WHITE, "retry x3 with backoff on 503 / overload");
arrowDown(M + CW / 2, ay + 30, ay + 48);
ay += 48;
box(M, ay, CW, 30, "Groq llama-3.3-70b  →  llama-3.1-8b", AMBER, WHITE, "automatic fallback if Gemini stays down");
arrowDown(M + CW / 2, ay + 30, ay + 48);
ay += 48;
box(M, ay, CW, 28, "Clean fallback message if all providers fail", LIGHT, DARK, "feature never crashes");
y = ay + 44;
callout(
  "Result",
  "Verified end-to-end: with a deliberately broken Gemini key, AI features still produced full results via Groq. With Gemini healthy, it stays primary. The user never sees a dead AI button.",
  GREEN_L,
  GREEN,
);
footer();
pdf.addPage();
y = M;

// ============================== 9. QA ==============================
h1("9", "Testing & QA");
para("A dedicated QA / Diagnostics page runs automated checks across the whole app. Provider-missing data is reported as a Warning, never a hard failure, so graceful fallbacks pass.");
h2("What QA validates");
bullets([
  "Every route renders and the analyze API returns valid data.",
  "Technical, fundamental, valuation, risk and scorecard logic stay within bounds.",
  "Momentum: score, price strength, buyer demand, EPS/sales trends, forward PE, ownership, cash flow, short-term setup, graphs, scenarios, data coverage.",
  "Evaluation: CAN SLIM (7 criteria), composite rating, Acc/Dis & SMR grades, Alpha/Beta, multi-year fundamentals.",
  "Timeframe coverage: hourly ≈ 1 month, daily ≈ 6 months, weekly ≈ 1 year.",
  "AI deep dives and 'what changed' return valid JSON (or a handled fallback).",
]);
h2("Build verification");
para("Every change was checked with `tsc --noEmit` (zero new type errors over the baseline) and a full `next build` (all pages generated successfully) before being considered done.");
footer();
pdf.addPage();
y = M;

// ============================== 10. HOW TO RUN ==============================
h1("10", "How to Run the App");
h2("1. Install dependencies");
para("npm install");
h2("2. Configure API keys in .env.local");
const envBox = [
  "GEMINI_API_KEY=your_gemini_key        # no space after =",
  "GROQ_API_KEY=gsk_your_groq_key         # fallback, free at console.groq.com",
];
fc(DARK);
const ebH = 14 + envBox.length * 14 + 8;
ensure(ebH + 6);
pdf.roundedRect(M, y, CW, ebH, 3, 3, "F");
tc([134, 239, 172]);
font("normal", 9);
envBox.forEach((ln, i) => pdf.text(ln, M + 10, y + 18 + i * 14));
y += ebH + 12;
h2("3. Start");
para("npm run dev      → development server at http://localhost:3000");
para("npm run build && npm start   → production build (faster, no recompile lag)");
callout(
  "Note on keys",
  "Gemini and Groq keys must be pasted directly after '=' with no leading space. If Gemini is overloaded, the app uses Groq automatically — both keys are recommended.",
  INDIGO_L,
  INDIGO,
);
footer();
pdf.addPage();
y = M;

// ============================== 11. STRUCTURE ==============================
h1("11", "Project Structure");
para("Key files and folders (new modules added during this build are marked NEW).");
const tree = [
  ["src/app/", "dir", ""],
  ["  analyze/page.tsx", "file", "main research workspace (10 tabs, PDF, charts)"],
  ["  dashboard/  news/  qa/ ...", "file", "other pages"],
  ["  api/analyze/route.ts", "file", "core analysis + AI report"],
  ["  api/momentum/route.ts", "new", "momentum + AI deep dive + what-changed"],
  ["  api/evaluation/route.ts", "new", "CAN SLIM evaluation + AI"],
  ["  api/news/route.ts", "file", "market + per-stock news"],
  ["src/lib/", "dir", ""],
  ["  momentumService.ts", "new", "momentum engine + graphs + scenarios"],
  ["  evaluationService.ts", "new", "CAN SLIM, composite, alpha/beta"],
  ["  aiClient.ts", "new", "Gemini + Groq resilient client"],
  ["  multiTimeframeChartService.ts", "file", "candles + indicators"],
  ["  marketContextService.ts", "file", "top-down index/sector"],
  ["  storage.ts", "file", "localStorage (watchlist, 15-day watch...)"],
  ["src/components/", "dir", ""],
  ["  MomentumTab.tsx", "new", "momentum UI"],
  ["  EvaluationTab.tsx", "new", "evaluation UI"],
  ["  AppShell.tsx", "file", "sidebar + top bar"],
];
font("normal", 9);
tree.forEach(([name, kind, desc]) => {
  ensure(16);
  const isDir = kind === "dir";
  tc(isDir ? INDIGO : DARK);
  font(isDir ? "bold" : "normal", 9);
  pdf.text(name, M + 6, y + 10);
  if (kind === "new") {
    fc(GREEN);
    pdf.roundedRect(M + 215, y + 1, 28, 12, 2, 2, "F");
    tc(WHITE);
    font("bold", 7);
    pdf.text("NEW", M + 229, y + 9.5, { align: "center" });
  }
  tc(GRAY);
  font("normal", 8.5);
  if (desc) pdf.text(desc, M + 252, y + 10);
  y += 16;
});
footer();
pdf.addPage();
y = M;

// ============================== 12. CONCLUSION ==============================
h1("12", "Conclusion & Future Work");
para("StockAnalytix MVP grew from a basic stock dashboard into a full research workspace with deep momentum analysis, a CAN SLIM evaluation engine, interactive charts, live news, resilient AI, and professional PDF reporting — all on free market data with graceful handling of missing fields.");
h2("Guardrails kept throughout");
bullets([
  "Research language only — no buy/sell advice, no guaranteed predictions.",
  "Mandatory disclaimer on every AI output and report.",
  "Never invent unavailable data — show a clean 'unavailable' state with the reason.",
]);
h2("Possible future enhancements");
bullets([
  "Drawing tools on charts (trendlines, fib levels) and synced indicator sub-panels.",
  "Momentum / CAN SLIM screeners over a stock universe.",
  "AI portfolio review and an AI Q&A chat scoped to one stock.",
  "Embedding live chart images into the PDF report.",
]);
y += 6;
fc(INDIGO);
pdf.roundedRect(M, y, CW, 46, 5, 5, "F");
tc(WHITE);
font("bold", 12);
pdf.text("StockAnalytix MVP", M + 14, y + 20);
tc([199, 210, 254]);
font("normal", 9.5);
pdf.text("Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently.", M + 14, y + 36);
y += 60;
footer();

// save
const out = "StockAnalytix_Documentation.pdf";
fs.writeFileSync(out, Buffer.from(pdf.output("arraybuffer")));
console.log("Wrote", out, "(" + pageNo + " pages)");
