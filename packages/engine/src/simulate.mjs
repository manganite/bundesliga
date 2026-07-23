// ============================================================================
//  Monte-Carlo season simulation — the §3 contract.
//
//  One simulation per data state. The artefact is identified by the CACHE KEY
//  alone, never by the UI view, so Übersicht and Tabelle can never disagree
//  about the same number.
//
//    cache/artefact key = (dataHash, runCount, engineVersion)
//    random key         = independent of the data state — see rng.mjs
//
//  Played matches are CONDITIONED ON, not sampled. Rating noise is drawn once
//  per club per run and applies to every fixture in that run: one run is one
//  hypothetical "true strength" configuration, not match-level randomness.
// ============================================================================

import { makeKeyBase, uniform01, ratingNoise, SIMULATION_PROTOCOL_VERSION } from "./rng.mjs";
import { effectiveParams, eloToLambdas } from "./model.mjs";
import { buildTable, rankTable, CURRENT_SEASON_RULES } from "./ranking.mjs";

/** Bump when the tallying or artefact shape changes. Part of the cache key. */
export const ENGINE_VERSION = 1;

const MIN_LAMBDA = 0.12;

/**
 * Draw one scoreline directly, without materialising the 121-cell matrix.
 *
 * Identical in result to building the distribution and binary-searching its
 * cumulative array — same canonical ordering (total goals, then home goals),
 * same uniform — but it walks the order incrementally and stops as soon as the
 * cumulative mass passes `u`. At 20 000 runs × 306 fixtures the matrix build
 * would dominate the cost; this touches roughly half the cells on average.
 *
 * The normalisation constant is computed in O(N) rather than O(N²): the
 * Dixon-Coles term is 1 everywhere except four cells, so
 *
 *   total = (Σ_h p_h)(Σ_a p_a) + Σ_{corner} p_h p_a (τ − 1)
 */
export function drawScorelineDirect(lamH, lamA, params, u) {
  const N = params.MAX_GOALS;
  const rho = params.RHO;

  const ph = new Float64Array(N + 1);
  const pa = new Float64Array(N + 1);
  let x = Math.exp(-lamH);
  let y = Math.exp(-lamA);
  ph[0] = x;
  pa[0] = y;
  let sh = x;
  let sa = y;
  for (let k = 1; k <= N; k++) {
    x = (x * lamH) / k;
    y = (y * lamA) / k;
    ph[k] = x;
    pa[k] = y;
    sh += x;
    sa += y;
  }

  const tau00 = 1 - lamH * lamA * rho;
  const tau01 = 1 + lamH * rho;
  const tau10 = 1 + lamA * rho;
  const tau11 = 1 - rho;
  const total = sh * sa
    + ph[0] * pa[0] * (tau00 - 1)
    + ph[0] * pa[1] * (tau01 - 1)
    + ph[1] * pa[0] * (tau10 - 1)
    + ph[1] * pa[1] * (tau11 - 1);

  const target = u * total;
  let cum = 0;
  // Canonical order: by total goals, then by home goals.
  for (let t = 0; t <= 2 * N; t++) {
    const hFrom = Math.max(0, t - N);
    const hTo = Math.min(t, N);
    for (let h = hFrom; h <= hTo; h++) {
      const a = t - h;
      let p = ph[h] * pa[a];
      if (h <= 1 && a <= 1) {
        p *= h === 0 ? (a === 0 ? tau00 : tau01) : (a === 0 ? tau10 : tau11);
      }
      if (p < 0) p = 0;
      cum += p;
      if (cum >= target) return [h, a];
    }
  }
  return [N, N]; // unreachable except through floating-point drift
}

/**
 * Run the season simulation.
 *
 * @param {object} input
 * @param {string} input.seasonId
 * @param {"bl1"|"bl2"} input.league
 * @param {Array<{clubId:string, rating:number}>} input.clubs
 * @param {Array<{id:string, home:string, away:string, gh?:number, ga?:number, isGhost?:boolean}>} input.fixtures
 *   Fixtures with `gh`/`ga` are played and are conditioned on, never sampled.
 * @param {object} input.params      raw season-params.json `params` block
 * @param {object} input.targets     name -> { places, positions: (rank:number)=>boolean }
 * @param {number} [input.runs]      default 20 000 (§3 canonical artefact)
 * @param {number} [input.batches]   default 20 — paired batches for SE(Δ)
 * @param {object} [input.rules]     season rules for the ranker
 * @param {string} [input.context]   random-key namespace, "league" by default
 */
