import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveContenders, surprisal, accuracy, brierScore, logLoss, calibration,
  calibrationSentence, performanceVsExpectation, remainingScheduleStrength,
  directDuels, favouriteSince, expectedTargetShift, conditionalsRecombine,
  pairedBatchStandardError, reportDelta, RANDOM_BASELINE, DIRECTION,
} from "../src/metrics.mjs";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// Spannungsindex
// ---------------------------------------------------------------------------

test("effective contenders: a two-horse race reads 2, a decided race reads 1", () => {
  assert.ok(near(effectiveContenders([0.5, 0.5]).value, 2));
  assert.ok(near(effectiveContenders([1, 0, 0]).value, 1));
  assert.ok(near(effectiveContenders([0.25, 0.25, 0.25, 0.25]).value, 4));
});

test("a k-place target is normalised before the entropy, and its floor is k", () => {
  // Two relegation places, fully decided among exactly two clubs: each club's
  // probability is 1, so the vector sums to 2 — not 1.
  const decided = [1, 1, 0, 0, 0];
  const r = effectiveContenders(decided, 2);
  assert.ok(near(r.value, 2), `decided two-place race must read 2, got ${r.value}`);
  assert.equal(r.floor, 2);

  // Without normalisation the entropy would be computed on a vector summing to
  // 2 and the reading would be meaningless. Guard the contract explicitly:
  // scaling every probability by a constant must not change the reading.
  const scaled = effectiveContenders([2, 2, 0, 0, 0], 2);
  assert.ok(near(scaled.value, r.value));
});

test("an open two-place race reads above its floor", () => {
  const open = [0.7, 0.6, 0.4, 0.3];
  const r = effectiveContenders(open, 2);
  assert.ok(r.value > r.floor, `${r.value} should exceed the floor ${r.floor}`);
});

test("effective contenders rejects a degenerate input rather than returning NaN", () => {
  assert.throws(() => effectiveContenders([0, 0, 0]), /sum to zero/);
  assert.throws(() => effectiveContenders([1], 0), /places must be positive/);
});

// ---------------------------------------------------------------------------
// Scoring metrics
// ---------------------------------------------------------------------------

test("surprisal is higher for the less likely outcome", () => {
  const pred = { homeWin: 0.5, draw: 0.25, awayWin: 0.25 };
  assert.ok(near(surprisal(pred, "homeWin"), 1)); // -log2(0.5)
  assert.ok(near(surprisal(pred, "draw"), 2));
  assert.ok(surprisal(pred, "awayWin") > surprisal(pred, "homeWin"));
});

const uniform = { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 };

test("the random baselines are what a uniform prediction actually scores", () => {
  const scored = Array.from({ length: 300 }, (_, i) => ({
    prediction: uniform,
    actual: ["homeWin", "draw", "awayWin"][i % 3],
  }));
  assert.ok(near(brierScore(scored).value, RANDOM_BASELINE.brier, 1e-12));
  assert.ok(near(logLoss(scored).value, RANDOM_BASELINE.logLoss, 1e-12));
});

test("accuracy is higher-is-better with a 1/3 baseline, losses are lower-is-better", () => {
  assert.equal(DIRECTION.accuracy, "higher");
  assert.equal(DIRECTION.brier, "lower");
  assert.equal(DIRECTION.logLoss, "lower");
  assert.ok(near(RANDOM_BASELINE.accuracy, 1 / 3));
  assert.ok(near(RANDOM_BASELINE.logLoss, Math.log(3)));
  assert.ok(near(RANDOM_BASELINE.brier, 2 / 3));

  const perfect = [{ prediction: { homeWin: 1, draw: 0, awayWin: 0 }, actual: "homeWin" }];
  assert.equal(accuracy(perfect).value, 1);
  assert.equal(brierScore(perfect).value, 0);
  assert.equal(logLoss(perfect).value, 0);
});

test("a confidently wrong prediction is penalised but does not produce Infinity", () => {
  const wrong = [{ prediction: { homeWin: 1, draw: 0, awayWin: 0 }, actual: "awayWin" }];
  assert.equal(accuracy(wrong).value, 0);
  assert.ok(Number.isFinite(logLoss(wrong).value));
  assert.ok(logLoss(wrong).value > 30);
});

test("empty input returns null rather than NaN", () => {
  assert.equal(accuracy([]).value, null);
  assert.equal(brierScore([]).value, null);
  assert.equal(logLoss([]).value, null);
});

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

test("calibration pools all three probabilities per match and counts matches, not pairs", () => {
  const scored = Array.from({ length: 40 }, (_, i) => ({
    prediction: { homeWin: 0.5, draw: 0.25, awayWin: 0.25 },
    actual: i % 2 === 0 ? "homeWin" : "draw",
  }));
  const cal = calibration(scored);
  assert.equal(cal.matches, 40, "the caption counts matches");
  assert.equal(cal.probabilities, 120, "3n probabilities");
  const totalPairs = cal.buckets.reduce((a, b) => a + b.n, 0);
  assert.equal(totalPairs, 120, "every probability lands in exactly one bucket");
});

