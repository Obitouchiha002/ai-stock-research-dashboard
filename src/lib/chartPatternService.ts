/**
 * Classical chart-pattern detection — Double Top/Bottom, Head & Shoulders,
 * Triple Top/Bottom, triangles, wedges and rectangles.
 *
 * These are multi-week SHAPES built from swing pivots, which is what separates
 * them from the 1-5 bar candlestick patterns in patternService.ts.
 *
 * Everything below is measured off the real OHLC series. The "measured move" is
 * the textbook mechanical projection of the pattern's own height — it is a
 * derived reference level, NOT a forecast, and is labelled that way everywhere.
 *
 * Research support only. Not buy/sell advice. No guaranteed prediction.
 */

export type PatternBias = "Bullish" | "Bearish" | "Neutral";
export type PatternStatus = "Confirmed" | "Forming";

export type Pivot = { i: number; date: string; price: number; kind: "H" | "L" };

export type ChartPattern = {
  name: string;
  bias: PatternBias;
  status: PatternStatus;
  /** Detection quality 0-100 — how cleanly the shape matches the textbook form. */
  quality: number;
  from: string;
  to: string;
  bars: number;
  /** The line a breakout must clear (neckline / support / resistance). */
  breakLevel: number;
  breakLabel: string;
  /** Textbook measured move off the pattern height. Reference only. */
  target: number | null;
  /** Bar on which the break happened, if it has. */
  brokeOn: string | null;
  /** What actually happened in the 10 bars after the break — null if too recent. */
  after10dPct: number | null;
  points: Pivot[];
  meaning: string;
};

// --------------------------------------------------------------- pivots -----

/** A bar is a swing high/low when it is the extreme of the +/-k bars around it. */
export function findPivots(rows: any[], k = 5): Pivot[] {
  const highs = rows.map((r) => Number(r.high));
  const lows = rows.map((r) => Number(r.low));
  const dates = rows.map((r) =>
    (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().split("T")[0],
  );
  const out: Pivot[] = [];
  for (let i = k; i < rows.length - k; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isH = false;
      if (lows[j] <= lows[i]) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) out.push({ i, date: dates[i], price: highs[i], kind: "H" });
    else if (isL) out.push({ i, date: dates[i], price: lows[i], kind: "L" });
  }

  // Collapse runs of the same kind into the single most extreme pivot, so the
  // sequence strictly alternates H, L, H, L …
  const zig: Pivot[] = [];
  for (const p of out) {
    const last = zig[zig.length - 1];
    if (!last || last.kind !== p.kind) {
      zig.push(p);
      continue;
    }
    if ((p.kind === "H" && p.price > last.price) || (p.kind === "L" && p.price < last.price)) {
      zig[zig.length - 1] = p;
    }
  }
  return zig;
}

// --------------------------------------------------------------- helpers ----

const near = (a: number, b: number, tol: number) => Math.abs(a - b) / ((a + b) / 2) <= tol;

/** How close two levels are, as a 0-100 quality score (0% apart => 100). */
const closeness = (a: number, b: number, tol: number) =>
  Math.max(0, Math.min(100, Math.round((1 - Math.abs(a - b) / ((a + b) / 2) / tol) * 100)));

/** Value on the line through two pivots, extended to bar x. */
function lineAt(p1: Pivot, p2: Pivot, x: number): number {
  if (p2.i === p1.i) return p1.price;
  const slope = (p2.price - p1.price) / (p2.i - p1.i);
  return p1.price + slope * (x - p1.i);
}

/** Least-squares slope of pivot prices against bar index, as % of price per bar. */
function slopePct(pts: Pivot[]): number {
  if (pts.length < 2) return 0;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.i, 0) / n;
  const my = pts.reduce((a, p) => a + p.price, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.i - mx) * (p.price - my);
    den += (p.i - mx) ** 2;
  }
  if (!den) return 0;
  return ((num / den) / my) * 100;
}

/**
 * First bar after `fromIdx` whose CLOSE breaks the level in `dir`.
 * Close-based so an intraday poke through the neckline is not a breakout.
 */
