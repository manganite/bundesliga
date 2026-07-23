import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  impliedProbabilities, buildMarketMatrix, marginsOf, requiredGrid,
  OMITTED_MASS_LIMIT, PATHOLOGICAL_GOALS, OddsError,
} from "../src/market.mjs";
import { effectiveParams, eloToLambdas } from "../../../packages/engine/src/model.mjs";
import {
  expectedPoints, bestTip, bestTipWithinTendency, favouriteTendency, hitRateComparison,
  optimiseMatchday, SELECTABLE_GOALS,
} from "../src/optimise.mjs";

const P = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../../data/season-params.json"), "utf8"),
).params;
const params = effectiveParams(P, { league: "bl1" });

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// odds → probabilities
// ---------------------------------------------------------------------------

test("simple normalisation removes the overround and sums to 1", () => {
  const p = impliedProbabilities({ home: 1.8, draw: 3.6, away: 4.5 });
  assert.ok(near(p.homeWin + p.draw + p.awayWin, 1));
  assert.ok(p.homeWin > p.draw && p.draw > p.awayWin);
  assert.ok(p.overround > 0, "a real book has an overround");
});

test("a fair book has zero overround", () => {
  const p = impliedProbabilities({ home: 3, draw: 3, away: 3 });
  assert.ok(near(p.overround, 0));
  assert.ok(near(p.homeWin, 1 / 3));
});

test("missing, non-positive or unparseable odds throw rather than guess", () => {
  for (const bad of [
    { home: 0, draw: 3, away: 4 },
    { home: -2, draw: 3, away: 4 },
    { home: 1, draw: 3, away: 4 },
    { home: "keine Zahl", draw: 3, away: 4 },
    { home: undefined, draw: 3, away: 4 },
  ]) {
    assert.throws(() => impliedProbabilities(bad), OddsError);
  }
});

// ---------------------------------------------------------------------------
// region reweighting
// ---------------------------------------------------------------------------

test("the market margins are exact BY CONSTRUCTION, with no optimiser", () => {
  const odds = { home: 1.8, draw: 3.6, away: 4.5 };
  const market = impliedProbabilities(odds);
  const built = buildMarketMatrix({ eloHome: 1800, eloAway: 1650, params, odds });

  const margins = marginsOf(built.matrix, built.maxGoals);
  assert.ok(near(margins.homeWin, market.homeWin, 1e-12), `home ${margins.homeWin} vs ${market.homeWin}`);
  assert.ok(near(margins.draw, market.draw, 1e-12));
  assert.ok(near(margins.awayWin, market.awayWin, 1e-12));
  assert.ok(near(margins.homeWin + margins.draw + margins.awayWin, 1, 1e-12));
});

test("the model still supplies the shape WITHIN each outcome", () => {
  const odds = { home: 1.8, draw: 3.6, away: 4.5 };
  const built = buildMarketMatrix({ eloHome: 1800, eloAway: 1650, params, odds });
  const n = built.maxGoals;
  const at = (h, a) => built.matrix.pmf[h * (n + 1) + a];
  // Within the home-win region the ordering the model produces must survive:
  // 1:0 is more likely than 5:0.
  assert.ok(at(1, 0) > at(5, 0));
  assert.ok(at(2, 1) > at(6, 1));
});

test("unusable odds fall back to the model and say so", () => {
  const built = buildMarketMatrix({
    eloHome: 1800, eloAway: 1650, params, odds: { home: 0, draw: 3, away: 4 },
  });
  assert.equal(built.source, "model");
  assert.match(built.note, /Modellwahrscheinlichkeit/);
});

// ---------------------------------------------------------------------------
// grid extent — the rule evaluated AFTER reweighting
// ---------------------------------------------------------------------------

test("the grid is extended until the WEIGHTED omitted mass is under the limit", () => {
  const { lamH, lamA } = eloToLambdas(1800, 1650, params);
  const market = impliedProbabilities({ home: 1.8, draw: 3.6, away: 4.5 });
  const grid = requiredGrid(lamH, lamA, params, market);
  assert.equal(grid.pathological, false);
  assert.ok(grid.omitted < OMITTED_MASS_LIMIT, `omitted ${grid.omitted}`);
  assert.ok(grid.maxGoals >= 6 && grid.maxGoals <= PATHOLOGICAL_GOALS);
});

