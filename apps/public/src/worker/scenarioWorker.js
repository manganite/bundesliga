// ============================================================================
//  The Szenarien worker (§10, V2a) — keeps the UI unblocked.
//
//  Two jobs, both browser-side BY DESIGN, not as an exception to §3: they are
//  user-interactive and session-scoped, so they cannot live in the pipeline.
//
//    "whatif"  — simulate the modified data state and the unmodified one with
//                the STANDARD random keys, and return the paired-batch Δ per
//                target/club. CRN against the baseline is automatic because the
//                keys exclude the data state (§3): fixing a scoreline that a run
//                drew identically changes nothing in that run, and the Δ shows
//                „unverändert".
//    "sample"  — draw one whole season at a named run index (Beispielsaison).
//
//  The worker imports packages/engine directly; it forks nothing.
// ============================================================================

import { simulateSeason, drawSeasonRun } from "../../../../packages/engine/src/simulate.mjs";
import { reportDelta } from "../../../../packages/engine/src/metrics.mjs";

function toTargets(config) {
  const out = {};
  for (const [name, t] of Object.entries(config)) {
    out[name] = { places: t.places, positions: (r) => r >= t.from && r <= t.to };
  }
  return out;
}

/**
 * Δ per (target, club) between the modified and the baseline data state, with
 * the §3 paired-batch SE and the 2·SE floor applied. Both simulations use the
 * SAME seasonId, so the SAME random keys — that is what makes the batches paired.
 */
function whatIf(payload) {
  const targets = toTargets(payload.targets);
  const common = {
    seasonId: payload.seasonId,
    league: payload.league,
    clubs: payload.clubs,
    params: payload.params,
    targets,
    runs: payload.runs,
    batches: payload.batches,
    rules: payload.rules,
  };
  const baseline = simulateSeason({ ...common, fixtures: payload.baselineFixtures });
  const modified = simulateSeason({ ...common, fixtures: payload.modifiedFixtures });

  // Per target and club: the paired-batch difference, with the noise floor.
  const deltas = {};
  for (const name of Object.keys(targets)) {
    deltas[name] = {};
    for (const clubId of modified.clubs) {
      const mod = modified.batchFrequencies[name][clubId];
      const base = baseline.batchFrequencies[name][clubId];
      const perBatch = mod.map((v, b) => v - base[b]);
      const report = reportDelta(perBatch);
      deltas[name][clubId] = {
        baseline: baseline.probabilities[name][clubId],
        modified: modified.probabilities[name][clubId],
        delta: report.delta,
        se: report.se,
        floor: report.floor,
        significant: report.significant,
      };
    }
  }
  return { probabilities: modified.probabilities, deltas, runs: payload.runs, batches: payload.batches };
}

self.onmessage = (event) => {
  const { id, kind, payload } = event.data;
  try {
    const result = kind === "sample"
      ? drawSeasonRun(payload)
      : whatIf(payload);
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message });
  }
};
