import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { predictFixture, scoredMatches, forecastCompletedSeason } from "../src/lib/season.js";

// ============================================================================
//  The consumer side of PREMATCH_FENSTER.
//
//  `prematch.json` has TWO jobs: it is the provenance record model quality
//  rests on, AND it is the only source of the per-fixture ratings every
//  prediction in the app is computed from. The first job alone would be served
//  by keeping entries for played matches only — and that is exactly the
//  "optimisation" that must never be made: `predictFixture` returns null
//  without an entry, and matchday tendencies, the scenario pre-fill with all
//  its presets, and `forecastCompletedSeason` all fall silent.
//
//  These tests are the permanent guard on that. They run against the COMMITTED
//  season, so removing future entries breaks them for real rather than in
//  theory.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

const PARAMS = read("data/season-params.json");

test("every fixture of the live season can be predicted — no entry, no forecast", () => {
  for (const league of ["bl1", "bl2"]) {
    const season = read(`data/seasons/2026/${league}/season.json`);
    const prematch = read(`data/seasons/2026/${league}/prematch.json`);

    const without = season.fixtures.filter((f) => !predictFixture(f, prematch, PARAMS, league));
    assert.equal(
      without.length,
      0,
      `${league}: ${without.length} fixture(s) without a prediction, first ${without[0]?.id} at ${without[0]?.kickoff}`,
    );
  }
});

test("the deterministic completion fills every open fixture", () => {
  const season = read("data/seasons/2026/bl1/season.json");
  const prematch = read("data/seasons/2026/bl1/prematch.json");

  const completed = forecastCompletedSeason(season, {}, prematch, PARAMS, "bl1");
  const open = completed.fixtures.filter((f) => f.gh === undefined || f.ga === undefined);
  assert.equal(open.length, 0, "the scenario final table would otherwise show a near-empty season");
});

// §5.3 stays intact under the rebuild rule: entries for fixtures that have not
// been played are model INPUT, never model EVIDENCE. Anchored, not assumed.
test("scoredMatches counts played fixtures only, however many entries exist", () => {
  const season = {
    clubs: [{ clubId: "A" }, { clubId: "B" }],
    fixtures: [
      { id: "played", matchday: 1, homeClubId: "A", awayClubId: "B", gh: 2, ga: 1, kickoff: "2026-08-28T18:30:00Z" },
      { id: "open", matchday: 2, homeClubId: "B", awayClubId: "A", kickoff: "2027-05-01T18:30:00Z" },
    ],
  };
  const prematch = {
    entries: [
      { fixtureId: "played", provenance: "contemporaneous", eloHome: 1800, eloAway: 1700 },
      { fixtureId: "open", provenance: "contemporaneous", eloHome: 1810, eloAway: 1690 },
    ],
  };

  const scored = scoredMatches(season, prematch, PARAMS, "bl1");
  assert.equal(scored.length, 1);
  assert.equal(scored[0].fixture.id, "played");
});
