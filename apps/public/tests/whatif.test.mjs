import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { simulateSeason, drawSeasonRun } from "../../../packages/engine/src/simulate.mjs";
import { reportDelta } from "../../../packages/engine/src/metrics.mjs";

// ============================================================================
//  Was-wäre-wenn — the CRN cancellation the acceptance criterion names.
//
//  This mirrors the worker's whatIf(): same seasonId → same random keys, so the
//  batches are paired and SE(Δ) = SD(Δ_b)/√B with the 2·SE floor applies. The
//  key assertion: fixing a scoreline that a run drew IDENTICALLY changes nothing
//  in that run, so the delta reads „unverändert".
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

const PARAMS = read("data/season-params.json").params;
const CONFIG = read("data/seasons/2026/config.json");
const SEASON = read("data/seasons/2026/bl1/season.json");
const OUTLOOK = read("data/seasons/2026/bl1/outlook.json");

const SEASON_ID = "2026-bl1";
const clubs = SEASON.clubs.map((c) => ({ clubId: c.clubId, rating: OUTLOOK.ratings[c.clubId] }));
const rules = {
  pointsForWin: CONFIG.leagues.bl1.pointsForWin,
  pointsForDraw: CONFIG.leagues.bl1.pointsForDraw,
  criteria: CONFIG.leagues.bl1.tiebreakCriteria,
};
const targets = Object.fromEntries(
  Object.entries(CONFIG.leagues.bl1.targets).map(([n, t]) => [n, { places: t.places, positions: (r) => r >= t.from && r <= t.to }]),
);
const engineFixtures = SEASON.fixtures.map((f) => ({
  id: f.id, home: f.homeClubId, away: f.awayClubId,
  ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}),
}));

function whatIf(modifiedFixtures, { runs = 2000, batches = 20 } = {}) {
  const common = { seasonId: SEASON_ID, league: "bl1", clubs, params: PARAMS, targets, runs, batches, rules };
  const baseline = simulateSeason({ ...common, fixtures: engineFixtures });
  const modified = simulateSeason({ ...common, fixtures: modifiedFixtures });
  const deltas = {};
  for (const name of Object.keys(targets)) {
    deltas[name] = {};
    for (const clubId of modified.clubs) {
      const perBatch = modified.batchFrequencies[name][clubId].map((v, b) => v - baseline.batchFrequencies[name][clubId][b]);
      deltas[name][clubId] = reportDelta(perBatch);
    }
  }
  return { baseline, modified, deltas };
}

test("CRN: every run that already drew the fixed scoreline is unchanged by fixing it", () => {
  // This is the cancellation the paired-batch SE rests on. Fix the first
  // remaining fixture to some value; for every run whose FREE draw of that
  // fixture equals the fixed value, the whole season is byte-identical between
  // baseline and modified, because the keys exclude the data state (§3) and no
  // other draw depends on it. So those runs contribute exactly 0 to the delta.
  const firstRemaining = engineFixtures.find((f) => f.gh === undefined);
  const fixedTo = [1, 0];
  const modified = engineFixtures.map((f) =>
    (f.id === firstRemaining.id ? { ...f, gh: fixedTo[0], ga: fixedTo[1] } : f));

  let matchingRuns = 0;
  for (let r = 0; r < 200; r++) {
    const base = drawSeasonRun({ seasonId: SEASON_ID, league: "bl1", clubs, fixtures: engineFixtures, params: PARAMS, rules, runIndex: r });
    const drew = base.scorelines.find((s) => s.id === firstRemaining.id);
    if (drew.gh !== fixedTo[0] || drew.ga !== fixedTo[1]) continue;
    matchingRuns++;
    const mod = drawSeasonRun({ seasonId: SEASON_ID, league: "bl1", clubs, fixtures: modified, params: PARAMS, rules, runIndex: r });
    // The fixed fixture now passes through as played, but the drawn value is the
    // same, so the final table must be identical.
    assert.deepEqual(mod.table.map((t) => [t.clubId, t.pts, t.rank]), base.table.map((t) => [t.clubId, t.pts, t.rank]));
  }
  assert.ok(matchingRuns > 0, "the oracle must find runs that drew the fixed value");
});

