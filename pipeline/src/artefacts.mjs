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
  const lastPlayed = fixtures.reduce((m, f) => (f.gh !== undefined ? Math.max(m, f.matchday) : m), 0);

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
  const wanted = [0, ...matchdays.filter((m) => m <= lastPlayed)];
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