test("a perfectly calibrated set has ECE 0", () => {
  // 100 matches: probability 0.5 on homeWin, which happens exactly half the
  // time; 0.25 each on draw and awayWin, each happening a quarter of the time.
  const scored = [];
  for (let i = 0; i < 100; i++) {
    const actual = i < 50 ? "homeWin" : i < 75 ? "draw" : "awayWin";
    scored.push({ prediction: { homeWin: 0.5, draw: 0.25, awayWin: 0.25 }, actual });
  }
  const cal = calibration(scored);
  assert.ok(cal.ece < 1e-12, `ece ${cal.ece}`);
});

test("an overconfident model shows a positive ECE and the sentence says so", () => {
  // Says 70 % on homeWin but it only happens 50 % of the time.
  const scored = [];
  for (let i = 0; i < 100; i++) {
    scored.push({
      prediction: { homeWin: 0.7, draw: 0.15, awayWin: 0.15 },
      actual: i < 50 ? "homeWin" : i < 75 ? "draw" : "awayWin",
    });
  }
  const cal = calibration(scored);
  assert.ok(cal.ece > 0.05, `ece ${cal.ece}`);
  assert.ok(near(cal.ecePercentagePoints, cal.ece * 100));
  const sentence = calibrationSentence(cal, 0.7);
  assert.match(sentence, /70 %/);
  assert.match(sentence, /zu optimistisch/);
});

test("empty buckets are not drawn; thin buckets are drawn but flagged unreliable", () => {
  const scored = [
    { prediction: { homeWin: 0.95, draw: 0.03, awayWin: 0.02 }, actual: "homeWin" },
    { prediction: { homeWin: 0.95, draw: 0.03, awayWin: 0.02 }, actual: "homeWin" },
  ];
  const cal = calibration(scored);
  assert.ok(cal.buckets.every((b) => b.n > 0), "no empty bucket is returned");
  assert.ok(cal.buckets.every((b) => !b.reliable), "buckets under 10 pairs are flagged");
});

test("a probability of exactly 1 lands in the last bucket, not off the end", () => {
  const cal = calibration([{ prediction: { homeWin: 1, draw: 0, awayWin: 0 }, actual: "homeWin" }]);
  const last = cal.buckets.find((b) => b.to === 1);
  assert.ok(last && last.n === 1, "p = 1 must fall in [0.9, 1.0]");
});

// ---------------------------------------------------------------------------
// Club-level metrics
// ---------------------------------------------------------------------------

test("performance vs expectation normalises by the club's own matches played", () => {
  // Three matches, each an even coin-flip-ish prediction worth 1.5 expected
  // points; the club won all three.
  const ms = Array.from({ length: 3 }, () => ({ points: 3, pWin: 0.4, pDraw: 0.3 }));
  const r = performanceVsExpectation(ms);
  assert.equal(r.actual, 9);
  assert.ok(near(r.expected, 3 * (3 * 0.4 + 0.3)));
  assert.ok(near(r.perMatch, r.difference / 3));
  assert.equal(r.played, 3);

  // A club that has played fewer matches is not thereby worse per match.
  const fewer = performanceVsExpectation(ms.slice(0, 2));
  assert.ok(near(fewer.perMatch, r.perMatch), "per-match figure must not depend on how many were played");
});

test("remaining schedule strength is reported separately for home and away", () => {
  const r = remainingScheduleStrength([
    { atHome: true, opponentRating: 1800 },
    { atHome: true, opponentRating: 1600 },
    { atHome: false, opponentRating: 2000 },
  ]);
  assert.equal(r.home, 1700);
  assert.equal(r.away, 2000);
  assert.equal(r.counts.total, 3);
});

test("a club with no home fixtures left reports null rather than 0", () => {
  const r = remainingScheduleStrength([{ atHome: false, opponentRating: 1500 }]);
  assert.equal(r.home, null);
  assert.equal(r.away, 1500);
});

test("direct duels need BOTH clubs above the threshold for the SAME target", () => {
  const fixtures = [
    { id: "f1", home: "A", away: "B" },
    { id: "f2", home: "A", away: "C" },
  ];
  const probs = {
    meister: { A: 0.4, B: 0.3, C: 0.02 },
    abstieg: { A: 0.0, B: 0.0, C: 0.5 },
  };
  const duels = directDuels(fixtures, probs, 0.1);
  assert.equal(duels.length, 1);
  assert.equal(duels[0].fixtureId, "f1");
  assert.equal(duels[0].target, "meister");
});

test("favourite-since requires an unbroken hold, not a transient lead", () => {
  const history = [
    { matchday: 1, probabilities: { A: 0.5, B: 0.4 } },
    { matchday: 2, probabilities: { A: 0.3, B: 0.6 } }, // B takes over
    { matchday: 3, probabilities: { A: 0.55, B: 0.4 } }, // A back in front
    { matchday: 4, probabilities: { A: 0.6, B: 0.3 } },
  ];
  assert.deepEqual(favouriteSince(history), { clubId: "A", sinceMatchday: 3 });
});

