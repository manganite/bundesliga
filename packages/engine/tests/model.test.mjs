import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  effectiveParams, eloToLambdas, buildScorelineDistribution, scorelineQuantile,
  scorelineIndex, canonicalOrder, predictMatch, drawScoreline, tendencyOf, poissonAt, poissonPmf, dcTau,
} from "../src/model.mjs";
import { makeKeyBase, uniform01 } from "../src/rng.mjs";

const shipped = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../../data/season-params.json"), "utf8"),
);
const P = shipped.params;

test("shipped season-params.json carries the per-league fields §11 asked about", () => {
  for (const k of ["HOME_ADV_BL2", "BASE_TOTAL_BL2", "ELO_PER_GOAL_BL2"]) {
    assert.equal(typeof P[k], "number", `${k} missing`);
  }
});

test("the documented BL2 effective values are what effectiveParams actually produces", () => {
  // Guards the convenience block in season-params.json against drifting away
  // from the rule the engine applies.
  const eff = effectiveParams(P, { league: "bl2" });
  const doc = shipped.perLeagueFields.effectiveBl2;
  assert.ok(Math.abs(eff.BASE_TOTAL - doc.BASE_TOTAL) < 1e-12);
  assert.ok(Math.abs(eff.ELO_PER_GOAL - doc.ELO_PER_GOAL) < 1e-12);
  assert.ok(Math.abs(eff.HOME_ADV - doc.HOME_ADV) < 1e-12);
});

test("BL1 is the pooled baseline untouched; BL2 gets the deltas", () => {
  const bl1 = effectiveParams(P, { league: "bl1" });
  assert.equal(bl1.BASE_TOTAL, P.BASE_TOTAL);
  assert.equal(bl1.ELO_PER_GOAL, P.ELO_PER_GOAL);
  assert.equal(bl1.HOME_ADV, P.HOME_ADV);

  const bl2 = effectiveParams(P, { league: "bl2" });
  assert.ok(bl2.BASE_TOTAL < bl1.BASE_TOTAL, "BL2 scores less");
  assert.notEqual(bl2.HOME_ADV, bl1.HOME_ADV);
});

test("the ghost term applies only inside the closed-door window, and only then", () => {
  const normal = effectiveParams(P, { league: "bl1", isGhost: false });
  const ghost = effectiveParams(P, { league: "bl1", isGhost: true });
  assert.equal(ghost.HOME_ADV, normal.HOME_ADV + P.HOME_ADV_GHOST);
  // BL2 ghost interaction is 0 in this fit, so both leagues shift equally.
  const ghost2 = effectiveParams(P, { league: "bl2", isGhost: true });
  assert.equal(ghost2.HOME_ADV, effectiveParams(P, { league: "bl2" }).HOME_ADV + P.HOME_ADV_GHOST);
});

test("home advantage raises the home rate and lowers the away rate", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const even = eloToLambdas(1500, 1500, p);
  assert.ok(even.lamH > even.lamA, "flat HOME_ADV must favour the host");
  assert.ok(Math.abs(even.lamH + even.lamA - p.BASE_TOTAL) < 1e-12, "supremacy splits around BASE_TOTAL");
});

test("a stronger club gets the higher rate", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const strong = eloToLambdas(1900, 1500, p);
  const weak = eloToLambdas(1500, 1900, p);
  assert.ok(strong.lamH > weak.lamH);
  assert.ok(strong.lamH > strong.lamA);
});

test("rates are floored so an extreme mismatch cannot produce a negative rate", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const { lamH, lamA } = eloToLambdas(1000, 2600, p);
  assert.ok(lamH >= 0.12 && lamA >= 0.12);
});

test("the scoreline distribution is a proper distribution", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const { lamH, lamA } = eloToLambdas(1800, 1600, p);
  const d = buildScorelineDistribution(lamH, lamA, p);
  let sum = 0;
  for (const x of d.pmf) {
    assert.ok(x >= 0, "negative probability");
    sum += x;
  }
  assert.ok(Math.abs(sum - 1) < 1e-12, `pmf sums to ${sum}`);
  assert.equal(d.cdf[d.cdf.length - 1], 1);
  for (let i = 1; i < d.cdf.length; i++) assert.ok(d.cdf[i] >= d.cdf[i - 1], "cdf not monotone");
});

