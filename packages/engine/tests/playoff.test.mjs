import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  pairingProbability, secondLegHost, awayGoalsApply, complementOf,
  survivalProbability, promotionProbability, PLAYOFF_CONTEXT,
} from "../src/playoff.mjs";
import { makeKeyBase, uniform01, ratingNoise } from "../src/rng.mjs";
import { effectiveParams, eloToLambdas } from "../src/model.mjs";
import { drawScorelineDirect } from "../src/simulate.mjs";

// ============================================================================
//  §6 — the relegation play-off.
//
//  The load-bearing test here is the REFERENCE REPLAY below: it re-derives the
//  win count from the primitives, so the ET rates, the once-per-club noise and
//  the leg order are all pinned by construction rather than by inspection. Each
//  variant that gets a detail wrong is run too, and must DISAGREE — a test that
//  cannot fail proves nothing.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const PARAMS = JSON.parse(fs.readFileSync(path.join(REPO, "data", "season-params.json"), "utf8")).params;
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(REPO, "data", "seasons", "2026", "config.json"), "utf8"),
);
const PLAYOFF = CONFIG.relegationPlayoff;

const SEASON = 2026;
// Deliberately close in strength: level aggregates are then common, so extra
// time and penalties are actually exercised rather than being dead code that
// the tests never reach.
const BASE = {
  seasonId: SEASON, clubA: "bl1-hertha", clubB: "bl2-fortuna",
  ratingA: 1600, ratingB: 1560, params: PARAMS, playoffConfig: PLAYOFF, runs: 4000,
};

// ---------------------------------------------------------------------------
//  The complement — named explicitly in the brief and asserted EXACTLY.
// ---------------------------------------------------------------------------

test("P(j schlägt i) = 1 − P(i schlägt j), bit for bit, not within Monte-Carlo error", () => {
  const ij = pairingProbability(BASE);
  const ji = pairingProbability({
    ...BASE, clubA: BASE.clubB, clubB: BASE.clubA, ratingA: BASE.ratingB, ratingB: BASE.ratingA,
  });
  assert.ok(Object.is(ji.pAWins, complementOf(ij.pAWins)), `${ji.pAWins} vs ${complementOf(ij.pAWins)}`);
  assert.ok(Object.is(ij.pAWins, complementOf(ji.pAWins)));
  assert.equal(ij.pairingId, ji.pairingId, "one pairing, one identity — argument order is not part of it");
});

test("the complement holds under a fixed home order too, once the sides are swapped with it", () => {
  const ij = pairingProbability({ ...BASE, hostRule: { host: "A", basis: "lot" } });
  const ji = pairingProbability({
    ...BASE, clubA: BASE.clubB, clubB: BASE.clubA, ratingA: BASE.ratingB, ratingB: BASE.ratingA,
    hostRule: { host: "B", basis: "lot" }, // the same club still hosts the second leg
  });
  assert.ok(Object.is(ji.pAWins, complementOf(ij.pAWins)));
  assert.equal(ij.hostSecondLeg, "A");
  assert.equal(ji.hostSecondLeg, "B");
});

test("the complement is not trivially true — the two sides do differ", () => {
  const ij = pairingProbability(BASE);
  assert.ok(ij.pAWins > 0.5 && ij.pAWins < 1, `expected a favourite, got ${ij.pAWins}`);
});

test("the pairing is decisive in every run — the two win counts sum to `runs`", () => {
  const ij = pairingProbability(BASE);
  const ji = pairingProbability({
    ...BASE, clubA: BASE.clubB, clubB: BASE.clubA, ratingA: BASE.ratingB, ratingB: BASE.ratingA,
  });
  assert.equal(Math.round((ij.pAWins + ji.pAWins) * BASE.runs), BASE.runs);
});

test("a club cannot play itself", () => {
  assert.throws(() => pairingProbability({ ...BASE, clubB: BASE.clubA }), /two clubs/);
});

// ---------------------------------------------------------------------------
//  Its own random-key namespace.
// ---------------------------------------------------------------------------