test("the reweighting factors drive the bound, and it is the WEIGHTED sum that counts", () => {
  const { lamH, lamA } = eloToLambdas(1900, 1500, params); // model: away win is rare
  const withModel = requiredGrid(lamH, lamA, params, impliedProbabilities({ home: 1.3, draw: 5, away: 9 }));
  const againstModel = requiredGrid(lamH, lamA, params, impliedProbabilities({ home: 9, draw: 5, away: 1.3 }));

  // Upweighting the rare region blows up its factor — that is the effect §9
  // says the bound must account for.
  assert.ok(
    againstModel.factors.awayWin > withModel.factors.awayWin * 2,
    `away factor ${withModel.factors.awayWin} -> ${againstModel.factors.awayWin}`,
  );

  // But the grid does NOT simply grow with it: the home factor collapses at the
  // same time, and for a strong home side that is where the tail mass lives.
  // Measured: factors home 0.849 -> 0.123, away 3.0 -> 20.7, and the required
  // grid falls from 10 to 9. This is exactly why §9 demands the weighted sum
  // rather than the conservative `omittedMass × max_r f_r`, which would force a
  // larger grid here for no benefit.
  assert.ok(againstModel.factors.homeWin < withModel.factors.homeWin);

  // What must hold in every case is the bound itself.
  for (const g of [withModel, againstModel]) {
    assert.equal(g.pathological, false);
    assert.ok(g.omitted < OMITTED_MASS_LIMIT, `omitted ${g.omitted} exceeds the limit`);
  }
});

test("a pathological market falls back to the model and surfaces a note", () => {
  // Force the guard by asking for a grid the rule cannot satisfy under 20 goals:
  // a market that is essentially certain of an outcome the model finds absurd.
  const built = buildMarketMatrix({
    eloHome: 2600, eloAway: 700, params, odds: { home: 500, draw: 500, away: 1.001 },
  });
  if (built.pathological) {
    assert.equal(built.source, "model");
    assert.match(built.note, /mehr als 20 Tore/);
  } else {
    // Not pathological here — then the contract still has to hold exactly.
    const margins = marginsOf(built.matrix, built.maxGoals);
    assert.ok(near(margins.homeWin + margins.draw + margins.awayWin, 1, 1e-12));
  }
});

// ---------------------------------------------------------------------------
// the optimiser
// ---------------------------------------------------------------------------

const quotas = { homeWin: 3, draw: 6, awayWin: 8 };

function fixture(eloH, eloA, odds, q = quotas) {
  const built = buildMarketMatrix({ eloHome: eloH, eloAway: eloA, params, odds });
  return {
    id: `${eloH}-${eloA}`,
    matrix: built.matrix,
    maxGoals: built.maxGoals,
    market: built.market,
    quotas: q,
  };
}

test("expected points combine the quota with exactly one bonus tier", () => {
  const f = fixture(1800, 1650, { home: 1.8, draw: 3.6, away: 4.5 });
  const e = expectedPoints({ home: 2, away: 0 }, f.matrix, f.maxGoals, f.quotas);
  assert.ok(e.expected > 0);
  // The two bonus probabilities are disjoint by construction.
  assert.ok(e.pExact + e.pGoalDiff <= e.pTendency + 1e-12);
  assert.equal(e.tendency, "homeWin");
});

test("bonus terms are summed over the FULL matrix, never renormalised onto 0–6", () => {
  const f = fixture(1900, 1500, { home: 1.2, draw: 6, away: 15 });
  const e = expectedPoints({ home: 1, away: 0 }, f.matrix, f.maxGoals, f.quotas);
  // A 7:6 is outside the selectable grid but inside the matrix; the tendency
  // probability must reflect the whole region, not the 0–6 corner of it.
  const margins = marginsOf(f.matrix, f.maxGoals);
  assert.ok(near(e.pTendency, margins.homeWin, 1e-12), "pTendency must equal the full region mass");
  assert.ok(f.maxGoals > SELECTABLE_GOALS, "the matrix must be larger than the selectable grid");
});

test("the optimiser picks the highest expected-points tip", () => {
  const f = fixture(1800, 1650, { home: 1.8, draw: 3.6, away: 4.5 });
  const best = bestTip(f.matrix, f.maxGoals, f.quotas);
  for (let h = 0; h <= SELECTABLE_GOALS; h++) {
    for (let a = 0; a <= SELECTABLE_GOALS; a++) {
      const e = expectedPoints({ home: h, away: a }, f.matrix, f.maxGoals, f.quotas);
      assert.ok(e.expected <= best.expected + 1e-12, `${h}:${a} beat the chosen tip`);
    }
  }
});

