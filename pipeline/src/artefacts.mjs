// ============================================================================
//  Precomputed simulation artefacts (§3, §5.3).
//
//  „Heavy artefacts — full timeline simulations are precomputed in the pipeline
//   and committed, never recomputed per browser visit."
//
//  Two artefacts per league-season:
//
//   1. CURRENT OUTLOOK — one simulation for the current data state, 20 000 runs.
//      This is the CANONICAL artefact: every displayed matchday delta comes from
//      it, and the user's run-count control changes only their own view, never
//      the basis of a historical difference. It is identified by its cache key
//      alone, never by the UI view, so no two pages can disagree about the same
//      number.
//
//   2. FROZEN-RATING TIMELINE — one simulation per matchday, 5 000 runs, using
//      the PRE-SEASON ratings throughout. This is what V1 ships (§1): a
//      live-rating timeline needs archived point-in-time ratings and cannot be
//      reconstructed from results alone, so it arrives in V1.2. The frozen curve
//      is computable today from results plus one pre-season rating — and is
//      labelled as exactly that.
//
//  Timeline points for past matchdays are STABLE: frozen ratings do not move and
//  played results are append-only. So they are computed once and reused, which
//  is what keeps a two-hourly workflow affordable.
// ============================================================================

import { simulateSeason, ENGINE_VERSION } from "../../packages/engine/src/simulate.mjs";
import { SIMULATION_PROTOCOL_VERSION } from "../../packages/engine/src/rng.mjs";

export const CANONICAL_RUNS = 20000;
export const TIMELINE_RUNS = 5000;
export const BATCHES = 20;

/** Targets from the season config, as the engine's predicate form. */
export function targetsFromConfig(leagueConfig) {
  if (!leagueConfig?.targets) {
    throw new Error(
      "league config carries no `targets`. Targets are season configuration (§7) and are never "
        + "assumed — a season without them cannot be simulated.",
    );
  }
  const out = {};
  for (const [name, t] of Object.entries(leagueConfig.targets)) {
    out[name] = { places: t.places, label: t.label, positions: (r) => r >= t.from && r <= t.to };
  }
  return out;
}

/** Results known after `matchday` — everything on later matchdays is unplayed. */
function stateAfterMatchday(fixtures, matchday) {
  return fixtures.map((f) => (f.matchday <= matchday && f.gh !== undefined
    ? f
    : { id: f.id, matchday: f.matchday, kickoff: f.kickoff, homeClubId: f.homeClubId, awayClubId: f.awayClubId }));
}

/**
 * The highest matchday M for which EVERY fixture of matchdays 1..M has a result
 * (AUDIT_FAMILIE §2). Zero when even the first matchday is still open.
 *
 * Both timelines cache their points on the promise that „a point for a completed
 * matchday cannot change". The old gate — some later matchday has begun — did
 * not keep that promise: a matchday with one postponed fixture was computed from
 * the other eight results and then frozen for good. Cumulative completeness
 * makes the promise true instead of merely asserted, and it is what makes a
 * live-grown timeline identical to a retroactively built one.
 *
 * The visible price is intended: a long postponement PAUSES the curve, and
 * several points appear at once when the makeup match is played. A gap that is
 * visible is the honest form of „we do not know yet"; a point silently computed
 * from eight ninths of a matchday is not.
 */
function completeThroughMatchday(fixtures, matchdays) {
  let last = 0;
  for (const m of matchdays) {
    if (m <= 0) continue;
    if (fixtures.some((f) => f.matchday === m && f.gh === undefined)) break;
    last = m;
  }
  return last;
}

const toEngineFixtures = (fixtures) => fixtures.map((f) => ({
  id: f.id,
  home: f.homeClubId,
  away: f.awayClubId,
  isGhost: f.isGhost ?? false,
  ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}),
}));

/**
 * The current outlook — the canonical artefact for this data state.
 *
 * @param {object} input
 * @param {Array} input.clubs    [{ clubId, rating }] at the CURRENT data state
 */
export function buildCurrentOutlook({
  seasonId, league, clubs, fixtures, params, targets, runs = CANONICAL_RUNS, rules,
  impactTargets = [],
}) {
  return {
    kind: "currentOutlook",
    // The ratings this artefact was computed from, so the app can show
    // rating-derived figures (Restprogramm-Schwere, Elo-Verlauf) without
    // inventing a rating source of its own.
    ratings: Object.fromEntries(clubs.map((c) => [c.clubId, c.rating])),
    ...simulateSeason({
      seasonId, league, clubs,
      fixtures: toEngineFixtures(fixtures),
      params, targets, runs, batches: BATCHES, rules,
      // „Wichtigstes kommendes Spiel" (§4): computed ONCE here, during the
      // canonical run, and consumed by both Übersicht and Spieltage. No extra
      // simulation — the conditionals are filtered from these very runs.
      impactTargets,
    }),
  };
}

/**
 * The frozen-rating timeline.
 *
 * Every point uses the SAME pre-season ratings; only the set of known results
 * grows. That is what makes the curve mean „Prognose mit eingefrorener
 * Saisonstart-Stärke" and nothing more — it carries no rating updates at all.
 *
 * @param {object} [input.existing]  a previously committed timeline; its points
 *   are reused unchanged, because a frozen-rating point for a completed
 *   matchday cannot change.
 */
