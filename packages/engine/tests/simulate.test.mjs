import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  simulateSeason, drawScorelineDirect, artefactKey, BL1_TARGETS, ENGINE_VERSION,
} from "../src/simulate.mjs";
import {
  effectiveParams, buildScorelineDistribution, scorelineQuantile, eloToLambdas,
} from "../src/model.mjs";
import { reportDelta, effectiveContenders } from "../src/metrics.mjs";

const P = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../../data/season-params.json"), "utf8"),
).params;
const p = effectiveParams(P, { league: "bl1" });

// The fast path must be indistinguishable from the reference implementation —
// otherwise the artefact and the displayed per-match prediction would disagree.
test("the direct draw is bit-identical to the full-matrix quantile", () => {
  for (const [eh, ea] of [[1700, 1650], [2000, 1400], [1500, 1900], [1600, 1600]]) {
    const { lamH, lamA } = eloToLambdas(eh, ea, p);
    const dist = buildScorelineDistribution(lamH, lamA, p);
    for (let i = 1; i < 4000; i++) {
      const u = i / 4000;
      const fast = drawScorelineDirect(lamH, lamA, p, u);
      const reference = scorelineQuantile(dist, u);
      assert.deepEqual(fast, reference, `mismatch at u=${u} for ${eh} vs ${ea}`);
    }
  }
});

// ---------------------------------------------------------------------------

const clubs = Array.from({ length: 18 }, (_, i) => ({
  clubId: `C${String(i + 1).padStart(2, "0")}`,
  rating: 1800 - i * 25,
}));

/** A full double round robin, ordered so matchdays are contiguous. */
function roundRobin(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      if (i !== j) out.push({ id: `${ids[i]}-${ids[j]}`, home: ids[i], away: ids[j] });
    }
  }
  return out;
}
const allFixtures = roundRobin(clubs.map((c) => c.clubId));

const base = {
  seasonId: "2026",
  league: "bl1",
  clubs,
  params: P,
  targets: BL1_TARGETS,
  runs: 2000,
  batches: 20,
};

test("a pre-season simulation produces a coherent artefact", () => {
  const art = simulateSeason({ ...base, fixtures: allFixtures });

  assert.equal(art.runs, 2000);
  assert.equal(art.playedCount, 0);
  assert.equal(art.remainingCount, 306);
  assert.equal(art.engineVersion, ENGINE_VERSION);

  // Exactly one champion per run.
  const champ = Object.values(art.probabilities.meister).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(champ - 1) < 1e-9, `champion probabilities sum to ${champ}`);

  // A k-place target sums to k — this is the property the metrics must
  // normalise away before entropy or total-variation distance.
  const top4 = Object.values(art.probabilities.platz1bis4).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(top4 - 4) < 1e-9, `top-4 sums to ${top4}`);
  const abstieg = Object.values(art.probabilities.abstieg).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(abstieg - 2) < 1e-9);

  // Every run assigns every club exactly one position.
  for (const id of art.clubs) {
    const dist = art.positionDistribution[id];
    assert.equal(dist.length, 18);
    assert.ok(Math.abs(dist.reduce((a, b) => a + b, 0) - 1) < 1e-9, `${id} positions`);
  }
  // Every position is filled exactly once per run.
  for (let r = 0; r < 18; r++) {
    const col = art.clubs.reduce((a, id) => a + art.positionDistribution[id][r], 0);
    assert.ok(Math.abs(col - 1) < 1e-9, `position ${r + 1} sums to ${col}`);
  }
});

test("the strongest club is the most likely champion", () => {
  const art = simulateSeason({ ...base, fixtures: allFixtures });
  const ranked = art.clubs.slice().sort((a, b) => art.probabilities.meister[b] - art.probabilities.meister[a]);
  assert.equal(ranked[0], "C01");
  assert.ok(art.probabilities.meister.C01 > art.probabilities.meister.C18);
  assert.ok(art.points.C01.expected > art.points.C18.expected);
});

test("point summaries are ordered p10 ≤ median ≤ p90", () => {
  const art = simulateSeason({ ...base, fixtures: allFixtures });
  for (const id of art.clubs) {
    const s = art.points[id];
    assert.ok(s.p10 <= s.median && s.median <= s.p90, `${id}: ${s.p10}/${s.median}/${s.p90}`);
    assert.ok(s.expected >= 0 && s.expected <= 3 * 34);
  }
});

test("played matches are conditioned on, never resampled", () => {
  // Give the weakest club a full season of maximal wins and the table must
  // reflect it — a sampler that ignored results could not produce this.
  const fixtures = allFixtures.map((f) =>
    f.home === "C18" ? { ...f, gh: 5, ga: 0 } : f.away === "C18" ? { ...f, gh: 0, ga: 5 } : f,
  );
  const art = simulateSeason({ ...base, fixtures, runs: 500 });
  assert.equal(art.playedCount, 34);
  assert.ok(
    art.probabilities.meister.C18 > 0.9,
    `a club that won all 34 should almost always be champion, got ${art.probabilities.meister.C18}`,
  );
});

