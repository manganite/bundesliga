#!/usr/bin/env node
/**
 * Pipeline entry point. The scheduled workflow runs exactly this.
 *
 *   node pipeline/src/cli.mjs [--data-dir data]
 *   node pipeline/src/cli.mjs --season 2025 --as-of 2026-06-01
 *   node pipeline/src/cli.mjs --carry-forward-until 2026-08-15
 *
 * --carry-forward-until lets clubs that clubelo has temporarily stopped listing
 * run on their last archived rating, bounded by that date and by a hard 42-day
 * ceiling. It is OFF BY DEFAULT: without it an unresolved club still fails the
 * job and blocks the commit. See pipeline/src/carryForward.mjs for why this is
 * sound during an off-season and why it must expire.
 *
 * The two override flags rebuild a COMPLETED season from clubelo's published
 * history. They are an explicit operator action — the scheduled workflow never
 * passes them, so automatic season detection (§5.5) remains the only path in
 * production. Everything rebuilt this way is `backfilled` provenance by
 * construction and must never be presented as „die damalige Prognose" (§5.3).
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
const seasonOverride = flag("season", null);
const asOf = flag("as-of", null);
const carryForwardUntil = flag("carry-forward-until", null);

try {
  const result = await runUpdate({ dataDir, seasonOverride, asOf, carryForwardUntil });
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
    carriedForward: (result.carried ?? []).map((c) => ({
      clubId: c.clubId, effectiveAt: c.effectiveAt, ageDays: c.ageDays,
    })),
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