test("play-off keys live in their own namespace and cannot collide with league keys", () => {
  const ids = ["bl1-hertha", "bl2-fortuna", "bl1-hertha|bl2-fortuna|pairing"];
  const kinds = ["noise", "decider", "scoreline", "leg1", "leg2", "et", "pens", "homeOrder"];
  const league = [], playoff = [];
  for (const id of ids) {
    for (const drawKind of kinds) {
      league.push(makeKeyBase({ seasonId: SEASON, context: "league", id, drawKind }));
      playoff.push(makeKeyBase({ seasonId: SEASON, context: PLAYOFF_CONTEXT, id, drawKind }));
    }
  }
  const shared = league.filter((k) => playoff.includes(k));
  assert.deepEqual(shared, [], "a play-off draw would share a stream with a league draw");
  assert.equal(PLAYOFF_CONTEXT, "playoff");
});

test("the pairing's own draw kinds are distinct", () => {
  const keys = ["noise", "leg1", "leg2", "et", "pens", "homeOrder"].map((drawKind) =>
    makeKeyBase({ seasonId: SEASON, context: PLAYOFF_CONTEXT, id: "a|b|pairing", drawKind }));
  assert.equal(new Set(keys).size, keys.length);
});

test("two different pairings draw different numbers", () => {
  const a = pairingProbability(BASE);
  const b = pairingProbability({ ...BASE, clubB: "bl2-elversberg" });
  assert.notEqual(a.pAWins, b.pAWins);
});

// ---------------------------------------------------------------------------
//  THE REFERENCE REPLAY.
//
//  Rebuilds the play-off from the primitives under the contract of §6, and four
//  variants that each break one clause of it. The correct replay must match the
//  engine exactly; every variant must not.
// ---------------------------------------------------------------------------

const MIN_LAMBDA = 0.12;

/**
 * @param {object} o
 * @param {boolean} [o.noisePerLeg]  break: redraw RATING_SIGMA for the second leg
 * @param {boolean} [o.etFromLeg1]   break: take the ET rates from the first leg
 * @param {boolean} [o.etNoHomeAdv]  break: drop HOME_ADV from the ET rates
 * @param {boolean} [o.etWithDc]     break: keep the Dixon-Coles term in ET
 */
