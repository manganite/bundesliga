#!/usr/bin/env node
/**
 * The RATINGS path — clubelo, and nothing else (Brief 34).
 *
 *   node pipeline/src/ratingsCli.mjs [--data-dir data]
 *
 * WHY THIS IS A SEPARATE ENTRY POINT. Results and ratings come from different
 * sources with different failure modes, and for a long time one job did both:
 * the ratings gate sat before every write, so „clubelo is unreachable" meant
 * „nothing is committed at all", results included. clubelo has had three
 * multi-day outages in one season, and each of them also stopped the league
 * results from reaching the app — which is what finally made the coupling
 * untenable rather than merely inelegant.
 *
 * So this job does exactly two things, both of them clubelo-only:
 *   1. archive today's daily snapshot, unless the archive already has it;
 *   2. backfill the mandatory dates the archive is still missing.
 *
 * It never touches season data, never computes a forecast and never writes
 * anything outside the rating archive. When it fails, it fails alone: its own
 * `betrieb` channel goes red and the results job keeps running, computing the
 * forecast from the newest complete archived snapshot and stamping it with that
 * snapshot's date.
 *
 * The courtesy rule survives the split unchanged, and is now easier to see: one
 * request per day when healthy, because step 1 is skipped as soon as today is
 * archived.
 */
import path from "node:path";
import { detectCurrentSeason, fetchSeason } from "./sources/openligadb.mjs";
import { fetchDailySnapshot } from "./sources/clubelo.mjs";
import { attachClubIds, backfillDates, backfillSnapshots, extractRatings, LEAGUES } from "./update.mjs";
import { appendSnapshot, readIndex, findSnapshotOn, resolveArchiveBase } from "./snapshots.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const dataDir = flag("data-dir", "data");
const log = (m) => process.stderr.write(`${m}\n`);

const observedAt = new Date().toISOString();
const today = observedAt.slice(0, 10);
const ratingsDir = resolveArchiveBase(dataDir, {});

try {
  // The club list comes from the season, because the archive has to cover the
  // clubs that actually play — the same resolution the results job does, and it
  // fails closed on an unknown club exactly as it does there.
  const detected = await detectCurrentSeason();
  const seasons = {};
  for (const league of LEAGUES) seasons[league] = attachClubIds(await fetchSeason(league, detected.season));
  const allClubs = new Map();
  for (const league of LEAGUES) for (const c of seasons[league].clubs) allClubs.set(c.clubId, c);
  const clubs = [...allClubs.values()];

  let changed = false;

  // --- 1. today's snapshot -------------------------------------------------
  const index = await readIndex(ratingsDir);
  if (findSnapshotOn(index, today, "clubelo")) {
    log(`clubelo: Tagesstand ${today} liegt bereits im Archiv — kein Abruf`);
  } else {
    const daily = await fetchDailySnapshot(today);
    const { ratings, missing } = extractRatings(clubs, daily);
    if (missing.length) {
      // A partial snapshot is NOT archived. A thin snapshot displacing a
      // complete one is a defect this repository has already paid for
      // (docs/verification/pipeline-ausfallverhalten.md §3); an absent snapshot
      // simply leaves the previous complete one in place, which is a defensible
      // basis, and the results job says how old it is.
      throw new Error(
        `clubelo lists ${Object.keys(ratings).length} of ${clubs.length} clubs on ${today}; `
          + `missing: ${missing.map((m) => m.name).join(", ")}. Nothing archived.`,
      );
    }
    const appended = await appendSnapshot(ratingsDir, {
      source: "clubelo", observedAt, effectiveAt: today, ratings,
    });
    if (appended.appended) {
      changed = true;
      log(`archiviert: ${appended.snapshotId} (${Object.keys(ratings).length} Klubs)`);
    } else {
      log(`Snapshot unverändert: ${appended.reason}`);
    }
  }

  // --- 2. the mandatory dates the archive still lacks -----------------------
  const fixtures = LEAGUES.flatMap((l) => seasons[l].fixtures);
  const after = await readIndex(ratingsDir);
  const missingDates = backfillDates(fixtures, today)
    .filter((d) => !findSnapshotOn(after, d, "clubelo"));
  if (missingDates.length) {
    log(`${missingDates.length} Pflichttermin(e) fehlen im Archiv — hole Historie nach`);
    const res = await backfillSnapshots({
      ratingsDir, clubs, dates: missingDates, observedAt, log,
    });
    if (res.appended > 0) changed = true;
  }

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
  log(changed ? "Ratings-Archiv erweitert" : "nichts Neues im Rating-Archiv");
  void path;
} catch (e) {
  process.stderr.write(`\nRATINGS FAILED — nothing written, nothing committed:\n  ${e.message}\n`);
  process.exit(1);
}
