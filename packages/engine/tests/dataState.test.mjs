import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDataUpdatedAt, overdueResults, stalenessWarning, seasonPhase,
  SEASON_PHASE_LABEL, configStampWarning, DEFAULT_GRACE_HOURS,
} from "../src/dataState.mjs";

const NOW = new Date("2026-09-05T20:00:00Z");

test("Datenstand is stated neutrally, with no health claim", () => {
  const s = formatDataUpdatedAt("2026-09-05T04:00:00Z");
  assert.match(s, /^Datenstand: /);
  assert.doesNotMatch(s, /Fehler|veraltet|Workflow|aktualisiert seit/);
});

test("a missing or unparseable timestamp does not fabricate one", () => {
  assert.match(formatDataUpdatedAt(null), /unbekannt/);
  assert.match(formatDataUpdatedAt("nonsense"), /unbekannt/);
});

// §5.1: an old dataUpdatedAt is NORMAL during an international break and all
// off-season. Nothing in this module may treat its age as evidence.
test("the age of dataUpdatedAt is never itself a staleness signal", () => {
  const fixtures = [
    { id: "m1", kickoff: "2026-10-20T18:30:00Z" }, // still in the future
  ];
  // Data untouched for six weeks, but no fixture is overdue: nothing to warn about.
  assert.equal(stalenessWarning(fixtures, NOW, DEFAULT_GRACE_HOURS), null);
});

test("a result missing past the grace period is the one honest warning", () => {
  const fixtures = [
    { id: "m1", kickoff: "2026-09-05T13:30:00Z", homeName: "FC Bayern München", awayName: "VfB Stuttgart" },
  ];
  const w = stalenessWarning(fixtures, NOW, 6);
  assert.ok(w, "6.5 hours after kickoff with no result should warn");
  assert.match(w.text, /FC Bayern München – VfB Stuttgart/);
  assert.match(w.text, /steht noch aus/);
  assert.match(w.text, /möglicherweise veraltet/);
  // The wording must not claim to know WHY — postponement, outage and workflow
  // failure are indistinguishable from the committed data.
  assert.doesNotMatch(w.text, /Workflow|Pipeline|Fehler|Ausfall/);
});

test("a fixture inside the grace period does not warn yet", () => {
  const fixtures = [{ id: "m1", kickoff: "2026-09-05T17:30:00Z" }];
  assert.equal(stalenessWarning(fixtures, NOW, 6), null);
});

test("a played fixture never counts as overdue", () => {
  const fixtures = [{ id: "m1", kickoff: "2026-09-01T13:30:00Z", gh: 2, ga: 1 }];
  assert.deepEqual(overdueResults(fixtures, NOW), []);
});

test("several overdue results are summarised, oldest first", () => {
  const fixtures = [
    { id: "m2", kickoff: "2026-09-05T11:30:00Z", homeName: "B", awayName: "C" },
    { id: "m1", kickoff: "2026-09-04T13:30:00Z", homeName: "A", awayName: "D" },
  ];
  const w = stalenessWarning(fixtures, NOW, 6);
  assert.equal(w.count, 2);
  assert.equal(w.fixtures[0].id, "m1", "oldest first");
  assert.match(w.text, /A – D/);
  assert.match(w.text, /1 weiteren/);
});

test("the grace period is configurable", () => {
  const fixtures = [{ id: "m1", kickoff: "2026-09-05T13:30:00Z" }];
  assert.equal(stalenessWarning(fixtures, NOW, 12), null);
  assert.ok(stalenessWarning(fixtures, NOW, 2));
});

// §5.5: the off-season must not break the app.
test("season phase covers pre-season, in-season and finished", () => {
  const none = [];
  const pre = [{ id: "a", kickoff: "x" }, { id: "b", kickoff: "y" }];
  const mid = [{ id: "a", kickoff: "x", gh: 1, ga: 0 }, { id: "b", kickoff: "y" }];
  const done = [{ id: "a", kickoff: "x", gh: 1, ga: 0 }, { id: "b", kickoff: "y", gh: 2, ga: 2 }];

  assert.equal(seasonPhase(none), "noFixtures");
  assert.equal(seasonPhase(pre), "preSeason");
  assert.equal(seasonPhase(mid), "inSeason");
  assert.equal(seasonPhase(done), "finished");
  assert.equal(SEASON_PHASE_LABEL.finished, "Saison beendet");
  assert.equal(SEASON_PHASE_LABEL.inSeason, null, "a running season needs no banner");
});

test("a season-config stamp mismatch warns visibly", () => {
  assert.equal(configStampWarning({ season: 2026 }, 2026), null);
  const w = configStampWarning({ season: 2025 }, 2026);
  assert.match(w, /2025/);
  assert.match(w, /2026/);
  assert.match(configStampWarning({}, 2026), /keinen Saisonstempel/);
});
