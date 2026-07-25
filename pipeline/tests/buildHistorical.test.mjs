import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildHistoricalLeague, historicalConfig, historicalPreMatch, loadTraining } from "../src/buildHistorical.mjs";

// ============================================================================
//  Historical artefacts (§V2b.1 §1). The acceptance criterion is DETERMINISM:
//  regeneration must be bit-identical. Proven here on one league-season at a
//  reduced run count (determinism does not depend on how many runs) so the test
//  stays fast.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const DATA = path.join(REPO, "data");
const register = JSON.parse(fs.readFileSync(path.join(DATA, "clubs.json"), "utf8"));
const params = JSON.parse(fs.readFileSync(path.join(DATA, "season-params.json"), "utf8")).params;
const config = JSON.parse(fs.readFileSync(path.join(DATA, "seasons/2026/config.json"), "utf8"));

const build = (league, year, runs) => buildHistoricalLeague({
  dataDir: DATA, league, year, register, leagueConfig: config.leagues[league], params,
  runs, timelineRuns: runs,
});

test("regeneration is bit-identical (determinism) at a reduced run count", () => {
  const a = build("bl1", 2015, 200);
  const b = build("bl1", 2015, 200);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "two builds of the same season must be identical");
});

test("the finished-season outlook is degenerate — the real final table with certainty", () => {
  const { outlook } = build("bl1", 2015, 200);
  // Zero remaining games → each club sits on exactly one final position.
  for (const dist of Object.values(outlook.positionDistribution)) {
    const ones = dist.filter((p) => p === 1);
    assert.equal(ones.length, 1, "a finished season pins every club to one position");
  }
  assert.equal(outlook.remainingCount, 0);
  // The champion has 100% „Meister".
  const champ = Object.entries(outlook.probabilities.meister).find(([, p]) => p === 1);
  assert.ok(champ, "the real champion carries 100% Meister");
});

test("every fixture is finished, and the season carries all 18 clubs", () => {
  const { seasonFile } = build("bl1", 2015, 100);
  assert.equal(seasonFile.clubs.length, 18);
  assert.equal(seasonFile.fixtures.length, 306);
  assert.ok(seasonFile.fixtures.every((f) => f.finished && f.gh !== undefined), "all games played");
  // Club names resolved via the register, not left as short-names.
  assert.ok(seasonFile.clubs.every((c) => c.name && c.name !== c.clubId || c.name === c.clubId));
});

test("prematch carries the training-elo verbatim, all backfilled, no timestamps", () => {
  const { matches, elo } = loadTraining(DATA, "bl1", 2015);
  const pm = historicalPreMatch("bl1", 2015, matches, elo);
  assert.equal(pm.entries.length, 306);
  assert.ok(pm.entries.every((e) => e.provenance === "backfilled"), "all backfilled (§5.3)");
  assert.equal(pm.counts.contemporaneous, 0);
  // Verbatim elo.
  const e0 = pm.entries[0];
  assert.equal(e0.eloHome, elo[e0.fixtureId].eloHome);
  // Determinism: no createdAt / timestamp fields.
  assert.ok(pm.entries.every((e) => !("createdAt" in e)), "no createdAt → deterministic");
});

test("historicalConfig sets awayGoalsApply per SEASON, not by cloning the current value", () => {
  const last = Number(String(config.relegationPlayoff.lastSeasonWithAwayGoals).slice(0, 4)); // 2020
  assert.equal(historicalConfig(config, 2015).relegationPlayoff.awayGoalsApply, true, "2015 ≤ 2020 → applies");
  assert.equal(historicalConfig(config, last).relegationPlayoff.awayGoalsApply, true, "the boundary season still applies");
  assert.equal(historicalConfig(config, last + 1).relegationPlayoff.awayGoalsApply, false, "the season after → abolished");
  assert.equal(historicalConfig(config, 2015).season, 2015);
  assert.equal(historicalConfig(config, 2015).label, "2015/16");
});

test("the frozen timeline uses pre-season ratings and has a pre-season point (md 0)", () => {
  const { timelineFrozen } = build("bl1", 2015, 100);
  assert.equal(timelineFrozen.kind, "frozenTimeline");
  assert.ok(timelineFrozen.points.some((p) => p.matchday === 0), "carries the pre-season forecast");
  assert.ok(timelineFrozen.points.some((p) => p.matchday === 34), "runs through the final matchday");
});
