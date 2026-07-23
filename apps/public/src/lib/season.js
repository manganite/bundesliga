// ============================================================================
//  Derivations the pages share. Everything here delegates to packages/engine —
//  the app implements no model, no league rule and no metric of its own (§10).
// ============================================================================

import { buildTable, rankTable, CURRENT_SEASON_RULES } from "../../../../packages/engine/src/ranking.mjs";
import { effectiveParams, predictMatch, tendencyOf } from "../../../../packages/engine/src/model.mjs";
import {
  effectiveContenders, remainingScheduleStrength, directDuels, surprisal,
} from "../../../../packages/engine/src/metrics.mjs";
import { playedFixtures, remainingFixtures } from "./data.js";

export function rulesFrom(leagueConfig) {
  return {
    ...CURRENT_SEASON_RULES,
    pointsForWin: leagueConfig.pointsForWin,
    pointsForDraw: leagueConfig.pointsForDraw,
    criteria: leagueConfig.tiebreakCriteria ?? CURRENT_SEASON_RULES.criteria,
  };
}

/**
 * The current table.
 *
 * `inSeason` is true unless every fixture has been played. That is not
 * cosmetic: while the season runs, the Spielordnung applies only the first two
 * criteria until a tied group has met home AND away, and anything it cannot
 * separate shares a table position. The ranker returns `sharedRank` for exactly
 * those rows and the UI must render them as shared rather than inventing an
 * order.
 */
export function currentTable(season, leagueConfig) {
  const rules = rulesFrom(leagueConfig);
  const played = playedFixtures(season.fixtures).map((f) => ({
    home: f.homeClubId, away: f.awayClubId, gh: f.gh, ga: f.ga,
  }));
  const clubIds = season.clubs.map((c) => c.clubId);
  const table = buildTable(clubIds, played, rules);
  const complete = remainingFixtures(season.fixtures).length === 0;
  return rankTable(table, played, { inSeason: !complete, rules });
}

/** Targets in display order, straight from the season configuration. */
export function targetList(leagueConfig) {
  return Object.entries(leagueConfig.targets).map(([id, t]) => ({ id, ...t }));
}

/**
 * The Spannungsindex for one target.
 *
 * A k-place target's probabilities sum to k, not 1, so they are normalised
 * before the entropy — and the FLOOR of the reading is then k. The caption must
 * say so, or a reading of 2,0 on two relegation places is misread as residual
 * suspense when it actually means „vollständig entschieden".
 */
export function tension(outlook, target) {
  if (!outlook?.probabilities?.[target.id]) return null;
  const probs = Object.values(outlook.probabilities[target.id]);
  const r = effectiveContenders(probs, target.places);
  return { ...r, target };
}

/** Remaining-schedule strength per club, home and away separately (§4). */
export function scheduleStrength(season, ratings) {
  const remaining = remainingFixtures(season.fixtures);
  const out = new Map();
  for (const club of season.clubs) {
    const fixtures = [];
    for (const f of remaining) {
      if (f.homeClubId === club.clubId) fixtures.push({ atHome: true, opponentRating: ratings[f.awayClubId] });
      else if (f.awayClubId === club.clubId) fixtures.push({ atHome: false, opponentRating: ratings[f.homeClubId] });
    }
    if (fixtures.every((f) => Number.isFinite(f.opponentRating))) {
      out.set(club.clubId, remainingScheduleStrength(fixtures));
    }
  }
  return out;
}

/** Direct duels among remaining fixtures (§4), θ configurable, default 10 %. */
export function duels(season, outlook, leagueConfig, theta = 0.1) {
  if (!outlook) return [];
  const remaining = remainingFixtures(season.fixtures).map((f) => ({
    id: f.id, home: f.homeClubId, away: f.awayClubId,
  }));
  const byTarget = {};
  for (const t of targetList(leagueConfig)) {
    // Klassenerhalt covers 15 of 18 places, so nearly every pairing would
    // qualify — it carries no information as a "duel" and is left out.
    if (t.places > 6) continue;
    byTarget[t.id] = outlook.probabilities[t.id];
  }
  const found = directDuels(remaining, byTarget, theta);
  const labels = Object.fromEntries(targetList(leagueConfig).map((t) => [t.id, t.label]));
  return found.map((d) => ({ ...d, targetLabel: labels[d.target] ?? d.target }));
}

