// ============================================================================
//  The optimiser (§9).
//
//    E = P(Tendenz) × Quote
//      + P(exaktes Ergebnis) × 2
//      + P(gleiche Tordifferenz, nicht exakt, nur bei Sieg) × 1
//
//  This is the verified best-of schema: the bonus is +2 for the exact result OR
//  +1 for the correct goal difference, never both, added on top of the quota.
//  Draws carry NO goal-difference tier — that asymmetry flips real cases.
//
//  `Quote` is the payout, taken as given. Selectable tips remain the 0–6 grid;
//  the bonus terms are summed over the FULL matrix and are never renormalised
//  onto 0–6.
// ============================================================================

import { scorelineIndex } from "../../../packages/engine/src/model.mjs";
import { tendencyOf, EXACT_BONUS, GOAL_DIFFERENCE_BONUS } from "./scoring.mjs";

/** Tips the user may actually enter. */
export const SELECTABLE_GOALS = 6;

/**
 * Expected points for one candidate tip.
 *
 * The two bonus sums run over the WHOLE matrix — a 7:0 that the user cannot
 * select still contributes to the goal-difference bonus of a 2:0 tip, and
 * dropping it would understate the tip.
 */
export function expectedPoints(tip, matrix, maxGoals, quotas) {
  const tipTendency = tendencyOf(tip.home, tip.away);
  const quota = quotas[tipTendency];

  let pTendency = 0;
  let pExact = 0;
  let pGoalDiff = 0;
  const tipDiff = tip.home - tip.away;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = matrix.pmf[scorelineIndex(h, a, maxGoals)];
      if (p === 0) continue;
      if (tendencyOf(h, a) !== tipTendency) continue;
      pTendency += p;
      if (h === tip.home && a === tip.away) pExact += p;
      // Best-of: the goal-difference tier is only reachable when the result is
      // NOT exact, and only for a decisive tip.
      else if (tipTendency !== "draw" && h - a === tipDiff) pGoalDiff += p;
    }
  }

  return {
    expected: pTendency * quota + pExact * EXACT_BONUS + pGoalDiff * GOAL_DIFFERENCE_BONUS,
    pTendency,
    pExact,
    pGoalDiff,
    quota,
    tendency: tipTendency,
  };
}

/** The tip with the highest expected points, over the selectable grid. */
export function bestTip(matrix, maxGoals, quotas) {
  let best = null;
  for (let h = 0; h <= SELECTABLE_GOALS; h++) {
    for (let a = 0; a <= SELECTABLE_GOALS; a++) {
      const e = expectedPoints({ home: h, away: a }, matrix, maxGoals, quotas);
      if (!best || e.expected > best.expected) best = { home: h, away: a, ...e };
    }
  }
  return best;
}

/** The market favourite's tendency — the one with the highest P(Tendenz). */
export function favouriteTendency(market) {
  let best = "homeWin";
  for (const t of ["draw", "awayWin"]) if (market[t] > market[best]) best = t;
  return best;
}

/**
 * THE HIT-RATE COMPARISON — conditional, not categorical, and mathematically
 * honest (§9).
 *
 * The market favourite is BY DEFINITION the tendency with the highest
 * P(Tendenz), so per match
 *
 *     P(optimierte Tendenz) ≤ P(Favoriten-Tendenz)
 *
 * under the same probability measure, with equality exactly when the optimised
 * tip IS the favourite (or the probabilities tie). Summed over a matchday, the
 * optimised tips therefore have the SAME expected tendency hit rate as the
 * favourite tips when they coincide, and a STRICTLY LOWER one otherwise —
 * never a higher one. Only REALISED hit rates can go either way, by luck.
 *
 * The expected POINTS can still be higher — that is the entire purpose.
 *
 * So the warning appears EXACTLY when the optimised expected hit rate is
 * strictly lower — equivalently, when at least one optimised tip uses a tendency
 * with strictly lower market probability than that match's favourite tendency.
 * Tips that differ only in SCORELINE within the same tendency (1:0 vs 2:0), or
 * that pick an equally probable tendency, change nothing and trigger NO warning.
 */
export function hitRateComparison(fixtures) {
  let optimised = 0;
  let favourite = 0;
  const differing = [];

  for (const f of fixtures) {
    const fav = favouriteTendency(f.market);
    optimised += f.market[f.tip.tendency];
    favourite += f.market[fav];
    if (f.market[f.tip.tendency] < f.market[fav]) {
      differing.push({ fixtureId: f.id, chosen: f.tip.tendency, favourite: fav });
    }
  }

  const n = fixtures.length || 1;
  return {
    optimisedExpected: optimised / n,
    favouriteExpected: favourite / n,
    // Strictly lower — the only condition under which the warning is honest.
    warn: differing.length > 0,
    differing,
    matches: fixtures.length,
  };
}

/** Optimise a whole matchday. */
export function optimiseMatchday(fixtures) {
  const rows = fixtures.map((f) => {
    const tip = bestTip(f.matrix, f.maxGoals, f.quotas);
    const fav = favouriteTendency(f.market);
    const favTip = bestTipWithinTendency(f.matrix, f.maxGoals, f.quotas, fav);
    return { ...f, tip, favouriteTip: favTip, favouriteTendency: fav };
  });
  return {
    rows,
    hitRate: hitRateComparison(rows.map((r) => ({ id: r.id, market: r.market, tip: r.tip }))),
    expectedPointsTotal: rows.reduce((a, r) => a + r.tip.expected, 0),
    favouritePointsTotal: rows.reduce((a, r) => a + r.favouriteTip.expected, 0),
  };
}

/** The best tip that stays inside a given tendency — the favourite-tip baseline. */
export function bestTipWithinTendency(matrix, maxGoals, quotas, tendency) {
  let best = null;
  for (let h = 0; h <= SELECTABLE_GOALS; h++) {
    for (let a = 0; a <= SELECTABLE_GOALS; a++) {
      if (tendencyOf(h, a) !== tendency) continue;
      const e = expectedPoints({ home: h, away: a }, matrix, maxGoals, quotas);
      if (!best || e.expected > best.expected) best = { home: h, away: a, ...e };
    }
  }
  return best;
}
