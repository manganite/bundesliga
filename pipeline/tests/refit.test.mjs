import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  decideProcess, checkReproduction, classOf, PROCESS_A, PROCESS_B, RefitError,
} from "../src/refit/decide.mjs";
import { foldMeans, applyGates, mergeDecision, GateError } from "../src/refit/gates.mjs";
import { buildPullRequestBody } from "../src/refit/report.mjs";

const tolerances = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../data/refit-tolerances.json"), "utf8"),
);
const shipped = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../data/season-params.json"), "utf8"),
);

const HASH_A = "bb000fbbd945dbc19c41baf093d607065747af92";
const HASH_B = "0123456789abcdef0123456789abcdef01234567";
const hyper = { window: 15, weighting: "equal", model: "v1" };

// ---------------------------------------------------------------------------
// the tolerance file itself
// ---------------------------------------------------------------------------

test("every shipped parameter has a tolerance class", () => {
  const missing = Object.keys(shipped.params).filter((k) => !classOf(tolerances, k));
  assert.deepEqual(missing, [], `no tolerance class for: ${missing.join(", ")}`);
});

test("structural parameters must reproduce exactly — they are decisions, not fits", () => {
  const structural = classOf(tolerances, "ET_FACTOR");
  assert.equal(structural.absolute, 0);
  assert.equal(structural.relative, 0);
  assert.equal(classOf(tolerances, "MAX_GOALS").absolute, 0);
});

test("bit-identical reproduction is the stated default expectation", () => {
  assert.equal(tolerances.preference.bitIdenticalPreferred, true);
});

// ---------------------------------------------------------------------------
// Process A / B decision
// ---------------------------------------------------------------------------

test("same hash and same hyperparameters is Process A", () => {
  const d = decideProcess({
    incumbentCommit: HASH_A, candidateCommit: HASH_A,
    incumbentHyper: hyper, candidateHyper: hyper,
  });
  assert.equal(d.process, PROCESS_A);
});

test("different hyperparameters is Process B, escape hatch or not", () => {
  const reproduction = checkReproduction(shipped.params, shipped.params, tolerances);
  const d = decideProcess({
    incumbentCommit: HASH_A, candidateCommit: HASH_A,
    incumbentHyper: hyper, candidateHyper: { ...hyper, window: 20 },
    reproduction,
  });
  assert.equal(d.process, PROCESS_B);
  assert.match(d.reason, /hyperparameters differ/);
});

test("a changed hash without a reproduction check is Process B", () => {
  const d = decideProcess({
    incumbentCommit: HASH_A, candidateCommit: HASH_B,
    incumbentHyper: hyper, candidateHyper: hyper,
  });
  assert.equal(d.process, PROCESS_B);
  assert.match(d.reason, /without it, Process B applies/);
});

test("a changed hash WITH a passing reproduction stays Process A", () => {
  const reproduction = checkReproduction(shipped.params, shipped.params, tolerances);
  assert.equal(reproduction.bitIdentical, true);
  const d = decideProcess({
    incumbentCommit: HASH_A, candidateCommit: HASH_B,
    incumbentHyper: hyper, candidateHyper: hyper, reproduction,
  });
  assert.equal(d.process, PROCESS_A);
  assert.equal(d.escapeHatch, true);
  assert.equal(d.bitIdentical, true);
});

test("tiny numerical noise still passes, and is reported as not bit-identical", () => {
  const noisy = { ...shipped.params, BASE_TOTAL: shipped.params.BASE_TOTAL + 1e-13 };
  const reproduction = checkReproduction(shipped.params, noisy, tolerances);
  assert.equal(reproduction.passes, true);
  assert.equal(reproduction.bitIdentical, false);

  const d = decideProcess({
    incumbentCommit: HASH_A, candidateCommit: HASH_B,
    incumbentHyper: hyper, candidateHyper: hyper, reproduction,
  });
  assert.equal(d.process, PROCESS_A);
  assert.match(d.reason, /within the pre-committed bounds/);
});

test("a real parameter change fails reproduction and forces Process B — no discretion", () => {
  const changed = { ...shipped.params, HOME_ADV: shipped.params.HOME_ADV + 0.5 };
  const reproduction = checkReproduction(shipped.params, changed, tolerances);
  assert.equal(reproduction.passes, false);
  assert.equal(reproduction.failed[0].parameter, "HOME_ADV");

  const d = decideProcess({
    incumbentCommit: HASH_A, candidateCommit: HASH_B,
    incumbentHyper: hyper, candidateHyper: hyper, reproduction,
  });
  assert.equal(d.process, PROCESS_B);
  assert.match(d.reason, /no discretion at this step/);
});

