// ============================================================================
//  The Kicktipp points schema (§9). VERIFIED — best-of, maximum 11.
//
//  Checked against the official Kicktipp rules („Punkteregel: 3 – 11 Punkte"
//  and the linked Quoten-Punkteregel explanation, retrieved 2026-07-23) and
//  confirmed by the user's own pool experience (maximum observed: 11).
//
//  Two parts:
//
//   1. The TENDENCY pays the quota, 3–9 points, derived from the POOL's tipping
//      behaviour:
//
//        Punkte = MAX / (10 × T/N) − MAX/10 + MIN,  MIN = 3, MAX = 9
//
//      with N = tips submitted and T = tips on that tendency, rounded and
//      clamped to [MIN, MAX].
//
//   2. The BONUS TIERS ARE BEST-OF, NOT STACKING:
//        win  — goal difference +1  OR  exact result +2
//        draw — exact result +2, and NO goal-difference tier (the official
//               table shows „–")
//
//      The arithmetic is conclusive: max 11 = 9 + 2. Stacking (+1 and +2) would
//      allow 12, contradicting the official header. There is ONE formula and no
//      configuration switch — the hypothetical stacking variant is deleted.
// ============================================================================

export const MIN_QUOTA_POINTS = 3;
export const MAX_QUOTA_POINTS = 9;
export const MAX_TOTAL_POINTS = 11;

export const EXACT_BONUS = 2;
export const GOAL_DIFFERENCE_BONUS = 1;

/**
 * The quota a tendency pays, from the pool's tipping behaviour.
 *
 * @param {number} tipsOnTendency  T
 * @param {number} tipsTotal       N
 */
export function quotaFromPool(tipsOnTendency, tipsTotal) {
  if (!(tipsTotal > 0)) throw new Error("tipsTotal must be positive");
  if (!(tipsOnTendency > 0)) return MAX_QUOTA_POINTS; // nobody picked it — the cap
  const share = tipsOnTendency / tipsTotal;
  const raw = MAX_QUOTA_POINTS / (10 * share) - MAX_QUOTA_POINTS / 10 + MIN_QUOTA_POINTS;
  return Math.min(MAX_QUOTA_POINTS, Math.max(MIN_QUOTA_POINTS, Math.round(raw)));
}

export const tendencyOf = (h, a) => (h > a ? "homeWin" : h < a ? "awayWin" : "draw");

/**
 * Points a tip scores against an actual result.
 *
 * `quota` is the tendency payout, taken as given (§9): the quota is recalculated
 * after every tip submission — including one's own, which raises T for the
 * chosen tendency — so the value at paste time can differ from the value at
 * scoring time. Inverting the rounded, clamped formula is not reliable, so the
 * snapshot is used as-is and the UI says so.
 */
export function scoreTip(tip, actual, quota) {
  const tipTendency = tendencyOf(tip.home, tip.away);
  if (tipTendency !== tendencyOf(actual.home, actual.away)) return 0;

  const exact = tip.home === actual.home && tip.away === actual.away;
  if (exact) return quota + EXACT_BONUS;

  // The goal-difference tier exists ONLY for a decisive tip. A draw tip that is
  // not exact scores the quota alone — the official table shows „–" there, and
  // this asymmetry flips real cases.
  if (tipTendency !== "draw" && tip.home - tip.away === actual.home - actual.away) {
    return quota + GOAL_DIFFERENCE_BONUS;
  }
  return quota;
}

/**
 * The bonus a tip can earn against one scoreline — exactly one tier, never both.
 * Exposed so the "no scoreline earns both bonuses" test can assert it directly.
 */
export function bonusFor(tip, outcome) {
  const tipTendency = tendencyOf(tip.home, tip.away);
  if (tipTendency !== tendencyOf(outcome.home, outcome.away)) return 0;
  if (tip.home === outcome.home && tip.away === outcome.away) return EXACT_BONUS;
  if (tipTendency !== "draw" && tip.home - tip.away === outcome.home - outcome.away) {
    return GOAL_DIFFERENCE_BONUS;
  }
  return 0;
}
