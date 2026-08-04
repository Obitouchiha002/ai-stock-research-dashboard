import { NextRequest, NextResponse } from "next/server";

// Multi-device sync store. A "sync code" is the only key: whoever knows the
// code reads/writes that bundle. No accounts, no passwords — deliberately
// simple. All data still lives in the browser; this is just a shared backup
// the user's other devices can pull from.
//
// Backed by Upstash Redis over its REST API (works on Vercel's Node runtime).
// Accepts either the Vercel-KV env names or Upstash's own.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const STORE_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const STORE_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const configured = () => Boolean(STORE_URL && STORE_TOKEN);

// A sync code links devices, so treat it like a shared secret: only unambiguous
// characters, bounded length, upper-cased so "abc" and "ABC" are the same code.
function normCode(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

const keyFor = (code: string) => `sync:${code}`;

// One-command Upstash REST call: POST a JSON array ["SET", key, val, ...].
async function redis(command: (string | number)[]): Promise<any> {
  const res = await fetch(STORE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STORE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store responded ${res.status}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const code = normCode(body.code);

    if (!configured()) {
      return NextResponse.json(
        {
          error:
            "Cloud sync is not set up on the server yet. Add an Upstash Redis (KV) store and its env vars.",
          notConfigured: true,
        },
        { status: 503 },
      );
    }
    if (code.length < 6) {
      return NextResponse.json(
        { error: "Sync code must be at least 6 characters." },
        { status: 400 },
      );
    }

    if (action === "pull") {
      const r = await redis(["GET", keyFor(code)]);
      const raw = r?.result;
      if (!raw) return NextResponse.json({ found: false, bundle: null, updatedAt: 0 });
      let parsed: any = null;
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        parsed = null;
      }
      return NextResponse.json({
        found: Boolean(parsed),
        bundle: parsed?.bundle ?? null,
        updatedAt: Number(parsed?.updatedAt) || 0,
      });
    }

    if (action === "push") {
      const bundle = body.bundle ?? {};
      const updatedAt = Number(body.updatedAt) || Date.now();
      const payload = JSON.stringify({ bundle, updatedAt });
      // Guard the store's per-record size limit.
      if (payload.length > 1_000_000) {
        return NextResponse.json(
          { error: "This data set is too large to sync." },
          { status: 413 },
        );
      }
      // Expire untouched bundles after 90 days so abandoned codes clean up.
      await redis(["SET", keyFor(code), payload, "EX", String(90 * 24 * 60 * 60)]);
      return NextResponse.json({ ok: true, updatedAt });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
