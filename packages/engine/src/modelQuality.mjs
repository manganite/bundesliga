// ============================================================================
//  Model quality — the §8 rules that make a quality figure honest.
//
//  THE THREE PROVENANCES ARE NEVER SILENTLY POOLED. §5.3 made that rule for two
//  values; Addendum A added a third, and the rule applies to it just as much:
//
//    contemporaneous — the rating was actually fetched before kickoff. Only
//                      these may be presented as „die damalige Prognose".
//    backfilled      — reconstructed afterwards from clubelo's published
//                      history. Valid for retrospective calculation only.
//    carried-forward — the last archived rating stood in because clubelo did
//                      not publish a current one. Not an observation of that
//                      day at all.
//
//  „Never silently" is the operative word: pooling is allowed, saying so is
//  mandatory. So every figure here carries the groups it rests on, and
//  `provenanceNote` turns that into the sentence a caption must contain. A
//  caller that pools without printing the note is the failure this module is
//  built to make hard.
// ============================================================================

import { accuracy, brierScore, logLoss, calibration } from "./metrics.mjs";

/** Display and reporting order. Fixed, so two views cannot disagree. */
export const PROVENANCE_ORDER = ["contemporaneous", "backfilled", "carried-forward"];

export const PROVENANCE_LABEL = {
  contemporaneous: "vor Anstoß geholt",
  backfilled: "nachträglich rekonstruiert",
  "carried-forward": "übertragener älterer Wert",
};

/**
 * Only `contemporaneous` predictions are what the app would actually have shown
 * before the match. The other two are reconstructions, and a headline figure
 * built on them is a retrospective statement — true, but a different claim.
 */
export const IS_CONTEMPORANEOUS = (p) => p === "contemporaneous";

/** Split scored matches by provenance, in the fixed order, dropping nothing. */
export function groupByProvenance(scored) {
  const groups = Object.fromEntries(PROVENANCE_ORDER.map((p) => [p, []]));
  const unknown = [];
  for (const s of scored) {
    if (Object.hasOwn(groups, s.provenance)) groups[s.provenance].push(s);
    else unknown.push(s);
  }
  if (unknown.length) {
    // A fourth value would silently vanish from every figure on the page.
    throw new Error(
      `${unknown.length} scored match(es) carry an unknown provenance `
        + `(${[...new Set(unknown.map((u) => String(u.provenance)))].join(", ")}). `
        + "Model-quality figures must account for every match or none.",
    );
  }
  return groups;
}

/** The four §4 figures for one set of scored matches. */
function figuresFor(scored) {
  return {
    n: scored.length,
    accuracy: accuracy(scored),
    brier: brierScore(scored),
    logLoss: logLoss(scored),
    calibration: calibration(scored),
  };
}

/**
 * Quality per provenance group AND pooled — with the pooled figure carrying the
 * mix it rests on, so no caption can quote it without being able to name them.
 *
 * @returns {{ byProvenance: object, pooled: object, mix: Array, note: string|null }}
 */
export function qualityByProvenance(scored) {
  const groups = groupByProvenance(scored);
  const byProvenance = {};
  const mix = [];
  for (const p of PROVENANCE_ORDER) {
    const g = groups[p];
    byProvenance[p] = g.length ? figuresFor(g) : { n: 0, accuracy: null, brier: null, logLoss: null, calibration: null };
    if (g.length) mix.push({ provenance: p, n: g.length, share: g.length / scored.length });
  }
  return {
    byProvenance,
    pooled: { ...figuresFor(scored), mix },
    mix,
    note: provenanceNote(mix),
  };
}

/**
 * The sentence a pooled figure must be shown with.
 *
 * `null` only when there is nothing to disclose: a single group, named by the
 * caller elsewhere, or no data at all. Anything else returns a sentence — a
 * caller that ignores it is pooling silently.
 */
export function provenanceNote(mix) {
  const present = mix.filter((m) => m.n > 0);
  if (present.length <= 1) return null;
  const parts = present.map((m) => `${m.n} ${PROVENANCE_LABEL[m.provenance]}`);
  const last = parts.pop();
  return `Diese Zahl mischt ${parts.join(", ")} und ${last}. `
    + "Nur die vor Anstoß geholten Ratings sind das, was die App damals gezeigt hätte; "
    + "die übrigen sind Rekonstruktionen und gelten nur rückblickend.";
}

