/**
 * Standalone daily stock digest -> email.
 *
 * Self-contained: does NOT need the Next.js server running. Reads config +
 * keys from .env.local, computes the last-24h digest (Yahoo + Perplexity, with
 * a Groq/OpenAI fallback), and emails it via Resend.
 *
 * Run manually:   node scripts/daily-digest.mjs
 * Dry run (print, no email):   node scripts/daily-digest.mjs --dry
 *
 * Scheduled automatically by the macOS launchd job (see install-digest-cron.sh).
 *
 * Config in .env.local:
 *   DIGEST_SYMBOLS   comma list, e.g. AAPL,RELIANCE.NS,TCS.NS
 *   DIGEST_EMAIL     recipient (for Resend's no-domain sending, use the email
 *                    you registered on resend.com)
 *   RESEND_API_KEY   from resend.com (free)
 *   RESEND_FROM      optional, defaults to "Daily Digest <onboarding@resend.dev>"
 *   PERPLEXITY_API_KEY / GROQ_API_KEY / OPENAI_API_KEY  (already present)
 */
import YahooFinance from "yahoo-finance2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const yahooFinance = new YahooFinance();
const DAY_MS = 24 * 60 * 60 * 1000;

// ---- load .env.local into process.env (without overwriting real env) -------
function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
    if (process.env[key] == null) process.env[key] = val;
  }
}
loadEnv();

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---- helpers ---------------------------------------------------------------
function toMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
}
function timeAgo(ms) {
  if (!ms) return "";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function toBullets(text) {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").replace(/\*+/g, "").trim())
    .filter(
      (l) =>
        l.length > 3 &&
        !/:$/.test(l) &&
        !/^(here('?s| is| are)|the following|summary|below|in the last 24|the provided|note:)/i.test(l) &&
        !/^no material developments/i.test(l) &&
        // drop model meta-commentary about the search/data, not the stock
        !/search results|date inconsisten|provided results|within the (requested|specific)|were (found|reported)|appear to be ai-generated|timeframe|no verified/i.test(l) &&
        !/no direct news|not mention|absence of|do not mention|unrelated to|no headlines|no company-specific|no significant news|quiet period|provided headlines|no specific news/i.test(l),
    );
}

async function perplexity(prompt) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.PERPLEXITY_MODEL || "sonar", messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const text = d?.choices?.[0]?.message?.content || "";
    const citations = Array.isArray(d?.citations) ? d.citations : (d?.search_results || []).map((s) => s?.url).filter(Boolean);
    return text ? { text, citations } : null;
  } catch {
    return null;
  }
}
async function groq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.4 }),
    });
    if (!res.ok) return "";
    const d = await res.json();
    return d?.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

async function digestOne(symbol) {
  let price = null, changePct = null;
  try {
    const q = await yahooFinance.quote(symbol);
    price = q?.regularMarketPrice ?? null;
    changePct = typeof q?.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null;
  } catch {}

  let news = [];
  try {
    const sr = await yahooFinance.search(symbol, { newsCount: 20 }).catch(() => null);
    news = (sr?.news || [])
      .map((a) => { const ms = toMs(a.providerPublishTime); return { title: a.title, url: a.link, source: a.publisher || "", time: ms, timeAgo: timeAgo(ms) }; })
      .filter((a) => a.time && Date.now() - a.time <= DAY_MS)
      .sort((a, b) => b.time - a.time)
      .slice(0, 5);
  } catch {}

  let bullets = [], citations = [], summary = "", source = "none";
  const today = new Date().toDateString();
  const prompt = `Today is ${today}. For the stock ${symbol}, list the most recent material developments (news, analyst rating/target changes, earnings/guidance, filings, management/product news, sector/macro events).
Return 2-5 short factual bullet points of what happened. Each bullet must be a plain statement of an event.
Do NOT comment on data quality, dates, timestamps, sources, or the search process. Do NOT say the results are inconsistent or outdated. If there is genuinely nothing, reply exactly: "No material developments in the last 24 hours."
Rules: research language only, NO buy/sell advice, NO price predictions. Concise.`;

  // Perplexity (live web) is primary. If it answers at all, trust it — even a
  // clean "nothing material" beats verbose fallback filler.
  const p = await perplexity(prompt);
  if (p?.text) {
    source = "perplexity";
    citations = p.citations || [];
    bullets = toBullets(p.text);
    summary = bullets.length ? p.text.trim() : "No material developments in the last 24 hours.";
  }

  // Fallback only when Perplexity gave nothing at all (null/failed).
  if (source === "none" && news.length) {
    const headlines = news.map((n, i) => `${i + 1}. ${n.title} (${n.source}, ${n.timeAgo})`).join("\n");
    const t = await groq(`These are recent market headlines. Extract ONLY items specifically about ${symbol}.
${headlines}
List 2-4 short factual bullets about ${symbol}. If NONE of the headlines are specifically about ${symbol}, reply exactly: "No material developments in the last 24 hours." Do NOT describe unrelated headlines. Research language only, NO buy/sell advice.`);
    if (t) { bullets = toBullets(t); summary = bullets.length ? t.trim() : "No material developments in the last 24 hours."; source = bullets.length ? "ai-news" : "none"; }
  }
  if (source === "none" && news.length) source = "news-only";
  if (!bullets.length && source !== "perplexity" && source !== "news-only") summary = "No material developments in the last 24 hours.";

  return { symbol, price, changePct, bullets, summary, citations, news, source };
}

