import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLiveTimeline, buildFrozenTimeline, targetsFromConfig } from "../src/artefacts.mjs";

// ============================================================================
//  Cumulative completeness (AUDIT_FAMILIE §2).
//
//  Both timelines cache their points on the promise that "a point for a
//  completed matchday cannot change". The old gate asked whether some LATER
//  matchday had begun — which is not the same question. A matchday with one
//  postponed fixture was computed from the other eight results and frozen for
//  good, and a retroactively rebuilt season therefore disagreed with the one
//  that had grown live. Same artefact type, two meanings.
//
//  Point M is now computed once every fixture of matchdays 1..M has a result.
//  These tests are written from the CASES the rule must cover, not from the
//  condition as implemented — that distinction is itself a lesson in CLAUDE.md.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

const PARAMS = read("data/season-params.json").params;
const CONFIG = read("data/seasons/2025/config.json");
const leagueConfig = CONFIG.leagues.bl1;
const rules = {
  pointsForWin: leagueConfig.pointsForWin,
  pointsForDraw: leagueConfig.pointsForDraw,
  criteria: leagueConfig.tiebreakCriteria,
};
const targets = targetsFromConfig(leagueConfig);

// A four-club league: two fixtures per matchday, small enough to simulate in a
// test and big enough to have a table.
const CLUBS = [
  { clubId: "A", rating: 1800 },
  { clubId: "B", rating: 1700 },
  { clubId: "C", rating: 1600 },
  { clubId: "D", rating: 1500 },
];

/** md -> [[home, away], [home, away]], with a kickoff date per matchday. */
const SCHEDULE = {
  1: [["A", "B"], ["C", "D"]],
  2: [["A", "C"], ["B", "D"]],
  3: [["A", "D"], ["B", "C"]],
};
const DATE = { 1: "2026-08-08", 2: "2026-08-15", 3: "2026-08-22" };

/**
 * @param {object} opts.results  fixtureId -> [gh, ga]; anything absent is unplayed
 * @param {object} opts.kickoffs fixtureId -> ISO date, overriding the matchday's
 */
function fixturesFor({ results = {}, kickoffs = {} } = {}) {
  const out = [];
  for (const [md, pairs] of Object.entries(SCHEDULE)) {
    pairs.forEach(([home, away], i) => {
      const id = `m${md}-${i}`;
      const date = kickoffs[id] ?? DATE[md];
      const f = { id, matchday: Number(md), kickoff: `${date}T15:30:00Z`, homeClubId: home, awayClubId: away };
      if (results[id]) [f.gh, f.ga] = results[id];
      out.push(f);
    });
  }
  return out;
}

const ALL_PLAYED = { "m1-0": [2, 1], "m1-1": [1, 1], "m2-0": [0, 2], "m2-1": [3, 0], "m3-0": [1, 0], "m3-1": [2, 2] };

const frozen = (fixtures, over = {}) => buildFrozenTimeline({
  seasonId: "t-bl1", league: "bl1", frozenClubs: CLUBS, fixtures,
  params: PARAMS, targets, rules, runs: 200, ...over,
});

const RATINGS = Object.fromEntries(CLUBS.map((c) => [c.clubId, c.rating]));
const ratingsOn = (date) => ({ snapshotId: `snap-${date}`, ratings: RATINGS });

const live = (fixtures, over = {}) => buildLiveTimeline({
  seasonId: "t-bl1", league: "bl1", clubs: CLUBS, fixtures,
  params: PARAMS, targets, rules, ratingsOn, runs: 200, ...over,
});

// ---------------------------------------------------------------------------

test("a matchday with a postponed fixture yields NO point — nor do the ones after it", () => {
  // Matchday 1 is missing one result; matchdays 2 and 3 are complete.
  const results = { ...ALL_PLAYED };
  delete results["m1-1"];
  const fixtures = fixturesFor({ results, kickoffs: { "m1-1": "2026-10-20" } });

  const t = frozen(fixtures);
  assert.deepEqual(t.points.map((p) => p.matchday), [0], "only the pre-season point is settled");

  const l = live(fixtures);
  assert.deepEqual(l.points.map((p) => p.matchday), [], "the live curve pauses too");
});