test("the canonical ordering is by total goals, then home goals", () => {
  const { cells } = canonicalOrder(4);
  assert.deepEqual(cells.slice(0, 6), [[0, 0], [0, 1], [1, 0], [0, 2], [1, 1], [2, 0]]);
  // Every scoreline appears exactly once.
  assert.equal(new Set(cells.map(([h, a]) => `${h}:${a}`)).size, cells.length);
  assert.equal(cells.length, 25);
  // Total goals never decreases along the ordering.
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1][0] + cells[i - 1][1];
    const cur = cells[i][0] + cells[i][1];
    assert.ok(cur >= prev, `total goals fell at ${i}`);
  }
});

test("the quantile inverts the canonical ordering exactly", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const d = buildScorelineDistribution(1.5, 1.2, p);
  const N = d.maxGoals;
  // Every canonical position with mass must be reachable, and the midpoint of
  // each cell's interval must map back to that same cell — this is what makes
  // CRN cancel error rather than scramble it.
  for (let i = 0; i < d.cdf.length; i++) {
    if (d.pmf[d.order[i]] < 1e-12) continue;
    const u = i === 0 ? d.cdf[0] / 2 : (d.cdf[i - 1] + d.cdf[i]) / 2;
    const [h, a] = scorelineQuantile(d, u);
    assert.equal(scorelineIndex(h, a, N), d.order[i], `midpoint of canonical cell ${i} mapped elsewhere`);
  }
});

test("Dixon-Coles shifts mass in the low-score corner and nowhere else", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const withDc = buildScorelineDistribution(1.4, 1.1, p);
  const plain = buildScorelineDistribution(1.4, 1.1, { ...p, RHO: 0 });
  const N = p.MAX_GOALS;
  const corner = [[0, 0], [0, 1], [1, 0], [1, 1]];
  for (const [h, a] of corner) {
    assert.notEqual(
      withDc.pmf[scorelineIndex(h, a, N)],
      plain.pmf[scorelineIndex(h, a, N)],
      `${h}:${a} should be corrected`,
    );
  }
  // Outside the corner the two differ only by renormalisation, so the RATIO
  // between any two such cells is untouched.
  const r1 = withDc.pmf[scorelineIndex(2, 1, N)] / withDc.pmf[scorelineIndex(3, 0, N)];
  const r2 = plain.pmf[scorelineIndex(2, 1, N)] / plain.pmf[scorelineIndex(3, 0, N)];
  assert.ok(Math.abs(r1 - r2) < 1e-12);
});

test("extra time drops the Dixon-Coles term entirely (§6)", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const et = buildScorelineDistribution(0.5, 0.4, p, { applyDc: false });
  const plain = buildScorelineDistribution(0.5, 0.4, { ...p, RHO: 0 });
  for (let i = 0; i < et.pmf.length; i++) {
    assert.ok(Math.abs(et.pmf[i] - plain.pmf[i]) < 1e-15, `cell ${i} differs`);
  }
});

test("predictMatch tendencies sum to 1 and favour the stronger side", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const pred = predictMatch(1900, 1550, p);
  const { homeWin, draw, awayWin } = pred.tendency;
  assert.ok(Math.abs(homeWin + draw + awayWin - 1) < 1e-12);
  assert.ok(homeWin > awayWin);
  assert.equal(pred.top5.length, 5);
  assert.ok(pred.top5[0].prob >= pred.top5[4].prob);
});

test("drawing many scorelines reproduces the distribution", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const { lamH, lamA } = eloToLambdas(1750, 1650, p);
  const d = buildScorelineDistribution(lamH, lamA, p);
  const key = makeKeyBase({ seasonId: "2026", id: "fixture-1", drawKind: "scoreline" });

  const N = 200000;
  let home = 0;
  let drawn = 0;
  for (let r = 0; r < N; r++) {
    const [gh, ga] = drawScoreline(d, key, r);
    const t = tendencyOf(gh, ga);
    if (t === "homeWin") home++;
    else if (t === "draw") drawn++;
  }
  const pred = predictMatch(1750, 1650, p);
  assert.ok(Math.abs(home / N - pred.tendency.homeWin) < 0.006, `home ${home / N} vs ${pred.tendency.homeWin}`);
  assert.ok(Math.abs(drawn / N - pred.tendency.draw) < 0.006, `draw ${drawn / N} vs ${pred.tendency.draw}`);
});

