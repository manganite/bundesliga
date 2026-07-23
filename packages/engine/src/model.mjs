// ============================================================================
//  The match model — Poisson + Dixon-Coles ("v1"), live per-club ratings, flat
//  fitted HOME_ADV. Settled in brief §2; the mechanisms tested and NOT built
//  are listed there and are deliberately absent here.
//
//  Parameters come from data/season-params.json (the Track C pooled BL1+BL2
//  fit). The apps consume what that file provides and NEVER synthesise
//  per-league parameters (§2).
// ============================================================================

import { uniform01 } from "./rng.mjs";

/**
 * Resolve base parameters to the effective parameters for one match.
 *
 * The BL2 fields are additive deltas on the pooled values, not a second
 * parameter set. This rule is taken verbatim from the lab that produced the fit
 * (football-model-lab, `src/trackc.mjs` → `effectiveParams`); it is not
 * re-derived here, because §2 forbids synthesising per-league parameters.
 *
 *   HOME_ADV_eff     = HOME_ADV + (bl2 ? HOME_ADV_BL2 : 0)
 *                               + (ghost ? HOME_ADV_GHOST + (bl2 ? HOME_ADV_GHOST_BL2 : 0) : 0)
 *   BASE_TOTAL_eff   = BASE_TOTAL   + (bl2 ? BASE_TOTAL_BL2   : 0)
 *   ELO_PER_GOAL_eff = ELO_PER_GOAL + (bl2 ? ELO_PER_GOAL_BL2 : 0)
 *
 * `isGhost` is true only for matches inside the closed-door window carried by
 * the season configuration. No causal claim is attached to it anywhere in the
 * UI (§8) — the pooled interval includes zero.
 */
export function effectiveParams(base, { league = "bl1", isGhost = false } = {}) {
  const bl2 = league === "bl2";
  const ghost = isGhost
    ? (base.HOME_ADV_GHOST ?? 0) + (bl2 ? (base.HOME_ADV_GHOST_BL2 ?? 0) : 0)
    : 0;
  return {
    ...base,
    HOME_ADV: (base.HOME_ADV ?? 0) + (bl2 ? (base.HOME_ADV_BL2 ?? 0) : 0) + ghost,
    BASE_TOTAL: base.BASE_TOTAL + (bl2 ? (base.BASE_TOTAL_BL2 ?? 0) : 0),
    ELO_PER_GOAL: base.ELO_PER_GOAL + (bl2 ? (base.ELO_PER_GOAL_BL2 ?? 0) : 0),
  };
}

/** Elo gap → the two Poisson rates. Supremacy is split around BASE_TOTAL. */
export function eloToLambdas(eloHome, eloAway, p) {
  const sup = (eloHome - eloAway + p.HOME_ADV) / p.ELO_PER_GOAL;
  return {
    lamH: Math.max(0.12, (p.BASE_TOTAL + sup) / 2),
    lamA: Math.max(0.12, (p.BASE_TOTAL - sup) / 2),
  };
}

/**
 * Poisson pmf at a single k, by the standard recursion.
 *
 * Exported because `packages/fit` needs the likelihood of ONE observed
 * scoreline per match and must not carry its own copy of this — one
 * implementation of the model mathematics in the monorepo, not two. The
 * vectorised `poissonPmf` below is the same recursion; a test holds the two
 * bit-identical so they cannot drift apart.
 */
