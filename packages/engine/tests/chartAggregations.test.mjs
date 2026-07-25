import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { zonePartition, cumulativeSeries, brierScore, logLoss, accuracy } from "../src/metrics.mjs";

// ============================================================================
//  CHART_AUSBAU — the two allowed engine additions: pure aggregations over
//  values that already exist. §2.1 zonePartition, §4.2 cumulativeSeries.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const targetList = (targets) => Object.entries(targets).map(([id, t]) => ({ id, ...t }));
const CONFIG = read("data/seasons/2026/config.json");

// ---------------------------------------------------------------------------
//  §2.1 zonePartition — disjoint bands summing to 1.
// ---------------------------------------------------------------------------

test("BL1: the bands are Meister · Platz 2–4 · Platz 5–6 · Mittelfeld · Relegationsplatz · Abstieg", () => {
  const zones = targetList(CONFIG.leagues.bl1.targets);
  const prob = { meister: 0.3, platz1bis4: 0.6, platz5bis6: 0.1, relegationsplatz: 0.05, abstieg: 0.02, klassenerhalt: 0.93 };
  const bands = zonePartition(prob, zones);
  assert.deepEqual(bands.map((b) => b.label), ["Meister", "Platz 2–4", "Platz 5–6", "Mittelfeld", "Relegationsplatz", "Abstieg"]);
  // Platz 2–4 is the nesting subtraction P(1–4) − P(Meister).
  const p24 = bands.find((b) => b.label === "Platz 2–4");
  assert.ok(Math.abs(p24.value - (0.6 - 0.3)) < 1e-12);
  // Mittelfeld is the remainder that fills ranks 7–15.
  const mid = bands.find((b) => b.id === "mittelfeld");
  assert.deepEqual([mid.from, mid.to], [7, 15]);
  assert.ok(Math.abs(mid.value - (1 - (0.3 + 0.3 + 0.1 + 0.05 + 0.02))) < 1e-12);
});

test("BL2: analog from its own target config — Aufstieg · Relegationsplatz (3.) · Mittelfeld · Relegationsplatz (16.) · Abstieg", () => {
  const zones = targetList(CONFIG.leagues.bl2.targets);
  const prob = { aufstieg: 0.5, relegationsplatzAufstieg: 0.1, relegationsplatzAbstieg: 0.05, abstieg: 0.03, klassenerhalt: 0.9 };
  const bands = zonePartition(prob, zones);
  assert.deepEqual(bands.map((b) => b.id), ["aufstieg", "relegationsplatzAufstieg", "mittelfeld", "relegationsplatzAbstieg", "abstieg"]);
  const mid = bands.find((b) => b.id === "mittelfeld");
  assert.deepEqual([mid.from, mid.to], [4, 15]);
});

test("the bands sum to 1 for every club of a real outlook — both leagues (float tolerance only)", () => {
  for (const lg of ["bl1", "bl2"]) {
    const outlook = read(`data/seasons/2026/${lg}/outlook.json`);
    const season = read(`data/seasons/2026/${lg}/season.json`);
    const zones = targetList(CONFIG.leagues[lg].targets);
    for (const club of season.clubs) {
      const prob = {};
      for (const z of zones) prob[z.id] = outlook.probabilities?.[z.id]?.[club.clubId] ?? 0;
      const bands = zonePartition(prob, zones);
      const total = bands.reduce((s, b) => s + b.value, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `${lg}/${club.clubId}: bands sum to ${total}, not 1`);
    }
  }
});

test("no band is ever the broad Klassenerhalt catch-all", () => {
  const zones = targetList(CONFIG.leagues.bl1.targets);
  const bands = zonePartition({ meister: 0.1, platz1bis4: 0.2, platz5bis6: 0.1, relegationsplatz: 0.05, abstieg: 0.05, klassenerhalt: 0.9 }, zones);
  assert.ok(!bands.some((b) => b.id === "klassenerhalt"));
});

// ---------------------------------------------------------------------------
//  §4.2 cumulativeSeries — last cumulative point ≡ the „Gesamt" figure.
// ---------------------------------------------------------------------------

const H = { homeWin: 1, draw: 0, awayWin: 0 };
const scoredFixture = (matchday, prediction, actual) => ({ fixture: { matchday }, prediction, actual });

const SCORED = [
  scoredFixture(1, { homeWin: 0.6, draw: 0.25, awayWin: 0.15 }, "homeWin"),
  scoredFixture(1, { homeWin: 0.4, draw: 0.3, awayWin: 0.3 }, "awayWin"),
  scoredFixture(2, { homeWin: 0.5, draw: 0.3, awayWin: 0.2 }, "draw"),
  scoredFixture(3, { homeWin: 0.7, draw: 0.2, awayWin: 0.1 }, "homeWin"),
  scoredFixture(3, { homeWin: 0.33, draw: 0.34, awayWin: 0.33 }, "awayWin"),
];

for (const [name, metric] of [["brier", brierScore], ["log-loss", logLoss], ["accuracy", accuracy]]) {
  test(`the last cumulative ${name} point equals the metric over the whole set`, () => {
    const series = cumulativeSeries(SCORED, metric);
    const whole = metric(SCORED).value;
    assert.ok(Math.abs(series.at(-1).cumulative - whole) < 1e-12, `${name}: ${series.at(-1).cumulative} vs Gesamt ${whole}`);
  });
}

test("per-matchday points fold only that matchday; cumulative counts grow", () => {
  const series = cumulativeSeries(SCORED, brierScore);
  assert.deepEqual(series.map((p) => p.matchday), [1, 2, 3]);
  assert.deepEqual(series.map((p) => p.n), [2, 1, 2]);
  assert.deepEqual(series.map((p) => p.cumulativeN), [2, 3, 5]);
  // The matchday-1 point equals brier over just matchday 1's two matches.
  const md1 = brierScore(SCORED.filter((s) => s.fixture.matchday === 1)).value; // matchday-1 only
  assert.ok(Math.abs(series[0].matchdayValue - md1) < 1e-12);
});

test("records without a matchday are skipped, not counted", () => {
  const series = cumulativeSeries([...SCORED, { prediction: H, actual: "home" }], accuracy);
  assert.deepEqual(series.map((p) => p.cumulativeN).at(-1), 5);
});