// The property that makes SE(Δ) estimable: reusing the SAME uniform across two
// data states keeps most drawn scorelines identical, so the paired difference
// carries far less simulation noise than two independent samples would.
//
// The assertion is deliberately COMPARATIVE. §3 is explicit that CRN guarantees
// no fixed reduction — how much smaller the noise gets "depends on the
// correlation between the two data states and must be measured, not assumed".
// So this test measures the reduction against the uncorrelated baseline instead
// of asserting an invented threshold.
test("common random numbers: paired draws move far less than independent draws", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const l0 = eloToLambdas(1700, 1650, p);
  const l1 = eloToLambdas(1710, 1650, p);
  const before = buildScorelineDistribution(l0.lamH, l0.lamA, p);
  const after = buildScorelineDistribution(l1.lamH, l1.lamA, p);

  const key = makeKeyBase({ seasonId: "2026", id: "fixture-1", drawKind: "scoreline" });
  const other = makeKeyBase({ seasonId: "2026", id: "fixture-2", drawKind: "scoreline" });

  const N = 50000;
  let pairedChanged = 0;
  let independentChanged = 0;
  for (let r = 0; r < N; r++) {
    const u = uniform01(key, r);
    const a = scorelineQuantile(before, u);
    const b = scorelineQuantile(after, u);
    if (a[0] !== b[0] || a[1] !== b[1]) pairedChanged++;

    const c = scorelineQuantile(after, uniform01(other, r));
    if (a[0] !== c[0] || a[1] !== c[1]) independentChanged++;
  }
  const paired = pairedChanged / N;
  const independent = independentChanged / N;
  assert.ok(
    paired < independent / 5,
    `CRN barely helped: paired ${(paired * 100).toFixed(1)}% vs independent ${(independent * 100).toFixed(1)}%`,
  );
});

// Same property at the level the app actually reports: the tendency. A 10-Elo
// nudge must leave the overwhelming majority of simulated match outcomes alone.
test("common random numbers: a small rating shift leaves nearly every tendency intact", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const l0 = eloToLambdas(1700, 1650, p);
  const l1 = eloToLambdas(1710, 1650, p);
  const before = buildScorelineDistribution(l0.lamH, l0.lamA, p);
  const after = buildScorelineDistribution(l1.lamH, l1.lamA, p);
  const key = makeKeyBase({ seasonId: "2026", id: "fixture-1", drawKind: "scoreline" });

  const N = 50000;
  let changed = 0;
  for (let r = 0; r < N; r++) {
    const u = uniform01(key, r);
    const a = scorelineQuantile(before, u);
    const b = scorelineQuantile(after, u);
    if (tendencyOf(...a) !== tendencyOf(...b)) changed++;
  }
  assert.ok(changed / N < 0.02, `${((changed / N) * 100).toFixed(2)}% of tendencies flipped`);
});

test("identical data states reproduce identical draws exactly", () => {
  const p = effectiveParams(P, { league: "bl1" });
  const l = eloToLambdas(1700, 1650, p);
  const d1 = buildScorelineDistribution(l.lamH, l.lamA, p);
  const d2 = buildScorelineDistribution(l.lamH, l.lamA, p);
  const key = makeKeyBase({ seasonId: "2026", id: "fixture-1", drawKind: "scoreline" });
  for (let r = 0; r < 5000; r++) {
    assert.deepEqual(drawScoreline(d1, key, r), drawScoreline(d2, key, r));
  }
});

test("tendencyOf labels the three outcomes", () => {
  assert.equal(tendencyOf(2, 1), "homeWin");
  assert.equal(tendencyOf(1, 1), "draw");
  assert.equal(tendencyOf(0, 3), "awayWin");
});

// The fit consumes these primitives so the monorepo carries ONE implementation
// of the model mathematics. That only holds if the two forms of the recursion
// cannot drift apart, so this pins them bit-identical.
test("the single-value and vectorised Poisson recursions agree bit for bit", () => {
  for (const lambda of [0.12, 0.5, 1.0, 1.4732, 2.5, 4.0]) {
    const vector = poissonPmf(lambda, 12);
    for (let k = 0; k <= 12; k++) {
      assert.ok(
        Object.is(poissonAt(lambda, k), vector[k]),
        `poissonAt(${lambda}, ${k}) = ${poissonAt(lambda, k)} but poissonPmf gave ${vector[k]}`,
      );
    }
  }
});

test("dcTau corrects exactly the four low-score cells", () => {
  const rho = -0.1;
  assert.equal(dcTau(0, 0, 1.4, 1.1, rho), 1 - 1.4 * 1.1 * rho);
  assert.equal(dcTau(0, 1, 1.4, 1.1, rho), 1 + 1.4 * rho);
  assert.equal(dcTau(1, 0, 1.4, 1.1, rho), 1 + 1.1 * rho);
  assert.equal(dcTau(1, 1, 1.4, 1.1, rho), 1 - rho);
  for (const [h, a] of [[0, 2], [2, 0], [1, 2], [2, 1], [3, 3]]) {
    assert.equal(dcTau(h, a, 1.4, 1.1, rho), 1, `${h}:${a} must be untouched`);
  }
});