// ---------------------------------------------------------------------------
//  Rating-Aktualität (§4 addendum, 2026-07-23)
//
//  RENAMED. §7 listed this card as „Rating-Verzögerung". That name promises a
//  measurement of how far the rating LAGS true strength — and that measurement
//  is not made here; §9 explicitly files the Elo-lag claim under „reasoning, not
//  measurement". Under the §8 naming discipline a label must not suggest a
//  measurement the card does not perform, so the card is „Rating-Aktualität".
//
//  Definition: per played match and club, the age of the pre-match rating that
//  was ACTUALLY used — kickoff minus its `effectiveAt`, in days. Reported as a
//  distribution per provenance, never pooled. It is an operational figure about
//  the freshness of the inputs and says nothing about whether, or how strongly,
//  a rating trails true strength.
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

/** Whole days between an `effectiveAt` date and a kickoff timestamp. */
export function ratingAgeDays(effectiveAt, kickoff) {
  const from = Date.parse(`${String(effectiveAt).slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${String(kickoff).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / DAY_MS);
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function ageSummary(ages) {
  if (!ages.length) return { n: 0, median: null, p10: null, p90: null, min: null, max: null };
  const s = [...ages].sort((a, b) => a - b);
  return {
    n: s.length,
    median: quantile(s, 0.5),
    p10: quantile(s, 0.1),
    p90: quantile(s, 0.9),
    min: s[0],
    max: s[s.length - 1],
  };
}

/**
 * Rating-Aktualität over a season.
 *
 * @param {Array<{kickoff:string, effectiveAt:string, provenance:string}>} entries
 *   one per PLAYED match — the pre-match dataset rows of matches that have been
 *   played. Unplayed fixtures carry no realised prediction and are not included
 *   by the caller.
 */
export function ratingFreshness(entries) {
  const byProvenance = {};
  const all = [];
  for (const p of PROVENANCE_ORDER) byProvenance[p] = [];

  for (const e of entries) {
    const age = ratingAgeDays(e.effectiveAt, e.kickoff);
    if (age === null) continue;
    if (!Object.hasOwn(byProvenance, e.provenance)) {
      throw new Error(`unknown provenance "${e.provenance}" in the pre-match dataset`);
    }
    byProvenance[e.provenance].push(age);
    all.push(age);
  }

  return {
    byProvenance: Object.fromEntries(PROVENANCE_ORDER.map((p) => [p, ageSummary(byProvenance[p])])),
    // Present for completeness, and deliberately alongside `note`: a single
    // number over a mix of provenances is the thing this module exists to stop
    // being quoted on its own.
    all: ageSummary(all),
    note: provenanceNote(
      PROVENANCE_ORDER
        .map((p) => ({ provenance: p, n: byProvenance[p].length, share: all.length ? byProvenance[p].length / all.length : 0 }))
        .filter((m) => m.n > 0),
    ),
  };
}

// ---------------------------------------------------------------------------
//  Platzierung vs Erwartung
// ---------------------------------------------------------------------------

/**
 * A club's expected final rank under the simulation: Σ_r r · P(rank = r).
 *
 * Deliberately the mean and not the mode: the mode of a flat placement
 * distribution jumps between neighbouring ranks on noise, and the card is a
 * comparison against the CURRENT table, not a prediction of one rank.
 */
export function expectedRank(positionDistribution) {
  if (!positionDistribution?.length) return null;
  let sum = 0;
  let mass = 0;
  for (const [i, p] of positionDistribution.entries()) {
    sum += (i + 1) * p;
    mass += p;
  }
  if (mass <= 0) return null;
  return sum / mass;
}

/**
 * Platzierung vs Erwartung, per club: where the club stands now against where
 * the simulation expects it to finish.
 *
 * A NEGATIVE difference means the club currently stands higher than expected —
 * rank 3 against an expected 8 is −5. The sign is stated here rather than left
 * to each view, because „besser als erwartet" and „kleinere Zahl" point in
 * opposite intuitive directions.
 */
export function placementVsExpectation(rows) {
  return rows.map((r) => {
    const expected = expectedRank(r.positionDistribution);
    return {
      clubId: r.clubId,
      rank: r.rank,
      sharedRank: r.sharedRank === true,
      expectedRank: expected,
      difference: expected === null ? null : r.rank - expected,
      betterThanExpected: expected === null ? null : r.rank < expected,
    };
  });
}