function replay({
  noisePerLeg = false, etFromLeg1 = false, etNoHomeAdv = false, etWithDc = false,
  fromRun = 0, runs = BASE.runs,
} = {}) {
  const p = effectiveParams(PARAMS, { league: PLAYOFF.parameterLeague });
  const sigma = PARAMS.RATING_SIGMA;
  const [lo, hi] = [BASE.clubA, BASE.clubB].sort();
  const flipped = lo !== BASE.clubA;
  const ratingLo = flipped ? BASE.ratingB : BASE.ratingA;
  const ratingHi = flipped ? BASE.ratingA : BASE.ratingB;
  const key = (id, drawKind) =>
    makeKeyBase({ seasonId: SEASON, context: PLAYOFF_CONTEXT, id: `${lo}|${hi}|${id}`, drawKind });
  const kNoiseLo = key(lo, "noise"), kNoiseHi = key(hi, "noise");
  const kLeg1 = key("pairing", "leg1"), kLeg2 = key("pairing", "leg2");
  const kEt = key("pairing", "et"), kPens = key("pairing", "pens");
  const kHost = key("pairing", "homeOrder");

  let winsLo = 0;
  for (let run = fromRun; run < fromRun + runs; run++) {
    const nLo = ratingLo + ratingNoise(kNoiseLo, run, sigma);
    const nHi = ratingHi + ratingNoise(kNoiseHi, run, sigma);
    // The break: a second, independent draw for the second leg.
    const nLo2 = noisePerLeg ? ratingLo + ratingNoise(kNoiseLo, run + 1e6, sigma) : nLo;
    const nHi2 = noisePerLeg ? ratingHi + ratingNoise(kNoiseHi, run + 1e6, sigma) : nHi;

    const firstHostIsLo = (uniform01(kHost, run) < 0.5 ? "lo" : "hi") === "hi";
    const l1 = firstHostIsLo ? eloToLambdas(nLo, nHi, p) : eloToLambdas(nHi, nLo, p);
    const [g1h, g1a] = drawScorelineDirect(
      Math.max(MIN_LAMBDA, l1.lamH), Math.max(MIN_LAMBDA, l1.lamA), p, uniform01(kLeg1, run));
    const l2 = firstHostIsLo ? eloToLambdas(nHi2, nLo2, p) : eloToLambdas(nLo2, nHi2, p);
    const [g2h, g2a] = drawScorelineDirect(
      Math.max(MIN_LAMBDA, l2.lamH), Math.max(MIN_LAMBDA, l2.lamA), p, uniform01(kLeg2, run));

    let aggLo = firstHostIsLo ? g1h + g2a : g1a + g2h;
    let aggHi = firstHostIsLo ? g1a + g2h : g1h + g2a;
    if (aggLo !== aggHi) { if (aggLo > aggHi) winsLo++; continue; }

    // Away goals: this season's configuration says they do not apply.
    if (PLAYOFF.awayGoalsApply) {
      const awLo = firstHostIsLo ? g2a : g1a;
      const awHi = firstHostIsLo ? g1a : g2a;
      if (awLo !== awHi) { if (awLo > awHi) winsLo++; continue; }
    }

    const f = PLAYOFF.extraTime.factor;
    let src = etFromLeg1 ? l1 : l2;
    if (etNoHomeAdv) {
      const flat = { ...p, HOME_ADV: 0 };
      src = firstHostIsLo ? eloToLambdas(nHi2, nLo2, flat) : eloToLambdas(nLo2, nHi2, flat);
    }
    const [eth, eta] = drawScorelineDirect(
      Math.max(MIN_LAMBDA * f, src.lamH * f), Math.max(MIN_LAMBDA * f, src.lamA * f),
      p, uniform01(kEt, run), { applyDc: etWithDc },
    );
    // The ET host is the second leg's host in every variant — only the RATES vary.
    aggLo += firstHostIsLo ? eta : eth;
    aggHi += firstHostIsLo ? eth : eta;
    if (aggLo !== aggHi) { if (aggLo > aggHi) winsLo++; continue; }

    if (uniform01(kPens, run) < PLAYOFF.penaltyPrior) winsLo++;
  }
  return { winsLo, runs, pAWins: flipped ? complementOf(winsLo / runs) : winsLo / runs };
}

test("REFERENCE REPLAY: the engine's play-off is exactly the §6 contract, run for run", () => {
  assert.ok(Object.is(pairingProbability(BASE).pAWins, replay().pAWins));
});

test("the replay discriminates — every broken clause changes the result", () => {
  const correct = replay().pAWins;
  for (const [clause, broken] of [
    ["RATING_SIGMA redrawn per leg", replay({ noisePerLeg: true }).pAWins],
    ["ET rates taken from the first leg", replay({ etFromLeg1: true }).pAWins],
    ["ET rates without HOME_ADV", replay({ etNoHomeAdv: true }).pAWins],
    ["Dixon-Coles kept in the ET phase", replay({ etWithDc: true }).pAWins],
  ]) {
    assert.notEqual(broken, correct, `${clause} produced the same number — the replay proves nothing`);
  }
});

test("extra time and penalties are actually reached, so the clauses above are not dead code", () => {
  // Counted through the replay's own arithmetic: how often are the two legs level?
  const p = effectiveParams(PARAMS, { league: PLAYOFF.parameterLeague });
  const [lo, hi] = [BASE.clubA, BASE.clubB].sort();
  const key = (id, drawKind) =>
    makeKeyBase({ seasonId: SEASON, context: PLAYOFF_CONTEXT, id: `${lo}|${hi}|${id}`, drawKind });
  let level = 0;
  for (let run = 0; run < BASE.runs; run++) {
    const nLo = 1560 + ratingNoise(key(lo, "noise"), run, PARAMS.RATING_SIGMA);
    const nHi = 1600 + ratingNoise(key(hi, "noise"), run, PARAMS.RATING_SIGMA);
    const firstHostIsLo = (uniform01(key("pairing", "homeOrder"), run) < 0.5 ? "lo" : "hi") === "hi";
    const l1 = firstHostIsLo ? eloToLambdas(nLo, nHi, p) : eloToLambdas(nHi, nLo, p);
    const [g1h, g1a] = drawScorelineDirect(l1.lamH, l1.lamA, p, uniform01(key("pairing", "leg1"), run));
    const l2 = firstHostIsLo ? eloToLambdas(nHi, nLo, p) : eloToLambdas(nLo, nHi, p);
    const [g2h, g2a] = drawScorelineDirect(l2.lamH, l2.lamA, p, uniform01(key("pairing", "leg2"), run));
    if (g1h + g2a === g1a + g2h) level++;
  }
  assert.ok(level > BASE.runs * 0.1, `only ${level} of ${BASE.runs} runs reached extra time`);
});

