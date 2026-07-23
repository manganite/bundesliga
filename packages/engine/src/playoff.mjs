// ============================================================================
//  The relegation play-off (§6).
//
//  ITS OWN SIMULATION, IN ITS OWN RANDOM-KEY NAMESPACE. The play-off is computed
//  from league marginals plus a separate pairing simulation, so its runs are not
//  the league artefact's runs. Every key here carries `context: "playoff"`
//  alongside seasonId, protocol version, run index and club id, with the legs,
//  extra time and penalties as distinct `drawKind`s — so a play-off draw can
//  never collide with a league draw.
//
//  RATING_SIGMA IS DRAWN ONCE PER CLUB PER RUN AND APPLIES TO BOTH LEGS.
//  Consistent with §3: one run is one hypothetical "true strength"
//  configuration, not match-level randomness. Redrawing it per leg would turn a
//  strength assumption into noise and quietly shrink the favourite's edge.
//
//  THE MARGINAL APPROXIMATION IS NAMED, NOT HIDDEN. Computing P(i beats j) from
//  current ratings and multiplying it with P(i 16th) · P(j 3rd) treats play-off
//  strength as independent of HOW the clubs got there — finishing 16th is mildly
//  informative about end-of-season strength, and this simulation redraws
//  RATING_SIGMA rather than inheriting the league runs' conditioned draws. That
//  is a deliberate, pragmatic approximation; the alternative would be a joint
//  two-league simulation, which §6 excludes. Every caption says so.
// ============================================================================

import { makeKeyBase, uniform01, ratingNoise } from "./rng.mjs";
import { effectiveParams, eloToLambdas } from "./model.mjs";
import { drawScorelineDirect } from "./simulate.mjs";

const MIN_LAMBDA = 0.12;
export const PLAYOFF_CONTEXT = "playoff";

/**
 * Who hosts the SECOND leg?
 *
 * DFL Spielordnung § 5 Nr. 4, verified verbatim (docs/verification/dfl-spielordnung.md):
 *
 *   „Das Heimrecht im Rückspiel besitzt der Club, der gemäß dem Spielplan der
 *    abgelaufenen Spielzeit weniger spielfreie Tage vor dem Hinspiel hatte. Bei
 *    gleicher Anzahl spielfreier Tage entscheidet das Los."
 *
 * So this is PAIRING-SPECIFIC, never a season constant: it depends on when each
 * club last played. The season configuration carries the rule and the dates; the
 * order is derived here per hypothetical pairing.
 *
 * Returns `null` when the answer is genuinely undetermined — the dates are
 * missing, or the rule ties and the lot has not been drawn. The caller then
 * simulates BOTH orders at 50/50 rather than picking one.
 *
 * @param {object} input
 * @param {string} input.firstLegDate      ISO date of the first leg
 * @param {string} input.lastMatchA        club A's last league match, ISO date
 * @param {string} input.lastMatchB        club B's last league match, ISO date
 * @param {"A"|"B"|null} [input.lotWinner] set once the lot has actually been drawn
 */
export function secondLegHost({ firstLegDate, lastMatchA, lastMatchB, lotWinner = null }) {
  if (lotWinner === "A" || lotWinner === "B") {
    return { host: lotWinner, basis: "lot", restDays: null };
  }
  if (!firstLegDate || !lastMatchA || !lastMatchB) {
    return { host: null, basis: "dates unknown", restDays: null };
  }

  const days = (from, to) => Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  ) - 1; // match-FREE days between the two matches

  const restA = days(lastMatchA, firstLegDate);
  const restB = days(lastMatchB, firstLegDate);
  if (!Number.isFinite(restA) || !Number.isFinite(restB)) {
    return { host: null, basis: "dates unparseable", restDays: null };
  }
  if (restA === restB) {
    // The rule ties and no lot has been drawn: genuinely undetermined.
    return { host: null, basis: "tie, lot not drawn", restDays: { A: restA, B: restB } };
  }
  return {
    host: restA < restB ? "A" : "B",
    basis: "fewer match-free days before the first leg",
    restDays: { A: restA, B: restB },
  };
}

/** Does the away-goals rule apply in this season? Two explicit fields, never one cutoff. */
export function awayGoalsApply(playoffConfig) {
  return playoffConfig?.awayGoalsApply === true;
}

/**
 * One play-off run, in CANONICAL orientation: the two sides are "lo" and "hi",
 * the pairing's club ids in sorted order — never the order the caller passed
 * them in. See `pairingProbability` for why.
 *
 * `hostSecond` is "lo" or "hi". The first leg is hosted by the other club.
 */
