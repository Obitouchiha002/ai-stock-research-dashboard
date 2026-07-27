import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

async function handleRequest(req: NextRequest) {
  let queryStr = null;
  const { searchParams } = new URL(req.url);

  let body: any = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch (e) {}
  }

  queryStr =
    searchParams.get("query") ||
    searchParams.get("q") ||
    searchParams.get("symbol") ||
    body.query ||
    body.q ||
    body.symbol;

  queryStr = queryStr && typeof queryStr === "string" ? queryStr.trim() : null;

  if (!queryStr) {
    return NextResponse.json(
      {
        success: false,
        error: "Search query is required",
        hint: "Pass query, q, or symbol parameter.",
        received: {
          query: searchParams.get("query") || body.query || null,
          q: searchParams.get("q") || body.q || null,
          symbol: searchParams.get("symbol") || body.symbol || null,
        },
      },
      { status: 400 },
    );
  }

  console.log(
    `[StockSearch] query=${queryStr} endpoint=/api/search-stock start`,
  );

  try {
    const results: any = await yahooFinance.search(queryStr);
    const matches = results.quotes
      .filter((q: Record<string, unknown>) => q.isYahooFinance)
      .map((q: Record<string, unknown>) => ({
        name: q.shortname || q.longname || q.symbol,
        symbol: q.symbol,
        exchange: q.exchange,
        type: q.quoteType,
      }))
      .slice(0, 10);

    console.log(`[StockSearch] query=${queryStr} status=200`);
    return NextResponse.json({ success: true, matches });
  } catch (error) {
    console.error("Search API Error:", error);
    console.log(
      `[StockSearch] query=${queryStr} status=500 error=search-failed`,
    );
    return NextResponse.json(
      { error: "Failed to search stock" },
      { status: 500 },
    );
  }
}

// Vercel: yahoo-finance2 + AI SDKs need the Node runtime (not Edge).
// force-dynamic prevents build-time prerendering of this handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