export function buildFrozenTimeline({
  seasonId, league, frozenClubs, fixtures, params, targets, rules,
  runs = TIMELINE_RUNS, existing = null, log = () => {},
}) {
  const matchdays = [...new Set(fixtures.map((f) => f.matchday))].sort((a, b) => a - b);
  const completeThrough = completeThroughMatchday(fixtures, matchdays);

  const byMatchday = new Map();
  for (const p of existing?.points ?? []) {
    // Reuse only points computed under the same protocol, run count and
    // engine — otherwise the curve would silently mix incomparable bases.
    if (p.runs === runs
      && p.engineVersion === ENGINE_VERSION
      && p.simulationProtocolVersion === SIMULATION_PROTOCOL_VERSION) {
      byMatchday.set(p.matchday, p);
    }
  }

  // Matchday 0 is the pre-season forecast: nothing played, frozen ratings.
  const wanted = [0, ...matchdays.filter((m) => m > 0 && m <= completeThrough)];
  let computed = 0;
  for (const md of wanted) {
    if (byMatchday.has(md)) continue;
    const state = stateAfterMatchday(fixtures, md);
    const sim = simulateSeason({
      seasonId: `${seasonId}-frozen-md${md}`,
      league,
      clubs: frozenClubs,
      fixtures: toEngineFixtures(state),
      params,
      targets,
      runs,
      batches: BATCHES,
      rules,
    });
    byMatchday.set(md, {
      matchday: md,
      runs,
      engineVersion: sim.engineVersion,
      simulationProtocolVersion: sim.simulationProtocolVersion,
      playedCount: sim.playedCount,
      probabilities: sim.probabilities,
      points: sim.points,
    });
    computed++;
    log(`timeline ${league} matchday ${md}: ${sim.playedCount} played`);
  }

  return {
    kind: "frozenTimeline",
    league,
    seasonId,
    runs,
    ratingBasis: "frozen pre-season ratings — the curve carries no rating updates",
    points: [...byMatchday.values()].sort((a, b) => a.matchday - b.matchday),
    computed,
  };
}

/**
 * The LIVE-rating timeline (§5.3, V1.2).
 *
 * Point M answers: „wie sah die Prognose nach dem M. Spieltag aus, mit den
 * Ratings, die damals galten?" That needs archived point-in-time ratings and
 * cannot be reconstructed from results alone — which is exactly why the archive
 * exists from day one.
 *
 * The rating for point M is the newest snapshot effective ON OR BEFORE the day
 * AFTER that matchday's last kickoff. „After", not „before": the point is the
 * state once the matchday is complete, so the update that matchday caused
 * belongs in it. Under clubelo's dating convention (docs/verification/clubelo.md
 * §1d) the change appears on the following day, hence +1.
 *
 * Where no snapshot is available for a point, that point is SKIPPED and named in
 * `gaps` — never back-extrapolated, never silently dropped (§5.3 degraded state).
 *
 * @param {(date:string)=>object|null} input.ratingsOn  snapshot lookup by date
 */
export function buildLiveTimeline({
  seasonId, league, clubs, fixtures, params, targets, rules,
  ratingsOn, runs = TIMELINE_RUNS, existing = null, log = () => {},
}) {
  const matchdays = [...new Set(fixtures.map((f) => f.matchday))].sort((a, b) => a - b);
  const completeThrough = completeThroughMatchday(fixtures, matchdays);

  const byMatchday = new Map();
  for (const point of existing?.points ?? []) {
    if (point.runs === runs
      && point.engineVersion === ENGINE_VERSION
      && point.simulationProtocolVersion === SIMULATION_PROTOCOL_VERSION) {
      byMatchday.set(point.matchday, point);
    }
  }

  const shiftDays = (iso, days) => {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const gaps = [];
  let computed = 0;
  for (const md of matchdays.filter((m) => m > 0 && m <= completeThrough)) {
    if (byMatchday.has(md)) continue;
    // The day the state of point M actually came about: the last kickoff among
    // ALL fixtures up to and including M, not just M's own.
    //
    // Without a postponement the two are the same, and every existing point
    // keeps its value. With one they differ, and only the cumulative form is
    // right: a match of matchday 3 made up in October is part of point 5, so
    // ratings from September would predate a result the point contains. That
    // would reintroduce, in the asOf, exactly the mismatch the completeness
    // rule removes from the state. See the note in AUDIT_FAMILIE §2.
    const upToHere = fixtures.filter((f) => f.matchday <= md);
    const lastKickoff = upToHere.reduce((max, f) => (f.kickoff > max ? f.kickoff : max), upToHere[0].kickoff);
    const asOf = shiftDays(lastKickoff, 1);

    const snap = ratingsOn(asOf);
    const missing = snap ? clubs.filter((c) => snap.ratings[c.clubId] === undefined) : clubs;
    if (!snap || missing.length) {
      gaps.push({
        matchday: md,
        asOf,
        reason: snap
          ? `${missing.length} Klub(s) ohne Rating in diesem Snapshot`
          : "kein archivierter Snapshot bis zu diesem Datum",
      });
      continue;
    }

    const state = stateAfterMatchday(fixtures, md);
    const sim = simulateSeason({
      seasonId: `${seasonId}-live-md${md}`,
      league,
      clubs: clubs.map((c) => ({ clubId: c.clubId, rating: snap.ratings[c.clubId] })),
      fixtures: toEngineFixtures(state),
      params,
      targets,
      runs,
      batches: BATCHES,
      rules,
    });
    byMatchday.set(md, {
      matchday: md,
      asOf,
      snapshotId: snap.snapshotId,
      runs,
      engineVersion: sim.engineVersion,
      simulationProtocolVersion: sim.simulationProtocolVersion,
      playedCount: sim.playedCount,
      probabilities: sim.probabilities,
      points: sim.points,
    });
    computed++;
    log(`live timeline ${league} matchday ${md}: ratings as of ${asOf}`);
  }

  return {
    kind: "liveTimeline",
    league,
    seasonId,
    runs,
    ratingBasis: "Ratings, wie sie nach dem jeweiligen Spieltag galten",
    points: [...byMatchday.values()].sort((a, b) => a.matchday - b.matchday),
    gaps,
    computed,
  };
}
