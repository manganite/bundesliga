import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPlayoffArtefact, lastLeagueMatchDates } from "../src/playoffArtefact.mjs";

// ============================================================================
//  The play-off artefact: one simulation, two league views.
//
//  Built on a deliberately tiny synthetic pair of leagues (three clubs each) so
//  the arithmetic can be checked by hand. The engine-level contract — the
//  complement, the key namespace, the ET model — is pinned in
//  packages/engine/tests/playoff.test.mjs; what is checked here is the wiring:
//  that both views read the SAME pairing numbers and that the totals compose.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const PARAMS = JSON.parse(fs.readFileSync(path.join(REPO, "data", "season-params.json"), "utf8")).params;
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(REPO, "data", "seasons", "2026", "config.json"), "utf8"),
);

/** A three-club league whose position distribution is stated outright. */
function outlook(league, dist) {
  return {
    league,
    clubs: Object.keys(dist),
    positionDistribution: dist,
  };
}

const BL1 = outlook("bl1", {
  // rows are P(rank 1), P(rank 2), P(rank 3) — here rank 3 stands in for "16th"
  "bl1-a": [0.7, 0.2, 0.1],
  "bl1-b": [0.2, 0.5, 0.3],
  "bl1-c": [0.1, 0.3, 0.6],
});
const BL2 = outlook("bl2", {
  "bl2-x": [0.6, 0.3, 0.1],
  "bl2-y": [0.3, 0.4, 0.3],
  "bl2-z": [0.1, 0.3, 0.6],
});

const RATINGS = {
  "bl1-a": 1650, "bl1-b": 1600, "bl1-c": 1550,
  "bl2-x": 1560, "bl2-y": 1530, "bl2-z": 1500,
};

// Three clubs, so "16th" is place 3 and the BL2 play-off place is place 3 too.
const PLAYOFF_CONFIG = { ...CONFIG.relegationPlayoff, between: ["bl1:3", "bl2:3"] };

const FIXTURES = {
  bl1: [
    { kickoff: "2027-05-15T15:30:00Z", homeClubId: "bl1-a", awayClubId: "bl1-b" },
    { kickoff: "2027-05-22T15:30:00Z", homeClubId: "bl1-b", awayClubId: "bl1-c" },
    { kickoff: "2027-05-22T15:30:00Z", homeClubId: "bl1-a", awayClubId: "bl1-c" },
  ],
  bl2: [
    { kickoff: "2027-05-16T13:30:00Z", homeClubId: "bl2-x", awayClubId: "bl2-y" },
    { kickoff: "2027-05-23T13:30:00Z", homeClubId: "bl2-y", awayClubId: "bl2-z" },
    { kickoff: "2027-05-23T13:30:00Z", homeClubId: "bl2-x", awayClubId: "bl2-z" },
  ],
};

const build = (over = {}) => buildPlayoffArtefact({
  season: 2026,
  playoffConfig: PLAYOFF_CONFIG,
  outlooks: { bl1: BL1, bl2: BL2 },
  fixtures: FIXTURES,
  ratings: RATINGS,
  params: PARAMS,
  runs: 2000,
  ...over,
});

// ---------------------------------------------------------------------------

test("every pairing is present — the sum over opponents is not pruned", () => {
  const a = build();
  assert.equal(a.pairings.length, 9);
  assert.equal(new Set(a.pairings.map((p) => `${p.bl1Club}|${p.bl2Club}`)).size, 9);
});

test("both leagues are named on every pairing row", () => {
  for (const p of build().pairings) {
    assert.ok(p.bl1Club.startsWith("bl1-"), `${p.bl1Club} is not marked as the Bundesliga side`);
    assert.ok(p.bl2Club.startsWith("bl2-"), `${p.bl2Club} is not marked as the 2.-Liga side`);
  }
});

test("the two sides of a pairing are exact complements", () => {
  for (const p of build().pairings) {
    assert.ok(Object.is(p.pBl2Wins, 1 - p.pBl1Wins), `${p.bl1Club} vs ${p.bl2Club}`);
  }
});

