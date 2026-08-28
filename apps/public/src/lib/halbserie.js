// ============================================================================
//  Half-season derivations (HALBSERIEN §2, §4, §5).
//
//  All of it is REAL data reshaped: a table over a subset of matchdays, a
//  balance over the same subset, the surprise list filtered. No new model, no
//  new metric — the ranking comes from packages/engine, the per-match scores
//  come from the existing `scoredMatches`, and this file only decides which
//  matches belong to which half.
//
//  The boundary is never a constant. It comes from the season configuration
//  (`herbstmeisterUntilMatchday`), because 17 follows from eighteen clubs and
//  thirty-four matchdays — a fact about this league's shape, not about
//  football. A season config without the field simply has no half-season, and
//  every consumer here returns null rather than inventing one.
// ============================================================================

import { buildTable, rankTable } from "../../../../packages/engine/src/ranking.mjs";
import { performanceVsExpectation } from "../../../../packages/engine/src/metrics.mjs";
import { rulesFrom } from "./season.js";
import { playedFixtures, remainingFixtures } from "./data.js";

/** The configured half-season boundary, or null when the season has none. */
export const halfBoundary = (leagueConfig) => leagueConfig?.herbstmeisterUntilMatchday ?? null;

/** The three views of a season. `null` boundary → only "gesamt" is offered. */
export const HALVES = [
  { id: "gesamt", label: "Gesamt" },
  { id: "hin", label: "Hinrunde" },
  { id: "rueck", label: "Rückrunde" },
];

/** Which half a matchday belongs to. Returns null when there is no boundary. */
export function halfOf(matchday, boundary) {
  if (!boundary) return null;
  return matchday <= boundary ? "hin" : "rueck";
}

/** Does this fixture belong to the requested half? "gesamt" takes everything. */
export const inHalf = (fixture, half, boundary) =>
  half === "gesamt" || !boundary || halfOf(fixture.matchday, boundary) === half;

/**
 * The REAL table over one half of the season.
 *
 * `inSeason` follows the same rule as the full table: it is false only when the
 * selected half is complete. That matters for more than tidiness — the
 * Spielordnung withholds criteria 3)–5) until a tied group has met home and
 * away, and inside the Hinrunde no pair ever has. A finished Hinrunde is
 * therefore still ranked under the in-season rules, and a genuine tie is a
 * geteilter Tabellenplatz rather than an invented order.
 *
 * Returns null when the season has no configured half.
 */
export function halfSeasonTable(season, leagueConfig, half) {
  const boundary = halfBoundary(leagueConfig);
  if (half !== "gesamt" && !boundary) return null;
  const rules = rulesFrom(leagueConfig);
  const clubIds = season.clubs.map((c) => c.clubId);
  const scope = season.fixtures.filter((f) => inHalf(f, half, boundary));
  const played = playedFixtures(scope).map((f) => ({
    home: f.homeClubId, away: f.awayClubId, gh: f.gh, ga: f.ga,
  }));
  const complete = remainingFixtures(scope).length === 0;
  // A half with nothing played yet still ranks — every club shares rank 1, which
  // is the honest table, not an empty state.
  return rankTable(buildTable(clubIds, played, rules), played, { inSeason: !complete, rules });
}

/**
 * Per-club balance for one half: matches, points, goals.
 *
 * Built from the engine's own table so that „Punkte" here can never drift from
 * „Punkte" in the standings — the points-for-a-win rule is season configuration
 * and is applied in exactly one place.
 */
export function halfSeasonBalance(season, leagueConfig, half) {
  const boundary = halfBoundary(leagueConfig);
  if (half !== "gesamt" && !boundary) return null;
  const rules = rulesFrom(leagueConfig);
  const scope = playedFixtures(season.fixtures.filter((f) => inHalf(f, half, boundary)));
  const rows = buildTable(
    season.clubs.map((c) => c.clubId),
    scope.map((f) => ({ home: f.homeClubId, away: f.awayClubId, gh: f.gh, ga: f.ga })),
    rules,
  );
  return new Map(rows.map((r) => [r.clubId, r]));
}

/**
 * Is the half-season anchor reached — i.e. is every fixture up to the boundary
 * played?
 *
 * This is the SAME cumulative-completeness question the timeline asks (Brief
 * 31), asked of the season file rather than of the artefact. Deliberately not
 * „is the current matchday past 17": a postponed fixture from matchday 12 means
 * the Hinrunde is not finished even in January, and a Herbstmeister announced
 * over a missing result would be wrong in exactly the way the completeness rule
 * exists to prevent.
 */
export function halfComplete(season, leagueConfig) {
  const boundary = halfBoundary(leagueConfig);
  if (!boundary) return false;
  const scope = season.fixtures.filter((f) => f.matchday <= boundary);
  return scope.length > 0 && remainingFixtures(scope).length === 0;
}

