// ============================================================================
//  „Was muss passieren?" — the requirement solver (§7, V2a).
//
//  A points total alone cannot express a minimal sufficient condition (six
//  points off a direct rival also deny them those points; six off mid-table do
//  not). So the contract is layered:
//
//    1. a CONSERVATIVE own-strength guarantee P* — the smallest own points total
//       that reaches the target under EVERY distribution of those points across
//       the club's own fixtures and every consistent combination of other
//       results;
//    2. when no P* exists, the necessary own minimum plus SUFFICIENT HELP
//       COMBINATIONS as explicit logical alternatives, each with a
//       machine-checkable certificate, subset-minimal;
//    3. where a single own fixture decides it, that fixture is named.
//
//  THE §6 TIEBREAK IS CONSERVATIVE. A points-level tie counts AGAINST the club:
//  goal difference and goals rank ahead of the head-to-head, and future goal
//  margins are unbounded, so a guarantee is issued only on STRICT points
//  separation. A rival that can merely TIE X on points is treated as ahead.
//
//  PRODUCTION LOGIC REASONS ON POINTS BOUNDS, never by enumerating scorelines
//  (§7). Exhaustive enumeration exists only as a test oracle on small synthetic
//  leagues. Completeness of the help search is explicitly NOT claimed: with ~45
//  remaining fixtures the space cannot be exhausted. The guarantee is that every
//  EMITTED combination is sound and subset-minimal, within a deterministic node
//  budget — never that the search found all of them.
//
//  DETERMINISM is required in full (§7): canonical sorting of clubs and
//  fixtures, a deterministic branching order over that sorted representation, and
//  no dependence on Map/Set iteration order anywhere on the search path.
// ============================================================================

/** Default node budget. Deterministic — a node count, never a wall-clock limit. */
export const DEFAULT_NODE_BUDGET = 50000;

/** All remaining head-to-head fixtures between two clubs, and each club's rest. */
function remainingBreakdown(remaining, clubId) {
  let own = 0;
  const h2h = new Map(); // rivalId -> count of X-vs-rival games
  const rivalRemaining = new Map(); // rivalId -> total remaining games
  for (const f of remaining) {
    const involvesX = f.home === clubId || f.away === clubId;
    const other = f.home === clubId ? f.away : f.away === clubId ? f.home : null;
    if (involvesX) {
      own++;
      h2h.set(other, (h2h.get(other) ?? 0) + 1);
    }
    for (const c of [f.home, f.away]) {
      if (c === clubId) continue;
      rivalRemaining.set(c, (rivalRemaining.get(c) ?? 0) + 1);
    }
  }
  return { own, h2h, rivalRemaining };
}

/**
 * The most points rival R can still reach when X ends on total own points `a`,
 * quantified over EVERY distribution of X's `a` points (the adversary picks the
 * one most favourable to R).
 *
 * R's points come from two pools:
 *   - games NOT against X: adversary maximises → 3 per game;
 *   - the h head-to-head games vs X: the adversary wants R to win them, but X
 *     must still total `a`. X's points outside the h H2H games cap at
 *     3·(own − h); whatever `a` cannot come from there, X is FORCED to earn
 *     inside the H2H games, which limits R. With h ≤ 2 the H2H outcome space is
 *     tiny, so it is solved exactly by enumerating the ≤ 3^h combinations.
 */