export function poissonAt(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

/** The same recursion, vectorised over 0…maxK. */
export function poissonPmf(lambda, maxK) {
  const out = new Float64Array(maxK + 1);
  let p = Math.exp(-lambda);
  out[0] = p;
  for (let k = 1; k <= maxK; k++) {
    p = (p * lambda) / k;
    out[k] = p;
  }
  return out;
}

/**
 * Dixon-Coles low-score dependence term. Exported for the same reason as
 * `poissonAt`: the fit needs it and must not reimplement it.
 */
export function dcTau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Row-major address of a scoreline inside `pmf`. Storage layout, not the ordering. */
export const scorelineIndex = (h, a, maxGoals) => h * (maxGoals + 1) + a;

/**
 * THE CANONICAL SCORELINE ORDERING (§3) — by TOTAL GOALS, then home goals.
 *
 * The inverse-CDF maps one uniform through the cumulative sums in exactly this
 * order, so the ordering decides how far an outcome travels when the
 * distribution shifts. §3 requires that the same uniform map to *nearby*
 * outcomes across data states, which is the whole basis of the CRN
 * cancellation — so the ordering was chosen by measurement, not convenience.
 *
 * Measured share of draws that move under a rating shift, 200k draws per cell
 * (scratch benchmark, +10 / +30 / +100 Elo on an even fixture):
 *
 *   ordering                      cell moved        tendency flipped
 *   row-major (h, then a)         10.2 / 24.9 / 59.9 %   4.8 / 12.8 / 32.1 %
 *   goal difference, then h       16.4 / 41.4 / 94.8 %   1.9 /  5.8 / 19.0 %
 *   TOTAL GOALS, then h            2.3 /  6.9 / 23.4 %   1.4 /  4.2 / 13.8 %
 *
 * Total-goals ordering dominates on every measure at every shift size, because
 * a rating change mostly redistributes Poisson mass along the total-goals
 * dimension; row-major cuts across that and puts 0:10 next to 1:0.
 *
 * Changing this ordering changes which scoreline a given uniform produces and
 * therefore breaks common random numbers against every existing artefact. It
 * must never change without bumping SIMULATION_PROTOCOL_VERSION.
 */
const orderCache = new Map();
export function canonicalOrder(maxGoals) {
  const hit = orderCache.get(maxGoals);
  if (hit) return hit;
  const cells = [];
  for (let h = 0; h <= maxGoals; h++) for (let a = 0; a <= maxGoals; a++) cells.push([h, a]);
  cells.sort((x, y) => (x[0] + x[1]) - (y[0] + y[1]) || x[0] - y[0]);
  const order = new Uint16Array(cells.length);
  for (let i = 0; i < cells.length; i++) order[i] = scorelineIndex(cells[i][0], cells[i][1], maxGoals);
  const out = { order, cells };
  orderCache.set(maxGoals, out);
  return out;
}

/**
 * Normalised, DC-corrected scoreline distribution plus its cumulative array in
 * canonical order. Built once per fixture per rating configuration.
 *
 * `applyDc: false` gives plain independent Poisson — used for the extra-time
 * phase of a play-off, where §6 excludes the DC term: DC is fitted on full
 * matches and its low-score correction has no basis at third-length rates.
 */
export function buildScorelineDistribution(lamH, lamA, params, { applyDc = true } = {}) {
  const N = params.MAX_GOALS;
  const rho = applyDc ? params.RHO : 0;
  const ph = poissonPmf(lamH, N);
  const pa = poissonPmf(lamA, N);
  const size = (N + 1) * (N + 1);
  const pmf = new Float64Array(size); // row-major storage, addressed by scorelineIndex
  const cdf = new Float64Array(size); // cumulative in CANONICAL order

  let total = 0;
  for (let h = 0; h <= N; h++) {
    for (let a = 0; a <= N; a++) {
      let p = ph[h] * pa[a] * dcTau(h, a, lamH, lamA, rho);
      if (p < 0) p = 0; // DC can push a corner negative at extreme rates
      pmf[scorelineIndex(h, a, N)] = p;
      total += p;
    }
  }
  for (let i = 0; i < size; i++) pmf[i] /= total;

  const { order } = canonicalOrder(N);
  let cum = 0;
  for (let i = 0; i < size; i++) {
    cum += pmf[order[i]];
    cdf[i] = cum;
  }
  cdf[size - 1] = 1; // kill normalisation drift so the last cell always wins

  return { pmf, cdf, order, maxGoals: N, lamH, lamA, omittedMass: 0 };
}

/**
 * Quantile function of the scoreline distribution: uniform → [home, away].
 *
 * Binary search over the canonical cumulative array. This is the mandated
 * mechanism (§3): the SAME underlying uniform maps to NEARBY outcomes when the
 * distribution shifts slightly, which is exactly what makes the paired
 * difference between two data states cancel most of the simulation error.
 */
export function scorelineQuantile(dist, u) {
  const { cdf, order, maxGoals } = dist;
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (u <= cdf[mid]) hi = mid;
    else lo = mid + 1;
  }
  const cell = order[lo]; // canonical position -> row-major address
  return [Math.floor(cell / (maxGoals + 1)), cell % (maxGoals + 1)];
}