/**
 * The Herbstmeister as a FACT, from the real results — or null while the half
 * is not complete.
 *
 * Returns the list of leaders, because a geteilter Tabellenplatz at the anchor
 * is a real state: inside the Hinrunde no pair has met twice, so the
 * Spielordnung stops after goal difference and goals scored, and criterion 6
 * never applies during a running season. Two clubs level there are level, and
 * the view says so instead of picking one.
 */
export function herbstmeisterFact(season, leagueConfig) {
  if (!halfComplete(season, leagueConfig)) return null;
  const table = halfSeasonTable(season, leagueConfig, "hin");
  if (!table?.length) return null;
  const leaders = table.filter((r) => r.rank === 1);
  return { clubIds: leaders.map((r) => r.clubId), shared: leaders.length > 1, table };
}

/**
 * The Herbstmeister as a FORECAST, from the artefact — or null when the
 * artefact predates the tally or the season has no anchor.
 *
 * Rows are sorted by probability; `decided` mirrors the engine's own reading of
 * the data, so a view never has to re-derive it.
 */
export function herbstmeisterForecast(artefact) {
  const hm = artefact?.herbstmeister;
  if (!hm?.probabilities) return null;
  const rows = Object.entries(hm.probabilities)
    .map(([clubId, p]) => ({ clubId, p }))
    .sort((a, b) => b.p - a.p);
  return { ...hm, rows };
}

/** Scored per-match rows restricted to one half (§4.1, §4.2 filtering). */
export const scoredInHalf = (scored, half, boundary) =>
  scored.filter((s) => inHalf(s.fixture, half, boundary));

/**
 * Points over/under expectation per club and per half (§5).
 *
 * The METRIC is the engine's `performanceVsExpectation`, unchanged — only the
 * match set is filtered. Reimplementing the arithmetic here to „save a call"
 * would be the second implementation §10 forbids, and it is exactly where a
 * points-for-a-win rule drifts.
 *
 * A club with no matches in a half gets no row: a per-match average over zero
 * matches is not zero, and a zero would read as „exactly as expected".
 *
 * @param {Array} scored  rows from `scoredMatches`
 * @returns {Map<string, {hin, rueck, entwicklung}>} keyed by club; `hin` and
 *   `rueck` are `performanceVsExpectation` results or null, `entwicklung` is
 *   Rückrunde − Hinrunde per match, or null while either half is empty.
 */
export function performanceByHalf(scored, leagueConfig) {
  const boundary = halfBoundary(leagueConfig);
  const rules = rulesFrom(leagueConfig);
  const buckets = new Map(); // club -> { hin: [], rueck: [] }
  const push = (clubId, half, points, pWin, pDraw) => {
    if (!buckets.has(clubId)) buckets.set(clubId, { hin: [], rueck: [] });
    buckets.get(clubId)[half].push({ points, pWin, pDraw });
  };
  for (const s of scored) {
    const half = halfOf(s.fixture.matchday, boundary);
    if (!half) continue;
    const { homeClubId: h, awayClubId: a, gh, ga } = s.fixture;
    const hp = gh > ga ? rules.pointsForWin : gh === ga ? rules.pointsForDraw : 0;
    const ap = ga > gh ? rules.pointsForWin : gh === ga ? rules.pointsForDraw : 0;
    push(h, half, hp, s.prediction.homeWin, s.prediction.draw);
    push(a, half, ap, s.prediction.awayWin, s.prediction.draw);
  }
  const out = new Map();
  for (const [clubId, b] of buckets) {
    const hin = b.hin.length ? performanceVsExpectation(b.hin, rules) : null;
    const rueck = b.rueck.length ? performanceVsExpectation(b.rueck, rules) : null;
    out.set(clubId, {
      clubId,
      hin,
      rueck,
      entwicklung: hin && rueck ? rueck.perMatch - hin.perMatch : null,
    });
  }
  return out;
}

/**
 * Which timeline an anchor comparison should read, and what may honestly be
 * said about the gap between two of its points.
 *
 * This matters more than it looks. The §0 v5 wording — „Die Prognose verändert
 * sich durch neue Ergebnisse und aktualisierte Ratings" — is only true of the
 * LIVE-rating curve. The frozen curve holds every rating at its pre-season value
 * by construction, so on an archive season (which has no live timeline) that
 * sentence would name a cause the data explicitly excludes. The archive is
 * exactly where this comparison is most often read, so the wrong default would
 * be the usual case, not the edge case.
 *
 * Returns null when neither curve is available.
 */
export function anchorSource(timeline, timelineLive) {
  if (timelineLive?.points?.length) {
    return {
      points: timelineLive.points,
      live: true,
      note: "Die Prognose verändert sich durch neue Ergebnisse und aktualisierte Ratings.",
    };
  }
  if (timeline?.points?.length) {
    return {
      points: timeline.points,
      live: false,
      note: "Die Prognose verändert sich hier allein durch die Ergebnisse — die Stärken sind auf "
        + "dem Stand des Saisonstarts eingefroren.",
    };
  }
  return null;
}