function breakoutAfter(
  rows: any[],
  fromIdx: number,
  level: number,
  dir: "up" | "down",
): { idx: number; date: string } | null {
  for (let i = fromIdx + 1; i < rows.length; i++) {
    const c = Number(rows[i].close);
    if ((dir === "up" && c > level) || (dir === "down" && c < level)) {
      const d = rows[i].date instanceof Date ? rows[i].date : new Date(rows[i].date);
      return { idx: i, date: d.toISOString().split("T")[0] };
    }
  }
  return null;
}

function after10(rows: any[], idx: number): number | null {
  if (idx + 10 >= rows.length) return null;
  const a = Number(rows[idx].close);
  const b = Number(rows[idx + 10].close);
  return ((b - a) / a) * 100;
}

/** A reversal pattern is only meaningful after a move in the opposite direction. */
function priorTrend(rows: any[], atIdx: number, lookback = 30): "up" | "down" | "flat" {
  const from = Math.max(0, atIdx - lookback);
  if (from === atIdx) return "flat";
  const a = Number(rows[from].close);
  const b = Number(rows[atIdx].close);
  const pct = ((b - a) / a) * 100;
  if (pct > 5) return "up";
  if (pct < -5) return "down";
  return "flat";
}

// ------------------------------------------------------------- detectors ----

const TOL = 0.035; // 3.5% — "roughly equal" for tops/bottoms
const TOL_WIDE = 0.055; // shoulders and necklines get a little more room

function detectDoubleAndTriple(rows: any[], z: Pivot[]): ChartPattern[] {
  const out: ChartPattern[] = [];
  const last = rows.length - 1;

  for (let i = 0; i + 2 < z.length; i++) {
    const [a, b, c] = [z[i], z[i + 1], z[i + 2]];

    // ---- Double Top:  H  L  H  (two peaks at the same level) ----
    if (a.kind === "H" && c.kind === "H" && near(a.price, c.price, TOL)) {
      const neck = b.price;
      const peak = (a.price + c.price) / 2;
      const height = peak - neck;
      // The trough must be a real pullback, and the pattern needs a rise into it.
      if (height / peak >= 0.03 && priorTrend(rows, a.i) === "up") {
        const brk = breakoutAfter(rows, c.i, neck, "down");
        out.push({
          name: "Double Top",
          bias: "Bearish",
          status: brk ? "Confirmed" : "Forming",
          quality: closeness(a.price, c.price, TOL),
          from: a.date, to: brk?.date || z[i + 2].date, bars: (brk?.idx ?? c.i) - a.i,
          breakLevel: neck, breakLabel: "Neckline (support)",
          target: neck - height,
          brokeOn: brk?.date || null,
          after10dPct: brk ? after10(rows, brk.idx) : null,
          points: [a, b, c],
          meaning:
            "Price tested the same high twice and failed both times. Buyers could not push through that level; a close back below the trough between the peaks is what confirms the pattern.",
        });
      }
    }

    // ---- Double Bottom:  L  H  L ----
    if (a.kind === "L" && c.kind === "L" && near(a.price, c.price, TOL)) {
      const neck = b.price;
      const trough = (a.price + c.price) / 2;
      const height = neck - trough;
      if (height / trough >= 0.03 && priorTrend(rows, a.i) === "down") {
        const brk = breakoutAfter(rows, c.i, neck, "up");
        out.push({
          name: "Double Bottom",
          bias: "Bullish",
          status: brk ? "Confirmed" : "Forming",
          quality: closeness(a.price, c.price, TOL),
          from: a.date, to: brk?.date || z[i + 2].date, bars: (brk?.idx ?? c.i) - a.i,
          breakLevel: neck, breakLabel: "Neckline (resistance)",
          target: neck + height,
          brokeOn: brk?.date || null,
          after10dPct: brk ? after10(rows, brk.idx) : null,
          points: [a, b, c],
          meaning:
            "Price found support at the same low twice. Sellers could not break it; a close back above the peak between the two lows is what confirms the pattern.",
        });
      }
    }
  }

  // ---- Triple Top / Bottom: H L H L H  (or the mirror) ----
  for (let i = 0; i + 4 < z.length; i++) {
    const p = z.slice(i, i + 5);
    const [a, b, c, d, e] = p;
    if (a.kind === "H" && near(a.price, c.price, TOL) && near(c.price, e.price, TOL)) {
      const neck = Math.min(b.price, d.price);
      const peak = (a.price + c.price + e.price) / 3;
      const height = peak - neck;
      if (height / peak >= 0.03 && priorTrend(rows, a.i) === "up") {
        const brk = breakoutAfter(rows, e.i, neck, "down");
        out.push({
          name: "Triple Top",
          bias: "Bearish",
          status: brk ? "Confirmed" : "Forming",
          quality: Math.round((closeness(a.price, c.price, TOL) + closeness(c.price, e.price, TOL)) / 2),
          from: a.date, to: brk?.date || e.date, bars: (brk?.idx ?? e.i) - a.i,
          breakLevel: neck, breakLabel: "Neckline (support)",
          target: neck - height,
          brokeOn: brk?.date || null,
          after10dPct: brk ? after10(rows, brk.idx) : null,
          points: p,
          meaning:
            "Three failed attempts at the same resistance. Stronger than a double top because supply has shown up at that level three separate times.",
        });
      }
    }
    if (a.kind === "L" && near(a.price, c.price, TOL) && near(c.price, e.price, TOL)) {
      const neck = Math.max(b.price, d.price);
      const trough = (a.price + c.price + e.price) / 3;
      const height = neck - trough;
      if (height / trough >= 0.03 && priorTrend(rows, a.i) === "down") {
        const brk = breakoutAfter(rows, e.i, neck, "up");
        out.push({
          name: "Triple Bottom",
          bias: "Bullish",
          status: brk ? "Confirmed" : "Forming",
          quality: Math.round((closeness(a.price, c.price, TOL) + closeness(c.price, e.price, TOL)) / 2),
          from: a.date, to: brk?.date || e.date, bars: (brk?.idx ?? e.i) - a.i,
          breakLevel: neck, breakLabel: "Neckline (resistance)",
          target: neck + height,
          brokeOn: brk?.date || null,
          after10dPct: brk ? after10(rows, brk.idx) : null,
          points: p,
          meaning:
            "Three successful defences of the same support. Demand has repeatedly appeared at that level.",
        });
      }
    }
  }

  return out;
}

