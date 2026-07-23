// ============================================================================
//  The production fit procedure.
//
//  Moved out of the private football-model-lab so the annual refit is
//  reproducible from this repository alone — see docs/FIT_EXTRACTION.md for the
//  inventory of what came from where.
//
//  ONE IMPLEMENTATION OF THE MODEL MATHEMATICS. The Poisson recursion, the
//  Dixon-Coles term and the parameter resolution all come from
//  `packages/engine`; nothing here reimplements them.
//
//  ONE DELIBERATE DIFFERENCE from the engine's sampling path: the engine
//  normalises over a TRUNCATED grid because it needs a finite grid to draw
//  from. A likelihood must not do that — normalising over a truncated grid
//  would condition on "at most MAX_GOALS goals". The analytic, untruncated
//  normalisation below is both correct and what produced the shipped
//  parameters, which is why the reproduction gate can be bit-identical.
// ============================================================================

import { poissonAt, dcTau, effectiveParams } from "../../engine/src/model.mjs";

const MIN_LAMBDA = 0.12;
const RHO_MAX = 0.35;

/** Parameter transforms: the optimiser works in an unconstrained space. */
export const SPEC = {
  BASE_TOTAL: { to: Math.log, from: Math.exp },
  ELO_PER_GOAL: { to: Math.log, from: Math.exp },
  RHO: {
    to: (r) => Math.atanh(Math.max(-0.999, Math.min(0.999, r / RHO_MAX))),
    from: (z) => RHO_MAX * Math.tanh(z),
  },
  HOME_ADV: { to: (x) => x, from: (z) => z },
  HOME_ADV_BL2: { to: (x) => x, from: (z) => z },
  HOME_ADV_GHOST: { to: (x) => x, from: (z) => z },
  HOME_ADV_GHOST_BL2: { to: (x) => x, from: (z) => z },
  BASE_TOTAL_BL2: { to: (x) => x, from: (z) => z },
  ELO_PER_GOAL_BL2: { to: (x) => x, from: (z) => z },
};

/**
 * The starting point. Every additive deviation starts at 0, so a key left out
 * of `keys` contributes nothing and the model reduces to the pooled form.
 */
export function defaults() {
  return {
    BASE_TOTAL: 2.65,
    ELO_PER_GOAL: 220,
    HOME_ADV: 0,
    RHO: -0.06,
    MAX_GOALS: 10,
    ET_FACTOR: 1 / 3,
    RATING_SIGMA: 100,
    HOME_ADV_BL2: 0,
    HOME_ADV_GHOST: 0,
    HOME_ADV_GHOST_BL2: 0,
    BASE_TOTAL_BL2: 0,
    ELO_PER_GOAL_BL2: 0,
  };
}

/** The two Poisson rates for one match under one parameter set. */
function lambdas(match, base) {
  const p = effectiveParams(base, { league: match.league, isGhost: match.isGhost });
  const sup = ((match.eloHome - match.eloAway) + p.HOME_ADV) / p.ELO_PER_GOAL;
  return {
    p,
    lamH: Math.max(MIN_LAMBDA, (p.BASE_TOTAL + sup) / 2),
    lamA: Math.max(MIN_LAMBDA, (p.BASE_TOTAL - sup) / 2),
  };
}

/**
 * Weighted mean negative log-likelihood of the observed scorelines.
 *
 * `Z` is the analytic normalisation of the Dixon-Coles-corrected distribution
 * over the FULL grid: the two Poisson factors sum to 1 on their own, and the
 * correction touches exactly four cells, so the whole constant is those four
 * terms. No truncation, no sum over a grid.
 */
export function negativeLogLikelihood(matches, base, weights) {
  const rho = base.RHO;
  let num = 0;
  let den = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const w = weights ? weights[i] : 1;
    const { lamH, lamA } = lambdas(m, base);

    const ph0 = Math.exp(-lamH);
    const pa0 = Math.exp(-lamA);
    const ph1 = ph0 * lamH;
    const pa1 = pa0 * lamA;
    const Z = 1
      + ph0 * pa0 * (-lamH * lamA * rho)
      + ph0 * pa1 * (lamH * rho)
      + ph1 * pa0 * (lamA * rho)
      + ph1 * pa1 * (-rho);

    const h = m.homeGoals;
    const a = m.awayGoals;
    const prob = Math.max(
      (poissonAt(lamH, h) * poissonAt(lamA, a) * dcTau(h, a, lamH, lamA, rho)) / Z,
      1e-12,
    );
    num += w * -Math.log(prob);
    den += w;
  }
  return num / den;
}

/**
 * Nelder-Mead, derivative-free.
 *
 * Kept exactly as the procedure that produced the shipped parameters used it,
 * down to the shrink rule and the 1e-7 spread stop. This is not a place to
 * improve anything: any change here changes the fit, which makes it a Process B
 * change (§5.5) and not a refactoring.
 */