test("Klassenerhalt lies between the safe places and the safe places plus the play-off", () => {
  const a = build();
  for (const [club, v] of Object.entries(a.bl1)) {
    assert.ok(v.pKlassenerhalt > v.pSafe, `${club}: the play-off must add something`);
    assert.ok(v.pKlassenerhalt < v.pSafe + v.pRelegationPlayoff, `${club}: it cannot add more than the place`);
  }
});

test("Klassenerhalt is exactly pSafe + P(16.) · Σ_j P(j 3.) · P(i schlägt j)", () => {
  const a = build();
  const byPair = new Map(a.pairings.map((p) => [`${p.bl1Club}|${p.bl2Club}`, p]));
  for (const [club, v] of Object.entries(a.bl1)) {
    let via = 0;
    for (const o of BL2.clubs) via += BL2.positionDistribution[o][2] * byPair.get(`${club}|${o}`).pBl1Wins;
    assert.ok(Math.abs(v.pKlassenerhalt - (v.pSafe + v.pRelegationPlayoff * via)) < 1e-15, club);
  }
});

test("Aufstieg is the same computation from the other side, on the same numbers", () => {
  const a = build();
  const byPair = new Map(a.pairings.map((p) => [`${p.bl1Club}|${p.bl2Club}`, p]));
  for (const [club, v] of Object.entries(a.bl2)) {
    let via = 0;
    // Note the complement: the BL2 view never simulates anything of its own.
    for (const o of BL1.clubs) via += BL1.positionDistribution[o][2] * (1 - byPair.get(`${o}|${club}`).pBl1Wins);
    assert.ok(Math.abs(v.pAufstieg - (v.pDirect + v.pPlayoffPlace * via)) < 1e-15, club);
  }
});

test("the play-off win probability is an average over opponents, never a sum", () => {
  const a = build();
  // Σ_j P(j auf 3.) = 1 across the league, so pWinsPlayoff must sit inside the
  // range of the individual pairing probabilities.
  const byPair = new Map(a.pairings.map((p) => [`${p.bl1Club}|${p.bl2Club}`, p]));
  for (const [club, v] of Object.entries(a.bl1)) {
    const ps = BL2.clubs.map((o) => byPair.get(`${club}|${o}`).pBl1Wins);
    assert.ok(v.pWinsPlayoff >= Math.min(...ps) - 1e-12 && v.pWinsPlayoff <= Math.max(...ps) + 1e-12, club);
  }
  const massBl2 = BL2.clubs.reduce((s, c) => s + BL2.positionDistribution[c][2], 0);
  assert.ok(Math.abs(massBl2 - 1) < 1e-12, "the third-place mass must sum to 1 or the average is not one");
});

test("the stronger Bundesliga club fares better in the play-off", () => {
  const a = build();
  assert.ok(a.bl1["bl1-a"].pWinsPlayoff > a.bl1["bl1-c"].pWinsPlayoff);
  assert.ok(a.bl2["bl2-x"].pWinsPlayoff > a.bl2["bl2-z"].pWinsPlayoff);
});

// ---------------------------------------------------------------------------
//  The home order.
// ---------------------------------------------------------------------------

test("the last league match date comes from the schedule the app already has", () => {
  const d = lastLeagueMatchDates(FIXTURES.bl1);
  assert.deepEqual(d, { "bl1-a": "2027-05-22", "bl1-b": "2027-05-22", "bl1-c": "2027-05-22" });
});

test("the season configuration may override a derived date, and the artefact says which was used", () => {
  const d = lastLeagueMatchDates(FIXTURES.bl1, { "bl1-a": "2027-05-19" });
  assert.equal(d["bl1-a"], "2027-05-19");
  assert.equal(d["bl1-b"], "2027-05-22");
  assert.equal(build().homeOrder.lastMatchDatesFrom, "the fetched schedule");
  assert.equal(
    build({ playoffConfig: { ...PLAYOFF_CONFIG, lastLeagueMatchdayDates: { "bl1-a": "2027-05-19" } } })
      .homeOrder.lastMatchDatesFrom,
    "season configuration",
  );
});