function playOnce({ ratingLo, ratingHi, hostSecond, params, playoffConfig, keys, run }) {
  const firstHostIsLo = hostSecond === "hi";

  // --- leg 1 -----------------------------------------------------------------
  const leg1 = firstHostIsLo
    ? eloToLambdas(ratingLo, ratingHi, params)
    : eloToLambdas(ratingHi, ratingLo, params);
  const [g1Home, g1Away] = drawScorelineDirect(
    Math.max(MIN_LAMBDA, leg1.lamH), Math.max(MIN_LAMBDA, leg1.lamA), params, uniform01(keys.leg1, run),
  );

  // --- leg 2 -----------------------------------------------------------------
  const leg2 = firstHostIsLo
    ? eloToLambdas(ratingHi, ratingLo, params)
    : eloToLambdas(ratingLo, ratingHi, params);
  const [g2Home, g2Away] = drawScorelineDirect(
    Math.max(MIN_LAMBDA, leg2.lamH), Math.max(MIN_LAMBDA, leg2.lamA), params, uniform01(keys.leg2, run),
  );

  // Aggregate from lo's point of view.
  let aggLo = firstHostIsLo ? g1Home + g2Away : g1Away + g2Home;
  let aggHi = firstHostIsLo ? g1Away + g2Home : g1Home + g2Away;

  if (aggLo !== aggHi) return aggLo > aggHi ? "lo" : "hi";

  // --- away goals, season-dependent -----------------------------------------
  if (awayGoalsApply(playoffConfig)) {
    // A club's away goals are those it scored in the leg it did NOT host.
    const awayLo = firstHostIsLo ? g2Away : g1Away;
    const awayHi = firstHostIsLo ? g1Away : g2Away;
    if (awayLo !== awayHi) return awayLo > awayHi ? "lo" : "hi";
  }

  // --- extra time -------------------------------------------------------------
  // §6, fully specified: ET_FACTOR is exactly 1/3 (30/90 minutes — a decision,
  // not an approximation). The ET rates are the SECOND LEG's full-match λs —
  // INCLUDING the second-leg host's HOME_ADV, which thereby scales
  // proportionally with the phase — multiplied by ET_FACTOR. NO Dixon-Coles
  // term: DC is fitted on full matches and its low-score correction has no basis
  // at third-length rates, so this phase is plain independent Poisson.
  const etFactor = playoffConfig?.extraTime?.factor ?? params.ET_FACTOR;
  const [etHome, etAway] = drawScorelineDirect(
    Math.max(MIN_LAMBDA * etFactor, leg2.lamH * etFactor),
    Math.max(MIN_LAMBDA * etFactor, leg2.lamA * etFactor),
    params,
    uniform01(keys.et, run),
    { applyDc: false },
  );
  aggLo += firstHostIsLo ? etAway : etHome;
  aggHi += firstHostIsLo ? etHome : etAway;
  if (aggLo !== aggHi) return aggLo > aggHi ? "lo" : "hi";

  // --- penalties --------------------------------------------------------------
  // The prior is stated as P(lo wins) in canonical orientation, so it too is
  // free of the caller's argument order. A non-½ prior therefore has to be
  // expressed per club, not per side — `penaltyPrior` is a season constant and
  // its only defensible value is ½ unless a pairing-level field is added.
  const prior = playoffConfig?.penaltyPrior ?? 0.5;
  return uniform01(keys.pens, run) < prior ? "lo" : "hi";
}

/**
 * P(A beats B) over a two-legged play-off.
 *
 * Ratings are FROZEN at the current data state and used for both legs. A
 * play-off computed months in advance has no true pre-match ratings — they do
 * not exist yet — so §6 fixes this explicitly: no extrapolation. The pairing is
 * recomputed whenever the data state changes.
 *
 * @param {object} input
 * @param {string} input.seasonId
 * @param {string} input.clubA         BL1 side by convention (the 16th)
 * @param {string} input.clubB         BL2 side by convention (the 3rd)
 * @param {number} input.ratingA
 * @param {number} input.ratingB
 * @param {object} input.params        raw season params
 * @param {object} input.playoffConfig season configuration for the play-off
 * @param {object} [input.hostRule]    result of `secondLegHost`; null host means 50/50
 * @param {number} [input.runs]
 */
