// ============================================================================
//  Market probabilities and the scoreline matrix (§9).
//
//  TWO DECISIONS, both fixed for reproducibility:
//
//  1. P(Tendenz) comes from the bookmaker odds with the overround removed by
//     SIMPLE NORMALISATION:  pᵢ = (1/quoteᵢ) / Σⱼ (1/quoteⱼ)
//     Other schemes (Shin, power) are NOT used. Missing, non-positive or
//     unparseable odds trigger the model fallback.
//
//  2. Scoreline shape is REGION REWEIGHTING, not λ-fitting. Fitting λ to the
//     market's H/D/A introduces an identification problem that does not need to
//     exist, and leaves the objective, tolerance and failure mode undefined.
//     Instead: take the model's matrix at its OWN λ, split it into the three
//     outcome regions, renormalise each region to sum to 1, and weight the
//     regions by the market's P(H), P(D), P(A):
//
//        P(h,a) = P_markt(Region von (h,a)) · M_Region(h,a)
//
//     The market margins are then exact BY CONSTRUCTION — no optimiser, no
//     tolerance, no failure mode. The model supplies only the shape within an
//     outcome, which is exactly what it is good for.
// ============================================================================

import { buildScorelineDistribution, scorelineIndex, eloToLambdas } from "../../../packages/engine/src/model.mjs";

export class OddsError extends Error {}

/**
 * Bookmaker odds → probabilities, overround removed by simple normalisation.
 * Throws rather than guessing, so the caller can fall back to the model.
 */
export function impliedProbabilities({ home, draw, away }) {
  const odds = { homeWin: home, draw, awayWin: away };
  const inv = {};
  let total = 0;
  for (const [key, value] of Object.entries(odds)) {
    const q = Number(value);
    if (!Number.isFinite(q) || q <= 1) {
      throw new OddsError(`odds for ${key} are missing or implausible: ${JSON.stringify(value)}`);
    }
    inv[key] = 1 / q;
    total += inv[key];
  }
  if (!(total > 0)) throw new OddsError("odds sum to zero");
  return {
    homeWin: inv.homeWin / total,
    draw: inv.draw / total,
    awayWin: inv.awayWin / total,
    overround: total - 1,
  };
}

const regionOf = (h, a) => (h > a ? "homeWin" : h < a ? "awayWin" : "draw");

/** The model's own region masses over a grid of `maxGoals`. */
function regionMasses(dist, maxGoals) {
  const out = { homeWin: 0, draw: 0, awayWin: 0 };
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      out[regionOf(h, a)] += dist.pmf[scorelineIndex(h, a, maxGoals)];
    }
  }
  return out;
}

/**
 * The grid a reweighted matrix must reach.
 *
 * ONE RULE, EVALUATED AFTER REWEIGHTING. The bound must account for the
 * reweighting factors f_r = P_markt(r) / P_Modell(r), since reweighting can
 * heavily upweight a rare region.
 *
 * `P_Modell(r)` is the region's FULL model probability, NOT the truncated matrix
 * sum — otherwise the factors are computed on a moving basis and are wrong. The
 * "full" reference is taken at a deliberately generous grid where the remaining
 * Poisson tail is negligible.
 *
 * Extend until  Σ_r f_r · omittedMass_r < 1e-4  — the WEIGHTED sum, not the
 * conservative `omittedMass × max_r f_r`.
 *
 * There is NO hard cap. Practical guard: if this needs more than 20 goals per
 * side, the market is pathological relative to the model — the caller logs the
 * fixture, falls back to the model's own probabilities and surfaces a note.
 */
export const OMITTED_MASS_LIMIT = 1e-4;
export const PATHOLOGICAL_GOALS = 20;
const FULL_REFERENCE_GOALS = 60;