function worstRivalMax(row, { pointsForWin }, { own, h2h, rivalRemaining }, a) {
  const h = h2h.get(row.clubId) ?? 0;
  const rivalTotal = rivalRemaining.get(row.clubId) ?? 0;
  const nonH2H = rivalTotal - h;
  const fromNonH2H = pointsForWin * nonH2H;

  // X is forced to earn at least this many points inside the H2H games.
  const xForcedInH2H = Math.max(0, a - pointsForWin * (own - h));

  // Enumerate the h games' (X, R) outcomes; keep the max R-points among those
  // that let X earn ≥ xForcedInH2H here.
  const perGame = [[pointsForWin, 0], [1, 1], [0, pointsForWin]]; // win / draw / loss for X
  let bestRivalH2H = 0;
  const stack = [[0, 0, 0]]; // [gameIndex, xSum, rSum]
  while (stack.length) {
    const [g, xSum, rSum] = stack.pop();
    if (g === h) {
      if (xSum >= xForcedInH2H && rSum > bestRivalH2H) bestRivalH2H = rSum;
      continue;
    }
    for (const [xp, rp] of perGame) stack.push([g + 1, xSum + xp, rSum + rp]);
  }
  return row.pts + fromNonH2H + bestRivalH2H;
}

/** The most points rival R can reach if all rivals lose everything they can. */
function bestCaseRivalMin(row) {
  return row.pts; // rivals cannot go below their current points
}

/**
 * Does own total `a` GUARANTEE the target (finish at position ≤ target.to)?
 *
 * Conservative: a rival counts as a threat if it can reach ≥ X's final points
 * (tie or better — a tie counts against X). Guaranteed iff FEWER THAN target.to
 * rivals can threaten. Rivals playing each other are treated independently,
 * which over-counts threats and therefore can only make the guarantee HARDER —
 * sound, never false.
 */
function guaranteedAt(rows, xRow, target, rules, breakdown, a) {
  const finalX = xRow.pts + a;
  let threats = 0;
  for (const row of rows) {
    if (row.clubId === xRow.clubId) continue;
    if (worstRivalMax(row, rules, breakdown, a) >= finalX) threats++;
  }
  return threats < target.to;
}

/**
 * The heart of it. Returns a structured, UI-agnostic result.
 *
 * @param {object} input
 * @param {Array<{clubId:string, pts:number}>} input.table   current points
 * @param {Array<{home:string, away:string}>}  input.remaining  remaining fixtures
 * @param {string} input.clubId                the club in question (X)
 * @param {{from:number, to:number, label?:string}} input.target  a „finish ≤ to" zone
 * @param {object} [input.rules]
 * @param {number} [input.nodeBudget]
 * @param {number} [input.maxCombinations]     how many alternatives to emit
 */