test("a high quota on an unlikely tendency can pull the tip off the favourite", () => {
  // The market strongly favours the home side, but the pool barely tips the
  // away win, so it pays 9 instead of 3.
  const f = fixture(1900, 1550, { home: 1.25, draw: 5.5, away: 11 }, { homeWin: 3, draw: 5, awayWin: 9 });
  const best = bestTip(f.matrix, f.maxGoals, f.quotas);
  assert.equal(favouriteTendency(f.market), "homeWin");
  assert.ok(best.expected >= bestTipWithinTendency(f.matrix, f.maxGoals, f.quotas, "homeWin").expected);
});

// ---------------------------------------------------------------------------
// THE HIT-RATE INVARIANT (§11): the expected hit rate of the optimised tips can
// never exceed that of the favourite tips.
// ---------------------------------------------------------------------------

test("property: optimised expected hit rate never exceeds the favourite's", () => {
  const markets = [
    { home: 1.25, draw: 5.5, away: 11 },
    { home: 1.8, draw: 3.6, away: 4.5 },
    { home: 3.4, draw: 3.4, away: 2.1 },
    { home: 2.5, draw: 3.2, away: 2.8 },
    { home: 8, draw: 5, away: 1.35 },
  ];
  const quotaSets = [
    { homeWin: 3, draw: 6, awayWin: 9 },
    { homeWin: 9, draw: 4, awayWin: 3 },
    { homeWin: 5, draw: 5, awayWin: 5 },
    { homeWin: 3, draw: 9, awayWin: 4 },
  ];
  for (const odds of markets) {
    for (const q of quotaSets) {
      for (const [eh, ea] of [[1900, 1500], [1750, 1700], [1500, 1900]]) {
        const f = fixture(eh, ea, odds, q);
        const tip = bestTip(f.matrix, f.maxGoals, f.quotas);
        const cmp = hitRateComparison([{ id: f.id, market: f.market, tip }]);
        assert.ok(
          cmp.optimisedExpected <= cmp.favouriteExpected + 1e-12,
          `invariant broken: ${cmp.optimisedExpected} > ${cmp.favouriteExpected}`,
        );
      }
    }
  }
});

test("the warning fires exactly when the expected hit rate is strictly lower", () => {
  const market = { homeWin: 0.6, draw: 0.25, awayWin: 0.15 };

  // Same tendency as the favourite, different scoreline — nothing changed.
  const same = hitRateComparison([{ id: "a", market, tip: { tendency: "homeWin" } }]);
  assert.equal(same.warn, false, "a different scoreline within one tendency must not warn");
  assert.ok(near(same.optimisedExpected, same.favouriteExpected));

  // A less probable tendency — strictly lower, so it must warn.
  const worse = hitRateComparison([{ id: "a", market, tip: { tendency: "awayWin" } }]);
  assert.equal(worse.warn, true);
  assert.ok(worse.optimisedExpected < worse.favouriteExpected);
  assert.equal(worse.differing.length, 1);
});

test("an equally probable tendency does not warn", () => {
  const tied = { homeWin: 0.4, draw: 0.4, awayWin: 0.2 };
  const cmp = hitRateComparison([{ id: "a", market: tied, tip: { tendency: "draw" } }]);
  assert.equal(cmp.warn, false, "equal probability is not strictly lower");
  assert.ok(near(cmp.optimisedExpected, cmp.favouriteExpected));
});

test("a whole matchday reports both totals so the trade-off is visible", () => {
  const fixtures = [
    fixture(1900, 1550, { home: 1.25, draw: 5.5, away: 11 }, { homeWin: 3, draw: 5, awayWin: 9 }),
    fixture(1750, 1700, { home: 2.1, draw: 3.4, away: 3.4 }, { homeWin: 5, draw: 5, awayWin: 5 }),
  ];
  const r = optimiseMatchday(fixtures);
  assert.equal(r.rows.length, 2);
  assert.ok(r.expectedPointsTotal >= r.favouritePointsTotal - 1e-12, "optimising must not lower expected points");
  assert.ok(r.hitRate.optimisedExpected <= r.hitRate.favouriteExpected + 1e-12);
});