function esc(s) { return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }
function emailHtml(digests) {
  const rows = digests.map((d) => {
    const up = (d.changePct ?? 0) >= 0;
    const chg = d.changePct != null ? `<span style="color:${up ? "#059669" : "#e11d48"};font-weight:700">${up ? "+" : ""}${d.changePct.toFixed(2)}%</span>` : "";
    const bl = (d.bullets || []).slice(0, 5).map((b) => `<li>${esc(b)}</li>`).join("") || `<li>${esc(d.summary)}</li>`;
    const links = (d.news || []).slice(0, 3).map((n) => `<a href="${esc(n.url)}" style="color:#4f46e5;font-size:12px">${esc(n.title)}</a>`).join("<br/>");
    return `<tr><td style="padding:16px;border-bottom:1px solid #e2e8f0">
      <div style="font-weight:800;color:#0f172a;font-size:15px">${esc(d.symbol)} ${d.price != null ? `<span style="color:#64748b;font-weight:400">${d.price}</span>` : ""} &nbsp; ${chg}</div>
      <ul style="margin:8px 0;padding-left:18px;color:#334155;font-size:14px">${bl}</ul>
      ${links ? `<div style="margin-top:6px">${links}</div>` : ""}
    </td></tr>`;
  }).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
    <h2 style="color:#4f46e5">📈 Daily Stock Digest</h2>
    <p style="color:#64748b;font-size:13px">What changed in the last 24 hours · ${new Date().toLocaleString()}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px">${rows}</table>
    <p style="color:#94a3b8;font-size:11px;margin-top:16px">Research support only. Not buy/sell advice. No guaranteed prediction. Always verify data independently.</p>
  </div>`;
}

async function sendEmail(html, count) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_EMAIL;
  const from = process.env.RESEND_FROM || "Daily Digest <onboarding@resend.dev>";
  if (!key || !to) { log("EMAIL SKIPPED — set RESEND_API_KEY and DIGEST_EMAIL in .env.local"); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `📈 Daily Stock Digest — ${new Date().toLocaleDateString()} (${count})`, html }),
  });
  if (!res.ok) { log("EMAIL FAILED:", res.status, (await res.text()).slice(0, 200)); return false; }
  log("EMAIL SENT to", to);
  return true;
}

async function main() {
  const symbols = (process.env.DIGEST_SYMBOLS || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
  if (!symbols.length) { log("No DIGEST_SYMBOLS set in .env.local — nothing to do."); process.exit(0); }
  log("Digest for:", symbols.join(", "), DRY ? "(DRY RUN)" : "");

  const digests = (await Promise.all(symbols.map((s) => digestOne(s).catch(() => null)))).filter(Boolean);
  // biggest movers first
  digests.sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0));

  // save a copy for inspection
  const outDir = path.join(ROOT, "scripts", "digest-output");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "last-digest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), digests }, null, 2));

  console.log("\n===== DIGEST =====");
  for (const d of digests) {
    console.log(`\n${d.symbol}  ${d.price ?? ""}  ${d.changePct != null ? (d.changePct >= 0 ? "+" : "") + d.changePct.toFixed(2) + "%" : ""}  [${d.source}]`);
    (d.bullets.length ? d.bullets : [d.summary]).slice(0, 5).forEach((b) => console.log("  • " + b));
  }
  console.log("\n==================\n");

  const html = emailHtml(digests);
  if (DRY) {
    fs.writeFileSync(path.join(outDir, "last-email.html"), html);
    log("DRY RUN — wrote scripts/digest-output/last-email.html (no email sent)");
  } else {
    await sendEmail(html, digests.length);
  }
}
main().catch((e) => { log("ERROR", e?.message || e); process.exit(1); });