// ---------------------------------------------------------------------------
//  The ET model, stated directly as well.
// ---------------------------------------------------------------------------

test("ET_FACTOR is exactly one third, in the parameters and in the season configuration", () => {
  assert.ok(Object.is(PARAMS.ET_FACTOR, 1 / 3), `${PARAMS.ET_FACTOR} is not 1/3`);
  assert.ok(Object.is(PLAYOFF.extraTime.factor, 1 / 3));
  assert.equal(PLAYOFF.extraTime.applyDixonColes, false);
});

test("the ET phase is plain independent Poisson — `applyDc: false` equals RHO = 0", () => {
  const p = effectiveParams(PARAMS, { league: "bl1" });
  assert.notEqual(p.RHO, 0, "RHO must be non-zero or this test is vacuous");
  for (let i = 1; i < 200; i++) {
    const u = i / 200;
    assert.deepEqual(
      drawScorelineDirect(0.5, 0.4, p, u, { applyDc: false }),
      drawScorelineDirect(0.5, 0.4, { ...p, RHO: 0 }, u),
    );
  }
  const withDc = [], without = [];
  for (let i = 1; i < 200; i++) {
    withDc.push(String(drawScorelineDirect(0.5, 0.4, p, i / 200)));
    without.push(String(drawScorelineDirect(0.5, 0.4, p, i / 200, { applyDc: false })));
  }
  assert.notDeepEqual(withDc, without, "the DC term must actually change low-scoring draws");
});

test("the league draw is untouched by the new option — `applyDc` defaults to true", () => {
  const p = effectiveParams(PARAMS, { league: "bl1" });
  for (let i = 1; i < 100; i++) {
    assert.deepEqual(
      drawScorelineDirect(1.6, 1.2, p, i / 100),
      drawScorelineDirect(1.6, 1.2, p, i / 100, { applyDc: true }),
    );
  }
});

// ---------------------------------------------------------------------------
//  Home right, derived from the fixture dates.
// ---------------------------------------------------------------------------

test("fewer match-free days before the first leg wins the second-leg home right", () => {
  // A played on the 16th, B on the 17th; first leg on the 22nd.
  // A has 5 match-free days, B has 4 — so B hosts the second leg.
  const r = secondLegHost({
    firstLegDate: "2027-05-22", lastMatchA: "2027-05-16", lastMatchB: "2027-05-17",
  });
  assert.equal(r.host, "B");
  assert.deepEqual(r.restDays, { A: 5, B: 4 });
  assert.match(r.basis, /match-free/);
});

test("REGRESSION ANCHOR: in the normal case the 2.-Liga club hosts the second leg", () => {
  // The rule reads backwards at first sight, so the real-world case is pinned.
  // Bundesliga's 34th matchday is a Saturday, 2. Bundesliga's the following
  // Sunday, the first leg the Thursday after: the SECOND-division club has the
  // shorter break and therefore hosts the SECOND leg. The DFL states this
  // outcome itself, and every play-off since 2008/09 followed it — first leg at
  // the Bundesliga club, second leg at the 2.-Liga club.
  // See docs/verification/dfl-spielordnung.md §4.5.1.
  const r = secondLegHost({
    firstLegDate: "2027-05-27",   // Thursday
    lastMatchA: "2027-05-22",     // Saturday — the Bundesliga club
    lastMatchB: "2027-05-23",     // Sunday   — the 2. Bundesliga club
  });
  assert.equal(r.host, "B", "the 2.-Liga club must host the second leg");
  assert.deepEqual(r.restDays, { A: 4, B: 3 });
});