test("a shared lead is not a lead", () => {
  const history = [{ matchday: 1, probabilities: { A: 0.5, B: 0.5 } }];
  assert.equal(favouriteSince(history), null);
});

// ---------------------------------------------------------------------------
// Wichtigstes kommendes Spiel
// ---------------------------------------------------------------------------

test("expected target shift is the q-weighted total-variation distance", () => {
  const pNow = { A: 0.5, B: 0.5 };
  const byOutcome = [
    { outcome: "homeWin", q: 0.5, conditional: { A: 0.8, B: 0.2 }, sampleSize: 10000 },
    { outcome: "awayWin", q: 0.5, conditional: { A: 0.2, B: 0.8 }, sampleSize: 10000 },
  ];
  // Each conditional is TV distance 0.3 from P_now; expectation is 0.3.
  const r = expectedTargetShift(pNow, byOutcome, 1);
  assert.ok(near(r.value, 0.3));
  assert.equal(r.smallestConditionalSample, 10000);
});

test("a fixture that changes nothing scores zero", () => {
  const pNow = { A: 0.5, B: 0.5 };
  const byOutcome = [
    { outcome: "homeWin", q: 0.6, conditional: { A: 0.5, B: 0.5 }, sampleSize: 12000 },
    { outcome: "awayWin", q: 0.4, conditional: { A: 0.5, B: 0.5 }, sampleSize: 8000 },
  ];
  assert.ok(near(expectedTargetShift(pNow, byOutcome, 1).value, 0));
});

// The trap §4 spells out: without dividing by k the relegation reading is
// inflated ≈ k-fold and structurally wins the "larger of the two" comparison.
test("a k-place target is divided by k before the distance", () => {
  const pNow = { A: 1.0, B: 0.6, C: 0.4 }; // sums to 2 — two relegation places
  const byOutcome = [
    { outcome: "homeWin", q: 0.5, conditional: { A: 1.0, B: 0.9, C: 0.1 }, sampleSize: 10000 },
    { outcome: "awayWin", q: 0.5, conditional: { A: 1.0, B: 0.3, C: 0.7 }, sampleSize: 10000 },
  ];
  const normalised = expectedTargetShift(pNow, byOutcome, 2);
  const unnormalised = expectedTargetShift(pNow, byOutcome, 1);
  assert.ok(near(unnormalised.value / normalised.value, 2), "the k-fold inflation must be removed");

  // And the normalised reading is a genuine probability distance: at most 1.
  assert.ok(normalised.value <= 1 + 1e-12);
});

test("the q-weighted conditionals recombine to P_now", () => {
  const pNow = { A: 0.5, B: 0.5 };
  const byOutcome = [
    { outcome: "homeWin", q: 0.5, conditional: { A: 0.8, B: 0.2 } },
    { outcome: "awayWin", q: 0.5, conditional: { A: 0.2, B: 0.8 } },
  ];
  assert.equal(conditionalsRecombine(pNow, byOutcome).ok, true);

  const broken = [
    { outcome: "homeWin", q: 0.5, conditional: { A: 0.9, B: 0.1 } },
    { outcome: "awayWin", q: 0.5, conditional: { A: 0.2, B: 0.8 } },
  ];
  assert.equal(conditionalsRecombine(pNow, broken).ok, false);
});

// ---------------------------------------------------------------------------
// Delta reporting
// ---------------------------------------------------------------------------

test("SE(delta) divides the batch spread by sqrt(B) — the correction v5 omitted", () => {
  const deltas = [0.01, 0.02, 0.03, 0.04];
  const { delta, se, batches } = pairedBatchStandardError(deltas);
  assert.ok(near(delta, 0.025));
  assert.equal(batches, 4);

  const mean = 0.025;
  const sd = Math.sqrt(deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / 3);
  assert.ok(near(se, sd / 2), "must be SD/sqrt(B), not SD");
  assert.ok(se < sd, "omitting the division would make the floor far too large");
});

test("changes below 2·SE are reported as unchanged", () => {
  // Tiny mean, comparatively large spread — genuinely indistinguishable.
  const noise = reportDelta([0.001, -0.002, 0.003, -0.001, 0.002, -0.003]);
  assert.equal(noise.significant, false);
  assert.equal(noise.display, null, "null renders as „unverändert\"");

  // A large, consistent move survives the floor.
  const real = reportDelta([0.05, 0.051, 0.049, 0.052, 0.048, 0.05]);
  assert.equal(real.significant, true);
  assert.ok(near(real.display, real.delta));
  assert.ok(real.floor < Math.abs(real.delta));
});

test("the noise floor is derived from the measured spread, not a constant", () => {
  const tight = reportDelta([0.01, 0.0101, 0.0099, 0.01, 0.0102, 0.0098]);
  const loose = reportDelta([0.01, 0.05, -0.03, 0.02, -0.01, 0.04]);
  assert.ok(tight.floor < loose.floor, "CRN guarantees no fixed reduction — the floor must move with the data");
});

test("a single batch cannot yield a standard error", () => {
  assert.throws(() => pairedBatchStandardError([0.01]), /at least two batches/);
});
