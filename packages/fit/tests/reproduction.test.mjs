import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadTrainingData, TrainingDataError } from "../src/data.mjs";
import { fit, negativeLogLikelihood, defaults } from "../src/procedure.mjs";
import { classOf, checkReproduction } from "../../../pipeline/src/refit/decide.mjs";

// ============================================================================
//  THE REPRODUCTION GATE (Fit-extraction brief, Phase 3).
//
//  The extracted procedure must reproduce the shipped season-params.json. This
//  was a same-language move, so the standard is BIT-IDENTICAL — the tolerance
//  classes are the fallback, not the target.
//
//  These tests need the clubelo-derived training Elo, which is deliberately not
//  committed while the licence question is open. On a clone without it they skip
//  with a message rather than pretending to pass.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const shipped = JSON.parse(fs.readFileSync(path.join(REPO, "data", "season-params.json"), "utf8"));
const tolerances = JSON.parse(fs.readFileSync(path.join(REPO, "data", "refit-tolerances.json"), "utf8"));
const KEYS = shipped.provenance.hyperparameters.fitKeys;

let training = null;
let loadError = null;
try {
  training = await loadTrainingData({ dataDir: path.join(REPO, "data"), window: [2011, 2025] });
} catch (e) {
  loadError = e;
}

const haveTraining = training !== null;
const skip = haveTraining ? false : `training Elo unavailable: ${loadError?.message?.split("\n")[0]}`;

test("the training window is the one the shipped parameters record", { skip }, () => {
  assert.equal(training.matches.length, 9180);
  assert.equal(training.seasons.length, shipped.provenance.fitSeasonCount);
  assert.equal(training.seasons[0], 2011);
  assert.equal(training.seasons.at(-1), 2025);
  assert.equal(new Set(training.matches.map((m) => m.league)).size, 2, "both leagues, pooled");
});

test("every training match carries a pre-match rating pair", { skip }, () => {
  for (const m of training.matches) {
    assert.ok(Number.isFinite(m.eloHome) && Number.isFinite(m.eloAway), `${m.id} lacks a rating`);
  }
});

// The finding that made the gate pass: the sum's order is part of the procedure.
test("the training order is pinned — by file, then the file's own order", { skip }, () => {
  const seen = [];
  for (const m of training.matches) {
    const key = `${m.league}-${m.season}`;
    if (seen[seen.length - 1] !== key) seen.push(key);
  }
  assert.deepEqual(seen, [...seen].sort(), "files must come in lexicographic order");
  assert.equal(seen[0], "bl1-2011");
  assert.equal(seen.at(-1), "bl2-2025");
});

test("reordering the same matches perturbs the likelihood in the last bits", { skip }, () => {
  const base = { ...defaults(), HOME_ADV: 80 };
  const asLoaded = negativeLogLikelihood(training.matches, base);
  const reordered = negativeLogLikelihood(
    training.matches.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    base,
  );
  assert.notEqual(asLoaded, reordered, "a different summation order does change the value");
  assert.ok(Math.abs(asLoaded - reordered) < 1e-12, "but only in the last bits");
});

test("THE GATE: the extracted procedure reproduces the shipped parameters bit for bit", { skip }, () => {
  const { params } = fit(training.matches, { keys: KEYS, start: { HOME_ADV: 80 } });

  const rows = KEYS.map((key) => {
    const cls = classOf(tolerances, key);
    return {
      key,
      cls: cls?.name ?? "—",
      shipped: shipped.params[key],
      reproduced: params[key],
      identical: Object.is(shipped.params[key], params[key]),
    };
  });

  const differing = rows.filter((r) => !r.identical);
  if (differing.length) {
    // Fall back to the pre-committed bounds and report precisely — but a
    // same-language move that is not bit-identical is a bug to investigate, not
    // a tolerance to widen.
    const check = checkReproduction(
      Object.fromEntries(KEYS.map((k) => [k, shipped.params[k]])),
      Object.fromEntries(KEYS.map((k) => [k, params[k]])),
      tolerances,
    );
    assert.fail(
      `${differing.length} of ${KEYS.length} parameters are not bit-identical `
        + `(within pre-committed bounds: ${check.passes}):\n`
        + differing.map((r) => `  ${r.key} [${r.cls}]: ${r.shipped} -> ${r.reproduced}`).join("\n"),
    );
  }

  assert.equal(differing.length, 0);
});

test("the fit is deterministic — same inputs, same output", { skip }, () => {
  const a = fit(training.matches, { keys: KEYS, start: { HOME_ADV: 80 } });
  const b = fit(training.matches, { keys: KEYS, start: { HOME_ADV: 80 } });
  for (const key of KEYS) assert.ok(Object.is(a.params[key], b.params[key]), key);
  assert.ok(Object.is(a.nll, b.nll));
});

test("a missing training half fails loudly rather than fitting on a subset", async () => {
  await assert.rejects(
    () => loadTrainingData({ dataDir: "/nonexistent/data" }),
    TrainingDataError,
  );
});
