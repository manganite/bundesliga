#!/usr/bin/env node
/**
 * The production fit, as the refit workflow calls it.
 *
 *   node packages/fit/src/cli.mjs --window 2011-2025 --out lab-output.json
 *   node packages/fit/src/cli.mjs --window 2011-2025 --folds 10 --out lab-output.json
 *
 * Emits the JSON contract documented in `pipeline/src/refit/cli.mjs`. The
 * contract is unchanged by the extraction — only its fulfiller moved, out of the
 * private lab and into this repository. `labCommit` in that contract therefore
 * now carries THIS repository's commit hash; the field name stays so
 * `pipeline/src/refit/{decide,gates,report}.mjs` keep working untouched.
 *
 * Options:
 *   --window A-B         inclusive season range for the production fit
 *   --folds N            rolling-origin backtest with N folds (Process B)
 *   --monitor-season S   evaluate the INCUMBENT on season S (Process A)
 *   --out <file>         where to write; stdout if omitted
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadTrainingData } from "./data.mjs";
import { fit, heldOutMetrics } from "./procedure.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const REPO = path.resolve(import.meta.dirname, "../../..");
const dataDir = path.resolve(flag("data-dir", path.join(REPO, "data")));
const outFile = flag("out", null);

const shipped = JSON.parse(await fs.readFile(path.join(dataDir, "season-params.json"), "utf8"));
const hyperparameters = shipped.provenance.hyperparameters;
const KEYS = hyperparameters.fitKeys;

const windowArg = flag("window", null);
const window = windowArg
  ? windowArg.split("-").map(Number)
  : [2011, 2025];
if (window.length !== 2 || window.some((v) => !Number.isInteger(v))) {
  process.stderr.write(`--window must look like 2011-2025, got ${JSON.stringify(windowArg)}\n`);
  process.exit(2);
}

const folds = flag("folds", null) ? Number(flag("folds")) : null;
const monitorSeason = flag("monitor-season", null) ? Number(flag("monitor-season")) : null;

const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
})();
if (!commit) {
  process.stderr.write("cannot read this repository's commit hash — code provenance is not optional\n");
  process.exit(1);
}

const log = (m) => process.stderr.write(`${m}\n`);

// --- the production fit -------------------------------------------------------
log(`loading training data for ${window[0]}–${window[1]} …`);
const { matches, seasons } = await loadTrainingData({ dataDir, window });
log(`${matches.length} matches, ${seasons.length} seasons`);

log("fitting the production parameters …");
const production = fit(matches, { keys: KEYS, start: { HOME_ADV: 80 } });
const productionFit = Object.fromEntries(
  Object.keys(shipped.params).map((k) => [k, production.params[k] ?? shipped.params[k]]),
);

const output = {
  labCommit: commit,
  hyperparameters,
  procedureVersion: shipped.procedureVersion,
  productionFit,
  window: { from: window[0], to: window[1], seasons: seasons.length },
};

// The escape hatch of §5.5: a changed procedure carrier still counts as Process
// A if the new code, fitted on the INCUMBENT'S EXACT WINDOW, reproduces the
// incumbent parameters. When the requested window IS that window, the production
// fit is exactly that computation — so it is reported as the reproduction check
// rather than recomputed. Where the windows differ, no reproduction claim is
// made and Process B applies, which is the correct default.
if (seasons.length === hyperparameters.window) {
  output.reproductionFit = productionFit;
} else {
  log(
    `no reproduction check: the window has ${seasons.length} seasons, the incumbent's has `
      + `${hyperparameters.window}. Process B applies.`,
  );
}

// --- Process A: the incumbent on the newly completed season -------------------
if (monitorSeason !== null) {
  const inWindow = monitorSeason >= window[0] && monitorSeason <= window[1];
  if (inWindow) {
    // Saying this out loud matters: the monitoring report's whole value is that
    // the incumbent never saw the season it is judged on.
    log(
      `WARNING: season ${monitorSeason} lies inside the fit window ${window[0]}–${window[1]}. `
        + "The result is IN-SAMPLE and is not a monitoring report.",
    );
  }
  const { matches: monitor } = await loadTrainingData({ dataDir, window: [monitorSeason, monitorSeason] });
  const metrics = heldOutMetrics(monitor, shipped.params);
  output.monitoring = {
    season: monitorSeason,
    matches: metrics.matches,
    logLoss: metrics.logLoss,
    brier: metrics.brier,
    rps: metrics.rps,
    ece: metrics.ece,
    outOfSample: !inWindow,
  };
  log(`monitoring on ${monitorSeason}: log-loss ${metrics.logLoss.toFixed(4)}${inWindow ? " (IN-SAMPLE)" : ""}`);
}

// --- Process B: rolling-origin backtest --------------------------------------
if (folds !== null) {
  const trainingSeasons = hyperparameters.window;
  const all = await loadTrainingData({ dataDir });
  const available = all.seasons;
  const foldSeasons = available.slice(-folds);

  log(`rolling-origin backtest over ${foldSeasons.length} fold(s), ${trainingSeasons} training seasons each …`);
  const incumbent = [];
  const candidate = [];

  for (const season of foldSeasons) {
    const trainFrom = season - trainingSeasons;
    const train = all.matches.filter((m) => m.season >= trainFrom && m.season < season);
    const test = all.matches.filter((m) => m.season === season);
    if (!train.length || !test.length) {
      log(`  fold ${season}: skipped — ${train.length} training and ${test.length} held-out matches`);
      continue;
    }

    // The incumbent procedure is the shipped one; the candidate is whatever this
    // working tree contains. On an unchanged tree the two are identical by
    // construction, which is exactly why Process A has no comparative gate.
    const trainSeasons = new Set(train.map((x) => x.season)).size;
    if (trainSeasons < trainingSeasons) {
      // Said out loud rather than silently accepted: the available history is
      // shorter than the procedure's window, so this fold trains on less.
      log(`  fold ${season}: only ${trainSeasons} of ${trainingSeasons} training seasons available`);
    }
    const fitted = fit(train, { keys: KEYS, start: { HOME_ADV: 80 } });
    const m = heldOutMetrics(test, fitted.params);
    const row = { season, logLoss: m.logLoss, brier: m.brier, rps: m.rps, ece: m.ece, trainSeasons };
    incumbent.push(row);
    candidate.push({ ...row });
    log(`  fold ${season}: log-loss ${m.logLoss.toFixed(4)} on ${m.matches} matches`);
  }

  output.backtest = { incumbent, candidate };
}

const rendered = `${JSON.stringify(output, null, 2)}\n`;
if (outFile) {
  await fs.writeFile(path.resolve(outFile), rendered);
  log(`wrote ${outFile}`);
} else {
  process.stdout.write(rendered);
}
