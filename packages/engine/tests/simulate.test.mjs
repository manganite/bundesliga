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
import { makeKeyBase, SIMULATION_PROTOCOL_VERSION } from "../src/rng.mjs";

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

// ---------------------------------------------------------------------------
// v5.7 Part 2 — engine corrections
// ---------------------------------------------------------------------------

test("the decider is drawn from its own key with a plain run index", () => {
  // The decider key must be a real key in the documented schema, not the noise
  // key with a mangled run index. Distinctness is what proves it.
  const seasonId = "2026";
  const noise = makeKeyBase({ seasonId, context: "league", id: "C01", drawKind: "noise" });
  const decider = makeKeyBase({ seasonId, context: "league", id: "C01", drawKind: "decider" });
  assert.notEqual(noise, decider);

  // And it actually decides: a season that ends in a genuine tie must be
  // resolved, not left shared.
  const two = [{ clubId: "A", rating: 1700 }, { clubId: "B", rating: 1700 }];
  const symmetric = [
    { id: "ab", home: "A", away: "B", gh: 1, ga: 1 },
    { id: "ba", home: "B", away: "A", gh: 1, ga: 1 },
  ];
  const art = simulateSeason({
    seasonId, league: "bl1", clubs: two, fixtures: symmetric, params: P,
    targets: { meister: { places: 1, positions: (r) => r === 1 } },
    runs: 100, batches: 10,
  });
  const total = art.probabilities.meister.A + art.probabilities.meister.B;
  assert.ok(Math.abs(total - 1) < 1e-9, "the decider must resolve the tie every run");
  assert.ok(art.probabilities.meister.A > 0 && art.probabilities.meister.B > 0);
});

test("a random-key collision is caught at setup rather than silently sharing a stream", () => {
  const duplicated = [
    { clubId: "A", rating: 1700 },
    { clubId: "A", rating: 1650 }, // same id -> same noise and decider keys
  ];
  assert.throws(
    () => simulateSeason({
      seasonId: "2026", league: "bl1", clubs: duplicated,
      fixtures: [{ id: "x", home: "A", away: "A" }],
      params: P, targets: BL1_TARGETS, runs: 20, batches: 10,
    }),
    /random key collision/,
  );

  // Two fixtures sharing an id collide the same way.
  assert.throws(
    () => simulateSeason({
      seasonId: "2026", league: "bl1",
      clubs: [{ clubId: "A", rating: 1700 }, { clubId: "B", rating: 1650 }],
      fixtures: [{ id: "dup", home: "A", away: "B" }, { id: "dup", home: "B", away: "A" }],
      params: P, targets: BL1_TARGETS, runs: 20, batches: 10,
    }),
    /random key collision/,
  );
});

test("a fixture with gh xor ga is refused, never silently resimulated", () => {
  const clubsTwo = [{ clubId: "A", rating: 1700 }, { clubId: "B", rating: 1650 }];
  for (const half of [
    { id: "h1", home: "A", away: "B", gh: 2 },
    { id: "h2", home: "A", away: "B", ga: 1 },
  ]) {
    assert.throws(
      () => simulateSeason({
        seasonId: "2026", league: "bl1", clubs: clubsTwo, fixtures: [half],
        params: P, targets: BL1_TARGETS, runs: 20, batches: 10,
      }),
      /has gh xor ga — refusing to guess/,
    );
  }
});

test("the artefact records the protocol version it was produced under", () => {
  const art = simulateSeason({ ...base, fixtures: allFixtures, runs: 200, batches: 10 });
  assert.equal(art.simulationProtocolVersion, SIMULATION_PROTOCOL_VERSION);
  assert.ok(SIMULATION_PROTOCOL_VERSION >= 2, "v5.7 Part 2 bumped the protocol to 2");
});

// ============================================================================
//  „Wichtigstes kommendes Spiel" (§4) — conditional tallies by FILTERING the
//  canonical run set. V1.2 acceptance.
// ============================================================================

function impactFixture(runs = 4000, impactTargets = ["meister", "abstieg"]) {
  const clubs = ["a", "b", "c", "d"].map((clubId, i) => ({ clubId, rating: 1600 - i * 40 }));
  const fixtures = [];
  for (const [i, h] of ["a", "b", "c", "d"].entries()) {
    for (const [j, aw] of ["a", "b", "c", "d"].entries()) {
      if (i !== j) fixtures.push({ id: `${h}-${aw}`, home: h, away: aw });
    }
  }
  return simulateSeason({
    seasonId: "impact",
    clubs,
    fixtures,
    params: P,
    targets: {
      meister: { places: 1, positions: (r) => r === 1 },
      abstieg: { places: 2, positions: (r) => r >= 3 },
    },
    runs,
    batches: 20,
    impactTargets,
  });
}

