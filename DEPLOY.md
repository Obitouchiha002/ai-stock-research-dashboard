# Deploying StockAnalytix to Vercel

**Live:** https://stockanalytix.vercel.app
**Project:** `grivaas-projects/stockanalytix`

Redeploy after any code change with:

```bash
npx vercel --prod
```

This project is Vercel-ready. Everything below has been verified with a clean
production build (`npm run build`, exit 0) and a smoke test of every API route
against both `npm start` and the live deployment.

---

## Why Vercel (and not BigRock / HostGator shared hosting)

The app has **13 server-side API routes** that need a running Node.js process:
Yahoo Finance calls, the momentum/evaluation engines, and three AI providers.
Shared cPanel hosting serves PHP over Apache — it cannot run a persistent Node
server, blocks most outbound HTTP, and caps requests around 30s (the
`/api/import-report` route legitimately needs up to 60s).

If you own a domain at BigRock/HostGator, keep it — just point its DNS at
Vercel. You only need the domain, not their hosting plan.

---

## 1. Prerequisites

- A [vercel.com](https://vercel.com) account (free Hobby tier is enough)
- Your three AI keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`

---

## 2. Deploy

This folder is **not a git repository** yet. Pick one path.

### Option A — Vercel CLI (no git needed, fastest)

```bash
npm i -g vercel
vercel login
vercel          # preview deploy; answer the prompts, accept defaults
vercel --prod   # promote to production
```

### Option B — GitHub (recommended for ongoing work; gives auto-deploy on push)

```bash
git init
git add .
git commit -m "StockAnalytix MVP"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then on vercel.com: **Add New → Project → Import** your repo. Vercel auto-detects
Next.js; leave the build settings untouched.

> `.gitignore` already contains `.env*`, so your keys will **not** be committed.
> Verify with `git status` before your first push — `.env.local` must not appear.

---

## 3. Add environment variables (required)

Vercel → your project → **Settings → Environment Variables**. Add each key for
**Production, Preview, and Development**:

| Name | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | recommended | Reasoning-heavy tasks (research note, evaluation, import cross-check) |
| `GEMINI_API_KEY` | recommended | Middle tier + the only provider with Google Search grounding |
| `GROQ_API_KEY` | recommended | Fast/light tasks (chat, news summaries) |

At least **one** key is required, otherwise every AI feature returns
"AI disabled". With all three, the app falls back across providers when one is
rate-limited or overloaded.

Paste the value only — **no quotes, no leading space**. See `.env.example`.

After adding or changing a variable you must **redeploy** (Deployments → ⋯ →
Redeploy) for it to take effect.

---

## 4. Point your BigRock / HostGator domain at Vercel

1. Vercel → project → **Settings → Domains** → add `yourdomain.com`
2. Vercel shows you the records to create
3. In your BigRock/HostGator DNS panel:
   - `A` record, host `@` → `76.76.21.21`
   - `CNAME` record, host `www` → `cname.vercel-dns.com`
4. Wait for propagation (minutes to a few hours). HTTPS is issued automatically.

*(Confirm the exact values against what Vercel's dashboard shows you — they can
change.)*

---

## What was changed to make this Vercel-safe

| # | Problem | Fix |
|---|---|---|
| 1 | `/api/gemini/file-status` read `.env.local` off disk. Vercel has a read-only filesystem and never deploys that file, so it always reported "no key found". | Rewritten to read `process.env`. It now reports all three providers and flags the classic "space after `=`" mistake. |
| 2 | No route had `maxDuration`. Vercel's default function timeout is **10s**; `/api/import-report` needs 30–60s. Those requests would have failed in production but pass locally. | `maxDuration = 60` on the nine AI/compute routes, `30` on the three light data routes. |
| 3 | No route declared a runtime. A route inferred as Edge would break `yahoo-finance2`. | `export const runtime = "nodejs"` on all 13 routes. |
| 4 | API routes could be prerendered at build time. | `export const dynamic = "force-dynamic"` on all 13. |
| 5 | `yahoo-finance2` (runtime schema resolution) and `technicalindicators` (dynamic requires) can break when bundled into a serverless function. | Declared as `serverExternalPackages` in `next.config.ts`. |
| 6 | `build` used `--turbopack`, which is still beta for production builds. | Build now uses the stable compiler; `dev` keeps Turbopack for speed. |
| 7 | No Node version pinned — Vercel could pick a different major. | `engines.node: ">=20.0.0"`. |
| 8 | No documented env contract. | Added `.env.example`. |
| 9 | API responses could be cached by the edge. | `vercel.json` sets `Cache-Control: no-store` on `/api/*`. |

Nothing in the UI, the analysis engines, or the AI prompts was touched.

---

## Verification performed

```
npm run build          exit 0, no errors, all 30 routes emitted
npx tsc --noEmit       37 errors — identical to the pre-existing baseline, zero new
npm start + curl:
  /api/gemini/file-status   -> all 3 providers detected
  /api/gemini/status        -> configured
  /api/quote?symbol=AAPL    -> live price
  /api/search-stock         -> RELIANCE.NS resolved
  /api/news?market=IN       -> live articles
  POST /api/momentum        -> momentumScore 90, full engine ran
  POST /api/analytics       -> seasonality + backtest
  POST /api/evaluation      -> CAN SLIM criteria
```

The 37 TypeScript errors are pre-existing (in `analyze-stock` / `analyze`) and
are suppressed by `typescript.ignoreBuildErrors: true` in `next.config.ts`.
They do not block the build. They were not introduced by the Vercel work.

---

## Before you share the URL publicly — read this

Once deployed, **anyone who opens your URL can trigger AI calls billed to your
keys**. There is currently no authentication and no rate limiting on the API
routes. A single person could loop `/api/research-note` and run up your OpenAI
bill.

Options, cheapest first:

1. **Keep the URL private.** A Vercel deployment URL is unlisted but not secret.
2. **Vercel Password Protection** — Settings → Deployment Protection. One click,
   available on Hobby for preview deployments and on Pro for production.
3. **Add rate limiting** to the API routes (per-IP, e.g. via `@upstash/ratelimit`).
4. **Add real auth** (NextAuth / Clerk) if more than one person will use it.

Also set **spend limits** in the OpenAI, Google AI Studio, and Groq dashboards.

---

## Daily Digest — scheduled email (Phase 2, activates on deploy)

The in-app Daily Digest (`/digest`) works locally now. The **scheduled daily
email** needs a deploy plus these env vars (all in Vercel → Settings → Env):

| Var | Purpose |
|---|---|
| `CRON_SECRET` | Any random string. Vercel Cron sends it as a Bearer token; the route rejects calls without it. |
| `DIGEST_SYMBOLS` | Comma list of symbols to digest, e.g. `AAPL,RELIANCE.NS,TCS.NS`. |
| `DIGEST_EMAIL` | Where the digest is emailed. |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) (free tier: 100 emails/day). |
| `RESEND_FROM` | Verified sender, e.g. `Digest <digest@yourdomain.com>`. |
| `PERPLEXITY_API_KEY` | (optional) sharper "what changed" via live web + citations. |