test("the rule is symmetric in its arguments", () => {
  const ab = secondLegHost({ firstLegDate: "2027-05-22", lastMatchA: "2027-05-16", lastMatchB: "2027-05-17" });
  const ba = secondLegHost({ firstLegDate: "2027-05-22", lastMatchA: "2027-05-17", lastMatchB: "2027-05-16" });
  assert.equal(ab.host, "B");
  assert.equal(ba.host, "A");
  assert.deepEqual(ba.restDays, { A: 4, B: 5 });
});

test("equal match-free days leaves the host undetermined until the lot is drawn", () => {
  const r = secondLegHost({ firstLegDate: "2027-05-22", lastMatchA: "2027-05-17", lastMatchB: "2027-05-17" });
  assert.equal(r.host, null);
  assert.match(r.basis, /lot not drawn/);
  const drawn = secondLegHost({
    firstLegDate: "2027-05-22", lastMatchA: "2027-05-17", lastMatchB: "2027-05-17", lotWinner: "A",
  });
  assert.equal(drawn.host, "A");
  assert.equal(drawn.basis, "lot");
});

test("a drawn lot overrides the rest-day rule — it is recorded, not recomputed", () => {
  const r = secondLegHost({
    firstLegDate: "2027-05-22", lastMatchA: "2027-05-16", lastMatchB: "2027-05-17", lotWinner: "A",
  });
  assert.equal(r.host, "A", "the recorded outcome must win over the derivation");
});

test("missing dates yield no host rather than a guessed one", () => {
  assert.equal(secondLegHost({ firstLegDate: null, lastMatchA: "2027-05-16", lastMatchB: "2027-05-17" }).host, null);
  assert.equal(secondLegHost({ firstLegDate: "2027-05-22", lastMatchA: null, lastMatchB: "2027-05-17" }).host, null);
  assert.equal(secondLegHost({ firstLegDate: "2027-05-22", lastMatchA: "2027-05-16", lastMatchB: null }).host, null);
  assert.equal(
    secondLegHost({ firstLegDate: "kein Datum", lastMatchA: "2027-05-16", lastMatchB: "2027-05-17" }).host,
    null,
  );
});

test("this season's configuration carries the rule and no fixed order", () => {
  assert.equal(PLAYOFF.homeOrderRule, "fewerRestDaysBeforeFirstLegHostsSecondLeg");
  assert.equal(PLAYOFF.playoffDates, null);
  assert.equal(PLAYOFF.lastLeagueMatchdayDates, null);
  assert.equal(PLAYOFF.lotDrawn, null);
});

// ---------------------------------------------------------------------------
//  The 50/50 mixture before a lot decision.
// ---------------------------------------------------------------------------

test("an undetermined order is simulated as a 50/50 mixture, and says so", () => {
  const mixed = pairingProbability(BASE);
  assert.equal(mixed.homeOrderMixed, true);
  assert.equal(mixed.hostSecondLeg, null);

  const hostA = pairingProbability({ ...BASE, hostRule: { host: "A", basis: "lot" } });
  const hostB = pairingProbability({ ...BASE, hostRule: { host: "B", basis: "lot" } });
  assert.equal(hostA.homeOrderMixed, false);

  // The mixture must sit between the two fixed orders, near their mean — not at
  // one of them, which is what silently picking an order would produce.
  const mean = (hostA.pAWins + hostB.pAWins) / 2;
  assert.ok(Math.abs(mixed.pAWins - mean) < 0.02, `${mixed.pAWins} is not near the mean ${mean}`);
  assert.notEqual(hostA.pAWins, hostB.pAWins, "the home order must matter, or the test is vacuous");
});

test("the home order matters in the expected direction — hosting the second leg helps", () => {
  // A hosts the second leg vs. A hosts the first: the second-leg host also plays
  // extra time at home, so it must fare no worse.
  const hostA = pairingProbability({ ...BASE, hostRule: { host: "A", basis: "lot" } });
  const hostB = pairingProbability({ ...BASE, hostRule: { host: "B", basis: "lot" } });
  assert.ok(hostA.pAWins > hostB.pAWins, `${hostA.pAWins} should exceed ${hostB.pAWins}`);
});