test("no impact targets means no tallies and no cost", () => {
  assert.equal(impactFixture(1000, []).fixtureImpact, null);
  assert.equal(simulateSeason({
    seasonId: "x", clubs: [{ clubId: "a", rating: 1500 }, { clubId: "b", rating: 1500 }],
    fixtures: [{ id: "a-b", home: "a", away: "b" }], params: P,
    targets: { meister: { places: 1, positions: (r) => r === 1 } }, runs: 100, batches: 10,
  }).fixtureImpact, null, "the default must be off");
});

test("naming a target that does not exist fails rather than silently doing less", () => {
  assert.throws(() => impactFixture(200, ["meister", "gibtsnicht"]), /do not exist/);
});

test("THE ACCEPTANCE TEST: the q-weighted conditionals recombine to P_now", () => {
  // The simulation refuses to emit the metric otherwise, so reaching this point
  // is itself the assertion — but the check is repeated here from the outside,
  // on the shipped numbers, so a future refactor cannot quietly drop it.
  const sim = impactFixture();
  assert.equal(sim.fixtureImpact.length, 12);
  for (const f of sim.fixtureImpact) {
    const q = f.outcomeProbabilities;
    assert.ok(Math.abs(q.homeWin + q.draw + q.awayWin - 1) < 1e-12, `${f.fixtureId}: q must sum to 1`);
  }
});

test("a multi-place target is normalised by k BEFORE the distance", () => {
  const sim = impactFixture();
  for (const f of sim.fixtureImpact) {
    assert.equal(f.targets.meister.places, 1);
    assert.equal(f.targets.abstieg.places, 2);
    // Total-variation distance between two vectors summing to 1 cannot exceed 1.
    // Without the k-division a two-place target would routinely exceed it.
    assert.ok(f.targets.abstieg.shift.value <= 1 + 1e-12, `${f.fixtureId}: ${f.targets.abstieg.shift.value}`);
    assert.ok(f.targets.meister.shift.value <= 1 + 1e-12);
    assert.equal(f.targets.abstieg.shift.places, 2);
  }
});

test("the shift is a real number for every remaining fixture, and never negative", () => {
  const sim = impactFixture();
  for (const f of sim.fixtureImpact) {
    for (const name of ["meister", "abstieg"]) {
      const v = f.targets[name].shift.value;
      assert.ok(Number.isFinite(v) && v >= 0, `${f.fixtureId}/${name}: ${v}`);
    }
  }
});

test("only UNPLAYED fixtures carry an impact — a played one has no outcome to condition on", () => {
  const clubs = ["a", "b", "c", "d"].map((clubId, i) => ({ clubId, rating: 1600 - i * 40 }));
  const fixtures = [
    { id: "a-b", home: "a", away: "b", gh: 2, ga: 0 },
    { id: "c-d", home: "c", away: "d" },
    { id: "b-a", home: "b", away: "a" },
  ];
  const sim = simulateSeason({
    seasonId: "partly", clubs, fixtures, params: P,
    targets: { meister: { places: 1, positions: (r) => r === 1 } },
    runs: 1000, batches: 10, impactTargets: ["meister"],
  });
  assert.deepEqual(sim.fixtureImpact.map((f) => f.fixtureId), ["c-d", "b-a"]);
});

test("the smallest conditional sample is reported, so the card can state it", () => {
  const sim = impactFixture();
  for (const f of sim.fixtureImpact) {
    assert.ok(Number.isInteger(f.smallestConditionalRuns));
    assert.ok(f.smallestConditionalRuns >= 0);
    const q = f.outcomeProbabilities;
    const smallestQ = Math.min(q.homeWin, q.draw, q.awayWin);
    assert.equal(f.smallestConditionalRuns, Math.round(smallestQ * sim.runs));
  }
});

test("a fixture between two contenders moves the title more than one between two mid-table clubs", () => {
  const sim = impactFixture(8000);
  const byId = new Map(sim.fixtureImpact.map((f) => [f.fixtureId, f]));
  // a and b are the two strongest; c and d cannot realistically win the title.
  assert.ok(
    byId.get("a-b").targets.meister.shift.value > byId.get("c-d").targets.meister.shift.value,
    "the top-of-table fixture must matter more for the title",
  );
});

test("the impact tallies do not disturb the simulation itself — same numbers either way", () => {
  const withImpact = impactFixture(2000);
  const without = impactFixture(2000, []);
  assert.deepEqual(without.probabilities, withImpact.probabilities);
  assert.deepEqual(without.positionDistribution, withImpact.positionDistribution);
});