test("a fully played season is deterministic and matches its real table", () => {
  // Every fixture decided: the simulation has nothing left to sample, so every
  // run must produce the identical table.
  const fixtures = allFixtures.map((f) => ({ ...f, gh: f.home < f.away ? 2 : 0, ga: f.home < f.away ? 0 : 2 }));
  const art = simulateSeason({ ...base, fixtures, runs: 100 });
  assert.equal(art.remainingCount, 0);
  for (const id of art.clubs) {
    const dist = art.positionDistribution[id];
    const nonZero = dist.filter((x) => x > 0);
    assert.equal(nonZero.length, 1, `${id} must land on one position every run`);
    assert.ok(Math.abs(nonZero[0] - 1) < 1e-12);
  }
});

test("the same inputs reproduce the same artefact exactly", () => {
  const a = simulateSeason({ ...base, fixtures: allFixtures, runs: 500 });
  const b = simulateSeason({ ...base, fixtures: allFixtures, runs: 500 });
  assert.deepEqual(a.probabilities, b.probabilities);
  assert.deepEqual(a.positionDistribution, b.positionDistribution);
});

// §3: raising the run count must EXTEND the sample, not resample it.
test("raising the run count extends the sample rather than resampling", () => {
  const short = simulateSeason({ ...base, fixtures: allFixtures, runs: 500, batches: 5 });
  const long = simulateSeason({ ...base, fixtures: allFixtures, runs: 2000, batches: 20 });
  // The first 5 batches of the long run cover exactly the same 500 runs, so
  // their per-batch frequencies must be identical.
  for (const club of short.clubs) {
    assert.deepEqual(
      long.batchFrequencies.meister[club].slice(0, 5),
      short.batchFrequencies.meister[club],
      `batch frequencies diverged for ${club}`,
    );
  }
});

test("per-batch frequencies are stored and average back to the aggregate", () => {
  const art = simulateSeason({ ...base, fixtures: allFixtures });
  for (const club of art.clubs) {
    const batches = art.batchFrequencies.meister[club];
    assert.equal(batches.length, 20);
    const mean = batches.reduce((a, b) => a + b, 0) / batches.length;
    assert.ok(Math.abs(mean - art.probabilities.meister[club]) < 1e-12, `${club}: ${mean}`);
  }
});

// The pay-off of common random numbers: a one-fixture data change must move the
// artefact by far less than two independent samples would differ.
test("common random numbers make a small data change measurable", () => {
  const before = simulateSeason({ ...base, fixtures: allFixtures, runs: 2000 });
  const changed = allFixtures.map((f, i) => (i === 0 ? { ...f, gh: 3, ga: 0 } : f));
  const after = simulateSeason({ ...base, fixtures: changed, runs: 2000 });

  const club = "C01";
  const deltas = after.batchFrequencies.meister[club].map(
    (x, i) => x - before.batchFrequencies.meister[club][i],
  );
  const report = reportDelta(deltas);
  assert.equal(report.batches, 20);
  assert.ok(Number.isFinite(report.se) && report.se >= 0);

  // With CRN the paired batch deltas must be far tighter than the batch-to-batch
  // spread of the level itself — that is exactly the noise CRN removes.
  const levels = before.batchFrequencies.meister[club];
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const levelSd = Math.sqrt(levels.reduce((a, x) => a + (x - mean) ** 2, 0) / (levels.length - 1));
  const deltaMean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const deltaSd = Math.sqrt(deltas.reduce((a, x) => a + (x - deltaMean) ** 2, 0) / (deltas.length - 1));
  assert.ok(deltaSd < levelSd, `paired spread ${deltaSd} should beat level spread ${levelSd}`);
});

test("the Spannungsindex reads sensibly off a real artefact", () => {
  const art = simulateSeason({ ...base, fixtures: allFixtures });
  const title = effectiveContenders(art.clubs.map((c) => art.probabilities.meister[c]), 1);
  assert.ok(title.value >= 1 && title.value <= 18);
  assert.equal(title.floor, 1);

  // Two relegation places: the floor is 2, not 1 — the trap §4 warns about.
  const rel = effectiveContenders(art.clubs.map((c) => art.probabilities.abstieg[c]), 2);
  assert.equal(rel.floor, 2);
  assert.ok(rel.value >= 2 - 1e-9, `a two-place reading cannot fall below 2, got ${rel.value}`);
});

test("runs must divide evenly into batches", () => {
  assert.throws(
    () => simulateSeason({ ...base, fixtures: allFixtures, runs: 1000, batches: 3 }),
    /multiple of batches/,
  );
});

test("the artefact key is independent of the random stream", () => {
  assert.equal(artefactKey({ dataHash: "abc", runCount: 20000 }), `abc:20000:${ENGINE_VERSION}`);
  assert.notEqual(
    artefactKey({ dataHash: "abc", runCount: 20000 }),
    artefactKey({ dataHash: "abd", runCount: 20000 }),
  );
});
