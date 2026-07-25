// ============================================================================
//  CLI: generate one historical season's artefacts (§V2b.1 §1).
//
//    node pipeline/src/buildHistoricalCli.mjs --season 2015 [--runs N] \
//         [--timeline-runs N] [--data-dir data]
//
//  Idempotent per season (re-running overwrites). Never runs in the cron — the
//  historical artefacts are generated ONCE and committed. No clubelo request.
// ============================================================================

import { writeHistoricalSeason } from "./buildHistorical.mjs";

const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const year = Number(flag("season"));
if (!Number.isInteger(year)) {
  console.error("usage: buildHistoricalCli.mjs --season <year> [--runs N] [--timeline-runs N] [--data-dir data]");
  process.exit(1);
}
const runs = flag("runs") ? Number(flag("runs")) : undefined;
const timelineRuns = flag("timeline-runs") ? Number(flag("timeline-runs")) : undefined;
const dataDir = flag("data-dir") ?? "data";

const started = Date.now();
writeHistoricalSeason({ dataDir, year, runs, timelineRuns, log: (m) => console.log(`  ${m}`) });
console.log(`historical ${year} written in ${((Date.now() - started) / 1000).toFixed(1)}s`);