function detectHeadAndShoulders(rows: any[], z: Pivot[]): ChartPattern[] {
  const out: ChartPattern[] = [];
  const last = rows.length - 1;

  for (let i = 0; i + 4 < z.length; i++) {
    const [ls, t1, head, t2, rs] = z.slice(i, i + 5);

    // ---- Head & Shoulders top:  H L H L H, middle peak highest ----
    if (
      ls.kind === "H" &&
      head.price > ls.price * 1.015 &&
      head.price > rs.price * 1.015 &&
      near(ls.price, rs.price, TOL_WIDE) &&
      near(t1.price, t2.price, TOL_WIDE) &&
      priorTrend(rows, ls.i) === "up"
    ) {
      // Neckline is the line through the two troughs, extended forward.
      const neckNow = lineAt(t1, t2, Math.min(last, rs.i + 20));
      const height = head.price - lineAt(t1, t2, head.i);
      let brk: { idx: number; date: string } | null = null;
      for (let j = rs.i + 1; j < rows.length; j++) {
        if (Number(rows[j].close) < lineAt(t1, t2, j)) {
          const d = rows[j].date instanceof Date ? rows[j].date : new Date(rows[j].date);
          brk = { idx: j, date: d.toISOString().split("T")[0] };
          break;
        }
      }
      out.push({
        name: "Head & Shoulders",
        bias: "Bearish",
        status: brk ? "Confirmed" : "Forming",
        quality: Math.round((closeness(ls.price, rs.price, TOL_WIDE) + closeness(t1.price, t2.price, TOL_WIDE)) / 2),
        from: ls.date, to: brk?.date || rs.date, bars: (brk?.idx ?? rs.i) - ls.i,
        breakLevel: neckNow, breakLabel: "Neckline (sloping support)",
        target: neckNow - height,
        brokeOn: brk?.date || null,
        after10dPct: brk ? after10(rows, brk.idx) : null,
        points: [ls, t1, head, t2, rs],
        meaning:
          "A high peak (the head) flanked by two lower peaks (the shoulders). The rally lost the ability to make a higher high; a close below the neckline drawn under the two troughs is what confirms it.",
      });
    }

    // ---- Inverse Head & Shoulders:  L H L H L, middle trough lowest ----
    if (
      ls.kind === "L" &&
      head.price < ls.price * 0.985 &&
      head.price < rs.price * 0.985 &&
      near(ls.price, rs.price, TOL_WIDE) &&
      near(t1.price, t2.price, TOL_WIDE) &&
      priorTrend(rows, ls.i) === "down"
    ) {
      const neckNow = lineAt(t1, t2, Math.min(last, rs.i + 20));
      const height = lineAt(t1, t2, head.i) - head.price;
      let brk: { idx: number; date: string } | null = null;
      for (let j = rs.i + 1; j < rows.length; j++) {
        if (Number(rows[j].close) > lineAt(t1, t2, j)) {
          const d = rows[j].date instanceof Date ? rows[j].date : new Date(rows[j].date);
          brk = { idx: j, date: d.toISOString().split("T")[0] };
          break;
        }
      }
      out.push({
        name: "Inverse Head & Shoulders",
        bias: "Bullish",
        status: brk ? "Confirmed" : "Forming",
        quality: Math.round((closeness(ls.price, rs.price, TOL_WIDE) + closeness(t1.price, t2.price, TOL_WIDE)) / 2),
        from: ls.date, to: brk?.date || rs.date, bars: (brk?.idx ?? rs.i) - ls.i,
        breakLevel: neckNow, breakLabel: "Neckline (sloping resistance)",
        target: neckNow + height,
        brokeOn: brk?.date || null,
        after10dPct: brk ? after10(rows, brk.idx) : null,
        points: [ls, t1, head, t2, rs],
        meaning:
          "A deep low (the head) flanked by two shallower lows. Selling pressure faded on each successive test; a close above the neckline drawn over the two peaks is what confirms it.",
      });
    }
  }

  return out;
}