export function pairingProbability({
  seasonId, clubA, clubB, ratingA, ratingB, params, playoffConfig,
  hostRule = { host: null }, runs = 20000,
}) {
  if (clubA === clubB) throw new Error(`a play-off pairing needs two clubs, got ${clubA} twice`);

  // Which parameter set applies to a match that belongs to NEITHER league is a
  // decision, not a derivation — so it is a configuration field with a stated
  // default, never an argument default buried in a signature. `"bl1"` selects
  // the un-delta'd base parameters; `"bl2"` adds the BL2 deltas. Either way the
  // values come from season-params.json through `effectiveParams` — the deltas
  // exist in exactly one place and are never restated here.
  const league = playoffConfig?.parameterLeague ?? "bl1";
  const p = effectiveParams(params, { league });
  const sigma = params.RATING_SIGMA ?? 0;

  // ---- CANONICAL ORIENTATION -----------------------------------------------
  // The pairing is identified by its two club ids in SORTED order, never by the
  // order the caller passed them in. Both the random keys and the play itself
  // are built in that orientation, so `pairing(i, j)` and `pairing(j, i)` draw
  // the very same numbers and produce the very same matches — and the
  // complement P(j beats i) = 1 − P(i beats j) then holds EXACTLY, bit for bit,
  // rather than only within Monte-Carlo error. That is what makes „both league
  // views consume the one pairing simulation" true in the strict sense: the BL2
  // view is not a second simulation that happens to agree.
  const flipped = clubB < clubA;
  const lo = flipped ? clubB : clubA;
  const hi = flipped ? clubA : clubB;
  const ratingLo = flipped ? ratingB : ratingA;
  const ratingHi = flipped ? ratingA : ratingB;
  /** caller side ("A"/"B") -> canonical side ("lo"/"hi"), and null stays null */
  const toCanon = (side) => (side == null ? null : (side === "A") !== flipped ? "lo" : "hi");
  const fromCanon = (side) => (side == null ? null : (side === "lo") !== flipped ? "A" : "B");

  const key = (id, drawKind) => makeKeyBase({
    seasonId, context: PLAYOFF_CONTEXT, id: `${lo}|${hi}|${id}`, drawKind,
  });
  const keys = {
    // One noise key per club — drawn once per run, used for BOTH legs.
    noiseLo: key(lo, "noise"),
    noiseHi: key(hi, "noise"),
    leg1: key("pairing", "leg1"),
    leg2: key("pairing", "leg2"),
    et: key("pairing", "et"),
    pens: key("pairing", "pens"),
    hostOrder: key("pairing", "homeOrder"),
  };

  // A play-off draw must never collide with a league draw, nor with another
  // draw kind of this pairing.
  const all = Object.values(keys);
  if (new Set(all).size !== all.length) {
    throw new Error(`play-off random key collision for ${lo} vs ${hi}`);
  }

  const hostSecondCanon = toCanon(hostRule.host ?? null);
  let winsLo = 0;
  for (let run = 0; run < runs; run++) {
    // Once per club per run, for both legs. Never redrawn per leg (§3, §6).
    const noisyLo = ratingLo + ratingNoise(keys.noiseLo, run, sigma);
    const noisyHi = ratingHi + ratingNoise(keys.noiseHi, run, sigma);

    // Where the rule ties and the lot has not been drawn, both orders are
    // simulated at 50/50 rather than one being chosen.
    const hostSecond = hostSecondCanon ?? (uniform01(keys.hostOrder, run) < 0.5 ? "lo" : "hi");

    if (playOnce({
      ratingLo: noisyLo, ratingHi: noisyHi, hostSecond, params: p, playoffConfig, keys, run,
    }) === "lo") winsLo++;
  }

  const pLo = winsLo / runs;
  return {
    clubA,
    clubB,
    // Computed through `complementOf` in the flipped case, so the swapped call
    // returns the bit-identical complement rather than a separately rounded
    // ratio that merely looks like one.
    pAWins: flipped ? complementOf(pLo) : pLo,
    runs,
    parameterLeague: league,
    /** the pairing's canonical identity, independent of argument order */
    pairingId: `${lo}|${hi}`,
    hostSecondLeg: fromCanon(hostSecondCanon),
    hostBasis: hostRule.basis ?? null,
    // Stated, not buried: where the order is undetermined this is a mixture.
    homeOrderMixed: hostSecondCanon === null,
  };
}

/**
 * Klassenerhalt for a BL1 club (§6):
 *
 *   P(i bleibt) = P(i auf 1.–15.) + Σ_j P(i auf 16.) · P(j auf 3. in BL2) · P(i schlägt j)
 *
 * League marginals suffice, but the SUM OVER POSSIBLE OPPONENTS is required —
 * there is no joint two-league simulation.
 */
export function survivalProbability({ pSafe, pRelegationPlayoff, opponents }) {
  let viaPlayoff = 0;
  for (const { pThird, pWin } of opponents) viaPlayoff += pThird * pWin;
  return pSafe + pRelegationPlayoff * viaPlayoff;
}

/**
 * Promotion for a BL2 club (§6), stated explicitly so no second implementation
 * arises:
 *
 *   P(j steigt auf) = P(j auf 1.–2.) + Σ_i P(j auf 3.) · P(i auf 16. in BL1) · P(j schlägt i)
 *
 * with P(j schlägt i) = 1 − P(i schlägt j): both league views consume THE ONE
 * pairing simulation, from complementary sides.
 */
export function promotionProbability({ pDirect, pPlayoffPlace, opponents }) {
  let viaPlayoff = 0;
  for (const { pSixteenth, pWin } of opponents) viaPlayoff += pSixteenth * pWin;
  return pDirect + pPlayoffPlace * viaPlayoff;
}

/** The complement, as one function so the two sides cannot drift apart. */
export const complementOf = (pAWins) => 1 - pAWins;