export function nelderMead(f, x0, { maxIter = 2000, step = 0.2 } = {}) {
  const n = x0.length;
  const simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += step * (Math.abs(p[i]) > 1e-8 ? Math.abs(p[i]) : 1);
    simplex.push(p);
  }
  let fv = simplex.map(f);

  const order = () => {
    const idx = fv.map((_, i) => i).sort((a, b) => fv[a] - fv[b]);
    return [idx.map((i) => simplex[i]), idx.map((i) => fv[i])];
  };

  for (let it = 0; it < maxIter; it++) {
    const [s0, v0] = order();
    for (let i = 0; i < s0.length; i++) { simplex[i] = s0[i]; fv[i] = v0[i]; }

    const spread = Math.max(
      ...simplex.slice(1).map((p) => Math.max(...p.map((c, i) => Math.abs(c - simplex[0][i])))),
    );
    if (spread < 1e-7) break;

    const cen = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += simplex[i][j] / n;

    const worst = simplex[n];
    const refl = cen.map((c, j) => c + (c - worst[j]));
    const fR = f(refl);

    if (fR < fv[0]) {
      const exp = cen.map((c, j) => c + 2 * (refl[j] - c));
      const fE = f(exp);
      if (fE < fR) { simplex[n] = exp; fv[n] = fE; } else { simplex[n] = refl; fv[n] = fR; }
    } else if (fR < fv[n - 1]) {
      simplex[n] = refl;
      fv[n] = fR;
    } else {
      const inside = fR >= fv[n];
      const con = inside
        ? cen.map((c, j) => c + 0.5 * (worst[j] - c))
        : cen.map((c, j) => c + 0.5 * (refl[j] - c));
      const fC = f(con);
      if (fC < Math.min(fR, fv[n])) {
        simplex[n] = con;
        fv[n] = fC;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((c, j) => simplex[0][j] + 0.5 * (c - simplex[0][j]));
          fv[i] = f(simplex[i]);
        }
      }
    }
  }

  const [s, v] = order();
  return { x: s[0], fx: v[0] };
}

/**
 * Fit the model.
 *
 * @param {Array} matches   training matches, each with league, isGhost, elo and goals
 * @param {object} options
 * @param {string[]} options.keys      which parameters are fitted; the rest stay at base
 * @param {number[]} [options.weights] per-match weights; omitted means equal
 * @param {object} [options.start]     overrides on the defaults
 */
export function fit(matches, { keys, weights, start, maxIter = 1500 } = {}) {
  const base = { ...defaults(), ...start };
  const objective = (z) => {
    const p = { ...base };
    keys.forEach((k, i) => { p[k] = SPEC[k].from(z[i]); });
    // The optimiser works unconstrained, so implausible regions are fenced off
    // by returning a large finite value rather than by clamping the parameter.
    if (!(p.BASE_TOTAL > 0.2 && p.BASE_TOTAL < 8) || !(p.ELO_PER_GOAL > 20 && p.ELO_PER_GOAL < 2000)) {
      return 1e6;
    }
    const nll = negativeLogLikelihood(matches, p, weights);
    return Number.isFinite(nll) ? nll : 1e6;
  };

  const result = nelderMead(objective, keys.map((k) => SPEC[k].to(base[k])), { maxIter });
  const params = { ...base };
  keys.forEach((k, i) => { params[k] = SPEC[k].from(result.x[i]); });
  return { params, nll: result.fx };
}

/**
 * Recency weights relative to a test season: `w = 0.5 ** (age / H)`.
 * `H = Infinity` gives equal weights — the shipped procedure's setting, because
 * recency weighting did not earn its keep on held-out evidence.
 */
export function recencyWeights(matches, testSeason, halfLife) {
  return matches.map((m) => (Number.isFinite(halfLife) ? 0.5 ** ((testSeason - m.season) / halfLife) : 1));
}

/**
 * Held-out outcome metrics. All four are LOWER IS BETTER; the random baselines
 * are ln 3 for log-loss and 2/3 for Brier (§4).
 */
export function heldOutMetrics(matches, base) {
  const N = 10; // the outcome sum needs a grid; 10 covers the data (max 9 goals)
  let logLoss = 0;
  let brier = 0;
  let rps = 0;
  const buckets = Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hits: 0 }));

  for (const m of matches) {
    const { lamH, lamA } = lambdas(m, base);
    const rho = base.RHO;

    let z = 0;
    let pH = 0;
    let pD = 0;
    let pA = 0;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const pr = poissonAt(lamH, i) * poissonAt(lamA, j) * dcTau(i, j, lamH, lamA, rho);
        z += pr;
        if (i > j) pH += pr; else if (i === j) pD += pr; else pA += pr;
      }
    }
    pH /= z; pD /= z; pA /= z;

    const outcome = m.homeGoals > m.awayGoals ? "H" : m.homeGoals === m.awayGoals ? "D" : "A";
    const observed = { H: outcome === "H" ? 1 : 0, D: outcome === "D" ? 1 : 0, A: outcome === "A" ? 1 : 0 };
    const pObserved = outcome === "H" ? pH : outcome === "D" ? pD : pA;

    logLoss += -Math.log(Math.max(pObserved, 1e-12));
    brier += (pH - observed.H) ** 2 + (pD - observed.D) ** 2 + (pA - observed.A) ** 2;

    // Ranked probability score over the ordered outcome scale H < D < A.
    const cumP = [pH, pH + pD];
    const cumO = [observed.H, observed.H + observed.D];
    rps += ((cumP[0] - cumO[0]) ** 2 + (cumP[1] - cumO[1]) ** 2) / 2;

    // Calibration pools all three probabilities per match (§4).
    for (const [key, p] of [["H", pH], ["D", pD], ["A", pA]]) {
      const b = buckets[Math.min(9, Math.floor(p * 10))];
      b.n++;
      b.sumP += p;
      b.hits += observed[key];
    }
  }

  const n = matches.length;
  const total = n * 3;
  let ece = 0;
  for (const b of buckets) {
    if (b.n === 0) continue;
    ece += (b.n / total) * Math.abs(b.sumP / b.n - b.hits / b.n);
  }

  return {
    logLoss: logLoss / n,
    brier: brier / n,
    rps: rps / n,
    ece: ece * 100, // percentage points, as the gates expect
    matches: n,
  };
}
