// ============================================================================
//  The data pipeline (§5.1). A scheduled GitHub Actions workflow running this
//  is the ONLY data path — there is no browser-side live fetch, because that
//  would contradict the committed-data contract and can produce inconsistent
//  states. Committed files are the single source.
//
//  Order matters and is not incidental:
//    fetch -> resolve clubs (fail closed) -> VERIFY -> archive -> derive -> write
//
//  Everything is computed in memory and verified BEFORE the first write, so a
//  failing gate leaves the repository untouched. On failure nothing is
//  committed and no status field is written; the workflow reports the actual
//  failure through Actions notification (§5.1 — v5 asked for both, which
//  contradict).
//
//  „Commit only on change" is honoured by comparing rendered content with what
//  is already on disk. `dataUpdatedAt` moves only when something SUBSTANTIVE
//  changed, never on a check that found nothing new.
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { detectCurrentSeason, fetchSeason } from "./sources/openligadb.mjs";
import { fetchDailySnapshot, indexSnapshot, fetchClubHistory, ratingOn } from "./sources/clubelo.mjs";
import { resolveClub } from "./clubMapping.mjs";
import { appendSnapshot, readIndex, readSnapshot } from "./snapshots.mjs";
import { buildPreMatchDataset } from "./preMatch.mjs";
import { verifyAll } from "./verify.mjs";

export const LEAGUES = ["bl1", "bl2"];

const stable = (o) => `${JSON.stringify(o, null, 2)}\n`;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Write only when the content actually differs. Returns true if it changed. */
async function writeIfChanged(file, contents) {
  try {
    if (await fs.readFile(file, "utf8") === contents) return false;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
  return true;
}

/** Attach resolved club ids to a normalised season's fixtures. Fails closed. */
export function attachClubIds(season) {
  const clubs = new Map();
  const fixtures = season.fixtures.map((f) => {
    const home = resolveClub(f.home);
    const away = resolveClub(f.away);
    clubs.set(home.clubId, home);
    clubs.set(away.clubId, away);
    return {
      id: f.id,
      matchday: f.matchday,
      kickoff: f.kickoff,
      homeClubId: home.clubId,
      awayClubId: away.clubId,
      homeName: f.home.teamName,
      awayName: f.away.teamName,
      finished: f.finished,
      ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}),
    };
  });
  return { ...season, fixtures, clubs: [...clubs.values()].sort((a, b) => a.clubId.localeCompare(b.clubId)) };
}

/**
 * Pick the ratings for our clubs out of a clubelo daily snapshot.
 *
 * Fails closed: an unresolved club fails the job and blocks the commit (§5.2).
 * A wrong match is worse than a missing one because it is silent, so this never
 * falls back to a near name, a previous value, or a league average.
 */
export function extractRatings(clubs, snapshot) {
  const byClub = indexSnapshot(snapshot);
  const ratings = {};
  const missing = [];
  for (const club of clubs) {
    const row = byClub.get(club.clubeloCsvName);
    if (!row) {
      missing.push(`${club.name} (clubelo "${club.clubeloCsvName}")`);
      continue;
    }
    ratings[club.clubId] = row.elo;
  }
  return { ratings, missing };
}

/**
 * Mid-season bootstrap (§5.3). "Archive from V1 day one" only suffices if V1
 * ships at season start; if it ships in October, the early pre-match ratings are
 * missing. So on first run the current season is backfilled from clubelo's
 * published history.
 *
 * One snapshot per matchday, effective the day BEFORE that matchday's first
 * kickoff — the dates the pre-match rule actually asks for. Future dates are
 * skipped: clubelo cannot have published them, and inventing them would be
 * exactly the silent fabrication §5.3 forbids. Whatever cannot be backfilled
 * stays a documented gap and the app enters its degraded state.
 */