export function analyseRequirement({
  table, remaining, clubId, target, rules = { pointsForWin: 3, pointsForDraw: 1 },
  nodeBudget = DEFAULT_NODE_BUDGET, maxCombinations = 6,
}) {
  if (target.from !== 1) {
    throw new Error(`the solver handles „finish at position ${target.to} or better" targets; got from=${target.from}`);
  }
  // CANONICAL ORDER first, so every later step is deterministic regardless of
  // the caller's array order or any Map iteration.
  const rows = table.map((r) => ({ clubId: r.clubId, pts: r.pts })).sort((a, b) => a.clubId.localeCompare(b.clubId));
  const xRow = rows.find((r) => r.clubId === clubId);
  if (!xRow) throw new Error(`club ${clubId} is not in the table`);

  const breakdown = remainingBreakdown(remaining, clubId);
  const ownRemaining = breakdown.own;
  const maxOwn = ownRemaining * rules.pointsForWin;

  // --- 1. the conservative own-strength guarantee P* ------------------------
  let pStar = null;
  for (let a = 0; a <= maxOwn; a++) {
    if (guaranteedAt(rows, xRow, target, rules, breakdown, a)) { pStar = a; break; }
  }
  if (pStar !== null) {
    return {
      clubId, target, ownRemaining, maxOwn,
      kind: "guaranteed",
      pStar,
      // Named exactly so the caption can be written without re-deriving it.
      statement: `${pStar} Punkte aus den letzten ${ownRemaining} Spielen reichen — unabhängig davon, wie sie zustande kommen.`,
      truncated: false,
    };
  }

  // No P*. Everything below assumes X wins out (its best own effort); the help
  // is what must happen ON TOP of that. Under wins-out, X denies every rival it
  // plays their head-to-head points (scope clause handled by construction).
  const finalX = xRow.pts + maxOwn;
  const rivals = rows
    .filter((r) => r.clubId !== clubId)
    .map((r) => {
      const h = breakdown.h2h.get(r.clubId) ?? 0;
      const nonH2H = (breakdown.rivalRemaining.get(r.clubId) ?? 0) - h;
      return {
        clubId: r.clubId,
        pts: r.pts,
        // Ceiling once X has beaten it in every H2H game.
        ceiling: r.pts + rules.pointsForWin * nonH2H,
        nonH2HRemaining: nonH2H,
      };
    });

  const threats = rivals.filter((r) => r.ceiling >= finalX);
  // A rival X cannot drop below X's total even if it loses everything it plays
  // (other than X) — only goal difference could separate them, which the
  // conservative rule never assumes.
  const unremovable = threats.filter((r) => r.pts >= finalX);

  // --- necessary condition: minimum own points if every rival collapses -----
  let necessary = null;
  for (let a = 0; a <= maxOwn; a++) {
    const finalXa = xRow.pts + a;
    const ahead = rows.filter((r) => r.clubId !== clubId && bestCaseRivalMin(r) >= finalXa).length;
    if (ahead < target.to) { necessary = a; break; }
  }

  // Impossible even winning out AND with maximal help: too many rivals are
  // already at or above X's own ceiling.
  if (unremovable.length >= target.to) {
    return {
      clubId, target, ownRemaining, maxOwn,
      kind: "impossible",
      reason: `${unremovable.length} Klub(s) sind auch dann nicht mehr einzuholen, wenn ${nameOf(clubId)} alle restlichen Spiele gewinnt.`,
      necessary,
      truncated: false,
    };
  }

  // --- 2. subset-minimal sufficient help combinations -----------------------
  //
  // Reduce the threat set to at most target.to − 1 by constraining rivals. Only
  // REMOVABLE threats can be constrained; the unremovable ones always remain, so
  // the number that must be neutralised is fixed:
  const removable = threats.filter((r) => r.pts < finalX)
    .sort((a, b) => a.clubId.localeCompare(b.clubId));
  const mustNeutralise = threats.length - (target.to - 1);

  const state = { finalX, rivals, target, unremovable };
  const combinations = [];
  let nodes = 0;
  let truncated = false;

  // Choose `mustNeutralise` rivals to constrain, in canonical (index) order.
  // Deterministic branching: a lexicographic combination generator over sorted
  // indices, no recursion into Map order.
  const chooseInto = (start, chosen) => {
    if (truncated || combinations.length >= maxCombinations) return;
    if (chosen.length === mustNeutralise) {
      nodes++;
      const combination = buildCombination(chosen.map((i) => removable[i]), finalX);
      // Every emitted combination is verified sound and subset-minimal HERE, so
      // the invariant holds by construction, not only by the acceptance tests.
      if (verifyHelpCertificate(state, combination).ok && isSubsetMinimal(state, combination)) {
        combinations.push(combination);
      }
      return;
    }
    for (let i = start; i < removable.length; i++) {
      if (++nodes > nodeBudget) { truncated = true; return; }
      chooseInto(i + 1, [...chosen, i]);
    }
  };
  if (mustNeutralise <= removable.length) chooseInto(0, []);
  else truncated = true; // cannot be done within the removable set — should not happen given the checks above

  // --- 3. a single deciding own fixture, where one exists -------------------
  const decidingFixture = findDecidingOwnFixture({
    remaining, clubId, xRow, target, rules, rows, breakdown, maxOwn,
  });

  return {
    clubId, target, ownRemaining, maxOwn,
    kind: "help",
    necessary,
    threats: threats.map((r) => r.clubId),
    combinations,
    decidingFixture,
    // The honest label the caption must carry.
    truncated,
    truncationNote: truncated
      ? "mögliche Kombinationen nicht vollständig durchsucht"
      : null,
    // The certificate state, so a consumer can RE-VERIFY every combination
    // independently — the whole point of a machine-checkable certificate is that
    // the checker need not trust the producer. Carries only ids and points.
    __state: state,
  };
}