export function simulateSeason({
  seasonId,
  league = "bl1",
  clubs,
  fixtures,
  params,
  targets,
  runs = 20000,
  batches = 20,
  rules = CURRENT_SEASON_RULES,
  context = "league",
}) {
  if (runs % batches !== 0) {
    throw new Error(`runs (${runs}) must be a multiple of batches (${batches}) — batches must be equal size`);
  }
  const p = effectiveParams(params, { league });
  const sigma = params.RATING_SIGMA ?? 0;
  const clubIds = clubs.map((c) => c.clubId);
  const nClubs = clubIds.length;
  const idx = new Map(clubIds.map((id, i) => [id, i]));
  const baseRating = clubs.map((c) => c.rating);

  // A fixture with exactly one of gh/ga is a data defect, not an unplayed
  // fixture. Classifying it as unplayed would silently discard the half-result
  // that IS there and resimulate the match — a wrong number that looks fine.
  for (const f of fixtures) {
    if ((f.gh === undefined) !== (f.ga === undefined)) {
      throw new Error(`fixture ${f.id} has gh xor ga — refusing to guess`);
    }
  }

  const played = fixtures.filter((f) => f.gh !== undefined && f.ga !== undefined);
  const remaining = fixtures.filter((f) => f.gh === undefined || f.ga === undefined);

  // Random keys: run-independent halves, computed once.
  const noiseKey = clubs.map((c) => makeKeyBase({ seasonId, context, id: c.clubId, drawKind: "noise" }));
  const fixtureKey = remaining.map((f) => makeKeyBase({ seasonId, context, id: f.id, drawKind: "scoreline" }));
  // The criterion-6 stand-in gets its OWN key. It used to reuse the noise key
  // with a mangled run index, which broke the documented schema ("every draw is
  // a pure function of its key") and hid a convention inside an XOR constant.
  const deciderKey = clubs.map((c) => makeKeyBase({ seasonId, context, id: c.clubId, drawKind: "decider" }));

  // makeKeyBase folds to 32 bits. With ~500 keys per season a collision has
  // probability ~3e-5 — small, but a collision silently couples two fixtures to
  // one random stream, which is exactly the failure the two-key design exists to
  // prevent. Cheap to rule out, impossible to notice later.
  const allKeys = [...noiseKey, ...fixtureKey, ...deciderKey];
  if (new Set(allKeys).size !== allKeys.length) {
    throw new Error(
      `random key collision: ${allKeys.length} keys folded to ${new Set(allKeys).size} distinct values. `
        + "Two draws would share a stream; refusing to simulate.",
    );
  }

  const targetNames = Object.keys(targets);
  // tally[target][club] and per-batch counts, so SE(Δ) is recomputable later
  // from the snapshot alone (§3: build once, use twice).
  const tally = Object.fromEntries(targetNames.map((t) => [t, new Int32Array(nClubs)]));
  const batchTally = Object.fromEntries(
    targetNames.map((t) => [t, Array.from({ length: batches }, () => new Int32Array(nClubs))]),
  );
  // positions[club][rank-1] — the 18×18 heatmap.
  const positions = Array.from({ length: nClubs }, () => new Int32Array(nClubs));
  const pointsTotal = new Float64Array(nClubs);
  const pointsSamples = Array.from({ length: nClubs }, () => new Int16Array(runs));

  const runsPerBatch = runs / batches;
  const noisy = new Float64Array(nClubs);
  const simulated = new Array(remaining.length);

  for (let run = 0; run < runs; run++) {
    const batch = Math.floor(run / runsPerBatch);

    // One noise draw per club per run — never per leg, never per fixture.
    for (let i = 0; i < nClubs; i++) {
      noisy[i] = baseRating[i] + ratingNoise(noiseKey[i], run, sigma);
    }

    for (let f = 0; f < remaining.length; f++) {
      const fx = remaining[f];
      const pf = fx.isGhost ? effectiveParams(params, { league, isGhost: true }) : p;
      const { lamH, lamA } = eloToLambdas(noisy[idx.get(fx.home)], noisy[idx.get(fx.away)], pf);
      const u = uniform01(fixtureKey[f], run);
      const [gh, ga] = drawScorelineDirect(
        Math.max(MIN_LAMBDA, lamH),
        Math.max(MIN_LAMBDA, lamA),
        pf,
        u,
      );
      simulated[f] = { home: fx.home, away: fx.away, gh, ga };
    }

    const allMatches = played.concat(simulated);
    const table = buildTable(clubIds, allMatches, rules);
    // A completed season: every leg has been played, so the in-season rules do
    // not apply. The decider stands in for criterion 6) exactly where the rules
    // end in a genuine tie, drawn from its own counter-based key.
    const ranked = rankTable(table, allMatches, {
      inSeason: false,
      rules,
      decider: (clubId) => uniform01(deciderKey[idx.get(clubId)], run),
    });

    for (const row of ranked) {
      const i = idx.get(row.clubId);
      positions[i][row.rank - 1]++;
      pointsTotal[i] += row.pts;
      pointsSamples[i][run] = row.pts;
      for (const name of targetNames) {
        if (targets[name].positions(row.rank)) {
          tally[name][i]++;
          batchTally[name][batch][i]++;
        }
      }
    }
  }

  // ---- assemble the artefact ----------------------------------------------
  const probabilities = {};
  for (const name of targetNames) {
    probabilities[name] = Object.fromEntries(clubIds.map((id, i) => [id, tally[name][i] / runs]));
  }

  // Per-batch target frequencies are STORED, not just the aggregate: without
  // them the paired batch differences cannot be recomputed later and SE(Δ) is
  // not obtainable (§3).
  const batchFrequencies = {};
  for (const name of targetNames) {
    batchFrequencies[name] = Object.fromEntries(
      clubIds.map((id, i) => [id, batchTally[name].map((b) => b[i] / runsPerBatch)]),
    );
  }

  const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const pointsSummary = Object.fromEntries(
    clubIds.map((id, i) => {
      const sorted = Array.from(pointsSamples[i]).sort((a, b) => a - b);
      return [id, {
        expected: pointsTotal[i] / runs,
        median: quantile(sorted, 0.5),
        p10: quantile(sorted, 0.1),
        p90: quantile(sorted, 0.9),
      }];
    }),
  );

  return {
    seasonId,
    league,
    runs,
    batches,
    engineVersion: ENGINE_VERSION,
    simulationProtocolVersion: SIMULATION_PROTOCOL_VERSION,
    clubs: clubIds,
    playedCount: played.length,
    remainingCount: remaining.length,
    probabilities,
    batchFrequencies,
    positionDistribution: Object.fromEntries(
      clubIds.map((id, i) => [id, Array.from(positions[i], (n) => n / runs)]),
    ),
    points: pointsSummary,
  };
}