export function backfillDates(fixtures, today) {
  const firstKickoffByMatchday = new Map();
  for (const f of fixtures) {
    const cur = firstKickoffByMatchday.get(f.matchday);
    if (!cur || f.kickoff < cur) firstKickoffByMatchday.set(f.matchday, f.kickoff);
  }
  const dates = new Set();
  for (const kickoff of firstKickoffByMatchday.values()) {
    const d = new Date(`${String(kickoff).slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso <= today) dates.add(iso);
  }
  return [...dates].sort();
}

export async function backfillSnapshots({
  ratingsDir, clubs, dates, observedAt, fetchText, log = () => {},
}) {
  if (dates.length === 0) return { appended: 0, dates: [], gaps: [] };

  const histories = new Map();
  const gaps = [];
  for (const club of clubs) {
    try {
      histories.set(club.clubId, await fetchClubHistory(club.clubeloUrlName, fetchText));
    } catch (e) {
      gaps.push({ clubId: club.clubId, reason: e.message });
    }
  }

  let appended = 0;
  for (const date of dates) {
    const ratings = {};
    for (const club of clubs) {
      const hist = histories.get(club.clubId);
      if (!hist) continue;
      const row = ratingOn(hist, date);
      if (row) ratings[club.clubId] = row.elo;
    }
    if (Object.keys(ratings).length === 0) {
      gaps.push({ date, reason: "no club had a published rating for this date" });
      continue;
    }
    const res = await appendSnapshot(ratingsDir, {
      source: "clubelo",
      observedAt,
      effectiveAt: date,
      ratings,
      note: "backfilled from clubelo published history — retrospective use only",
    });
    if (res.appended) appended++;
    log(`backfill ${date}: ${Object.keys(ratings).length} clubs, ${res.appended ? "archived" : res.reason}`);
  }
  return { appended, dates, gaps };
}

/**
 * Run one pipeline update.
 *
 * @param {object} opts
 * @param {string} opts.dataDir       repository `data/` directory
 * @param {Function} [opts.fetchJson] injectable for offline tests
 * @param {Function} [opts.fetchText] injectable for offline tests
 * @param {Date} [opts.now]
 */
export async function runUpdate({
  dataDir,
  fetchJson,
  fetchText,
  now = new Date(),
  log = (m) => process.stderr.write(`${m}\n`),
} = {}) {
  const observedAt = now.toISOString();
  const today = observedAt.slice(0, 10);
  const ratingsDir = path.join(dataDir, "ratings");

  // --- 1. detect the season. Never hardcoded (§5.5). ------------------------
  const detected = await detectCurrentSeason("bl1", fetchJson);
  log(`detected season ${detected.season} (${detected.leagueName}), matchday ${detected.matchday}`);

  const configFile = path.join(dataDir, "seasons", String(detected.season), "config.json");
  let config;
  try {
    config = JSON.parse(await fs.readFile(configFile, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        `no season configuration at ${configFile}. §5.5 requires a season-stamped config; ` +
          "the pipeline will not invent rules or European slots for an unknown season.",
      );
    }
    throw e;
  }
  if (Number(config.season) !== Number(detected.season)) {
    throw new Error(`season config is stamped ${config.season} but the detected season is ${detected.season}`);
  }

  // --- 2. fetch and resolve. Fails closed on an unknown club. ---------------
  const seasons = {};
  for (const league of LEAGUES) {
    seasons[league] = attachClubIds(await fetchSeason(league, detected.season, fetchJson));
    log(`${league}: ${seasons[league].fixtures.length} fixtures, ${seasons[league].clubs.length} clubs`);
  }

  const allClubs = new Map();
  for (const league of LEAGUES) for (const c of seasons[league].clubs) allClubs.set(c.clubId, c);

  // --- 3. ratings ----------------------------------------------------------
  const daily = await fetchDailySnapshot(today, fetchText);
  const { ratings, missing } = extractRatings([...allClubs.values()], daily);
  if (missing.length) {
    throw new Error(
      `${missing.length} club(s) have no clubelo rating on ${today}:\n  ${missing.join("\n  ")}\n` +
        "Under §5.2 the job fails and nothing is committed — a wrong rating is worse than a missing one.",
    );
  }

  // --- 4. VERIFY before anything is written --------------------------------
  const existingIndex = await readIndex(ratingsDir);
  const archived = [];
  for (const meta of existingIndex.snapshots.slice(-8)) {
    archived.push(await readSnapshot(ratingsDir, meta.snapshotId));
  }
  const verification = {};
  for (const league of LEAGUES) {
    verification[league] = verifyAll({
      season: seasons[league],
      config: config.leagues[league],
      ratings,
      snapshots: [...archived, { effectiveAt: today, ratings }],
    });
  }
  log(
    "verified: counts, club ratings, rating direction "
      + `(checked ${LEAGUES.reduce((a, l) => a + verification[l].ratingDirection.checked, 0)}, `
      + `skipped ${LEAGUES.reduce((a, l) => a + verification[l].ratingDirection.skipped, 0)} as confounded)`,
  );

  // --- 5. archive. Idempotent, atomic, append-only. -------------------------
  const changes = [];
  let backfill = null;
  if (existingIndex.snapshots.length === 0) {
    const dates = backfillDates(seasons.bl1.fixtures.concat(seasons.bl2.fixtures), today);
    log(`first run — backfilling ${dates.length} date(s) from clubelo history`);
    backfill = await backfillSnapshots({
      ratingsDir, clubs: [...allClubs.values()], dates, observedAt, fetchText, log,
    });
    if (backfill.appended) changes.push(`${backfill.appended} backfilled snapshot(s)`);
  }

  const appended = await appendSnapshot(ratingsDir, {
    source: "clubelo", observedAt, effectiveAt: today, ratings,
  });
  if (appended.appended) changes.push(`rating snapshot ${appended.snapshotId}`);
  else log(`snapshot unchanged: ${appended.reason}`);

  // --- 6. derive the per-fixture pre-match dataset --------------------------
  const index = await readIndex(ratingsDir);
  for (const league of LEAGUES) {
    const file = path.join(dataDir, "seasons", String(detected.season), league, "prematch.json");
    let existing = null;
    try {
      existing = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const { dataset, created } = await buildPreMatchDataset({
      league,
      season: detected.season,
      fixtures: seasons[league].fixtures,
      index,
      loadSnapshot: (id) => readSnapshot(ratingsDir, id),
      existing,
      modelVersion: JSON.parse(await fs.readFile(path.join(dataDir, "season-params.json"), "utf8")).procedureVersion,
      createdAt: observedAt,
    });
    if (await writeIfChanged(file, stable(dataset))) {
      changes.push(`${league} pre-match dataset (+${created})`);
    }
  }

  // --- 7. write the season data --------------------------------------------
  for (const league of LEAGUES) {
    const s = seasons[league];
    const payload = {
      schemaVersion: 1,
      league,
      season: detected.season,
      source: s.source,
      clubs: s.clubs.map((c) => ({ clubId: c.clubId, name: c.name, openLigaDbId: c.openLigaDbId })),
      fixtures: s.fixtures,
    };
    const file = path.join(dataDir, "seasons", String(detected.season), league, "season.json");
    if (await writeIfChanged(file, stable(payload))) changes.push(`${league} fixtures/results`);
  }

  // --- 8. dataUpdatedAt moves ONLY on a substantive change -----------------
  const metaFile = path.join(dataDir, "meta.json");
  let meta = { schemaVersion: 1, dataUpdatedAt: null, season: detected.season };
  try {
    meta = JSON.parse(await fs.readFile(metaFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  if (changes.length === 0) {
    log("nothing changed — no commit, and dataUpdatedAt deliberately stays put");
    return { changed: false, season: detected.season, changes: [], dataUpdatedAt: meta.dataUpdatedAt };
  }

  meta = {
    schemaVersion: 1,
    season: detected.season,
    // The moment of the last SUBSTANTIVE change. The app shows this neutrally
    // as „Datenstand" and must not derive any workflow-health claim from it.
    dataUpdatedAt: observedAt,
    dataHash: sha(LEAGUES.map((l) => stable(seasons[l].fixtures)).join("")),
    lastChanges: changes,
  };
  await writeIfChanged(metaFile, stable(meta));
  log(`changed: ${changes.join(", ")}`);

  return { changed: true, season: detected.season, changes, dataUpdatedAt: observedAt, backfill };
}