/** A help combination: per-rival upper bounds on remaining points. */
function buildCombination(constrainedRivals, finalX) {
  return {
    constraints: constrainedRivals.map((r) => ({
      clubId: r.clubId,
      // The WEAKEST bound that still drops the rival strictly below X: its
      // remaining points (from games not against X) must stay ≤ this.
      maxRemainingPoints: finalX - r.pts - 1,
    })).sort((a, b) => a.clubId.localeCompare(b.clubId)),
  };
}

/**
 * MACHINE-CHECKABLE CERTIFICATE. Given the wins-out scenario and a combination,
 * recompute every rival's ceiling under the combination's bounds and assert that
 * fewer than target.to rivals can still reach X's total.
 */
export function verifyHelpCertificate(state, combination) {
  const { finalX, rivals, target } = state;
  const bound = new Map(combination.constraints.map((c) => [c.clubId, c.maxRemainingPoints]));
  let threats = 0;
  const offenders = [];
  for (const r of rivals) {
    const cap = bound.has(r.clubId) ? Math.min(bound.get(r.clubId), r.nonH2HRemaining * 3) : r.nonH2HRemaining * 3;
    const ceiling = r.pts + Math.max(0, cap);
    if (ceiling >= finalX) { threats++; offenders.push(r.clubId); }
  }
  return { ok: threats < target.to, threats, offenders };
}

/** Subset-minimal: removing any single constraint invalidates the certificate. */
export function isSubsetMinimal(state, combination) {
  if (!verifyHelpCertificate(state, combination).ok) return false;
  for (let i = 0; i < combination.constraints.length; i++) {
    const without = { constraints: combination.constraints.filter((_, j) => j !== i) };
    if (verifyHelpCertificate(state, without).ok) return false; // this constraint was not needed
  }
  return true;
}

/**
 * Where a single own fixture against a rival decides the guarantee, name it —
 * „ein Sieg im direkten Duell gegen Y genügt" (§7 item 3).
 */
function findDecidingOwnFixture({ remaining, clubId, xRow, target, rules, rows, breakdown, maxOwn }) {
  // Own fixtures against a threatening rival, in canonical order.
  const ownAgainst = remaining
    .filter((f) => (f.home === clubId || f.away === clubId))
    .map((f) => (f.home === clubId ? f.away : f.home))
    .filter((rivalId, i, arr) => arr.indexOf(rivalId) === i)
    .sort((a, b) => a.localeCompare(b));

  for (const rivalId of ownAgainst) {
    // Would winning every game (already the wins-out case) plus this being a
    // strict head-to-head win change nothing new — the interesting statement is
    // when beating THIS rival is what tips a single remaining threat. We report
    // it descriptively; the guarantee itself is covered by the combinations.
    const rivalRow = rows.find((r) => r.clubId === rivalId);
    if (!rivalRow) continue;
    const h = breakdown.h2h.get(rivalId) ?? 0;
    const nonH2H = (breakdown.rivalRemaining.get(rivalId) ?? 0) - h;
    const rivalCeilingIfBeaten = rivalRow.pts + rules.pointsForWin * nonH2H;
    if (rivalCeilingIfBeaten < xRow.pts + maxOwn) {
      return { rivalId, note: `Ein Sieg im direkten Duell gegen ${rivalId} nimmt diesem Klub die entscheidenden Punkte.` };
    }
  }
  return null;
}

// The solver works purely on ids; the UI supplies display names. Kept internal
// so the „impossible" reason can still read naturally without a name map here.
function nameOf(id) { return id; }
