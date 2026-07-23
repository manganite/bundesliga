// ============================================================================
//  Verification gates that run BEFORE anything is written (§5.1).
//
//  „Verify before writing: pre-match rating check (a decisive result must be
//   followed by a rating rise for the winner); sane fixture and matchday counts;
//   every fixture club resolves to a rating."
//
//  A failing gate means the job fails and the repository stays UNCHANGED — no
//  partial commit, no status field. The workflow reports the actual failure
//  through GitHub Actions notification instead (§5.1: v5 asked the job both to
//  commit nothing and to write a status, which contradict).
// ============================================================================

export class VerificationError extends Error {
  constructor(message, problems) {
    super(message);
    this.problems = problems;
  }
}

/**
 * Sane fixture and matchday counts.
 *
 * Expectations come from the season configuration, never from constants: the
 * Bundesliga has had 20 clubs and 38 matchdays before, and the V2 window
 * contains such a season (§5.4).
 */
export function verifyFixtureCounts(season, config) {
  const problems = [];
  const { fixtures } = season;
  const expectedMatches = (config.clubCount * (config.clubCount - 1));

  if (fixtures.length !== expectedMatches) {
    problems.push(`expected ${expectedMatches} fixtures for ${config.clubCount} clubs, got ${fixtures.length}`);
  }

  const matchdays = new Set(fixtures.map((f) => f.matchday));
  if (matchdays.size !== config.matchdayCount) {
    problems.push(`expected ${config.matchdayCount} matchdays, got ${matchdays.size}`);
  }
  for (const md of matchdays) {
    if (!Number.isInteger(md) || md < 1 || md > config.matchdayCount) {
      problems.push(`implausible matchday ${md}`);
    }
  }

  const perMatchday = new Map();
  for (const f of fixtures) perMatchday.set(f.matchday, (perMatchday.get(f.matchday) ?? 0) + 1);
  const expectedPerMatchday = config.clubCount / 2;
  for (const [md, n] of perMatchday) {
    if (n !== expectedPerMatchday) problems.push(`matchday ${md} has ${n} fixtures, expected ${expectedPerMatchday}`);
  }

  // Every club must appear exactly twice against every other — once home, once
  // away. A silently truncated or duplicated fetch fails here.
  const pairs = new Set();
  for (const f of fixtures) {
    const key = `${f.homeClubId}>${f.awayClubId}`;
    if (pairs.has(key)) problems.push(`duplicate fixture ${key}`);
    pairs.add(key);
  }

  const ids = new Set(fixtures.map((f) => f.id));
  if (ids.size !== fixtures.length) problems.push("duplicate fixture ids");

  return problems;
}

/** Every fixture club resolves to a rating in the snapshot about to be archived. */
export function verifyEveryClubHasRating(fixtures, ratings) {
  const problems = [];
  const needed = new Set();
  for (const f of fixtures) {
    needed.add(f.homeClubId);
    needed.add(f.awayClubId);
  }
  for (const clubId of [...needed].sort()) {
    const v = ratings[clubId];
    if (v === undefined) problems.push(`no rating for ${clubId}`);
    else if (!Number.isFinite(v)) problems.push(`non-numeric rating for ${clubId}: ${v}`);
    else if (v < 500 || v > 2600) problems.push(`implausible rating for ${clubId}: ${v}`);
  }
  return problems;
}

/**
 * Pre-match rating check: after a decisive result the winner's rating must rise.
 *
 * This catches the failure that matters — ratings joined to the wrong club, or
 * a source whose dates are offset — and it catches it in the one direction Elo
 * guarantees.
 *
 * The check is only meaningful where two snapshots BRACKET EXACTLY ONE match
 * for that club. A club that played twice between the snapshots can legitimately
 * end lower after a win, so those cases are skipped rather than reported, and
 * the number skipped is returned so an empty check cannot masquerade as a pass.
 *
 * @param {Array} playedFixtures  decisive, finished fixtures with kickoff + result
 * @param {Array} snapshots       [{ effectiveAt, ratings }], any order
 */
export function verifyRatingDirection(playedFixtures, snapshots) {
  const ordered = snapshots.slice().sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const problems = [];
  let checked = 0;
  let skipped = 0;

  const matchesOf = new Map();
  for (const f of playedFixtures) {
    for (const club of [f.homeClubId, f.awayClubId]) {
      if (!matchesOf.has(club)) matchesOf.set(club, []);
      matchesOf.get(club).push(f);
    }
  }

  for (const f of playedFixtures) {
    if (f.gh === f.ga) continue; // only decisive results say anything
    const winner = f.gh > f.ga ? f.homeClubId : f.awayClubId;
    const day = String(f.kickoff).slice(0, 10);

    const before = [...ordered].reverse().find((s) => s.effectiveAt <= day && s.ratings[winner] !== undefined);
    const after = ordered.find((s) => s.effectiveAt > day && s.ratings[winner] !== undefined);
    if (!before || !after) { skipped++; continue; }

    // Confounded if the club played anything else inside the window.
    const others = (matchesOf.get(winner) ?? []).filter((m) => {
      const d = String(m.kickoff).slice(0, 10);
      return m.id !== f.id && d >= before.effectiveAt && d < after.effectiveAt;
    });
    if (others.length) { skipped++; continue; }

    checked++;
    if (after.ratings[winner] <= before.ratings[winner]) {
      problems.push(
        `${winner} won fixture ${f.id} (${f.gh}:${f.ga}) on ${day} but its rating did not rise: ` +
          `${before.ratings[winner]} (${before.effectiveAt}) -> ${after.ratings[winner]} (${after.effectiveAt})`,
      );
    }
  }

  return { problems, checked, skipped };
}

/** Run every gate and throw with the full list rather than the first failure. */
export function verifyAll({ season, config, ratings, snapshots = [] }) {
  const problems = [
    ...verifyFixtureCounts(season, config),
    ...verifyEveryClubHasRating(season.fixtures, ratings),
  ];

  const decisive = season.fixtures.filter((f) => f.gh !== undefined && f.gh !== f.ga);
  const direction = verifyRatingDirection(decisive, snapshots);
  problems.push(...direction.problems);

  if (problems.length) {
    throw new VerificationError(
      `${problems.length} verification problem(s) — nothing is written and nothing is committed`,
      problems,
    );
  }
  return { ok: true, ratingDirection: direction };
}
