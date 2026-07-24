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

/**
 * Presentation order INSIDE a shared rank (§11, V1.1 addition).
 *
 * Before the first matchday every club is on 0 points with no goals, so the
 * Spielordnung puts all of them on one geteilter Tabellenplatz and the ranker —
 * correctly — refuses to order them. That leaves the display falling back to
 * whatever order the club list happened to have, which reads as a ranking to
 * anyone who does not know better. Ordering those rows by expected points is
 * strictly more informative and, crucially, cannot misrepresent anything: the
 * rows being reordered are exactly the rows the table itself declares
 * indistinguishable.
 *
 * Two rules make this safe, and both are load-bearing:
 *   * ONLY within a shared-rank block. Rows the ranker did separate keep their
 *     order, always.
 *   * The shared rank stays displayed, and the caption says the order inside it
 *     is the forecast's, not the table's.
 *
 * With no forecast to sort by, the order is left exactly as it was.
 */
export function orderWithinSharedRanks(table, points) {
  if (!points) return table;
  const out = [];
  for (let i = 0; i < table.length;) {
    let j = i;
    while (j < table.length && table[j].sharedRank && table[j].rank === table[i].rank) j++;
    if (j - i > 1) {
      out.push(...table.slice(i, j).sort((a, b) => {
        const pa = points[a.clubId]?.expected;
        const pb = points[b.clubId]?.expected;
        if (pa === undefined || pb === undefined || pa === pb) return 0;
        return pb - pa;
      }));
      i = j;
    } else {
      out.push(table[i]);
      i++;
    }
  }
  return out;
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
  // Presentation joins — the matchday (a duel needs its „when" to be useful) and
  // the heat `min(P_A, P_B)` (a duel is hottest when BOTH clubs are in the race).
  // Neither touches the §4 metric; they are read off the fixture list here.
  const matchdayOf = new Map(season.fixtures.map((f) => [f.id, f.matchday]));
  return found.map((d) => ({
    ...d,
    targetLabel: labels[d.target] ?? d.target,
    matchday: matchdayOf.get(d.fixtureId) ?? null,
    heat: Math.min(d.pHome, d.pAway),
  }));
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

  // Places from which the season continues in a play-off. Without them this
  // function claims „Klassenerhalt nicht mehr möglich" the moment 15th becomes
  // unreachable — which is false while 16th is still in reach, and it is a
  // GUARANTEE, so being wrong is not a rounding matter. The list is season
  // configuration: between 1992/93 and 2007/08 it was empty.
  const playoffPlaces = new Set(leagueConfig.playoffPlaces ?? []);

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

      if (canCatch < t.to) {
        perClub.get(row.clubId).secured.push(t);
      } else if (aboveCeiling >= t.to) {
        // The zone itself is gone. Whether that is the end depends on whether
        // the place right below it leads into a play-off and is still reachable.
        const playoffPlace = t.to + 1;
        const viaPlayoff = playoffPlaces.has(playoffPlace) && aboveCeiling < playoffPlace;
        perClub.get(row.clubId).eliminated.push({ ...t, viaPlayoff });
      }
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
      // `viaPlayoff` travels with the statement: the UI must not phrase a
      // play-off route as a settled exit.
      results.push({ clubId, target: widest, kind: "eliminated", viaPlayoff: widest.viaPlayoff === true });
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

// ---------------------------------------------------------------------------
//  V1.2 — Modellgüte
// ---------------------------------------------------------------------------

/**
 * Per PLAYED match and club: how old was the rating that prediction rested on?
 *
 * §4 addendum („Rating-Aktualität", renamed from „Rating-Verzögerung" — the old
 * name promised a measurement of how far the rating LAGS true strength, which
 * this does not make). The provenance is resolved PER CLUB, because an entry can
 * be `carried-forward` on account of one club while the other's rating came from
 * the snapshot as normal.
 */
export function ratingAgeEntries(season, prematch) {
  if (!prematch) return [];
  const played = new Set(playedFixtures(season.fixtures).map((f) => f.id));
  const out = [];
  for (const e of prematch.entries) {
    if (!played.has(e.fixtureId)) continue;
    for (const clubId of [e.homeClubId, e.awayClubId]) {
      const carried = e.carriedFrom?.[clubId];
      const effectiveAt = carried ? carried.effectiveAt : e.snapshotEffectiveAt;
      const provenance = carried ? "carried-forward" : (e.snapshotProvenance ?? e.provenance);
      // An entry from before the schema carried these fields contributes
      // nothing rather than a guessed date.
      if (!effectiveAt || !provenance) continue;
      out.push({ fixtureId: e.fixtureId, clubId, kickoff: e.kickoff, effectiveAt, provenance });
    }
  }
  return out;
}

/**
 * The same predictions, but computed from the FROZEN pre-season ratings — the
 * „Trefferquote live vs eingefroren" comparison.
 *
 * The frozen ratings come from the timeline artefact, which records the ratings
 * its own curve was computed from. The app does not pick a second frozen rating
 * source of its own (§10).
 */
export function scoredMatchesFrozen(season, timeline, params, league) {
  const frozen = timeline?.frozenRatings;
  if (!frozen || !params) return [];
  const p = effectiveParams(params.params, { league });
  const out = [];
  for (const f of playedFixtures(season.fixtures)) {
    const eh = frozen[f.homeClubId];
    const ea = frozen[f.awayClubId];
    if (!Number.isFinite(eh) || !Number.isFinite(ea)) continue;
    out.push({
      fixture: f,
      // One label for the whole set: these are not pre-match ratings at all,
      // they are the season-start ratings applied retrospectively.
      provenance: "frozen",
      prediction: predictMatch(eh, ea, p).tendency,
      actual: tendencyOf(f.gh, f.ga),
    });
  }
  return out;
}

/**
 * „Wichtigstes kommendes Spiel" (§4), read from the canonical artefact.
 *
 * The metric is computed ONCE in the pipeline during the canonical run; this
 * only ranks and labels it. `matchday` restricts the candidates to one matchday
 * (the Spieltage page); without it the whole remaining season is considered.
 */
export function fixtureImpact(outlook, season, leagueConfig, { matchday = null } = {}) {
  if (!outlook?.fixtureImpact?.length) return [];
  const byId = new Map(season.fixtures.map((f) => [f.id, f]));
  const labels = Object.fromEntries(targetList(leagueConfig).map((t) => [t.id, t.label]));
  const rows = [];
  for (const entry of outlook.fixtureImpact) {
    const fx = byId.get(entry.fixtureId);
    if (!fx) continue;
    if (matchday !== null && fx.matchday !== matchday) continue;
    // The larger of the two, and WHICH one — a bare number would not say what
    // it is about, and the two targets mean very different things.
    let best = null;
    for (const [target, v] of Object.entries(entry.targets)) {
      if (!best || v.shift.value > best.value) {
        best = { target, label: labels[target] ?? target, value: v.shift.value, places: v.places };
      }
    }
    if (!best) continue;
    rows.push({
      fixtureId: entry.fixtureId,
      fixture: fx,
      matchday: fx.matchday,
      home: entry.home,
      away: entry.away,
      outcomeProbabilities: entry.outcomeProbabilities,
      smallestConditionalRuns: entry.smallestConditionalRuns,
      byTarget: entry.targets,
      leading: best,
    });
  }
  return rows.sort((a, b) => b.leading.value - a.leading.value);
}