/**
 * Clinch and elimination, under the CONSERVATIVE tiebreak rule of §6.
 *
 * Where two clubs can finish level on points the tiebreak is treated as
 * UNFAVOURABLE, and no upper bound on future goals is ever assumed — future goal
 * margins are unbounded, and the Spielordnung ranks goal difference and goals
 * AHEAD of the direct comparison, so a locked head-to-head guarantees nothing.
 * In practice a guarantee is therefore issued only on STRICT points separation.
 *
 * This makes „sicher" genuinely sicher, at the cost of declaring things settled
 * slightly later than a naive implementation would.
 */
export function clinched(season, table, leagueConfig) {
  const rules = rulesFrom(leagueConfig);
  const remaining = remainingFixtures(season.fixtures);
  const maxPointsLeft = new Map(season.clubs.map((c) => [c.clubId, 0]));
  for (const f of remaining) {
    maxPointsLeft.set(f.homeClubId, maxPointsLeft.get(f.homeClubId) + rules.pointsForWin);
    maxPointsLeft.set(f.awayClubId, maxPointsLeft.get(f.awayClubId) + rules.pointsForWin);
  }

  const rows = table.map((r) => ({
    clubId: r.clubId,
    pts: r.pts,
    ceiling: r.pts + maxPointsLeft.get(r.clubId),
  }));

  // Only "finish at position `to` or better" targets can be settled this way.
  const zoneTargets = targetList(leagueConfig).filter((t) => t.from === 1).sort((a, b) => a.to - b.to);

  const perClub = new Map();
  for (const row of rows) perClub.set(row.clubId, { secured: [], eliminated: [] });

  for (const t of zoneTargets) {
    for (const row of rows) {
      // Guaranteed IN: fewer than `t.to` clubs can still reach this club's
      // points. Strict separation only — a possible tie counts against it.
      const canCatch = rows.filter((o) => o.clubId !== row.clubId && o.ceiling >= row.pts).length;
      // Guaranteed OUT: at least `t.to` clubs already have more points than this
      // club can still reach.
      const aboveCeiling = rows.filter((o) => o.clubId !== row.clubId && o.pts > row.ceiling).length;

      if (canCatch < t.to) perClub.get(row.clubId).secured.push(t);
      else if (aboveCeiling >= t.to) perClub.get(row.clubId).eliminated.push(t);
    }
  }

  // ONE statement per club — the strongest thing that is true. Listing every
  // club against every target produces the full cross product, which is noise
  // rather than news (§10: one primary element, empty cards hide).
  const results = [];
  for (const [clubId, { secured, eliminated }] of perClub) {
    if (secured.length) {
      // The most specific secured zone: „Platz 1–4 sicher" implies
      // Klassenerhalt, so only the tightest one is worth saying.
      results.push({ clubId, target: secured[0], kind: "secured" });
      continue;
    }
    // The only elimination that is genuinely news is the widest zone — being
    // out of the title race is expected for most of the league.
    const widest = eliminated[eliminated.length - 1];
    if (widest && widest.to >= rows.length - 3) {
      results.push({ clubId, target: widest, kind: "eliminated" });
    }
  }
  return results;
}

/** Pre-match predictions for played fixtures, from the committed dataset. */
export function scoredMatches(season, prematch, params, league) {
  if (!prematch || !params) return [];
  const p = effectiveParams(params.params, { league });
  const byFixture = new Map(prematch.entries.map((e) => [e.fixtureId, e]));
  const out = [];
  for (const f of playedFixtures(season.fixtures)) {
    const e = byFixture.get(f.id);
    if (!e) continue;
    const prediction = predictMatch(e.eloHome, e.eloAway, p).tendency;
    const actual = tendencyOf(f.gh, f.ga);
    out.push({
      fixture: f,
      provenance: e.provenance,
      prediction,
      actual,
      surprisal: surprisal(prediction, actual),
    });
  }
  return out;
}

/** A fixture's prediction, for an unplayed match. */
export function predictFixture(fixture, prematch, params, league) {
  if (!prematch || !params) return null;
  const e = prematch.entries.find((x) => x.fixtureId === fixture.id);
  if (!e) return null;
  const p = effectiveParams(params.params, { league });
  return predictMatch(e.eloHome, e.eloAway, p);
}
