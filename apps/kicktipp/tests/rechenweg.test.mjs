import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { effectiveParams } from "../../../packages/engine/src/model.mjs";
import { buildMarketMatrix, impliedProbabilities } from "../src/market.mjs";
import { optimiseMatchday, expectedPoints } from "../src/optimise.mjs";
import {
  marketPercent, tendencyBreakdown, deviation, decisionSentence,
  MODEL_BASIS_CAPTION, DEVIATION_THRESHOLD,
} from "../src/rechenweg.mjs";

// ============================================================================
//  §KICKTIPP_TRANSPARENZ §2/§3 — the Rechenweg surfacing and the Grundlage
//  toggle. PURE checks: nothing here changes the optimiser or the scoring; the
//  decomposition must reconcile with the optimiser's own expected value.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const PARAMS = effectiveParams(
  JSON.parse(fs.readFileSync(path.join(REPO, "data/season-params.json"), "utf8")).params,
  { league: "bl1" },
);
const label = (t) => ({ homeWin: "H", draw: "U", awayWin: "A" }[t]);
const QUOTAS = { homeWin: 4, draw: 6, awayWin: 8 };
// The model basis is the odds-less fallback path — the same the app uses.
const modelBasis = (eloHome, eloAway) => {
  const b = buildMarketMatrix({ eloHome, eloAway, params: PARAMS, odds: null });
  return { matrix: b.matrix, maxGoals: b.maxGoals, region: b.market, source: b.source };
};

test("the per-tendency decomposition sums EXACTLY to the optimiser's expected value", () => {
  const m = modelBasis(1780, 1610);
  for (const b of tendencyBreakdown(m.matrix, m.maxGoals, QUOTAS)) {
    const sum = b.parts.tendenz + b.parts.differenz + b.parts.exakt;
    assert.ok(Math.abs(sum - b.expected) < 1e-12, `${b.tendency}: parts ${sum} vs expected ${b.expected}`);
    // …and equals expectedPoints for that exact tip (no separate computation).
    const e = expectedPoints(b.tip, m.matrix, m.maxGoals, QUOTAS);
    assert.ok(Math.abs(e.expected - b.expected) < 1e-12);
  }
});

test("market percentages equal impliedProbabilities, and the margin is the overround", () => {
  const odds = { home: 1.5, draw: 4.0, away: 6.0 };
  const p = marketPercent(odds);
  const ref = impliedProbabilities({ home: 1.5, draw: 4.0, away: 6.0 });
  assert.equal(p.homeWin, ref.homeWin);
  assert.equal(p.draw, ref.draw);
  assert.equal(p.awayWin, ref.awayWin);
  assert.equal(p.margin, ref.overround);
  assert.equal(marketPercent(null), null, "no odds → no market percentages (model-only)");
});

test("deviation flags a tendency where model and market differ by ≥ 10 Pp.", () => {
  const market = { homeWin: 0.60, draw: 0.25, awayWin: 0.15 };
  const model = { homeWin: 0.45, draw: 0.25, awayWin: 0.30 }; // H −15pp, A +15pp
  const dev = deviation(market, model);
  assert.equal(dev.homeWin, true);
  assert.equal(dev.awayWin, true);
  assert.equal(dev.draw, false);
  // Just under the threshold does not flag.
  assert.equal(deviation({ homeWin: 0.5 }, { homeWin: 0.5 - DEVIATION_THRESHOLD + 0.001 }).homeWin, false);
  assert.deepEqual(deviation(null, model), {}, "no market → nothing to compare");
});

test("model mode is the odds-less fallback, and the toggle genuinely changes the basis (§3)", () => {
  const elo = { eloHome: 1700, eloAway: 1550 };
  // The model basis IS buildMarketMatrix(odds:null) — the existing fallback path,
  // odds-independent by construction, so model mode reproduces it bit-identically.
  const model = buildMarketMatrix({ ...elo, params: PARAMS, odds: null });
  assert.equal(model.source, "model");
  const modelAgain = buildMarketMatrix({ ...elo, params: PARAMS, odds: null });
  assert.deepEqual([...model.matrix.pmf], [...modelAgain.matrix.pmf], "the fallback is deterministic");

  // With extreme odds the MARKET basis differs from the model — the toggle matters.
  const market = buildMarketMatrix({ ...elo, params: PARAMS, odds: { home: 1.2, draw: 6, away: 12 } });
  assert.equal(market.source, "market");
  const differs = ["homeWin", "draw", "awayWin"].some((t) => Math.abs(market.market[t] - model.market[t]) > 0.02);
  assert.ok(differs, "market and model region masses should differ under extreme odds");

  // A model-only fixture's two bases coincide → switching the toggle is a no-op.
  const marketNoOdds = buildMarketMatrix({ ...elo, params: PARAMS, odds: null });
  assert.deepEqual([...marketNoOdds.matrix.pmf], [...model.matrix.pmf]);
});

test("the decision sentence names the margin, and flags a deviation from the favourite", () => {
  const m = modelBasis(1780, 1610);
  const bd = tendencyBreakdown(m.matrix, m.maxGoals, QUOTAS);
  const noDev = decisionSentence(bd, bd[0].tendency, label);
  assert.match(noDev, /Kein Abweichen/);
  assert.match(noDev, /erwartete Punkte/);
  // If the favourite is NOT the winner, it reads as a deviation.
  const other = bd.find((b) => b.tendency !== bd[0].tendency).tendency;
  assert.match(decisionSentence(bd, other, label), /Abweichung/);
});

test("the model-basis caption is anchored and honest (market is the better long-run estimate)", () => {
  assert.match(MODEL_BASIS_CAPTION, /margenfreie Marktquoten die bessere Einzelspiel-Schätzung/);
  assert.match(MODEL_BASIS_CAPTION, /nicht automatisch besser/);
});