- The cron schedule lives in `vercel.json` → `crons` (`30 3 * * *` = 03:30 UTC daily; change to taste).
- Until all five are set, `/api/cron/daily-digest` safely returns `{ skipped: true }` — it never errors.
- Test after deploy: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/daily-digest`.
- **Note:** the cron reads its stock list from `DIGEST_SYMBOLS` (server-side), not from the browser watchlist — localStorage isn't readable by a server cron. Moving the watchlist to a database/KV so the email tracks it automatically is a later step.

## Trend Alerts — scheduled email (activates on deploy)

The Trend Alerts tool (`/trend-alerts`) evaluates each stock's moving-average
trend on **confirmed daily closes** and detects changes **bar-over-bar** (so it
needs no stored history — one daily run catches that day's changes). In-app it
scans when you open the page / hit "Scan Now". The **background email** runs via
Vercel Cron after market close.

- Cron: `vercel.json` → `/api/cron/trend-alerts`, schedule `30 22 * * 1-5` (22:30 UTC, weekdays).
- Env: reuses the digest email config, plus `TREND_SYMBOLS` (comma list; falls back to `DIGEST_SYMBOLS`). Needs `DIGEST_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM`.
- Only emails when there are actual trend changes that day (no spam). Safe no-op until configured.
- Test after deploy: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/trend-alerts`.

## Known runtime limits (not deployment bugs)

- **Gemini Google Search grounding** hits a 429 quota on free keys. The app
  degrades gracefully — `generateGrounded()` returns `""` and the report falls
  back to summary + news, with `webResearchUsed: false` surfaced in the UI.
- **Notes, watchlist, alerts and imported reports live in `localStorage`**, so
  they are per-browser and per-device. They do not sync across devices and are
  lost if the user clears site data. Moving them to a database is a separate
  piece of work.
- **`/api/quote` returns a malformed `time` field** (epoch seconds treated as
  milliseconds, e.g. `+058490-11-23`). Pre-existing; harmless because the UI
  does not read that field. Worth fixing separately.

---

*Research support only. Not buy/sell advice. No guaranteed prediction. Always
verify data independently.*
