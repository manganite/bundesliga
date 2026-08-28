// ============================================================================
//  Rebuild the SIMULATION artefacts of a completed, committed season.
//
//  Why this exists: an ENGINE_VERSION bump changes the artefact shape, and the
//  archive would otherwise keep answering with the old one for ever. The cron
//  heals only the season it detects; every earlier season is committed and
//  nothing recomputes it.
//
//  What it deliberately does NOT do: touch season.json, prematch.json or
//  config.json. Those carry PROVENANCE — where the results came from, which
//  snapshot each prediction used — and a season built by the live pipeline
//  (2025/26) has better provenance than any reconstruction could give it. Only
//  outlook.json and timeline-frozen.json are recomputed, and both are recomputed
//  from the rating inputs THEY THEMSELVES RECORD: `ratings` in the outlook,
//  `frozenRatings` in the timeline. No rating source is invented here, and none
//  is fetched.
//
//  The live season is refused outright: the cron owns it, rebuilds it every two
//  hours, and its live timeline needs the rating archive rather than a recorded
//  field.
//
//    node pipeline/src/rebuildArtefacts.mjs --season 2025            # write
//    node pipeline/src/rebuildArtefacts.mjs --season 2025 --check    # dry run
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import {
  buildCurrentOutlook, buildFrozenTimeline, targetsFromConfig, herbstmeisterAnchor,
} from "./artefacts.mjs";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const stable = (o) => `${JSON.stringify(o, null, 2)}\n`;

/**
 * Rebuild one league of one season.
 *
 * @returns {{league:string, files:Array<{file:string, changed:boolean}>}}
 */
export function rebuildLeague({ dataDir, year, league, check = false, log = () => {} }) {
  const dir = path.join(dataDir, "seasons", String(year), league);
  const config = readJson(path.join(dataDir, "seasons", String(year), "config.json"));
  const params = readJson(path.join(dataDir, "season-params.json")).params;
  const season = readJson(path.join(dir, "season.json"));
  const leagueConfig = config.leagues[league];
  const targets = targetsFromConfig(leagueConfig);
  const rules = {
    pointsForWin: leagueConfig.pointsForWin,
    pointsForDraw: leagueConfig.pointsForDraw,
    criteria: leagueConfig.tiebreakCriteria,
  };
  const seasonId = `${year}-${league}`;
  const anchor = herbstmeisterAnchor(leagueConfig);
  const files = [];

  const write = (file, payload) => {
    const next = stable(payload);
    const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    const changed = prev !== next;
    if (changed && !check) fs.writeFileSync(file, next);
    files.push({ file, changed });
  };

  // ---- outlook -------------------------------------------------------------
  const outlookFile = path.join(dir, "outlook.json");
  const prevOutlook = readJson(outlookFile);
  if (!prevOutlook.ratings) {
    throw new Error(`${outlookFile} records no \`ratings\`; refusing to invent a rating source`);
  }
  const clubs = season.clubs.map((c) => {
    const rating = prevOutlook.ratings[c.clubId];
    if (rating === undefined) throw new Error(`${outlookFile}: no rating for ${c.clubId}`);
    return { clubId: c.clubId, rating };
  });
  const outlook = {
    ...buildCurrentOutlook({
      seasonId, league, clubs, fixtures: season.fixtures, params, targets, rules,
      runs: prevOutlook.runs,
      impactTargets: leagueConfig.impactTargets ?? [],
      herbstmeisterUntilMatchday: anchor,
    }),
    // Provenance is carried over verbatim where the old artefact had it. It is
    // an observation about the run that produced the ratings, not something a
    // rebuild can re-derive.
    ...(prevOutlook.ratingProvenance ? { ratingProvenance: prevOutlook.ratingProvenance } : {}),
  };
  write(outlookFile, outlook);

  // ---- frozen timeline -----------------------------------------------------
  const timelineFile = path.join(dir, "timeline-frozen.json");
  if (fs.existsSync(timelineFile)) {
    const prev = readJson(timelineFile);
    if (!prev.frozenRatings) {
      // A season built by `buildHistorical` derives its pre-season ratings from
      // the committed training data and does not record them in the artefact.
      // That season is owned by the other tool; guessing a rating source here
      // is exactly what this file refuses to do.
      throw new Error(
        `${timelineFile} records no \`frozenRatings\` — this is a reconstructed historical season. `
          + `Rebuild it with: node pipeline/src/buildHistoricalCli.mjs --season ${year}`,
      );
    }
    const timeline = buildFrozenTimeline({
      seasonId, league,
      frozenClubs: season.clubs.map((c) => ({ clubId: c.clubId, rating: prev.frozenRatings[c.clubId] })),
      fixtures: season.fixtures, params, targets, rules,
      runs: prev.runs,
      // `existing: null` on purpose — reusing points is what we are undoing.
      existing: null,
      log,
      herbstmeisterUntilMatchday: anchor,
    });
    write(timelineFile, {
      ...timeline,
      frozenSnapshotId: prev.frozenSnapshotId,
      frozenEffectiveAt: prev.frozenEffectiveAt,
      frozenRatings: prev.frozenRatings,
      label: prev.label,
      computed: undefined, // run-scoped; must not make the file differ per run
    });
  }

  return { league, files };
}

/** Rebuild every league of one committed season. */
export function rebuildSeason({ dataDir = "data", year, check = false, log = () => {} }) {
  const dir = path.join(dataDir, "seasons", String(year));
  const leagues = fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, "outlook.json")));
  for (const league of leagues) {
    if (fs.existsSync(path.join(dir, league, "timeline-live.json"))) {
      throw new Error(
        `${year}/${league} carries a live timeline — that is the running season, and the cron owns it. `
          + "It rebuilds itself on the next run; rebuilding it here would need the rating archive, not a recorded field.",
      );
    }
  }
  const out = [];
  for (const league of leagues) out.push(rebuildLeague({ dataDir, year, league, check, log }));
  return out;
}
