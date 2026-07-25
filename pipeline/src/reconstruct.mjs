// ============================================================================
//  Rating reconstruction for historical seasons (§V2b.1 §1).
//
//  The committed training-elo gives, per fixture, the two clubs' ratings the day
//  BEFORE kickoff (`eloHome`/`eloAway`). From those pre-match values we rebuild
//  each club's rating as a STEP FUNCTION over the season — no clubelo request, no
//  approximation.
//
//  The state „after matchday N" for a club is the pre-match value it carried into
//  its NEXT match — the fixture at matchday N+1, identified by the MATCHDAY LABEL,
//  not by the calendar date. That distinction is the postponement/Nachholspiel
//  case the brief calls out: if a club's matchday-(N+1) game was played out of
//  order, its rating after matchday N is still the pre-match value of that
//  matchday-(N+1) fixture, not of whatever game happened next by date.
// ============================================================================

/** The pre-match rating a club carried into a given fixture. */
function preMatchFor(elo, match, clubId) {
  const e = elo[match.id];
  if (!e) throw new Error(`reconstruct: no training-elo for fixture ${match.id}`);
  if (clubId === match.home) return e.eloHome;
  if (clubId === match.away) return e.eloAway;
  throw new Error(`reconstruct: ${clubId} did not play fixture ${match.id}`);
}

/**
 * Build the reconstruction for one league-season.
 *
 * @param {Array}  matches training results ({id, matchday, date, home, away, …})
 * @param {object} elo     training-elo map: fixtureId → {eloHome, eloAway}
 * @returns {{ clubs, matchdayCount, ratingBefore, ratingsAfterMatchday, preSeasonRatings }}
 */
export function reconstruct(matches, elo) {
  // clubId → (matchday → pre-match elo)
  const byClub = new Map();
  const put = (clubId, matchday, value, fixtureId) => {
    if (!byClub.has(clubId)) byClub.set(clubId, new Map());
    const md = byClub.get(clubId);
    if (md.has(matchday)) {
      throw new Error(`reconstruct: ${clubId} has two fixtures at matchday ${matchday} (${fixtureId})`);
    }
    md.set(matchday, value);
  };
  for (const m of matches) {
    put(m.home, m.matchday, preMatchFor(elo, m, m.home), m.id);
    put(m.away, m.matchday, preMatchFor(elo, m, m.away), m.id);
  }

  const clubs = [...byClub.keys()].sort((a, b) => a.localeCompare(b, "de"));
  const matchdayCount = Math.max(...matches.map((m) => m.matchday));

  // Every club must play every matchday exactly once — a complete season.
  for (const clubId of clubs) {
    const md = byClub.get(clubId);
    for (let n = 1; n <= matchdayCount; n++) {
      if (!md.has(n)) throw new Error(`reconstruct: ${clubId} has no fixture at matchday ${n}`);
    }
  }

  /** The pre-match rating a club carried into its matchday-`matchday` fixture. */
  const ratingBefore = (clubId, matchday) => byClub.get(clubId)?.get(matchday);

  /**
   * Every club's rating „after matchday N" — the pre-match value of its
   * matchday-(N+1) fixture (by label). For N ≥ matchdayCount (season over) there
   * is no next fixture, so the last matchday's pre-match value stands in; the
   * season-end simulation has zero remaining games, so this placeholder never
   * affects an outcome (documented, §1).
   */
  const ratingsAfterMatchday = (n) => {
    const next = n + 1 <= matchdayCount ? n + 1 : matchdayCount;
    return new Map(clubs.map((clubId) => [clubId, byClub.get(clubId).get(next)]));
  };

  /** The pre-season ratings — what every club carried into matchday 1. */
  const preSeasonRatings = () => new Map(clubs.map((clubId) => [clubId, byClub.get(clubId).get(1)]));

  return { clubs, matchdayCount, ratingBefore, ratingsAfterMatchday, preSeasonRatings };
}