test("when the makeup match is played the missing points appear at once", () => {
  const open = fixturesFor({
    results: (() => { const r = { ...ALL_PLAYED }; delete r["m1-1"]; return r; })(),
    kickoffs: { "m1-1": "2026-10-20" },
  });
  const closed = fixturesFor({ results: ALL_PLAYED, kickoffs: { "m1-1": "2026-10-20" } });

  const before = frozen(open);
  const after = frozen(closed, { existing: before });
  assert.deepEqual(after.points.map((p) => p.matchday), [0, 1, 2, 3]);
  assert.equal(after.computed, 3, "three points catch up in one run");
});

// The heart of finding §1.3: same data, two build paths, one result.
test("live-grown and retroactively built timelines agree, point for point", () => {
  const fixtures = fixturesFor({ results: ALL_PLAYED, kickoffs: { "m1-1": "2026-10-20" } });

  // Retro: everything at once, from complete data.
  const retro = frozen(fixtures);

  // Live: the season as it unfolded — matchday 2 and 3 land before the makeup
  // match of matchday 1, exactly the situation that used to split the meanings.
  const step1 = frozen(fixturesFor({
    results: { "m1-0": ALL_PLAYED["m1-0"] },
    kickoffs: { "m1-1": "2026-10-20" },
  }));
  const step2 = frozen(fixturesFor({
    results: (() => { const r = { ...ALL_PLAYED }; delete r["m1-1"]; return r; })(),
    kickoffs: { "m1-1": "2026-10-20" },
  }), { existing: step1 });
  const grown = frozen(fixtures, { existing: step2 });

  assert.deepEqual(
    grown.points.map(({ matchday, playedCount, probabilities }) => ({ matchday, playedCount, probabilities })),
    retro.points.map(({ matchday, playedCount, probabilities }) => ({ matchday, playedCount, probabilities })),
    "a live-grown curve must be the retroactive one — otherwise regeneration is not deterministic",
  );
});

test("NO CHURN — a settled point is reused byte for byte", () => {
  const fixtures = fixturesFor({ results: ALL_PLAYED });
  const first = frozen(fixtures);
  const second = frozen(fixtures, { existing: first });
  assert.equal(second.computed, 0);
  assert.deepEqual(second.points, first.points);
});

test("the live asOf follows the last kickoff up to that point, not the order of runs", () => {
  // Matchday 1 has a fixture made up on 20 October; matchdays 2 and 3 sit in
  // August. Point 2 and 3 therefore came about in October, not in August.
  const fixtures = fixturesFor({ results: ALL_PLAYED, kickoffs: { "m1-1": "2026-10-20" } });
  const l = live(fixtures);
  const asOf = Object.fromEntries(l.points.map((p) => [p.matchday, p.asOf]));
  assert.equal(asOf[1], "2026-10-21");
  assert.equal(asOf[2], "2026-10-21", "point 2 contains the October result, so its ratings may not predate it");
  assert.equal(asOf[3], "2026-10-21");

  // Built in stages, the values must be identical — no dependence on when the
  // cron first got there.
  const staged = live(fixtures, { existing: live(fixtures) });
  assert.deepEqual(staged.points.map((p) => p.asOf), l.points.map((p) => p.asOf));
});

test("without a postponement the asOf is unchanged — the ordinary case is untouched", () => {
  const fixtures = fixturesFor({ results: ALL_PLAYED });
  const asOf = Object.fromEntries(live(fixtures).points.map((p) => [p.matchday, p.asOf]));
  assert.deepEqual(asOf, { 1: "2026-08-09", 2: "2026-08-16", 3: "2026-08-23" });
});
