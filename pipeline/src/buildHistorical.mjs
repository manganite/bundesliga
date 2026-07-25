// ============================================================================
//  Historical-season artefacts (§V2b.1 §1).
//
//  Builds the SAME committed set a finished season carries today (season.json,
//  config.json, prematch.json, outlook.json, timeline-frozen.json) — no live
//  timeline, no playoff artefact, matching the shape of the already-committed
//  2025/26 season. Everything comes from the committed training data + the
//  reconstruction; NO clubelo request. Deterministic by construction: no
//  timestamps, no Date.now — regeneration is bit-identical (the test proves it
//  on one season).
//
//  The outlook of a finished season is degenerate (zero remaining games → the
//  final table with probability 1); its `ratings` are the last reconstructed
//  values (§1 season-end), which the scenario tool reuses on the archive page.
//  The frozen timeline uses the reconstructed PRE-SEASON ratings, exactly as the
//  live pipeline freezes the pre-season snapshot.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { buildCurrentOutlook, buildFrozenTimeline, targetsFromConfig, CANONICAL_RUNS, TIMELINE_RUNS } from "./artefacts.mjs";
import { reconstruct } from "./reconstruct.mjs";
import { seasonClubs, resolveClubName } from "./clubRegister.mjs";

export const HISTORICAL_LEAGUES = ["bl1", "bl2"];

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const seasonLabel = (year) => `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
const shiftDay = (isoDate, days) => {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The committed training halves for one league-season, joined by fixture id. */
export function loadTraining(dataDir, league, year) {
  const results = readJson(path.join(dataDir, "training/results", `${league}-${year}.json`));
  const elo = readJson(path.join(dataDir, "ratings/training-elo", `${league}-${year}.json`));
  return { matches: results.matches, elo: elo.ratings, resultsSource: results.source, eloSource: elo.source };
}

/** Season fixtures in the app's shape, sorted canonically. */
export function historicalFixtures(matches, register) {
  return [...matches]
    .sort((a, b) => (a.matchday - b.matchday) || String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id))
    .map((m) => ({
      id: m.id,
      matchday: m.matchday,
      kickoff: `${m.date}T00:00:00Z`,
      homeClubId: m.home,
      awayClubId: m.away,
      homeName: resolveClubName(register, m.home),
      awayName: resolveClubName(register, m.away),
      finished: true,
      gh: m.homeGoals,
      ga: m.awayGoals,
    }));
}

/**
 * The pre-match dataset from the committed training-elo. Every entry is
 * `backfilled` (§5.3): the ratings are reconstructed after the fact, valid the
 * day before kickoff. Deterministic — no createdAt.
 */
export function historicalPreMatch(league, year, matches, elo) {
  const entries = [...matches]
    .sort((a, b) => (a.matchday - b.matchday) || String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id))
    .map((m) => ({
      fixtureId: m.id,
      kickoff: `${m.date}T00:00:00Z`,
      homeClubId: m.home,
      awayClubId: m.away,
      eloHome: elo[m.id].eloHome,
      eloAway: elo[m.id].eloAway,
      rule: "committed training-elo (pre-match, day before kickoff)",
      provenance: "backfilled",
      snapshotProvenance: "backfilled",
      snapshotEffectiveAt: shiftDay(m.date, -1),
      modelVersion: "training-elo",
    }));
  return {
    schemaVersion: 1,
    league,
    season: year,
    rule: "committed training-elo, valid the day before kickoff (§V2b.1)",
    entries,
    gaps: [],
    counts: { contemporaneous: 0, backfilled: entries.length, carriedForward: 0 },
  };
}

/** The season-level config, cloned from the current config (G2: tiebreak carried). */
export function historicalConfig(currentConfig, year) {
  const po = currentConfig.relegationPlayoff;
  // The away-goals rule is SEASON-specific: it applied through the last season
  // named in the config and was abolished the season after (UEFA boundary,
  // docs/verification/dfl-spielordnung.md §4.5). Cloning the current value blindly
  // would mark a 2015 play-off as away-goals-free, which is wrong.
  const relegationPlayoff = po?.exists
    ? { ...po, awayGoalsApply: year <= Number(String(po.lastSeasonWithAwayGoals).slice(0, 4)) }
    : po;
  return {
    _comment: `Historische Saison (V2b.1). Regeln/Ziele/Tiebreak aus der aktuellen Konfiguration übernommen (G2, docs/verification/dfl-spielordnung.md); awayGoalsApply saisonspezifisch.`,
    schemaVersion: currentConfig.schemaVersion,
    season: year,
    label: seasonLabel(year),
    leagues: currentConfig.leagues,
    relegationPlayoff,
  };
}

/** Build one league's artefacts (season/prematch/outlook/timeline-frozen). */
export function buildHistoricalLeague({
  dataDir, league, year, register, leagueConfig, params,
  runs = CANONICAL_RUNS, timelineRuns = TIMELINE_RUNS, log = () => {},
}) {
  const { matches, elo, resultsSource } = loadTraining(dataDir, league, year);
  const recon = reconstruct(matches, elo);
  const fixtures = historicalFixtures(matches, register);
  const clubs = seasonClubs(register, recon.clubs);
  const targets = targetsFromConfig(leagueConfig);
  const rules = {
    pointsForWin: leagueConfig.pointsForWin,
    pointsForDraw: leagueConfig.pointsForDraw,
    criteria: leagueConfig.tiebreakCriteria,
  };
  const seasonId = `${year}-${league}`;

  const endRatings = recon.ratingsAfterMatchday(recon.matchdayCount);
  const preSeason = recon.preSeasonRatings();

  const outlook = buildCurrentOutlook({
    seasonId, league,
    clubs: clubs.map((c) => ({ clubId: c.clubId, rating: endRatings.get(c.clubId) })),
    fixtures, params, targets, rules, runs,
  });
  const timelineFrozen = buildFrozenTimeline({
    seasonId, league,
    frozenClubs: clubs.map((c) => ({ clubId: c.clubId, rating: preSeason.get(c.clubId) })),
    fixtures, params, targets, rules, runs: timelineRuns, log,
  });

  return {
    seasonFile: { schemaVersion: 1, league, season: year, source: resultsSource, clubs, fixtures },
    prematch: historicalPreMatch(league, year, matches, elo),
    outlook,
    timelineFrozen,
  };
}

/** Write one historical season (both leagues + config) under data/seasons/<year>. */
export function writeHistoricalSeason({ dataDir = "data", year, runs, timelineRuns, log = () => {} }) {
  const register = readJson(path.join(dataDir, "clubs.json"));
  const params = readJson(path.join(dataDir, "season-params.json")).params;
  // Rules/targets/tiebreak come from the newest committed config (G2).
  const newest = latestConfig(dataDir);
  const config = historicalConfig(newest, year);

  const outDir = path.join(dataDir, "seasons", String(year));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`);

  for (const league of HISTORICAL_LEAGUES) {
    const built = buildHistoricalLeague({
      dataDir, league, year, register, leagueConfig: config.leagues[league], params, runs, timelineRuns, log,
    });
    const dir = path.join(outDir, league);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "season.json"), `${JSON.stringify(built.seasonFile, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, "prematch.json"), `${JSON.stringify(built.prematch, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, "outlook.json"), `${JSON.stringify(built.outlook, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, "timeline-frozen.json"), `${JSON.stringify(built.timelineFrozen, null, 2)}\n`);
    log(`wrote ${league} ${year}`);
  }
}

/** The newest committed season config — the source of the (stable) rules/targets. */
function latestConfig(dataDir) {
  const seasonsDir = path.join(dataDir, "seasons");
  const years = fs.readdirSync(seasonsDir).filter((n) => /^\d{4}$/.test(n)).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    const p = path.join(seasonsDir, String(y), "config.json");
    if (fs.existsSync(p)) return readJson(p);
  }
  throw new Error("no committed config to derive rules/targets from");
}