/** Triangles, wedges and rectangles — read off the slope of the last highs vs lows. */
function detectTrendlineShapes(rows: any[], z: Pivot[]): ChartPattern[] {
  const recent = z.slice(-7);
  const highs = recent.filter((p) => p.kind === "H");
  const lows = recent.filter((p) => p.kind === "L");
  if (highs.length < 2 || lows.length < 2) return [];

  const sH = slopePct(highs);
  const sL = slopePct(lows);
  const FLAT = 0.06; // % per bar — below this a boundary counts as horizontal
  const last = rows.length - 1;
  const close = Number(rows[last].close);

  const hi = highs[highs.length - 1];
  const hi0 = highs[0];
  const lo = lows[lows.length - 1];
  const lo0 = lows[0];
  const upper = lineAt(hi0, hi, last);
  const lower = lineAt(lo0, lo, last);
  if (!(upper > lower)) return [];

  const start = recent[0];
  const width = Math.max(...highs.map((p) => p.price)) - Math.min(...lows.map((p) => p.price));

  let name = "";
  let bias: PatternBias = "Neutral";
  let meaning = "";
  const flatH = Math.abs(sH) < FLAT;
  const flatL = Math.abs(sL) < FLAT;

  if (flatH && sL > FLAT) {
    name = "Ascending Triangle"; bias = "Bullish";
    meaning = "Flat resistance with rising lows — buyers keep paying up into the same ceiling while sellers give ground.";
  } else if (flatL && sH < -FLAT) {
    name = "Descending Triangle"; bias = "Bearish";
    meaning = "Flat support with falling highs — sellers keep pressing into the same floor while buyers give ground.";
  } else if (sH < -FLAT && sL > FLAT) {
    name = "Symmetrical Triangle"; bias = "Neutral";
    meaning = "Highs falling and lows rising into a squeeze. Direction is undecided — the break decides it.";
  } else if (sH > FLAT && sL > FLAT && sL > sH) {
    name = "Rising Wedge"; bias = "Bearish";
    meaning = "Both boundaries rise, but the lows rise faster — the advance is narrowing and losing thrust.";
  } else if (sH < -FLAT && sL < -FLAT && sH > sL) {
    name = "Falling Wedge"; bias = "Bullish";
    meaning = "Both boundaries fall, but the highs fall faster — the decline is narrowing and losing thrust.";
  } else if (flatH && flatL) {
    name = "Rectangle (Range)"; bias = "Neutral";
    meaning = "Price is bounded by flat support and flat resistance — a balance zone until one side gives.";
  } else {
    return [];
  }

  const bullish = bias === "Bullish";
  const level = bullish ? upper : bias === "Bearish" ? lower : upper;
  const dir: "up" | "down" = bullish ? "up" : bias === "Bearish" ? "down" : "up";
  const brk = breakoutAfter(rows, recent[recent.length - 1].i, level, dir);

  return [
    {
      name,
      bias,
      status: brk ? "Confirmed" : "Forming",
      // Tighter squeeze = cleaner shape.
      quality: Math.max(
        30,
        Math.min(100, Math.round(100 - ((upper - lower) / close) * 100 * 4)),
      ),
      from: start.date,
      to: brk?.date || recent[recent.length - 1].date,
      bars: (brk?.idx ?? recent[recent.length - 1].i) - start.i,
      breakLevel: level,
      breakLabel: dir === "up" ? "Upper boundary (resistance)" : "Lower boundary (support)",
      target: bias === "Neutral" ? null : bullish ? upper + width : lower - width,
      brokeOn: brk?.date || null,
      after10dPct: brk ? after10(rows, brk.idx) : null,
      points: recent,
      meaning,
    },
  ];
}