test("the mixture draw has its own key — it does not steal a leg's stream", () => {
  const kinds = ["homeOrder", "leg1", "leg2"].map((drawKind) =>
    makeKeyBase({ seasonId: SEASON, context: PLAYOFF_CONTEXT, id: "a|b|pairing", drawKind }));
  assert.equal(new Set(kinds).size, 3);
});

// ---------------------------------------------------------------------------
//  Away goals — two explicit fields, never one cutoff.
// ---------------------------------------------------------------------------

test("the away-goals rule follows the explicit season field", () => {
  assert.equal(awayGoalsApply(PLAYOFF), false);
  assert.equal(PLAYOFF.lastSeasonWithAwayGoals, "2020/21");
  assert.equal(PLAYOFF.firstSeasonWithout, "2021/22");
  assert.equal(awayGoalsApply({ awayGoalsApply: true }), true);
  assert.equal(awayGoalsApply(undefined), false, "absent means not applied, never assumed");
});

test("turning the away-goals rule on changes the outcome", () => {
  const off = pairingProbability(BASE);
  const on = pairingProbability({ ...BASE, playoffConfig: { ...PLAYOFF, awayGoalsApply: true } });
  assert.notEqual(off.pAWins, on.pAWins);
});

test("the complement survives the away-goals rule — it is not an artefact of the tiebreak chain", () => {
  const cfg = { ...PLAYOFF, awayGoalsApply: true };
  const ij = pairingProbability({ ...BASE, playoffConfig: cfg });
  const ji = pairingProbability({
    ...BASE, playoffConfig: cfg,
    clubA: BASE.clubB, clubB: BASE.clubA, ratingA: BASE.ratingB, ratingB: BASE.ratingA,
  });
  assert.ok(Object.is(ji.pAWins, complementOf(ij.pAWins)));
});

// ---------------------------------------------------------------------------
//  BL2 deltas: consumed from season-params.json, never restated.
// ---------------------------------------------------------------------------

test("the parameter set is a configuration decision, recorded in the season file", () => {
  assert.equal(PLAYOFF.parameterLeague, "bl1");
  assert.equal(pairingProbability(BASE).parameterLeague, "bl1");
  assert.equal(
    pairingProbability({ ...BASE, playoffConfig: { ...PLAYOFF, parameterLeague: "bl2" } }).parameterLeague,
    "bl2",
  );
});

test("the BL2 deltas reach the play-off through effectiveParams and change it", () => {
  const bl1 = pairingProbability(BASE);
  const bl2 = pairingProbability({ ...BASE, playoffConfig: { ...PLAYOFF, parameterLeague: "bl2" } });
  assert.notEqual(bl1.pAWins, bl2.pAWins, "the deltas must have an effect or they are not being consumed");

  // And they are the file's own values, applied in exactly one place.
  const a = effectiveParams(PARAMS, { league: "bl1" });
  const b = effectiveParams(PARAMS, { league: "bl2" });
  assert.equal(b.HOME_ADV, PARAMS.HOME_ADV + PARAMS.HOME_ADV_BL2);
  assert.equal(b.BASE_TOTAL, PARAMS.BASE_TOTAL + PARAMS.BASE_TOTAL_BL2);
  assert.equal(b.ELO_PER_GOAL, PARAMS.ELO_PER_GOAL + PARAMS.ELO_PER_GOAL_BL2);
  assert.equal(a.HOME_ADV, PARAMS.HOME_ADV, "bl1 is the base set — no delta");
  const differing = Object.keys(b).filter((k) => !Object.is(a[k], b[k]));
  assert.deepEqual(differing.sort(), ["BASE_TOTAL", "ELO_PER_GOAL", "HOME_ADV"]);
});

// ---------------------------------------------------------------------------
//  The two league views, from complementary sides of the one simulation.
// ---------------------------------------------------------------------------