/** One fixture draw for one run — pure function of (keyBase, runIndex). */
export function drawScoreline(dist, keyBase, runIndex) {
  return scorelineQuantile(dist, uniform01(keyBase, runIndex));
}

/**
 * Descriptive per-match prediction. Rating noise is NEVER applied here: this is
 * the displayed forecast for a concrete fixture, not a simulation run.
 */
export function predictMatch(eloHome, eloAway, params) {
  const { lamH, lamA } = eloToLambdas(eloHome, eloAway, params);
  const dist = buildScorelineDistribution(lamH, lamA, params);
  const N = dist.maxGoals;

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  const cells = [];
  for (let h = 0; h <= N; h++) {
    for (let a = 0; a <= N; a++) {
      const p = dist.pmf[scorelineIndex(h, a, N)];
      cells.push({ score: [h, a], prob: p });
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }
  cells.sort((x, y) => y.prob - x.prob);

  return {
    tendency: { homeWin, draw, awayWin },
    mostLikely: cells[0],
    // The most likely scoreline WITHIN the favourite tendency (§SCORELINE_KONVENTION).
    favourite: favouriteScoreline(dist),
    top5: cells.slice(0, 5),
    expectedGoals: [lamH, lamA],
  };
}

/**
 * The most likely scoreline WITHIN the most likely tendency.
 *
 * The global modal scoreline reads as a contradiction next to the favourite
 * tendency: draws bundle their probability onto few scorelines (mostly 1:1),
 * wins spread theirs over many (1:0, 2:0, 2:1 …), so „Heimsieg 57 %" can sit
 * beside a global modal of 1:1. The honest display is the modal scoreline
 * conditioned on the favourite tendency.
 *
 * Ties at BOTH levels resolve by the engine's CANONICAL scoreline ordering
 * (by total goals, then home goals) — first in the ordering wins. That ordering
 * already exists and is protocol-stamped; no new convention is introduced. For
 * the tendency level the tie-break is the order of each tendency's earliest
 * canonical scoreline: draw (0:0) before home win (1:0) before away win (0:1).
 *
 * @param {object} dist  a scoreline distribution from buildScorelineDistribution
 * @returns {{tendency:string, pTendency:number, scoreline:[number,number], pScoreline:number}}
 */
export function favouriteScoreline(dist) {
  const N = dist.maxGoals;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (let h = 0; h <= N; h++) {
    for (let a = 0; a <= N; a++) {
      const p = dist.pmf[scorelineIndex(h, a, N)];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  // Tendency argmax with the canonical tie-break: the candidates are listed in
  // the order of their earliest canonical scoreline, and a strict `>` keeps the
  // first on a tie.
  const masses = [["draw", draw], ["homeWin", homeWin], ["awayWin", awayWin]];
  let tendency = masses[0][0];
  let pTendency = masses[0][1];
  for (const [t, m] of masses) if (m > pTendency) { tendency = t; pTendency = m; }

  const inRegion = tendency === "homeWin"
    ? (h, a) => h > a
    : tendency === "awayWin"
      ? (h, a) => h < a
      : (h, a) => h === a;

  // Argmax over that region only, walking cells in CANONICAL order so a strict
  // `>` leaves the first-in-the-ordering winner on any tie.
  const { order, cells } = canonicalOrder(N);
  let scoreline = null;
  let pScoreline = -1;
  for (let i = 0; i < order.length; i++) {
    const [h, a] = cells[i];
    if (!inRegion(h, a)) continue;
    const p = dist.pmf[order[i]];
    if (p > pScoreline) { pScoreline = p; scoreline = [h, a]; }
  }

  return { tendency, pTendency, scoreline, pScoreline };
}

/** Tendency of an actual scoreline — the label the §4 metrics score against. */
export const tendencyOf = (gh, ga) => (gh > ga ? "homeWin" : gh < ga ? "awayWin" : "draw");
