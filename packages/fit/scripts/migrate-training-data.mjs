#!/usr/bin/env node
/**
 * One-off migration of the lab's already-fetched training data into this repo.
 *
 *   node packages/fit/scripts/migrate-training-data.mjs --lab ../football-model-lab
 *
 * ZERO clubelo requests. Everything comes from the lab's local store; the lab is
 * read and never modified.
 *
 * The data is SPLIT, because the two halves have different licences and
 * therefore different homes:
 *
 *   results  — OpenLigaDB-derived, ODbL. Committed to this repo, each file
 *              naming its source.
 *   pre-match Elo — clubelo-derived. clubelo publishes no licence and the
 *              permission request is outstanding, so this follows the rating
 *              archive's location rule (BUNDESLIGA_RATINGS_DIR) and is NOT
 *              committed. If the answer allows it, committing it later is a
 *              configuration-and-copy change, nothing more.
 *
 * The join key is the fixture id, which both halves carry.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { resolveArchiveBase } from "../../../pipeline/src/snapshots.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const REPO = path.resolve(import.meta.dirname, "../../..");
const lab = path.resolve(flag("lab", path.join(REPO, "..", "football-model-lab")));
const dataDir = path.resolve(flag("data-dir", path.join(REPO, "data")));

const source = path.join(lab, "data", "track-c");
const resultsOut = path.join(dataDir, "training", "results");
const eloOut = path.join(resolveArchiveBase(dataDir), "training-elo");

const stable = (o) => `${JSON.stringify(o, null, 2)}\n`;

let files;
try {
  files = (await fs.readdir(source)).filter((f) => f.endsWith(".json")).sort();
} catch (e) {
  process.stderr.write(
    `cannot read the lab's training data at ${source}: ${e.message}\n`
      + "Pass --lab <path to the football-model-lab working copy>.\n",
  );
  process.exit(1);
}

await fs.mkdir(resultsOut, { recursive: true });
await fs.mkdir(eloOut, { recursive: true });

let matches = 0;
const written = [];

for (const file of files) {
  const season = JSON.parse(await fs.readFile(path.join(source, file), "utf8"));

  const results = {
    schemaVersion: 1,
    league: season.league,
    season: season.season,
    source: {
      results: season.source?.results ?? "OpenLigaDB",
      licence: "ODbL 1.0",
      migratedFrom: "football-model-lab data/track-c",
      migratedOn: new Date().toISOString().slice(0, 10),
      note: "Ergebnisse und Spielplan. Die zugehörigen Pre-Match-Elo-Werte liegen "
        + "getrennt im Rating-Archiv und sind nicht committet.",
    },
    matches: season.matches.map((m) => ({
      id: m.id,
      league: m.league,
      matchday: m.matchday,
      date: m.date,
      home: m.home,
      away: m.away,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      isGhost: m.isGhost,
    })),
  };

  const elo = {
    schemaVersion: 1,
    league: season.league,
    season: season.season,
    source: {
      elo: season.source?.elo ?? "clubelo.com per-club daily history",
      licence: "unpublished — permission request outstanding; do not commit publicly",
      migratedFrom: "football-model-lab data/track-c",
      migratedOn: new Date().toISOString().slice(0, 10),
    },
    // Keyed by fixture id, so the two halves join without duplicating anything.
    ratings: Object.fromEntries(season.matches.map((m) => [m.id, { eloHome: m.eloHome, eloAway: m.eloAway }])),
  };

  const name = `${season.league}-${season.season}.json`;
  await fs.writeFile(path.join(resultsOut, name), stable(results));
  await fs.writeFile(path.join(eloOut, name), stable(elo));
  matches += results.matches.length;
  written.push(name);
}

process.stdout.write(`${JSON.stringify({
  files: written.length,
  matches,
  results: path.relative(REPO, resultsOut),
  elo: path.relative(REPO, eloOut),
  clubeloRequests: 0,
}, null, 2)}\n`);