test("without a published first-leg date every pairing is a 50/50 mixture, and is marked as one", () => {
  const a = build();
  assert.equal(a.homeOrder.firstLegDate, null);
  assert.equal(a.homeOrder.mixedPairings, 9);
  assert.equal(a.homeOrder.totalPairings, 9);
  for (const p of a.pairings) {
    assert.equal(p.homeOrderMixed, true);
    assert.equal(p.hostsSecondLeg, null);
    assert.equal(p.homeOrderBasis, "dates unknown");
  }
});

test("once the first leg is dated the order is derived — the 2.-Liga club hosts the second leg", () => {
  // BL1's last matchday is the Saturday, BL2's the Sunday: the 2.-Liga club has
  // the shorter break and therefore hosts the second leg. The real-world case.
  const a = build({
    playoffConfig: { ...PLAYOFF_CONFIG, playoffDates: { firstLeg: "2027-05-27", secondLeg: "2027-05-31" } },
  });
  assert.equal(a.homeOrder.mixedPairings, 0);
  for (const p of a.pairings) {
    assert.equal(p.hostsSecondLeg, "bl2", `${p.bl1Club} vs ${p.bl2Club}`);
    assert.equal(p.homeOrderMixed, false);
    assert.deepEqual(p.restDays, { A: 4, B: 3 });
  }
});

test("a drawn lot applies to its own pairing and to no other", () => {
  const dated = { ...PLAYOFF_CONFIG, playoffDates: { firstLeg: "2027-05-26" } };
  // On that date both sides have the same break, so the rule ties everywhere.
  const tie = build({ playoffConfig: { ...dated, lastLeagueMatchdayDates: { "bl2-y": "2027-05-22" } } });
  const tied = tie.pairings.filter((p) => p.bl2Club === "bl2-y");
  assert.ok(tied.every((p) => p.homeOrderMixed), "an untied lot leaves the order a mixture");

  const drawn = build({
    playoffConfig: {
      ...dated,
      lastLeagueMatchdayDates: { "bl2-y": "2027-05-22" },
      lotDrawn: { bl1Club: "bl1-c", bl2Club: "bl2-y", hostsSecondLeg: "bl1" },
    },
  });
  const one = drawn.pairings.find((p) => p.bl1Club === "bl1-c" && p.bl2Club === "bl2-y");
  assert.equal(one.hostsSecondLeg, "bl1");
  assert.equal(one.homeOrderBasis, "lot");
  assert.equal(one.homeOrderMixed, false);
  const others = drawn.pairings.filter((p) => p !== one && p.bl2Club === "bl2-y");
  assert.ok(others.every((p) => p.homeOrderMixed), "the lot must not leak into other pairings");
});

// ---------------------------------------------------------------------------
//  What the artefact refuses to claim.
// ---------------------------------------------------------------------------

test("a season without a play-off says so instead of leaving the artefact out", () => {
  const a = build({ playoffConfig: { ...PLAYOFF_CONFIG, exists: false } });
  assert.equal(a.exists, false);
  assert.deepEqual(a.pairings, []);
  assert.match(a.reason, /keine Relegation/);
});

test("the marginal approximation and the 3.-Liga gap are recorded in the artefact itself", () => {
  const a = build();
  assert.match(a.approximation, /Marginalnäherung/);
  assert.match(a.approximation, /RATING_SIGMA/);
  assert.match(a.notComputed.bl2Relegation, /3\. Liga/);
});

test("the artefact records the versions it was produced under", () => {
  const a = build();
  assert.equal(typeof a.engineVersion, "number");
  assert.equal(typeof a.simulationProtocolVersion, "number");
  assert.equal(a.runs, 2000);
  assert.equal(a.parameterLeague, "bl1");
  assert.equal(a.awayGoalsApply, false);
});

test("a malformed `between` fails loudly rather than guessing the places", () => {
  assert.throws(() => build({ playoffConfig: { ...PLAYOFF_CONFIG, between: ["bl1:16"] } }), /bl1\/bl2 pair/);
  assert.throws(() => build({ playoffConfig: { ...PLAYOFF_CONFIG, between: ["16", "3"] } }), /is not/);
  assert.throws(
    () => build({ playoffConfig: { ...PLAYOFF_CONFIG, between: ["bl2:3", "bl1:16"] } }),
    /bl1\/bl2 pair/,
  );
});

test("the artefact is deterministic — the same data state gives the same file", () => {
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});
