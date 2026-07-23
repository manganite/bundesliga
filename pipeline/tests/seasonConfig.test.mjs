import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
//  Every committed season configuration, checked against itself.
//
//  The season config is where „every rule that has ever changed" lives, which
//  makes a MISSING field the dangerous case: code that falls back to a default
//  keeps running and quietly answers a different question. `playoffPlaces` is
//  exactly that — absent, the clinch logic declares „Klassenerhalt nicht mehr
//  möglich" while the play-off place is still reachable, and that statement is
//  issued as a mathematical guarantee.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const SEASONS = path.join(REPO, "data", "seasons");

const seasons = fs.existsSync(SEASONS)
  ? fs.readdirSync(SEASONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : [];

const configOf = (s) => JSON.parse(fs.readFileSync(path.join(SEASONS, s, "config.json"), "utf8"));

test("there are committed seasons to check — the scan must not pass by finding nothing", () => {
  assert.ok(seasons.length > 0, "no committed season configuration found");
});

test("every league declares its play-off places explicitly", () => {
  for (const s of seasons) {
    const config = configOf(s);
    for (const [league, lc] of Object.entries(config.leagues)) {
      assert.ok(
        Array.isArray(lc.playoffPlaces),
        `${s}/${league}: playoffPlaces is missing. An absent field reads as "no play-off", which is a `
          + "claim about the season — it has to be written down, including as an empty list.",
      );
      for (const place of lc.playoffPlaces) {
        assert.ok(Number.isInteger(place) && place >= 1 && place <= lc.clubCount, `${s}/${league}: ${place}`);
      }
    }
  }
});

test("a declared play-off place has a target of its own, so the app can name it", () => {
  for (const s of seasons) {
    const config = configOf(s);
    for (const [league, lc] of Object.entries(config.leagues)) {
      for (const place of lc.playoffPlaces) {
        const target = Object.values(lc.targets).find((t) => t.from === place && t.to === place);
        assert.ok(target, `${s}/${league}: place ${place} is a play-off place with no target to label it`);
      }
    }
  }
});

test("the season's play-off pairing matches the places the leagues declare", () => {
  for (const s of seasons) {
    const config = configOf(s);
    const po = config.relegationPlayoff;
    if (!po?.exists) {
      // A season without a play-off must not have any league claiming one.
      for (const [league, lc] of Object.entries(config.leagues)) {
        assert.deepEqual(lc.playoffPlaces, [], `${s}/${league}: no play-off this season, but places are declared`);
      }
      continue;
    }
    for (const spec of po.between) {
      const [league, place] = spec.split(":");
      assert.ok(
        config.leagues[league]?.playoffPlaces.includes(Number(place)),
        `${s}: relegationPlayoff.between says ${spec}, but ${league} does not list place ${place}`,
      );
    }
  }
});

test("the play-off block carries the fields the engine reads, with no silent defaults", () => {
  for (const s of seasons) {
    const po = configOf(s).relegationPlayoff;
    if (!po?.exists) continue;
    for (const field of [
      "between", "homeOrderRule", "awayGoalsApply", "lastSeasonWithAwayGoals", "firstSeasonWithout",
      "parameterLeague", "penaltyPrior", "extraTime",
    ]) {
      assert.ok(po[field] !== undefined, `${s}: relegationPlayoff.${field} is missing`);
    }
    // The dates may legitimately be unknown — but the KEY must be present, so
    // "not yet published" is distinguishable from "nobody thought about it".
    for (const field of ["playoffDates", "lastLeagueMatchdayDates", "lotDrawn"]) {
      assert.ok(field in po, `${s}: relegationPlayoff.${field} must be present, even as null`);
    }
    assert.ok(Object.is(po.extraTime.factor, 1 / 3), `${s}: ET factor must be exactly one third`);
    assert.equal(po.extraTime.applyDixonColes, false, `${s}: the ET phase carries no Dixon-Coles term`);
    assert.ok(["bl1", "bl2"].includes(po.parameterLeague), `${s}: parameterLeague`);
  }
});

test("the away-goals boundary is two explicit fields that do not contradict each other", () => {
  for (const s of seasons) {
    const po = configOf(s).relegationPlayoff;
    if (!po?.exists) continue;
    const last = Number(po.lastSeasonWithAwayGoals.slice(0, 4));
    const first = Number(po.firstSeasonWithout.slice(0, 4));
    assert.equal(first, last + 1, `${s}: the two boundary fields describe different boundaries`);
    const season = configOf(s).season;
    assert.equal(po.awayGoalsApply, season <= last, `${s}: awayGoalsApply contradicts the boundary`);
  }
});
