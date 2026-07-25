import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadRelegation, validateEntry, aggregateOf, relegationForSeason, BOUNDARIES } from "../src/relegation.mjs";

// ============================================================================
//  Relegation record (§V2b.1 G1). The curated results must be internally
//  consistent (aggregate = leg sum, the decision method matches the score) and
//  must agree with the OpenLigaDB anchors for the two seasons OpenLigaDB carries.
//  A wrong result here would put a false fact in the archive season balance.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const relegation = await loadRelegation(path.join(REPO, "data"));

test("every season 2011/12–2025/26 has both relegation boundaries", () => {
  for (let year = 2011; year <= 2025; year++) {
    const s = relegationForSeason(relegation, year);
    assert.ok(s, `season ${year} missing`);
    for (const b of BOUNDARIES) assert.ok(s[b], `season ${year} missing ${b}`);
  }
});

test("loadRelegation already validated every entry — aggregate, winner, decision method", () => {
  // loadRelegation throws on any inconsistency, so reaching here means all 30
  // entries are internally consistent. Re-assert a couple of tricky ones.
  const awayGoals = relegation.seasons["2018"]["bl1-bl2"]; // Stuttgart–Union, 2:2, Union on away goals
  assert.equal(awayGoals.decidedBy, "awayGoals");
  const { goalsA, goalsB } = aggregateOf(awayGoals);
  assert.equal(goalsA, goalsB, "an away-goals tie must be level on aggregate");
  assert.equal(awayGoals.winner, "1. FC Union Berlin");

  const penalties = relegation.seasons["2023"]["bl1-bl2"]; // Bochum–Düsseldorf, 3:3, Bochum on penalties
  assert.equal(penalties.decidedBy, "penalties");
  assert.equal(penalties.winner, "VfL Bochum");
});

test("the OpenLigaDB anchors match: 2024/25 and 2025/26 BL1/BL2", () => {
  // These two are the ground truth from OpenLigaDB rel/2024 and rel/2025.
  const a = relegation.seasons["2024"]["bl1-bl2"];
  assert.deepEqual(a.legs, [
    { home: "1. FC Heidenheim", away: "SV Elversberg", gh: 2, ga: 2 },
    { home: "SV Elversberg", away: "1. FC Heidenheim", gh: 1, ga: 2 },
  ]);
  assert.equal(a.winner, "1. FC Heidenheim");

  const b = relegation.seasons["2025"]["bl1-bl2"];
  assert.deepEqual(b.legs, [
    { home: "VfL Wolfsburg", away: "SC Paderborn 07", gh: 0, ga: 0 },
    { home: "SC Paderborn 07", away: "VfL Wolfsburg", gh: 2, ga: 1 },
  ]);
  assert.equal(b.winner, "SC Paderborn 07");
});

test("validateEntry is fail-closed on a wrong aggregate", () => {
  assert.throws(() => validateEntry("test", "bl1-bl2", {
    legs: [{ home: "A", away: "B", gh: 1, ga: 0 }, { home: "B", away: "A", gh: 0, ga: 0 }],
    aggregate: "9:9", decidedBy: "regular", winner: "A", loser: "B", source: "x",
  }), /aggregate 9:9 ≠ leg sum 1:0/);
});

test("validateEntry is fail-closed when the decision method contradicts the score", () => {
  // Level aggregate but claimed decided „regular" (goals) → must throw.
  assert.throws(() => validateEntry("test", "bl2-3liga", {
    legs: [{ home: "A", away: "B", gh: 1, ga: 1 }, { home: "B", away: "A", gh: 0, ga: 0 }],
    aggregate: "1:1", decidedBy: "regular", winner: "A", loser: "B", source: "x",
  }), /winner does not lead/);
});

test("validateEntry is fail-closed when leg 2 is not the reverse fixture", () => {
  assert.throws(() => validateEntry("test", "bl1-bl2", {
    legs: [{ home: "A", away: "B", gh: 1, ga: 0 }, { home: "A", away: "C", gh: 0, ga: 0 }],
    aggregate: "1:0", decidedBy: "regular", winner: "A", loser: "B", source: "x",
  }), /leg 2 .* is not the reverse of leg 1/);
});

test("every entry cites a source", () => {
  for (const boundaries of Object.values(relegation.seasons)) {
    for (const b of BOUNDARIES) assert.ok(boundaries[b].source, `${b} lacks a source`);
  }
});
