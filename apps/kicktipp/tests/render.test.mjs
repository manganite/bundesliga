import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { effectiveParams } from "../../../packages/engine/src/model.mjs";
import { buildMarketMatrix } from "../src/market.mjs";
import { favouriteTendency } from "../src/optimise.mjs";
import { oddsSourceLabel, oddsSourceShort, BOOKMAKER_MARGIN_THRESHOLD } from "../src/rechenweg.mjs";
import { renderRechenweg } from "../src/render.mjs";

// ============================================================================
//  §Quellen-Label — „entrandet" gone, the odds source named, and the guard:
//  the Modell line shows the MODEL, never the reweighted matrix wearing the
//  market's margins.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const PARAMS = effectiveParams(
  JSON.parse(fs.readFileSync(path.join(REPO, "data/season-params.json"), "utf8")).params,
  { league: "bl1" },
);
const doc = new JSDOM("").window.document;

// Augsburg – Schalke (1. Spieltag) reference: Markt 44,0/25,5/30,5, Modell
// 56,6/23,9/19,5 — a real margin-free (computed) round.
const REF_ODDS = { home: 2.27, draw: 3.92, away: 3.28 }; // → ~44,0/25,5/30,5, ~0 % margin
const REF_MODEL = { homeWin: 0.566, draw: 0.239, awayWin: 0.195 };

function row({ odds = REF_ODDS, model = REF_MODEL } = {}) {
  const m = buildMarketMatrix({ eloHome: 1650, eloAway: 1600, params: PARAMS, odds: null });
  return {
    homeName: "Augsburg", awayName: "Schalke", odds,
    model: { region: model }, matrix: m.matrix, maxGoals: m.maxGoals,
    quotas: { homeWin: 4, draw: 5, awayWin: 8 },
    basisTendency: favouriteTendency(model),
  };
}

// ---------------------------------------------------------------------------
//  §1 · No jargon; the margin explained.
// ---------------------------------------------------------------------------

test("no user-facing string in the app uses the entrandet jargon (source scan)", () => {
  const roots = ["apps/kicktipp/src", "apps/kicktipp/index.html"];
  const files = [];
  for (const r of roots) {
    const p = path.join(REPO, r);
    if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) files.push(path.join(p, f));
    else files.push(p);
  }
  const offenders = files.filter((f) => /\.(m?js|html|css)$/.test(f) && /entrandet/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(offenders.map((f) => path.relative(REPO, f)), []);
});

test("the market line reads in plain language and explains where the margin comes from", () => {
  const text = renderRechenweg(row(), doc).textContent;
  assert.doesNotMatch(text, /entrandet/);
  assert.match(text, /ohne Marge/);
  assert.match(text, /Kehrwerte der Quoten summieren auf .* — der Überschuss ist die Marge/);
});

// ---------------------------------------------------------------------------
//  §2 · The odds source, from the margin.
// ---------------------------------------------------------------------------

test("oddsSourceLabel names bookmaker vs computed odds by the margin threshold", () => {
  assert.match(oddsSourceLabel(0.05), /Buchmacherquoten \(Marge 5,0 %\)/);
  assert.match(oddsSourceLabel(0.001), /rechnerische Quoten ohne Marge — vermutlich aus dem Tippverhalten/);
  assert.equal(oddsSourceLabel(BOOKMAKER_MARGIN_THRESHOLD).startsWith("Buchmacher"), true, "the threshold itself is bookmaker");
  assert.equal(oddsSourceLabel(null), null);
  assert.equal(oddsSourceShort(0.05), "Buchmacher");
  assert.equal(oddsSourceShort(0.001), "rechnerisch");
});

test("the disclosure states the odds source (computed for the margin-free reference)", () => {
  const text = renderRechenweg(row(), doc).textContent;
  assert.match(text, /Quotenquelle: rechnerische Quoten ohne Marge/);
  // A real bookmaker line (md1-style, ~5 %) is labelled accordingly.
  const book = renderRechenweg(row({ odds: { home: 1.32, draw: 6.5, away: 7.25 } }), doc).textContent;
  assert.match(book, /Quotenquelle: Buchmacherquoten \(Marge/);
});

// ---------------------------------------------------------------------------
//  §3 · Guard: the Modell line shows the model, not the market.
// ---------------------------------------------------------------------------

test("the Modell line shows the odds-less run's numbers, NOT the market percentages", () => {
  const text = renderRechenweg(row(), doc).textContent;
  // The model line carries the model's own masses…
  assert.match(text, /Modell: 56,6 % \/ 23,9 % \/ 19,5 %/);
  // …and the market line carries the market's — the two are NOT the same.
  assert.match(text, /ohne Marge 44,0 % \/ 25,5 % \/ 30,5 %/);
  assert.match(text, /deutliche Abweichung vom Markt bei H, A/);
});

test("self-test: if the Modell line were wired to the market, the deviation would vanish", () => {
  // Feed the MARKET masses into model.region — the mis-wiring the guard exists
  // to catch. Then there is no divergence and the flag does not fire, which is
  // exactly what the guard test above would fail on.
  const marketMasses = { homeWin: 0.44, draw: 0.255, awayWin: 0.305 };
  const text = renderRechenweg(row({ model: marketMasses }), doc).textContent;
  assert.doesNotMatch(text, /deutliche Abweichung vom Markt/);
  assert.match(text, /Modell: 44,0 % \/ 25,5 % \/ 30,5 %/);
});
