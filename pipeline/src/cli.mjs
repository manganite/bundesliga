#!/usr/bin/env node
/**
 * Pipeline entry point. The scheduled workflow runs exactly this.
 *
 *   node pipeline/src/cli.mjs [--data-dir data]
 *
 * Exit codes:
 *   0  ran cleanly — see `changed` in the summary for whether anything moved
 *   1  a gate failed. NOTHING was written and nothing must be committed; the
 *      workflow surfaces the failure through GitHub Actions notification, which
 *      is the only workflow-health channel (§5.1).
 */
import path from "node:path";
import { runUpdate } from "./update.mjs";
import { VerificationError } from "./verify.mjs";
import { ClubResolutionError } from "./clubMapping.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const dataDir = path.resolve(flag("data-dir", "data"));

try {
  const result = await runUpdate({ dataDir });
  // GitHub Actions reads this to decide whether to commit at all.
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `season=${result.season}\n`);
  }
  process.stdout.write(`${JSON.stringify({
    changed: result.changed,
    season: result.season,
    changes: result.changes,
    dataUpdatedAt: result.dataUpdatedAt,
  }, null, 2)}\n`);
} catch (e) {
  if (e instanceof VerificationError) {
    process.stderr.write(`\nVERIFICATION FAILED — nothing written, nothing committed:\n`);
    for (const p of e.problems) process.stderr.write(`  - ${p}\n`);
  } else if (e instanceof ClubResolutionError) {
    process.stderr.write(`\nCLUB RESOLUTION FAILED — nothing written, nothing committed:\n  ${e.message}\n`);
  } else {
    process.stderr.write(`\nPIPELINE FAILED — nothing written, nothing committed:\n  ${e.message}\n`);
    if (process.env.RUNNER_DEBUG) process.stderr.write(`${e.stack}\n`);
  }
  process.exit(1);
}