// ------------------------------------------------------------------ main ----

export function detectChartPatterns(rows: any[], lookbackBars = 260) {
  const slice = rows.length > lookbackBars ? rows.slice(-lookbackBars) : rows;
  if (slice.length < 40) {
    return { ok: false, reason: "Not enough history to trace chart patterns.", patterns: [] as ChartPattern[], pivots: [] as Pivot[] };
  }

  const pivots = findPivots(slice, 5);
  if (pivots.length < 3) {
    return { ok: false, reason: "Price has not made enough swing highs and lows to form a pattern.", patterns: [] as ChartPattern[], pivots };
  }

  const found = [
    ...detectHeadAndShoulders(slice, pivots),
    ...detectDoubleAndTriple(slice, pivots),
    ...detectTrendlineShapes(slice, pivots),
  ];

  // A Head & Shoulders always also matches as a Double Top on its outer peaks —
  // keep the richer shape and drop the overlapping simpler one.
  const ranked = found.sort((a, b) => b.points.length - a.points.length || b.quality - a.quality);
  const kept: ChartPattern[] = [];
  for (const p of ranked) {
    const clash = kept.some(
      (k) => p.from <= k.to && k.from <= p.to && k.bias === p.bias,
    );
    if (!clash) kept.push(p);
  }

  // Newest first.
  kept.sort((a, b) => (a.to < b.to ? 1 : a.to > b.to ? -1 : 0));

  const counts = {
    bullish: kept.filter((p) => p.bias === "Bullish").length,
    bearish: kept.filter((p) => p.bias === "Bearish").length,
    neutral: kept.filter((p) => p.bias === "Neutral").length,
    confirmed: kept.filter((p) => p.status === "Confirmed").length,
    forming: kept.filter((p) => p.status === "Forming").length,
  };

  return {
    ok: true,
    scanned: slice.length,
    pivots,
    counts,
    patterns: kept.slice(0, 8),
  };
}