/**
 * The cache/artefact key (§3). Decides WHICH artefact is being viewed; it has
 * nothing to do with the random stream, and the random stream has nothing to do
 * with it.
 */
export const artefactKey = ({ dataHash, runCount, engineVersion = ENGINE_VERSION }) =>
  `${dataHash}:${runCount}:${engineVersion}`;

/** Standard targets for a Bundesliga season. Configuration, never constants. */
export const BL1_TARGETS = {
  meister: { places: 1, positions: (r) => r === 1 },
  platz1bis4: { places: 4, positions: (r) => r <= 4 },
  platz5bis6: { places: 2, positions: (r) => r === 5 || r === 6 },
  klassenerhalt: { places: 15, positions: (r) => r <= 15 },
  relegationsplatz: { places: 1, positions: (r) => r === 16 },
  abstieg: { places: 2, positions: (r) => r >= 17 },
};

export const BL2_TARGETS = {
  aufstieg: { places: 2, positions: (r) => r <= 2 },
  relegationsplatzAufstieg: { places: 1, positions: (r) => r === 3 },
  klassenerhalt: { places: 15, positions: (r) => r <= 15 },
  relegationsplatzAbstieg: { places: 1, positions: (r) => r === 16 },
  abstieg: { places: 2, positions: (r) => r >= 17 },
};
