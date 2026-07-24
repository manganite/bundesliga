// ============================================================================
//  Outcome and performance colour helpers (§FARBEN_UNTERTITEL §2.1 / §2.2).
//
//  Only var() references to the tokens in index.css — no component carries its
//  own hex. Colour is an accent beside the text, never the sole signal.
// ============================================================================

/** Which OUTCOME a tendency is — green / amber / red. Never good/bad. */
export const OUTCOME_TOKEN = {
  homeWin: "--outcome-home",
  draw: "--outcome-draw",
  awayWin: "--outcome-away",
};

export const outcomeColor = (tendency) => (OUTCOME_TOKEN[tendency] ? `var(${OUTCOME_TOKEN[tendency]})` : null);

/**
 * The performance colour for a signed value, ONLY where „more = better" holds
 * objectively (performance vs. expectation). Positive green, negative red, zero
 * neutral. Deliberately NOT for scenario deltas or fixture impact — a „+" on
 * Abstieg is bad, so a sign valence would mislead there.
 */
export const perfColor = (value) => {
  if (value == null || value === 0) return undefined;
  return value > 0 ? "var(--perf-pos)" : "var(--perf-neg)";
};
