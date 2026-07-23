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

const dayOffset = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * How far either side of a kickoff a snapshot may sit and still isolate that
 * one match. Two days is deliberately tight — see the warning below.
 */
export const DEFAULT_MAX_BRACKET_DAYS = 2;

/**
 * Pre-match rating check: after a decisive result the winner's rating must rise.
 *
 * This catches the failure that matters — ratings joined to the wrong club, or
 * a source whose dates are offset — in the one direction Elo guarantees.
 *
 * THE BRACKET MUST BE TIGHT, and this is not a detail. clubelo rates EVERY
 * competition a club plays; our fixture list is league-only. With a week-wide
 * bracket a club can win on Saturday and lose in Europe on Wednesday, and its
 * rating legitimately ends lower — measured on real 2025/26 data, a weekly
 * bracket produced 22 "violations" in 216 checks, every one of them a European
 * or cup match the league fixtures cannot see. Widening this window does not
 * make the check stronger, it makes it wrong.
 *
 * So: the two snapshots must sit within `maxBracketDays` either side of the
 * kickoff, and no other LEAGUE match of that club may fall between them. A club
 * plays at most once a day, so a ±2-day bracket around a kickoff isolates that
 * fixture in practice. Anything wider is skipped rather than reported, and the
 * skipped count is returned so an empty check cannot masquerade as a pass.
 *
 * CLUBELO'S DATING CONVENTION, verified on real 2025/26 data: the row covering
 * the match date is the PRE-match rating, and the new value starts the day
 * AFTER. Three worked examples, all consistent:
 *
 *   Leverkusen won 27 Sep — 1838.5 valid 26–27 Sep, 1841.9 from 28 Sep
 *   Bayern     won 29 Nov — 1988.5 valid 28–29 Nov, 1989.6 from 30 Nov
 *   Frankfurt  won 14 Mar — 1681.8 valid 13–14 Mar, 1684.8 from 15 Mar
 *
 * So `before` is the rating valid ON the match date, not one strictly earlier.
 * Taking a strictly earlier snapshot pulls in whatever else happened in
 * between — Bayern lost in Europe on 26 Nov, which is why the 27 Nov value is
 * 1990.3 and a naive comparison "showed" a win lowering the rating.
 *
 * NOTE the deliberate asymmetry with the forecast rule in preMatch.mjs, which
 * uses the latest snapshot STRICTLY BEFORE the kickoff date. That rule is
 * conservative on purpose: it can never leak a match's own result into its
 * forecast, even if clubelo were to change its dating. This gate has the
 * opposite job — isolating one match as tightly as possible — so it follows the
 * convention above instead. The two differing rules are intentional, not an
 * inconsistency.
 *
 * @param {Array} playedFixtures  decisive, finished fixtures with kickoff + result
 * @param {Array} snapshots       [{ effectiveAt, ratings }], any order
 */
export function verifyRatingDirection(playedFixtures, snapshots, { maxBracketDays = DEFAULT_MAX_BRACKET_DAYS } = {}) {
  const ordered = snapshots.slice().sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const problems = [];
  let checked = 0;
  let skipped = 0;
  let unchanged = 0;

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
    const earliest = dayOffset(day, -maxBracketDays);
    const latest = dayOffset(day, maxBracketDays);

    // `<= day`: clubelo's row covering the match date is the pre-match value.
    const before = [...ordered].reverse().find(
      (s) => s.effectiveAt <= day && s.effectiveAt >= earliest && s.ratings[winner] !== undefined,
    );
    const after = ordered.find(
      (s) => s.effectiveAt > day && s.effectiveAt <= latest && s.ratings[winner] !== undefined,
    );
    if (!before || !after) { skipped++; continue; }

    // Confounded if the club played another LEAGUE match inside the window.
    // Other competitions are invisible here, which is exactly why the bracket
    // is kept narrow enough that they cannot fit.
    const others = (matchesOf.get(winner) ?? []).filter((m) => {
      const d = String(m.kickoff).slice(0, 10);
      return m.id !== f.id && d >= before.effectiveAt && d < after.effectiveAt;
    });
    if (others.length) { skipped++; continue; }

    const pre = before.ratings[winner];
    const post = after.ratings[winner];

    // EXACT equality means clubelo published no update for this match and
    // carried the value forward — which is what it does after a season's final
    // matchday. That is a data-availability condition, not a join error: a
    // mis-joined rating shows up as a FALL, and bit-identical floats are not
    // something a wrong join produces. Counted separately so it stays visible
    // rather than silently passing or wrongly failing.
    if (post === pre) { unchanged++; continue; }

    checked++;
    if (post < pre) {
      problems.push(
        `${winner} won fixture ${f.id} (${f.gh}:${f.ga}) on ${day} but its rating fell: ` +
          `${pre} (${before.effectiveAt}) -> ${post} (${after.effectiveAt})`,
      );
    }
  }

  return { problems, checked, skipped, unchanged };
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
