export function normalizeSymbol(input: string, market: string = "US") {
  if (!input) return null;
  const original = input.trim();
  const upper = original.toUpperCase();

  let baseSymbol = upper;
  if (baseSymbol.includes(".")) {
    baseSymbol = baseSymbol.split(".")[0];
  }

  // Handle common name searches
  if (baseSymbol === "TATA MOTORS" || baseSymbol === "TATA MOTORS LTD") {
    baseSymbol = "TATAMOTORS";
  }

  let candidates = [upper];

  let isLikelyExactSymbol =
    upper === original && (upper.includes(".") || upper.length <= 5);

  if (market === "NSE") {
    if (!upper.endsWith(".NS")) {
      candidates.unshift(`${baseSymbol}.NS`);
    } else {
      isLikelyExactSymbol = true;
    }
  } else if (market === "BSE") {
    if (!upper.endsWith(".BO")) {
      candidates.unshift(`${baseSymbol}.BO`);
    } else {
      isLikelyExactSymbol = true;
    }
  }

  // Ensure base symbol is also tested
  if (!candidates.includes(baseSymbol) && baseSymbol !== upper) {
    candidates.push(baseSymbol);
  }

  // Suggestions for known migrations/demergers
  let suggestions: Array<{ symbol: string; name: string }> = [];
  if (baseSymbol === "TATAMOTORS") {
    suggestions = [
      { symbol: "TMCV.NS", name: "Tata Motors Commercial Vehicles" },
      { symbol: "TMPV.NS", name: "Tata Motors Passenger Vehicles" },
    ];
  }

  return {
    input: original,
    normalizedQuery: candidates[0],
    baseSymbol,
    market,
    possibleSymbols: candidates,
    isLikelyExactSymbol,
    suggestions,
  };
}