export function requiredGrid(lamH, lamA, params, market) {
  // The reference distribution. Everything below is measured against THIS, on
  // one fixed scale — that is what "the region's full model probability, not the
  // truncated matrix sum" means, and why the factors do not move as the grid
  // grows.
  const full = buildScorelineDistribution(lamH, lamA, { ...params, MAX_GOALS: FULL_REFERENCE_GOALS });
  const fullRegions = regionMasses(full, FULL_REFERENCE_GOALS);

  const factors = {};
  for (const r of ["homeWin", "draw", "awayWin"]) {
    factors[r] = fullRegions[r] > 0 ? market[r] / fullRegions[r] : 0;
  }

  // Region mass the n×n subgrid of the reference distribution covers.
  const coveredByGrid = (n) => {
    const out = { homeWin: 0, draw: 0, awayWin: 0 };
    for (let h = 0; h <= n; h++) {
      for (let a = 0; a <= n; a++) {
        out[regionOf(h, a)] += full.pmf[scorelineIndex(h, a, FULL_REFERENCE_GOALS)];
      }
    }
    return out;
  };

  for (let n = 6; n <= PATHOLOGICAL_GOALS; n++) {
    const covered = coveredByGrid(n);
    let weighted = 0;
    for (const r of ["homeWin", "draw", "awayWin"]) {
      weighted += factors[r] * Math.max(0, fullRegions[r] - covered[r]);
    }
    if (weighted < OMITTED_MASS_LIMIT) return { maxGoals: n, omitted: weighted, pathological: false, factors };
  }
  return { maxGoals: PATHOLOGICAL_GOALS, omitted: null, pathological: true, factors };
}

/**
 * The reweighted scoreline matrix for one fixture.
 *
 * Returns the matrix on a grid large enough that the §9 bound holds, plus the
 * fallback flag when the market is pathological relative to the model.
 */
export function buildMarketMatrix({ eloHome, eloAway, params, odds }) {
  const { lamH, lamA } = eloToLambdas(eloHome, eloAway, params);

  let market;
  let source = "market";
  let note = null;
  try {
    market = impliedProbabilities(odds);
  } catch (e) {
    // Missing, non-positive or unparseable odds trigger the model fallback.
    const modelDist = buildScorelineDistribution(lamH, lamA, params);
    market = regionMasses(modelDist, params.MAX_GOALS);
    source = "model";
    note = `Buchmacherquoten unbrauchbar (${e.message}) — es gilt die Modellwahrscheinlichkeit.`;
  }

  const grid = requiredGrid(lamH, lamA, params, market);
  if (grid.pathological) {
    // The market is pathological relative to the model: fall back to the
    // model's own probabilities for this fixture and say so visibly.
    const modelDist = buildScorelineDistribution(lamH, lamA, params);
    return {
      matrix: modelDist,
      maxGoals: params.MAX_GOALS,
      market: regionMasses(modelDist, params.MAX_GOALS),
      source: "model",
      note: "Der Markt weicht so stark vom Modell ab, dass die Umgewichtung mehr als 20 Tore "
        + "je Seite bräuchte. Für dieses Spiel gelten die Modellwahrscheinlichkeiten.",
      pathological: true,
    };
  }

  const n = grid.maxGoals;
  const base = buildScorelineDistribution(lamH, lamA, { ...params, MAX_GOALS: n });
  const regions = regionMasses(base, n);

  const size = (n + 1) * (n + 1);
  const pmf = new Float64Array(size);
  for (let h = 0; h <= n; h++) {
    for (let a = 0; a <= n; a++) {
      const r = regionOf(h, a);
      const i = scorelineIndex(h, a, n);
      // Renormalise the region to 1, then weight it by the market's margin.
      pmf[i] = regions[r] > 0 ? (base.pmf[i] / regions[r]) * market[r] : 0;
    }
  }

  return {
    matrix: { pmf, maxGoals: n },
    maxGoals: n,
    market,
    source,
    note,
    pathological: false,
    omitted: grid.omitted,
  };
}

/** Region masses of a built matrix — used by tests to assert exactness. */
export function marginsOf(matrix, maxGoals) {
  const out = { homeWin: 0, draw: 0, awayWin: 0 };
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) out[regionOf(h, a)] += matrix.pmf[scorelineIndex(h, a, maxGoals)];
  }
  return out;
}
