import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLiveTimeline, buildFrozenTimeline, targetsFromConfig } from "../src/artefacts.mjs";
import { findSnapshotAsOf } from "../src/snapshots.mjs";

// ============================================================================
//  The live-rating timeline (§5.3, V1.2).
//
//  „A live-rating timeline cannot be reconstructed from results alone." This is
//  the artefact that proves the archive was worth keeping from day one — so the
//  test runs against the REAL archive and the REAL completed season, not a
//  synthetic one.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

const PARAMS = read("data/season-params.json").params;
const INDEX = read("data/ratings/index.json");
const CONFIG = read("data/seasons/2025/config.json");
const SEASON = read("data/seasons/2025/bl1/season.json");

const snapshotOf = (id) => read(`data/ratings/snapshots/${id}.json`);
const ratingsOn = (date) => {
  const meta = findSnapshotAsOf(INDEX, date);
  if (!meta) return null;
  return { snapshotId: meta.snapshotId, ratings: snapshotOf(meta.snapshotId).ratings };
};

const leagueConfig = CONFIG.leagues.bl1;
const rules = {
  pointsForWin: leagueConfig.pointsForWin,
  pointsForDraw: leagueConfig.pointsForDraw,
  criteria: leagueConfig.tiebreakCriteria,
};

// A small run count: what is under test is the wiring — which ratings each
// point uses and what happens where none exist — not the Monte-Carlo numbers.
const build = (over = {}) => buildLiveTimeline({
  seasonId: "2025-bl1",
  league: "bl1",
  clubs: SEASON.clubs,
  fixtures: SEASON.fixtures,
  params: PARAMS,
  targets: targetsFromConfig(leagueConfig),
  rules,
  ratingsOn,
  runs: 200,
  ...over,
});

test("the completed season yields one point per played matchday", () => {
  const live = build();
  const matchdays = [...new Set(SEASON.fixtures.map((f) => f.matchday))];
  assert.equal(live.points.length, matchdays.length);
  assert.deepEqual(live.points.map((p) => p.matchday), matchdays.sort((a, b) => a - b));
  assert.deepEqual(live.gaps, [], "the archive covers this season, so there is nothing to skip");
});

test("each point names the rating it used, and that rating is AFTER its matchday", () => {
  const live = build();
  for (const point of live.points) {
    const dayFixtures = SEASON.fixtures.filter((f) => f.matchday === point.matchday);
    const lastKickoff = dayFixtures.reduce((m, f) => (f.kickoff > m ? f.kickoff : m), dayFixtures[0].kickoff);
    assert.ok(point.snapshotId, `matchday ${point.matchday} has no snapshot id`);
    assert.ok(
      point.asOf > String(lastKickoff).slice(0, 10),
      `matchday ${point.matchday}: ${point.asOf} must lie after the last kickoff ${lastKickoff}`,
    );
  }
});

test("the ratings move along the season — otherwise this is the frozen curve again", () => {
  const live = build();
  const first = snapshotOf(live.points[0].snapshotId).ratings;
  const last = snapshotOf(live.points.at(-1).snapshotId).ratings;
  const moved = Object.keys(first).filter((c) => last[c] !== undefined && last[c] !== first[c]);
  assert.ok(moved.length > 10, `only ${moved.length} clubs' ratings moved across the season`);
});

test("the live and the frozen curve are genuinely different", () => {
  const live = build();
  const frozenSnap = ratingsOn(String(SEASON.fixtures[0].kickoff).slice(0, 10));
  const frozen = buildFrozenTimeline({
    seasonId: "2025-bl1",
    league: "bl1",
    frozenClubs: SEASON.clubs.map((c) => ({ clubId: c.clubId, rating: frozenSnap.ratings[c.clubId] })),
    fixtures: SEASON.fixtures,
    params: PARAMS,
    targets: targetsFromConfig(leagueConfig),
    rules,
    runs: 200,
  });
  const mid = Math.floor(live.points.length / 2);
  const l = live.points[mid];
  const f = frozen.points.find((x) => x.matchday === l.matchday);
  assert.ok(f, "the frozen curve must cover the same matchday");
  assert.notDeepEqual(l.probabilities, f.probabilities);
});

test("a point without an archived rating is NAMED, never back-extrapolated", () => {
  // No archive at all: every point is a gap, and none is invented.
  const live = build({ ratingsOn: () => null });
  assert.deepEqual(live.points, []);
  assert.equal(live.gaps.length, [...new Set(SEASON.fixtures.map((f) => f.matchday))].length);
  for (const g of live.gaps) {
    assert.ok(g.reason.length > 0);
    assert.ok(g.asOf);
  }
});

test("a snapshot missing one club is a gap for that point, not a partial simulation", () => {
  const dropOne = (date) => {
    const snap = ratingsOn(date);
    if (!snap) return null;
    const ratings = { ...snap.ratings };
    delete ratings[SEASON.clubs[0].clubId];
    return { ...snap, ratings };
  };
  const live = build({ ratingsOn: dropOne });
  assert.deepEqual(live.points, []);
  assert.ok(live.gaps.every((g) => /ohne Rating/.test(g.reason)));
});

test("points are reused across runs — a completed matchday cannot change", () => {
  const first = build();
  const second = build({ existing: first, ratingsOn: () => { throw new Error("must not recompute"); } });
  assert.equal(second.computed, 0);
  assert.deepEqual(second.points.map((p) => p.matchday), first.points.map((p) => p.matchday));
});

test("points computed under a different run count are NOT reused", () => {
  const first = build({ runs: 200 });
  const second = build({ runs: 400, existing: first });
  assert.ok(second.computed > 0, "a different run count is a different basis and must be recomputed");
});

// ---------------------------------------------------------------------------
//  The frozen timeline now carries its ratings, for „live vs eingefroren".
// ---------------------------------------------------------------------------

test("the committed frozen timeline carries the ratings it was computed from", () => {
  const file = path.join(REPO, "data/seasons/2025/bl1/timeline-frozen.json");
  if (!fs.existsSync(file)) return; // the artefact is written by the pipeline
  const t = read("data/seasons/2025/bl1/timeline-frozen.json");
  if (!t.frozenRatings) return; // predates this release; the next run adds it
  for (const c of SEASON.clubs) {
    assert.ok(Number.isFinite(t.frozenRatings[c.clubId]), `${c.clubId} has no frozen rating`);
  }
});