test("the 2·SE floor actually suppresses movement — most cells read „unverändert“ on a mild change", () => {
  // In a coupled league fixing any fixture perturbs the whole table, so there is
  // no truly „distant unchanged" club. What the floor guarantees is that SMALL
  // movements are not sold as change: fixing one mid-table fixture to a common
  // 1:1 leaves the large majority of (target, club) cells below the noise floor.
  const remaining = engineFixtures.filter((f) => f.gh === undefined);
  const fx = remaining[Math.floor(remaining.length / 2)];
  const modified = engineFixtures.map((f) => (f.id === fx.id ? { ...f, gh: 1, ga: 1 } : f));
  const { deltas } = whatIf(modified, { runs: 4000 });

  let total = 0;
  let unchanged = 0;
  for (const name of Object.keys(targets)) {
    for (const clubId of Object.keys(deltas[name])) {
      total++;
      if (!deltas[name][clubId].significant) unchanged++;
    }
  }
  // The vast majority must read unchanged; a single mid-table draw cannot
  // legitimately move most of the table above the noise floor.
  assert.ok(unchanged / total > 0.6, `only ${unchanged}/${total} cells read unverändert`);
  assert.ok(unchanged > 0 && unchanged < total, "the floor must both suppress and admit — not all-or-nothing");
});

test("fixing an EXTREME upset does move probabilities above the noise floor", () => {
  // Force the strongest club to lose its next game 0:5 — a rare draw, so most
  // runs differ and the change is real, not noise.
  const remaining = engineFixtures.filter((f) => f.gh === undefined);
  // Bayern carry the highest rating; find their first remaining fixture.
  const strong = clubs.slice().sort((a, b) => b.rating - a.rating)[0].clubId;
  const fx = remaining.find((f) => f.home === strong || f.away === strong);
  const strongHome = fx.home === strong;
  const modified = engineFixtures.map((f) =>
    (f.id === fx.id ? { ...f, gh: strongHome ? 0 : 5, ga: strongHome ? 5 : 0 } : f));

  const { deltas } = whatIf(modified, { runs: 4000 });
  // The forced loser's own title/top chances must move measurably.
  const moved = Object.values(deltas).some((byClub) => byClub[strong]?.significant);
  assert.ok(moved, "a forced heavy defeat of the favourite must shift its probabilities above noise");
});

test("the floor is 2·SE and comes from the measured batch spread, not a constant", () => {
  const run0 = drawSeasonRun({ seasonId: SEASON_ID, league: "bl1", clubs, fixtures: engineFixtures, params: PARAMS, rules, runIndex: 0 });
  const firstRemaining = run0.scorelines.find((s) => !s.played);
  const modified = engineFixtures.map((f) =>
    (f.id === firstRemaining.id ? { ...f, gh: firstRemaining.gh, ga: firstRemaining.ga } : f));
  const { deltas } = whatIf(modified);
  const sample = deltas.meister[clubs[0].clubId];
  assert.ok(Math.abs(sample.floor - 2 * sample.se) < 1e-12, "floor must be exactly 2·SE");
  assert.equal(sample.significant, Math.abs(sample.delta) >= sample.floor);
});

test("a no-op scenario is identically zero and shown as „unverändert“, not „0,0 Pp.“", () => {
  // Modified == baseline: every batch delta is exactly 0. A zero delta is never
  // a change, even though the floor is also zero — reportDelta guards that.
  const { deltas } = whatIf(engineFixtures);
  for (const name of Object.keys(targets)) {
    for (const clubId of Object.keys(deltas[name])) {
      assert.equal(deltas[name][clubId].delta, 0);
      assert.equal(deltas[name][clubId].significant, false, "zero change must not read as significant");
    }
  }
});
