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
import {
  appendSnapshot, readIndex, readSnapshot, findPreMatchSnapshot, findSnapshotOn, resolveArchiveBase,
} from "./snapshots.mjs";
import { buildPreMatchDataset, frozenRatingLabel } from "./preMatch.mjs";
import { buildCurrentOutlook, buildFrozenTimeline, targetsFromConfig } from "./artefacts.mjs";
import { buildPlayoffArtefact } from "./playoffArtefact.mjs";
import { verifyAll } from "./verify.mjs";
import {
  resolveMissingClubs, groupFixturesByClub, evaluateCarryForward, latestArchivedRating, CARRIED_PROVENANCE,
} from "./carryForward.mjs";

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
      // Structured, not a message: the carry-forward step needs the club id, and
      // the failure text is built from these at the point of failure.
      missing.push({ clubId: club.clubId, name: club.name, clubeloCsvName: club.clubeloCsvName });
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
  const shift = (iso, days) => {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const span = new Map();
  for (const f of fixtures) {
    const cur = span.get(f.matchday);
    if (!cur) span.set(f.matchday, { first: f.kickoff, last: f.kickoff });
    else {
      if (f.kickoff < cur.first) cur.first = f.kickoff;
      if (f.kickoff > cur.last) cur.last = f.kickoff;
    }
  }

  const dates = new Set();
  for (const { first, last } of span.values()) {
    // The day before the matchday starts — the pre-match rating the §5.3
    // forecast rule asks for (latest snapshot STRICTLY before the kickoff).
    dates.add(shift(first, -1));
    // And the day after it ends, so the rating-direction gate has a bracket
    // tight enough to isolate a single match. Without this the gate is either
    // vacuous or confounded by European fixtures (see verify.mjs).
    dates.add(shift(last, 1));
  }
  // The kickoff dates themselves: under clubelo's dating the row covering the
  // match date is that match's pre-match value, which is what the direction
  // gate compares against (verify.mjs).
  for (const f of fixtures) dates.add(String(f.kickoff).slice(0, 10));
  // A future date cannot have been published; inventing one would be exactly the
  // silent fabrication §5.3 forbids.
  return [...dates].filter((d) => d <= today).sort();
}

/**
 * Politeness delay between clubelo requests in the one-time history backfill.
 *
 * The backfill is the only path that hits clubelo dozens of times in a row — one
 * full history per club. The two-hourly cron fetches a single daily CSV and needs
 * nothing. Development and tests must never loop against the live API; they run
 * against recorded fixtures.
 */