test("Klassenerhalt and Aufstieg are computed from the same pairing numbers", () => {
  const opponents = [
    { club: "bl2-fortuna", pThird: 0.30 },
    { club: "bl2-elversberg", pThird: 0.20 },
  ].map((o) => {
    const p = pairingProbability({ ...BASE, clubB: o.club });
    return { ...o, pWin: p.pAWins };
  });

  const pSafe = 0.62, pRelegationPlayoff = 0.14;
  const survival = survivalProbability({ pSafe, pRelegationPlayoff, opponents });
  assert.ok(survival > pSafe && survival < pSafe + pRelegationPlayoff);

  // The BL2 side of the very same pairing, taken as the complement.
  const fortuna = opponents[0];
  const promotion = promotionProbability({
    pDirect: 0.22, pPlayoffPlace: fortuna.pThird,
    opponents: [{ pSixteenth: pRelegationPlayoff, pWin: complementOf(fortuna.pWin) }],
  });
  const viaPlayoff = fortuna.pThird * pRelegationPlayoff * complementOf(fortuna.pWin);
  assert.ok(Math.abs(promotion - (0.22 + viaPlayoff)) < 1e-15);

  // Nothing was simulated twice: the BL2 number is 1 − the BL1 number, exactly.
  const swapped = pairingProbability({
    ...BASE, clubA: fortuna.club, clubB: BASE.clubA,
    ratingA: BASE.ratingB, ratingB: BASE.ratingA,
  });
  assert.ok(Object.is(swapped.pAWins, complementOf(fortuna.pWin)));
});

test("with no play-off place there is no play-off term", () => {
  assert.equal(survivalProbability({ pSafe: 0.9, pRelegationPlayoff: 0, opponents: [] }), 0.9);
  assert.equal(promotionProbability({ pDirect: 0.4, pPlayoffPlace: 0, opponents: [] }), 0.4);
});

test("a certain play-off winner recovers the full place probability", () => {
  const s = survivalProbability({
    pSafe: 0.5, pRelegationPlayoff: 0.2,
    opponents: [{ pThird: 0.6, pWin: 1 }, { pThird: 0.4, pWin: 1 }],
  });
  assert.ok(Math.abs(s - 0.7) < 1e-15, `${s}`);
});

test("the sum over opponents is required — a single opponent understates the term", () => {
  const many = survivalProbability({
    pSafe: 0.5, pRelegationPlayoff: 0.2,
    opponents: [{ pThird: 0.5, pWin: 0.6 }, { pThird: 0.5, pWin: 0.6 }],
  });
  const one = survivalProbability({
    pSafe: 0.5, pRelegationPlayoff: 0.2, opponents: [{ pThird: 0.5, pWin: 0.6 }],
  });
  assert.ok(many > one);
});

// ---------------------------------------------------------------------------
//  Determinism and run semantics.
// ---------------------------------------------------------------------------

test("the pairing is deterministic — same inputs, bit-identical output", () => {
  assert.ok(Object.is(pairingProbability(BASE).pAWins, pairingProbability(BASE).pAWins));
});

test("more runs EXTEND the sample rather than resampling it", () => {
  // §3: raising the run count must leave the first N runs bit-identical. Here
  // that is checked as an exact decomposition — the 8000-run win count is the
  // 4000-run count plus the count over runs 4000..7999, to the unit.
  const short = pairingProbability(BASE);
  const long = pairingProbability({ ...BASE, runs: 8000 });
  const first = Math.round(short.pAWins * BASE.runs);
  const total = Math.round(long.pAWins * 8000);
  const second = replay({ fromRun: BASE.runs, runs: 8000 - BASE.runs }).winsLo;
  assert.equal(total, first + second, "the extra runs did not simply extend the sample");
  assert.ok(second > 0 && second < 8000 - BASE.runs, "the second half must be non-degenerate");
});

test("RATING_SIGMA is what makes the play-off uncertain beyond the scoreline draw", () => {
  const withNoise = pairingProbability(BASE);
  const without = pairingProbability({ ...BASE, params: { ...PARAMS, RATING_SIGMA: 0 } });
  assert.notEqual(withNoise.pAWins, without.pAWins);
  // Killing the noise must sharpen the favourite: strength is then certain.
  assert.ok(without.pAWins > withNoise.pAWins, `${without.pAWins} vs ${withNoise.pAWins}`);
});