test("a parameter the tolerance file has never seen fails, rather than passing by default", () => {
  const grown = { ...shipped.params, NEW_TERM: 0.3 };
  const reproduction = checkReproduction(shipped.params, grown, tolerances);
  assert.equal(reproduction.passes, false);
  assert.ok(reproduction.failed.some((f) => f.parameter === "NEW_TERM"));
});

test("a structural parameter cannot drift at all", () => {
  const drifted = { ...shipped.params, ET_FACTOR: shipped.params.ET_FACTOR + 1e-15 };
  const reproduction = checkReproduction(shipped.params, drifted, tolerances);
  assert.equal(reproduction.passes, false);
});

test("missing code provenance is refused outright", () => {
  assert.throws(
    () => decideProcess({ incumbentCommit: null, candidateCommit: HASH_B, incumbentHyper: hyper, candidateHyper: hyper }),
    RefitError,
  );
});

// ---------------------------------------------------------------------------
// the comparative gates
// ---------------------------------------------------------------------------

const folds = (logLoss, brier, rps, ece, n = 10) => Array.from({ length: n }, (_, i) => ({
  season: 2016 + i, logLoss, brier, rps, ece,
}));

const gateConfig = tolerances.comparativeGates;

test("an improvement passes every gate", () => {
  const inc = foldMeans(folds(1.0, 0.60, 0.20, 2.5));
  const cand = foldMeans(folds(0.98, 0.59, 0.198, 2.4));
  const r = applyGates(inc, cand, gateConfig);
  assert.equal(r.passes, true);
  assert.equal(r.decision.passes, true);
  assert.deepEqual(r.breached, []);
});

test("log-loss worsening beyond 0.5 % relative fails the decision metric", () => {
  const inc = foldMeans(folds(1.0, 0.60, 0.20, 2.5));
  const justInside = applyGates(inc, foldMeans(folds(1.004, 0.60, 0.20, 2.5)), gateConfig);
  assert.equal(justInside.decision.passes, true, "0.4 % is inside the 0.5 % limit");

  const outside = applyGates(inc, foldMeans(folds(1.006, 0.60, 0.20, 2.5)), gateConfig);
  assert.equal(outside.decision.passes, false, "0.6 % is outside");
  assert.equal(outside.passes, false);
});

// The rule that matters most: a guardrail breach blocks REGARDLESS of log-loss.
test("a guardrail breach blocks the merge even when log-loss improves", () => {
  const inc = foldMeans(folds(1.0, 0.60, 0.20, 2.5));
  const cand = foldMeans(folds(0.90, 0.615, 0.20, 2.5)); // log-loss much better, Brier 2.5 % worse
  const r = applyGates(inc, cand, gateConfig);
  assert.equal(r.decision.passes, true, "log-loss improved");
  assert.equal(r.blockedByGuardrail, true);
  assert.equal(r.passes, false, "a guardrail breach blocks regardless of log-loss");
  assert.equal(r.breached[0].metric, "brier");
});

test("the ECE guardrail is absolute, in percentage points", () => {
  const inc = foldMeans(folds(1.0, 0.60, 0.20, 2.0));
  assert.equal(applyGates(inc, foldMeans(folds(1.0, 0.60, 0.20, 2.9)), gateConfig).passes, true);
  const breach = applyGates(inc, foldMeans(folds(1.0, 0.60, 0.20, 3.2)), gateConfig);
  assert.equal(breach.passes, false);
  assert.equal(breach.breached[0].metric, "ece");
});

test("too few folds, or mismatched folds, is refused", () => {
  const inc = foldMeans(folds(1.0, 0.60, 0.20, 2.5, 4));
  assert.throws(() => applyGates(inc, foldMeans(folds(1.0, 0.6, 0.2, 2.5, 4)), gateConfig), /at least 5 folds/);
  assert.throws(
    () => applyGates(foldMeans(folds(1.0, 0.6, 0.2, 2.5, 10)), foldMeans(folds(1.0, 0.6, 0.2, 2.5, 8)), gateConfig),
    /SAME folds/,
  );
  assert.throws(() => foldMeans([]), GateError);
});

// ---------------------------------------------------------------------------
// the override rule
// ---------------------------------------------------------------------------

test("no report means no merge, whatever the gates say", () => {
  const gates = applyGates(foldMeans(folds(1.0, 0.6, 0.2, 2.5)), foldMeans(folds(0.9, 0.59, 0.19, 2.4)), gateConfig);
  assert.equal(mergeDecision({ gates, reportPresent: false }).mayMerge, false);
  assert.equal(mergeDecision({ gates, reportPresent: true }).mayMerge, true);
});