export const BACKFILL_DELAY_MS = 750;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function backfillSnapshots({
  ratingsDir, clubs, dates, observedAt, fetchText, log = () => {}, delayMs = BACKFILL_DELAY_MS,
}) {
  if (dates.length === 0) return { appended: 0, dates: [], gaps: [] };

  const histories = new Map();
  const gaps = [];
  for (const [i, club] of clubs.entries()) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
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
  seasonOverride = null,
  asOf = null,
  ratingsDir: ratingsDirOverride = null,
  carryForwardUntil = null,
  log = (m) => process.stderr.write(`${m}\n`),
} = {}) {
  const observedAt = now.toISOString();
  // `asOf` lets an operator rebuild a COMPLETED season from clubelo's published
  // history — V2 groundwork, and the only way to exercise the full pipeline
  // while the current season has no usable ratings. It never affects a normal
  // run: without it, ratings are taken as of today.
  const today = asOf ?? observedAt.slice(0, 10);
  // Location is configuration (§ v5.7 Part 2.5), not an assumption.
  const ratingsDir = resolveArchiveBase(dataDir, { override: ratingsDirOverride });

  // --- 1. detect the season. Never hardcoded (§5.5). ------------------------
  // `seasonOverride` is an explicit operator action for rebuilding a past
  // season, not a hardcoded season: the scheduled workflow never passes it, so
  // the automatic detection §5.5 requires stays the only path in production.
  const detected = seasonOverride
    ? { season: Number(seasonOverride), matchday: null, leagueName: `manual override ${seasonOverride}`, detectedFrom: "operator override" }
    : await detectCurrentSeason("bl1", fetchJson);
  log(`${seasonOverride ? "season override" : "detected season"} ${detected.season} (${detected.leagueName})`);

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
  // FETCH ECONOMY — the courtesy rule as code, not as good intentions.
  //
  // clubelo publishes at most ONE snapshot per day; this job runs twelve times
  // a day. Fetching the daily CSV every time asked the operator's server for
  // the same bytes eleven times for nothing. So: if today is already archived,
  // the ratings come out of the archive and clubelo is not contacted at all.
  //
  // This is not a cache. The archive is the committed, verified record, and
  // reading it is exactly what the carry-forward path already does. The
  // OpenLigaDB fetch above keeps its two-hour rhythm — results DO change
  // intraday, ratings do not.
  const archiveIndex = await readIndex(ratingsDir);
  const todayArchived = findSnapshotOn(archiveIndex, today, "clubelo");

  let ratings;
  let missing;
  if (todayArchived) {
    const snap = await readSnapshot(ratingsDir, todayArchived.snapshotId);
    ratings = { ...snap.ratings };
    // A club absent from the archived snapshot is treated exactly as a club
    // absent from a fresh CSV: fail-closed, or carried forward if the switch is
    // set. The archive is the same observation, not a weaker one.
    missing = [...allClubs.values()]
      .filter((club) => ratings[club.clubId] === undefined)
      .map((club) => ({ clubId: club.clubId, name: club.name, clubeloCsvName: club.clubeloCsvName }));
    // One line, so a run's log still accounts for every source.
    log("clubelo: Tagesstand vorhanden, kein Abruf");
  } else {
    const daily = await fetchDailySnapshot(today, fetchText);
    ({ ratings, missing } = extractRatings([...allClubs.values()], daily));
  }

  // Clubs the snapshot did not cover, whether it came from the network or the
  // archive. Fail-closed is the default: without --carry-forward-until this
  // still fails the job (§5.2, unchanged).
  const ratingProvenance = Object.fromEntries(
    Object.keys(ratings).map((clubId) => [clubId, { provenance: "live", effectiveAt: today, ageDays: 0 }]),
  );
  const nameOfClub = (clubId) => allClubs.get(clubId)?.name ?? clubId;
  let carried = [];
  if (missing.length) {
    const preIndex = archiveIndex;
    const allFixtures = LEAGUES.flatMap((l) => seasons[l].fixtures);
    const { carried: ok, stillMissing } = await resolveMissingClubs({
      missingClubIds: missing.map((m) => m.clubId),
      requestedDate: today,
      carryForwardUntil,
      index: preIndex,
      loadSnapshot: (id) => readSnapshot(ratingsDir, id),
      fixturesByClub: groupFixturesByClub(allFixtures),
    });
    carried = ok;

    if (stillMissing.length) {
      throw new Error(
        `${stillMissing.length} club(s) have no usable clubelo rating on ${today}:\n`
          + `${stillMissing.map((m) => `  ${nameOfClub(m.clubId)}: ${m.reason}`).join("\n")}\n`
          + "Under §5.2 the job fails and nothing is committed — a wrong rating is worse than a missing one.",
      );
    }

    // Logged loudly: the Actions notification must be a truthful record of what
    // was committed, and a forecast partly built on stale inputs has to say so.
    for (const c of carried) {
      ratings[c.clubId] = c.rating;
      ratingProvenance[c.clubId] = {
        provenance: CARRIED_PROVENANCE,
        effectiveAt: c.effectiveAt,
        ageDays: c.ageDays,
        snapshotId: c.snapshotId,
      };
      log(`CARRIED FORWARD ${nameOfClub(c.clubId)}: rating from ${c.effectiveAt}, ${c.ageDays} day(s) old`);
    }
    log(`${carried.length} club(s) running on a carried-forward rating (--carry-forward-until=${carryForwardUntil})`);
  }

  // --- 4. VERIFY before anything is written --------------------------------
  const existingIndex = await readIndex(ratingsDir);
  // Load the whole archive, not a tail: the rating-direction gate needs the
  // snapshots that actually bracket recent fixtures, and a fixed tail silently
  // makes the gate vacuous whenever the archive is sparse.
  const archived = [];
  for (const meta of existingIndex.snapshots) {
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
  const checked = LEAGUES.reduce((a, l) => a + verification[l].ratingDirection.checked, 0);
  const skipped = LEAGUES.reduce((a, l) => a + verification[l].ratingDirection.skipped, 0);
  const unchanged = LEAGUES.reduce((a, l) => a + verification[l].ratingDirection.unchanged, 0);
  log(`verified: counts, club ratings, rating direction `
    + `(checked ${checked}, skipped ${skipped}, ${unchanged} with no published rating update)`);
  if (checked === 0 && skipped > 0) {
    // Not a failure — early in a season, or on a first run, there is simply no
    // bracketing snapshot yet. Said out loud so a vacuous gate is never mistaken
    // for a passing one.
    log("  note: the rating-direction gate had nothing to check — no snapshot pair brackets a decisive result yet");
  }

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

  // The archive records what clubelo ACTUALLY published — carried values are a
  // resolution step, never a fabricated observation.
  const observedRatings = Object.fromEntries(
    Object.entries(ratings).filter(([clubId]) => ratingProvenance[clubId].provenance === "live"),
  );
  const appended = await appendSnapshot(ratingsDir, {
    source: "clubelo", observedAt, effectiveAt: today, ratings: observedRatings,
  });
  if (appended.appended) changes.push(`rating snapshot ${appended.snapshotId}`);
  else log(`snapshot unchanged: ${appended.reason}`);

  // --- 6. derive the per-fixture pre-match dataset --------------------------
  const index = await readIndex(ratingsDir);
  const fixturesByClubAll = groupFixturesByClub(LEAGUES.flatMap((l) => seasons[l].fixtures));
  const shipped = JSON.parse(await fs.readFile(path.join(dataDir, "season-params.json"), "utf8"));
  const shippedParams = shipped.params;
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
      modelVersion: shipped.procedureVersion,
      createdAt: observedAt,
      // Same bounded rule as the current ratings, evaluated per fixture: the
      // snapshot's own date is what the age is measured from.
      carryForward: carryForwardUntil
        ? async ({ clubId, snapshotEffectiveAt, fixture }) => {
          const previous = await latestArchivedRating({
            clubId, date: snapshotEffectiveAt, index, loadSnapshot: (id) => readSnapshot(ratingsDir, id),
          });
          const verdict = evaluateCarryForward({
            clubId,
            requestedDate: snapshotEffectiveAt,
            carryForwardUntil,
            previous,
            clubFixtures: (fixturesByClubAll.get(clubId) ?? []).filter((f) => f.id !== fixture.id),
          });
          return verdict.ok ? verdict : null;
        }
        : null,
    });
    if (await writeIfChanged(file, stable(dataset))) {
      changes.push(`${league} pre-match dataset (+${created})`);
    }
  }

  // --- 6b. precomputed simulation artefacts (§3) ----------------------------
  // Heavy artefacts belong here, never in the browser. The canonical 20 000-run
  // outlook is what every displayed delta is measured against.
  const outlooks = {};
  for (const league of LEAGUES) {
    const s = seasons[league];
    const leagueConfig = config.leagues[league];
    const targets = targetsFromConfig(leagueConfig);
    const rules = {
      pointsForWin: leagueConfig.pointsForWin,
      pointsForDraw: leagueConfig.pointsForDraw,
      criteria: leagueConfig.tiebreakCriteria,
    };
    const dir = path.join(dataDir, "seasons", String(detected.season), league);

    const currentClubs = s.clubs.map((c) => ({ clubId: c.clubId, rating: ratings[c.clubId] }));
    const outlook = {
      ...buildCurrentOutlook({
        seasonId: `${detected.season}-${league}`,
        league, clubs: currentClubs, fixtures: s.fixtures, params: shippedParams, targets, rules,
      }),
      // Per club, where its rating came from. The app marks anything not live.
      ratingProvenance: Object.fromEntries(
        s.clubs.map((c) => [c.clubId, ratingProvenance[c.clubId]]),
      ),
    };
    if (await writeIfChanged(path.join(dir, "outlook.json"), stable(outlook))) {
      changes.push(`${league} current outlook`);
    }
    outlooks[league] = outlook;

    // The frozen curve needs ONE pre-season rating per club. Where it is
    // missing the feature does not fail — but it must not claim what it does
    // not have, so the artefact records the start it actually has (§5.3).
    const firstKickoff = s.fixtures.reduce((min, f) => (f.kickoff < min ? f.kickoff : min), s.fixtures[0].kickoff);
    const frozenMeta = findPreMatchSnapshot(index, firstKickoff);
    if (!frozenMeta) {
      log(`${league}: no pre-season snapshot — frozen timeline skipped, app enters its degraded state`);
    } else {
      const frozenSnap = await readSnapshot(ratingsDir, frozenMeta.snapshotId);
      const missingFrozen = s.clubs.filter((c) => frozenSnap.ratings[c.clubId] === undefined);
      if (missingFrozen.length) {
        log(`${league}: ${missingFrozen.length} club(s) lack a pre-season rating — frozen timeline skipped`);
      } else {
        let existingTimeline = null;
        try {
          existingTimeline = JSON.parse(await fs.readFile(path.join(dir, "timeline-frozen.json"), "utf8"));
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        const timeline = buildFrozenTimeline({
          seasonId: `${detected.season}-${league}`,
          league,
          frozenClubs: s.clubs.map((c) => ({ clubId: c.clubId, rating: frozenSnap.ratings[c.clubId] })),
          fixtures: s.fixtures,
          params: shippedParams,
          targets,
          rules,
          existing: existingTimeline,
          log,
        });
        const payload = {
          ...timeline,
          frozenSnapshotId: frozenMeta.snapshotId,
          frozenEffectiveAt: frozenMeta.effectiveAt,
          label: frozenRatingLabel({
            seasonStart: String(firstKickoff).slice(0, 10),
            earliestEffectiveAt: frozenMeta.effectiveAt,
          }),
          computed: undefined, // run-scoped; must not make the file differ per run
        };
        if (await writeIfChanged(path.join(dir, "timeline-frozen.json"), stable(payload))) {
          changes.push(`${league} frozen timeline (+${timeline.computed} point(s))`);
        }
      }
    }
  }

  // --- 6c. the relegation play-off (§6) -------------------------------------
  // Deliberately AFTER both leagues: it is one simulation across the two, and
  // both league views read it from complementary sides. It is written once, at
  // the season level, so there is no per-league copy that could disagree.
  {
    const playoff = buildPlayoffArtefact({
      season: detected.season,
      playoffConfig: config.relegationPlayoff,
      outlooks,
      fixtures: { bl1: seasons.bl1.fixtures, bl2: seasons.bl2.fixtures },
      ratings,
      params: shippedParams,
      log,
    });
    const file = path.join(dataDir, "seasons", String(detected.season), "playoff.json");
    if (await writeIfChanged(file, stable(playoff))) changes.push("relegation play-off");
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
    return { changed: false, season: detected.season, changes: [], dataUpdatedAt: meta.dataUpdatedAt, carried };
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

  return { changed: true, season: detected.season, changes, dataUpdatedAt: observedAt, backfill, carried };
}
