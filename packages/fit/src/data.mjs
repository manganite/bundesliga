// ============================================================================
//  Loading the training data.
//
//  It lives in two places on purpose, because the two halves have different
//  licences:
//
//    results       data/training/results/           committed, ODbL
//    pre-match Elo <BUNDESLIGA_RATINGS_DIR>/training-elo/   NOT committed
//
//  clubelo publishes no licence and the permission request is outstanding, so
//  the Elo half follows the rating archive's location rule. If the answer allows
//  it, committing it is a configuration-and-copy change.
//
//  The join key is the fixture id, carried by both halves. A fixture without an
//  Elo pair is a hole in the training set, and this refuses rather than dropping
//  it quietly — a fit silently trained on a subset is a fit nobody can reproduce.
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { resolveArchiveBase } from "../../../pipeline/src/snapshots.mjs";

export class TrainingDataError extends Error {}

const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };

export function trainingPaths(dataDir) {
  return {
    results: path.join(dataDir, "training", "results"),
    elo: path.join(resolveArchiveBase(dataDir), "training-elo"),
  };
}

/**
 * Load the training window.
 *
 * @param {object} opts
 * @param {string} opts.dataDir
 * @param {[number, number]} [opts.window]  inclusive season range, e.g. [2011, 2025]
 */
export async function loadTrainingData({ dataDir, window = null }) {
  const paths = trainingPaths(dataDir);

  if (!(await exists(paths.results))) {
    throw new TrainingDataError(
      `no training results at ${paths.results}. Run packages/fit/scripts/migrate-training-data.mjs once.`,
    );
  }
  if (!(await exists(paths.elo))) {
    throw new TrainingDataError(
      `no training Elo at ${paths.elo}.\n`
        + "It is clubelo-derived and deliberately not committed while the licence question is open "
        + "(docs/FIT_EXTRACTION.md), so a fresh clone does not have it. Point BUNDESLIGA_RATINGS_DIR "
        + "at an archive that does, or run the migration script against the lab working copy.",
    );
  }

  const files = (await fs.readdir(paths.results)).filter((f) => f.endsWith(".json")).sort();
  const matches = [];
  const seasons = new Set();
  const missingElo = [];

  for (const file of files) {
    const results = JSON.parse(await fs.readFile(path.join(paths.results, file), "utf8"));
    if (window && (results.season < window[0] || results.season > window[1])) continue;

    const eloFile = path.join(paths.elo, file);
    if (!(await exists(eloFile))) {
      throw new TrainingDataError(`results for ${file} have no matching Elo file at ${eloFile}`);
    }
    const elo = JSON.parse(await fs.readFile(eloFile, "utf8"));

    for (const m of results.matches) {
      const rating = elo.ratings[m.id];
      if (!rating) { missingElo.push(m.id); continue; }
      matches.push({
        id: m.id,
        league: m.league,
        season: results.season,
        matchday: m.matchday,
        date: m.date,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        isGhost: m.isGhost,
        eloHome: rating.eloHome,
        eloAway: rating.eloAway,
      });
    }
    seasons.add(results.season);
  }

  if (missingElo.length) {
    throw new TrainingDataError(
      `${missingElo.length} fixture(s) have results but no pre-match Elo (first: ${missingElo[0]}). `
        + "Refusing to fit on a silently reduced training set.",
    );
  }
  if (!matches.length) {
    throw new TrainingDataError(`the window ${window ? window.join("–") : "(all)"} selected no matches`);
  }

  // THE ORDER IS PART OF THE PROCEDURE, not a free choice.
  //
  // The likelihood is a sum, so a different order changes the result in the last
  // bits — measured: 1.2e-14 at identical parameters. Nelder-Mead is
  // derivative-free and chaotic enough to amplify that: reordering the same 9180
  // matches by date instead of by file moved HOME_ADV_GHOST by 2.2 and
  // ELO_PER_GOAL by 0.6, thousands of times the tolerance classes.
  //
  // So the order is pinned: files lexicographically by `<league>-<season>.json`
  // (bl1-2011 … bl2-2025), and within a file the file's own match order. That is
  // the order the shipped parameters were fitted in, and it is deterministic
  // across machines — unlike a bare `readdirSync`, which is what the lab relied
  // on. Anything here that changes the order is a Process B change, not a
  // refactoring.
  return { matches, seasons: [...seasons].sort((a, b) => a - b) };
}
