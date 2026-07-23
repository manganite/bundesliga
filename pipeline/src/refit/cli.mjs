#!/usr/bin/env node
/**
 * The annual refit (§5.5). Runs in summer, NEVER commits directly, opens a PR.
 *
 *   node pipeline/src/refit/cli.mjs --lab-output <file> [--out <dir>]
 *
 * WHERE THE FITS COME FROM. Every fit runs from a PINNED LAB COMMIT, out of
 * `football-model-lab`. This repository does not contain the fitting code and
 * must not reimplement it — a second implementation of the procedure would make
 * the whole provenance chain meaningless. The workflow checks the lab out at
 * its pinned commit, runs it there, and hands the result to this script.
 *
 * THE CONTRACT with the lab run is a single JSON file:
 *
 * {
 *   "labCommit": "<40-hex>",              // the pinned commit that produced this
 *   "hyperparameters": { ... },           // the fitted procedure's hyperparameters
 *   "procedureVersion": "track-c-part0-v1",
 *
 *   // Process A — the incumbent evaluated on the newly completed season S.
 *   // A genuine out-of-sample result: the incumbent never saw S.
 *   "monitoring": { "season": 2026, "matches": 306,
 *                   "logLoss": 0.0, "brier": 0.0, "rps": 0.0, "ece": 0.0,
 *                   "historicalFolds": [ { "season": 2016, "logLoss": 0.0 } ] },
 *
 *   // The unchanged procedure refitted on the newest 15 completed seasons.
 *   "productionFit": { "BASE_TOTAL": 0.0, ... },
 *
 *   // Only when the lab commit changed: the new code fitted on the INCUMBENT'S
 *   // EXACT WINDOW, for the escape-hatch reproduction check.
 *   "reproductionFit": { "BASE_TOTAL": 0.0, ... },
 *
 *   // Process B only: both procedures on IDENTICAL rolling-origin folds.
 *   "backtest": { "incumbent": [ {season, logLoss, brier, rps, ece} ],
 *                 "candidate": [ ... ] }
 * }
 *
 * Anything missing is reported as missing. This script never fills a gap with a
 * plausible number.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { decideProcess, checkReproduction, PROCESS_A, PROCESS_B } from "./decide.mjs";
import { foldMeans, applyGates } from "./gates.mjs";
import { buildPullRequestBody } from "./report.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const ROOT = path.resolve(import.meta.dirname, "../../..");
const labOutputPath = flag("lab-output");
const outDir = path.resolve(flag("out", path.join(ROOT, "refit-output")));

if (!labOutputPath) {
  process.stderr.write(
    "usage: node pipeline/src/refit/cli.mjs --lab-output <file>\n\n"
      + "The fits come from football-model-lab at a pinned commit. This repository does not\n"
      + "contain the fitting code and must not reimplement it.\n",
  );
  process.exit(2);
}

const fail = (message) => {
  process.stderr.write(`REFIT FAILED — nothing written, nothing committed:\n  ${message}\n`);
  process.exit(1);
};

const lab = JSON.parse(await fs.readFile(path.resolve(labOutputPath), "utf8"));
const tolerances = JSON.parse(await fs.readFile(path.join(ROOT, "data", "refit-tolerances.json"), "utf8"));
const shipped = JSON.parse(await fs.readFile(path.join(ROOT, "data", "season-params.json"), "utf8"));

const incumbentCommit = shipped.provenance?.labCommit;
const incumbentHyper = shipped.provenance?.hyperparameters ?? {
  window: tolerances.windowProvenance.seasons,
  weighting: tolerances.windowProvenance.weighting,
};

if (!incumbentCommit) fail("the shipped season-params.json carries no labCommit — code provenance is not optional");
if (!lab.labCommit) fail("the lab output carries no labCommit");

// --- reproduction check, only when the commit changed ------------------------
let reproduction = null;
if (lab.labCommit !== incumbentCommit && lab.reproductionFit) {
  reproduction = checkReproduction(shipped.params, lab.reproductionFit, tolerances);
}

const decision = decideProcess({
  incumbentCommit,
  candidateCommit: lab.labCommit,
  incumbentHyper,
  candidateHyper: lab.hyperparameters ?? incumbentHyper,
  reproduction,
});

// --- run the process ---------------------------------------------------------
let gates = null;
if (decision.process === PROCESS_B) {
  if (!lab.backtest?.incumbent?.length || !lab.backtest?.candidate?.length) {
    fail(
      "Process B requires a rolling-origin backtest of BOTH procedures on identical folds. "
        + "The lab output carries none, so the comparative gates cannot be applied.",
    );
  }
  try {
    gates = applyGates(
      foldMeans(lab.backtest.incumbent),
      foldMeans(lab.backtest.candidate),
      tolerances.comparativeGates,
    );
  } catch (e) {
    fail(e.message);
  }
} else if (!lab.monitoring) {
  fail("Process A requires the incumbent's monitoring report on the newly completed season");
}

// --- assemble the PR ---------------------------------------------------------
const body = buildPullRequestBody({
  decision,
  provenance: {
    candidateCommit: lab.labCommit,
    incumbentCommit,
    hyperparameters: lab.hyperparameters ?? incumbentHyper,
    window: tolerances.windowProvenance,
    procedureVersion: lab.procedureVersion ?? shipped.procedureVersion,
  },
  monitoring: lab.monitoring ?? null,
  baselines: { logLoss: Math.log(3), brier: 2 / 3 },
  reproduction,
  gates,
  newParameters: lab.productionFit ?? null,
});

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "pull-request.md"), body);

// The proposed season-params.json, ready for the PR. Written to the output
// directory, NOT over data/ — this run never commits.
if (lab.productionFit) {
  const proposed = {
    ...shipped,
    procedureVersion: lab.procedureVersion ?? shipped.procedureVersion,
    provenance: {
      ...shipped.provenance,
      labCommit: lab.labCommit,
      hyperparameters: lab.hyperparameters ?? incumbentHyper,
      fitDate: new Date().toISOString().slice(0, 10),
      fitSeasonCount: tolerances.windowProvenance.seasons,
    },
    params: lab.productionFit,
  };
  await fs.writeFile(path.join(outDir, "season-params.json"), `${JSON.stringify(proposed, null, 2)}\n`);
}

const summary = {
  process: decision.process,
  reason: decision.reason,
  escapeHatch: decision.escapeHatch ?? false,
  bitIdentical: reproduction?.bitIdentical ?? null,
  reproductionPasses: reproduction?.passes ?? null,
  gatesPass: gates?.passes ?? null,
  blockedByGuardrail: gates?.blockedByGuardrail ?? false,
  outputDir: outDir,
};
await fs.writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, `process=${decision.process}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `gates_pass=${gates?.passes ?? "n/a"}\n`);
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.stderr.write(
  `\nProzess ${decision.process}. Bericht: ${path.join(outDir, "pull-request.md")}\n`
    + "Dieser Lauf hat nichts committet.\n",
);
