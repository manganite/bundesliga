// ============================================================================
//  Bounded rating carry-forward (v5.7 Addendum, Part 2.6).
//
//  WHY THIS IS SOUND. A clubelo rating is a STEP FUNCTION: it changes only when
//  a club plays. During a genuine off-season the rating from 3 July *is* the
//  rating on 23 July — clubelo has merely not extended the row. Carrying it
//  forward is therefore not an estimate.
//
//  WHY IT MUST EXPIRE. The pipeline sees only BL1/BL2 fixtures. It cannot see
//  the DFB-Pokal or European qualifying, and European qualifying runs in July. A
//  club can play a match this pipeline knows nothing about, and its true rating
//  moves without anything here noticing. So a long carry-forward is NOT safe.
//
//  Hence: an explicit, time-boxed switch. FAIL-CLOSED STAYS THE DEFAULT — without
//  the flag an unresolved club still fails the job and blocks the commit (§5.2,
//  unchanged). Nothing here is automatic.
// ============================================================================

/**
 * Hard ceiling between the rating's `effectiveAt` and the date it is used for.
 * Beyond this the value is refused EVEN WITH the switch set: the flag can
 * shorten the window, never extend it.
 */
export const MAX_CARRY_FORWARD_DAYS = 42;

export const CARRIED_PROVENANCE = "carried-forward";

const dayDiff = (fromIso, toIso) => Math.round(
  (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000,
);

/**
 * Decide whether one club may run on a carried rating.
 *
 * Every precondition must hold. Any failure means the club is unresolved, and
 * an unresolved club fails the job.
 *
 * @param {object} input
 * @param {string} input.clubId
 * @param {string} input.requestedDate     the date the rating is needed for
 * @param {string|null} input.carryForwardUntil  the switch; null = off
 * @param {{effectiveAt: string, rating: number, snapshotId: string}|null} input.previous
 *   the most recent archived rating for this club, or null if there is none
 * @param {Array<{kickoff: string}>} input.clubFixtures
 *   fixtures KNOWN TO THE PIPELINE involving this club
 */
export function evaluateCarryForward({
  clubId, requestedDate, carryForwardUntil, previous, clubFixtures = [],
}) {
  const refuse = (reason) => ({ ok: false, clubId, reason });

  // 1. Off by default.
  if (!carryForwardUntil) return refuse("carry-forward is off (no --carry-forward-until)");

  // 2. The switch is time-boxed.
  if (requestedDate > carryForwardUntil) {
    return refuse(`requested date ${requestedDate} is after --carry-forward-until=${carryForwardUntil}`);
  }

  // 3. A prior snapshot must exist. Nothing is invented.
  if (!previous) return refuse("no earlier snapshot carries a rating for this club");

  // 4. Hard ceiling, regardless of the flag.
  const ageDays = dayDiff(previous.effectiveAt, requestedDate);
  if (ageDays < 0) return refuse(`the archived rating (${previous.effectiveAt}) is newer than ${requestedDate}`);
  if (ageDays > MAX_CARRY_FORWARD_DAYS) {
    return refuse(
      `the rating from ${previous.effectiveAt} is ${ageDays} days old, past the ${MAX_CARRY_FORWARD_DAYS}-day ceiling`,
    );
  }

  // 5. No fixture this pipeline knows about may fall in the gap. If the club
  //    played a league match in between, the rating provably moved and the step
  //    function argument no longer holds.
  const intervening = clubFixtures.filter((f) => {
    const day = String(f.kickoff).slice(0, 10);
    return day > previous.effectiveAt && day <= requestedDate;
  });
  if (intervening.length) {
    return refuse(
      `${intervening.length} known fixture(s) fall between ${previous.effectiveAt} and ${requestedDate}`,
    );
  }

  return {
    ok: true,
    clubId,
    rating: previous.rating,
    // NEVER rewritten: the carried entry keeps the real date of the rating it
    // came from. Anything else would launder a stale value into a fresh one.
    effectiveAt: previous.effectiveAt,
    snapshotId: previous.snapshotId,
    ageDays,
    provenance: CARRIED_PROVENANCE,
  };
}

/**
 * The most recent archived rating for a club, at or before `date`.
 * Returns null when the archive has none.
 */
export async function latestArchivedRating({ clubId, date, index, loadSnapshot }) {
  const candidates = index.snapshots
    .filter((s) => s.effectiveAt <= date)
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.observedAt.localeCompare(a.observedAt));
  for (const meta of candidates) {
    const snap = await loadSnapshot(meta.snapshotId);
    const rating = snap.ratings[clubId];
    if (rating !== undefined) {
      return { effectiveAt: meta.effectiveAt, rating, snapshotId: meta.snapshotId };
    }
  }
  return null;
}

/**
 * Resolve the clubs a daily snapshot did not cover.
 *
 * Per-club, never global: a club that IS present always uses its live value and
 * is never considered here.
 *
 * @returns {{carried: Array, stillMissing: Array}}
 */
export async function resolveMissingClubs({
  missingClubIds, requestedDate, carryForwardUntil, index, loadSnapshot, fixturesByClub = new Map(),
}) {
  const carried = [];
  const stillMissing = [];

  for (const clubId of missingClubIds) {
    const previous = await latestArchivedRating({ clubId, date: requestedDate, index, loadSnapshot });
    const verdict = evaluateCarryForward({
      clubId,
      requestedDate,
      carryForwardUntil,
      previous,
      clubFixtures: fixturesByClub.get(clubId) ?? [],
    });
    if (verdict.ok) carried.push(verdict);
    else stillMissing.push(verdict);
  }

  return { carried, stillMissing };
}

/** Fixtures grouped by club, for the intervening-fixture precondition. */
export function groupFixturesByClub(fixtures) {
  const out = new Map();
  for (const f of fixtures) {
    for (const club of [f.homeClubId, f.awayClubId]) {
      if (!out.has(club)) out.set(club, []);
      out.get(club).push(f);
    }
  }
  return out;
}