test("a failing gate blocks by default, and a silent override is refused", () => {
  const gates = applyGates(foldMeans(folds(1.0, 0.6, 0.2, 2.5)), foldMeans(folds(1.05, 0.6, 0.2, 2.5)), gateConfig);
  assert.equal(gates.passes, false);
  assert.equal(mergeDecision({ gates, reportPresent: true }).mayMerge, false);
  // An override with no written justification is not an override.
  assert.equal(mergeDecision({ gates, reportPresent: true, override: {} }).mayMerge, false);
  assert.equal(mergeDecision({ gates, reportPresent: true, override: { justification: "passt schon" } }).mayMerge, false);
});

test("an override with a written justification is allowed and recorded", () => {
  const gates = applyGates(foldMeans(folds(1.0, 0.6, 0.2, 2.5)), foldMeans(folds(1.05, 0.6, 0.2, 2.5)), gateConfig);
  const d = mergeDecision({
    gates,
    reportPresent: true,
    override: {
      by: "manganite",
      justification: "Der Log-Loss-Rückgang stammt aus zwei Folds mit auffälliger Torverteilung; "
        + "die übrigen acht Folds sind unverändert. Entscheidung dokumentiert und im nächsten Jahr erneut zu prüfen.",
    },
  });
  assert.equal(d.mayMerge, true);
  assert.equal(d.override.recorded, true);
});

// ---------------------------------------------------------------------------
// the pull-request body
// ---------------------------------------------------------------------------

const provenance = {
  candidateCommit: HASH_B,
  incumbentCommit: HASH_A,
  hyperparameters: hyper,
  window: tolerances.windowProvenance,
  procedureVersion: "track-c-part0-v1",
};

test("a Process A report carries provenance, the monitoring result and no gates", () => {
  const body = buildPullRequestBody({
    decision: { process: PROCESS_A, reason: "same pinned lab commit and same hyperparameters" },
    provenance,
    monitoring: { season: 2026, matches: 306, logLoss: 0.98, brier: 0.59, rps: 0.19, ece: 2.4 },
    baselines: { logLoss: Math.log(3), brier: 2 / 3 },
    newParameters: shipped.params,
  });

  assert.match(body, /Prozess A/);
  assert.match(body, new RegExp(HASH_A));
  assert.match(body, new RegExp(HASH_B));
  assert.match(body, /15 Saisons, gleichgewichtet/);
  assert.match(body, /echtes Out-of-Sample-Ergebnis/);
  assert.match(body, /kein vergleichendes Gate/);
  assert.match(body, /committet nichts direkt/);
  assert.doesNotMatch(body, /Vergleichende Gates/, "Process A has no comparative gates");
});

test("a Process B report carries the gates and the override rule", () => {
  const gates = applyGates(foldMeans(folds(1.0, 0.6, 0.2, 2.5)), foldMeans(folds(1.05, 0.62, 0.2, 2.5)), gateConfig);
  const body = buildPullRequestBody({
    decision: { process: PROCESS_B, reason: "hyperparameters differ" },
    provenance,
    gates,
    newParameters: null,
  });

  assert.match(body, /Prozess B/);
  assert.match(body, /Vergleichende Gates/);
  assert.match(body, /Leitplanke ist gerissen/);
  assert.match(body, /schriftlicher Begründung/);
  assert.match(body, /Stille[\s\S]{0,40}Übersteuerungen sind unzulässig/);
});

test("the report states that a changed window rule is itself a Process B change", () => {
  const body = buildPullRequestBody({
    decision: { process: PROCESS_A, reason: "same pinned lab commit" },
    provenance,
    newParameters: shipped.params,
  });
  assert.match(body, /Ändert sich die Fensterregel, ist das ein Prozess-B-Wechsel/);
});

test("a failed reproduction is shown with its pre-committed bounds", () => {
  const changed = { ...shipped.params, HOME_ADV: shipped.params.HOME_ADV + 0.5 };
  const reproduction = checkReproduction(shipped.params, changed, tolerances);
  const body = buildPullRequestBody({
    decision: { process: PROCESS_B, reason: "reproduction failed" },
    provenance,
    reproduction,
    newParameters: null,
  });
  assert.match(body, /Reproduktionsprüfung/);
  assert.match(body, /nicht bestanden/);
  assert.match(body, /HOME_ADV/);
  assert.match(body, /vor.{0,3} diesem Lauf/);
});
