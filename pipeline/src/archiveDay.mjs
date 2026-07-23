#!/usr/bin/env node
/**
 * Archive clubelo's daily snapshot for ONE specific date.
 *
 *   node pipeline/src/archiveDay.mjs 2026-07-03 [--data-dir data]
 *
 * An explicit operator action, not part of any workflow. It exists for one
 * situation: clubelo stops extending a club's series, so every future daily CSV
 * lacks it, and the archive therefore can never gain a rating for that club from
 * a date when it WAS listed. Without a snapshot from that period the bounded
 * carry-forward (carryForward.mjs) can never satisfy its age ceiling — waiting
 * makes it strictly worse, because the newest snapshot containing the club only
 * gets older.
 *
 * One request, of exactly the kind the two-hourly cron already makes. This is
 * not a bulk fetch and does not increase request volume.
 *
 * The snapshot is appended with its REAL `effectiveAt` (the requested date) and
 * an `observedAt` of now — an honest record of "fetched today, describes that
 * day". Nothing is backdated and nothing existing is touched: the archive stays
 * append-only.
 */
import path from "node:path";
import { detectCurrentSeason, fetchSeason } from "./sources/openligadb.mjs";
import { fetchDailySnapshot } from "./sources/clubelo.mjs";
import { resolveClub } from "./clubMapping.mjs";
import { appendSnapshot, resolveArchiveBase } from "./snapshots.mjs";

const argv = process.argv.slice(2);
const date = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

if (!date) {
  process.stderr.write("usage: node pipeline/src/archiveDay.mjs <YYYY-MM-DD> [--data-dir data]\n");
  process.exit(2);
}

const dataDir = path.resolve(flag("data-dir", "data"));
const ratingsDir = resolveArchiveBase(dataDir);

try {
  // Which clubs matter is taken from the current season, exactly as the
  // pipeline does — the archive holds our clubs, not clubelo's whole world.
  const detected = await detectCurrentSeason("bl1");
  const clubs = new Map();
  for (const league of ["bl1", "bl2"]) {
    const season = await fetchSeason(league, detected.season);
    for (const f of season.fixtures) {
      for (const team of [f.home, f.away]) {
        const club = resolveClub(team);
        clubs.set(club.clubId, club);
      }
    }
  }

  const snapshot = await fetchDailySnapshot(date);
  const byCsvName = new Map(snapshot.rows.map((r) => [r.club, r]));

  const ratings = {};
  const absent = [];
  for (const club of clubs.values()) {
    const row = byCsvName.get(club.clubeloCsvName);
    if (row) ratings[club.clubId] = row.elo;
    else absent.push(club.name);
  }

  if (Object.keys(ratings).length === 0) {
    throw new Error(`the snapshot for ${date} covers none of our clubs — refusing to archive it`);
  }

  const result = await appendSnapshot(ratingsDir, {
    source: "clubelo",
    observedAt: new Date().toISOString(),
    effectiveAt: date,
    ratings,
    note: `archived out of band for ${date} — see pipeline/src/archiveDay.mjs`,
  });

  process.stdout.write(`${JSON.stringify({
    date,
    archived: result.appended,
    reason: result.reason ?? null,
    snapshotId: result.snapshotId,
    clubs: Object.keys(ratings).length,
    absent,
  }, null, 2)}\n`);
} catch (e) {
  process.stderr.write(`\nARCHIVE FAILED — nothing written:\n  ${e.message}\n`);
  process.exit(1);
}
