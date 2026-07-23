// ============================================================================
//  Every metric from brief §4, as a documented, unit-tested function.
//
//  The UI and the tests consume these; neither re-implements them, and no
//  metric is defined in more than one place (§10).
//
//  Two traps §4 calls out explicitly and this module enforces rather than
//  documents:
//
//   - Entropy needs probabilities that SUM TO 1. Relegation probabilities sum to
//     the NUMBER OF PLACES, not to 1, so they are normalised first — and the
//     floor of the reading is then `k`, not 1.
//   - Total-variation distance needs the same. A k-place target sums to k in
//     every conditional too, so both vectors are divided by k before the
//     distance; otherwise the relegation reading is inflated ≈ k-fold and
//     structurally wins the "larger of the two" comparison.
//
//  Chart direction is stated per metric here so the UI cannot get it wrong:
//  accuracy is higher-is-better with a 1/3 baseline; Brier and log-loss are
//  lower-is-better with baselines 2/3 and ln 3.
// ============================================================================

const OUTCOMES = ["homeWin", "draw", "awayWin"];

/** Baselines a uniform 1-in-3 guess achieves. Displayed alongside every chart. */
export const RANDOM_BASELINE = {
  accuracy: 1 / 3,
  brier: 2 / 3,
  logLoss: Math.log(3),
};

/** Which way is better, per metric — so no caption can invert it (§4, §8). */
export const DIRECTION = {
  accuracy: "higher",
  brier: "lower",
  logLoss: "lower",
  ece: "lower",
};

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Spannungsindex
// ---------------------------------------------------------------------------

/**
 * Shannon entropy reported as the EFFECTIVE NUMBER OF CONTENDERS, exp(H).
 *
 * @param {number[]} probabilities  one per club
 * @param {number} places  how many places the target covers. The probabilities
 *   are expected to sum to `places`; they are normalised to sum 1 before the
 *   entropy. For the championship `places = 1` and they already do.
 *
 * @returns {{value:number, floor:number, places:number}}
 *   `floor` is the reading a FULLY DECIDED race produces: with k places settled
 *   among exactly k clubs the normalised probabilities are 1/k each and the
 *   reading is k, not 1. Every caption must state this, or readers misread the
 *   floor as residual suspense ("2,0 = vollständig entschieden" for two direct
 *   relegation spots).
 */
export function effectiveContenders(probabilities, places = 1) {
  if (places <= 0) throw new Error("places must be positive");
  const total = sum(probabilities);
  if (total <= 0) throw new Error("probabilities sum to zero");
  let h = 0;
  for (const p of probabilities) {
    const q = p / total;
    if (q > 0) h -= q * Math.log(q);
  }
  return { value: Math.exp(h), floor: places, places };
}

// ---------------------------------------------------------------------------
// Per-match scoring metrics
// ---------------------------------------------------------------------------

/**
 * Surprisal of what actually happened, −log₂ P(actual tendency), under that
 * match's PRE-MATCH prediction. Higher = more surprising.
 */
export function surprisal(prediction, actualTendency) {
  const p = prediction[actualTendency];
  if (p === undefined) throw new Error(`unknown tendency: ${actualTendency}`);
  return -Math.log2(Math.max(p, Number.MIN_VALUE));
}

/**
 * Share of played matches whose argmax pre-match tendency matched reality.
 * HIGHER IS BETTER; the random baseline is 1/3.
 *
 * A rising accuracy curve is an improvement. Never describe a falling accuracy
 * curve as one — §4 and §8 both single this out, because v5's prose conflated a
 * falling LOSS with accuracy.
 */
export function accuracy(scored) {
  if (!scored.length) return { value: null, n: 0, baseline: RANDOM_BASELINE.accuracy, direction: "higher" };
  let hits = 0;
  for (const { prediction, actual } of scored) {
    let best = OUTCOMES[0];
    for (const o of OUTCOMES) if (prediction[o] > prediction[best]) best = o;
    if (best === actual) hits++;
  }
  return {
    value: hits / scored.length,
    n: scored.length,
    baseline: RANDOM_BASELINE.accuracy,
    direction: "higher",
  };
}

/** Multiclass Brier score. LOWER IS BETTER; random baseline 2/3. */
export function brierScore(scored) {
  if (!scored.length) return { value: null, n: 0, baseline: RANDOM_BASELINE.brier, direction: "lower" };
  let total = 0;
  for (const { prediction, actual } of scored) {
    for (const o of OUTCOMES) {
      const hit = o === actual ? 1 : 0;
      total += (prediction[o] - hit) ** 2;
    }
  }
  return {
    value: total / scored.length,
    n: scored.length,
    baseline: RANDOM_BASELINE.brier,
    direction: "lower",
  };
}

/** Multiclass log-loss. LOWER IS BETTER; random baseline ln 3 ≈ 1.0986. */
export function logLoss(scored, { floor = 1e-15 } = {}) {
  if (!scored.length) return { value: null, n: 0, baseline: RANDOM_BASELINE.logLoss, direction: "lower" };
  let total = 0;
  for (const { prediction, actual } of scored) {
    total -= Math.log(Math.max(prediction[actual], floor));
  }
  return {
    value: total / scored.length,
    n: scored.length,
    baseline: RANDOM_BASELINE.logLoss,
    direction: "lower",
  };
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/**
 * Reliability buckets and the expected calibration error.
 *
 * ALL THREE outcome probabilities per match are pooled: `n` matches yield `3n`
 * (predicted probability, hit ∈ {0,1}) pairs — not only the predicted class.
 * Ten fixed buckets of equal width, [0,0.1) … [0.9,1.0].
 *
 * ECE = Σ_b (n_b / N) · |x_b − y_b|, reported in percentage points.
 *
 * The three pairs of a match are NOT independent — they sum to 1 — so the
 * caption counts MATCHES, not pairs: „basiert auf n Spielen (3n
 * Wahrscheinlichkeiten)", never „3n Beobachtungen". `matches` is returned for
 * exactly that sentence. Empty buckets are not drawn and contribute nothing;
 * buckets with fewer than 10 pairs are drawn but marked unreliable.
 */
export const CALIBRATION_MIN_BUCKET = 10;

export function calibration(scored) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    from: i / 10,
    to: (i + 1) / 10,
    n: 0,
    sumPredicted: 0,
    hits: 0,
  }));

  for (const { prediction, actual } of scored) {
    for (const o of OUTCOMES) {
      const p = prediction[o];
      // The last bucket is closed at 1.0, so p = 1 belongs to bucket 9.
      const b = buckets[Math.min(9, Math.floor(p * 10))];
      b.n++;
      b.sumPredicted += p;
      if (o === actual) b.hits++;
    }
  }

  const total = scored.length * 3;
  let ece = 0;
  const out = [];
  for (const b of buckets) {
    if (b.n === 0) continue; // empty buckets are not drawn and contribute nothing
    const x = b.sumPredicted / b.n;
    const y = b.hits / b.n;
    ece += (b.n / total) * Math.abs(x - y);
    out.push({
      from: b.from,
      to: b.to,
      n: b.n,
      meanPredicted: x,
      observedFrequency: y,
      reliable: b.n >= CALIBRATION_MIN_BUCKET,
    });
  }

  return {
    buckets: out,
    ece,
    ecePercentagePoints: ece * 100,
    matches: scored.length,
    probabilities: total,
    direction: "lower",
  };
}

/**
 * The generated, data-driven sentence §8 asks for: „Wenn die App 70 % sagt —
 * tritt es dann auch in 70 % der Fälle ein?" answered from the bucket that
 * actually contains the quoted level.
 */
export function calibrationSentence(cal, level = 0.7) {
  const b = cal.buckets.find((x) => level >= x.from && level < x.to)
    ?? cal.buckets.find((x) => level >= x.from && level <= x.to);
  if (!b || !b.reliable) return null;
  const said = Math.round(b.meanPredicted * 100);
  const happened = Math.round(b.observedFrequency * 100);
  const gap = happened - said;
  const verdict = Math.abs(gap) < 2
    ? "das passt gut zusammen"
    : gap < 0
      ? "hier ist das Modell etwas zu optimistisch"
      : "hier ist das Modell etwas zu vorsichtig";
  return `Wenn die App ${said} % sagt, tritt es tatsächlich in ${happened} % der Fälle ein — ${verdict}.`;
}

// ---------------------------------------------------------------------------
// Club-level metrics
// ---------------------------------------------------------------------------

/**
 * Über-/Unterperformance: actual points minus expected points from each match's
 * PRE-MATCH prediction, divided by that club's matches played.
 *
 * Normalising by the club's own `played` is not optional: clubs do NOT all have
 * the same number of matches during a matchday or after a postponement (§7).
 */
export function performanceVsExpectation(clubMatches, rules = { pointsForWin: 3, pointsForDraw: 1 }) {
  if (!clubMatches.length) return { actual: 0, expected: 0, difference: 0, perMatch: null, played: 0 };
  let actual = 0;
  let expected = 0;
  for (const m of clubMatches) {
    actual += m.points;
    expected += rules.pointsForWin * m.pWin + rules.pointsForDraw * m.pDraw;
  }
  return {
    actual,
    expected,
    difference: actual - expected,
    perMatch: (actual - expected) / clubMatches.length,
    played: clubMatches.length,
  };
}

/**
 * Restprogramm-Schwere: mean opponent rating over remaining fixtures, reported
 * SEPARATELY for home and away (§4) — the two are not interchangeable under a
 * flat home advantage.
 */
export function remainingScheduleStrength(remaining) {
  const home = remaining.filter((f) => f.atHome);
  const away = remaining.filter((f) => !f.atHome);
  const mean = (xs) => (xs.length ? sum(xs.map((f) => f.opponentRating)) / xs.length : null);
  return {
    home: mean(home),
    away: mean(away),
    overall: remaining.length ? sum(remaining.map((f) => f.opponentRating)) / remaining.length : null,
    counts: { home: home.length, away: away.length, total: remaining.length },
  };
}

/**
 * Direktes Duell: a remaining fixture in which BOTH clubs have P(target) ≥ θ for
 * the SAME target. θ is configurable, default 10 %.
 */
export function directDuels(remainingFixtures, probabilitiesByTarget, theta = 0.1) {
  const out = [];
  for (const f of remainingFixtures) {
    for (const [target, byClub] of Object.entries(probabilitiesByTarget)) {
      const ph = byClub[f.home];
      const pa = byClub[f.away];
      if (ph >= theta && pa >= theta) {
        out.push({ fixtureId: f.id, home: f.home, away: f.away, target, pHome: ph, pAway: pa });
      }
    }
  }
  return out;
}

/**
 * „Favorit ab Spieltag M": the earliest matchday from which a club holds the
 * highest P(target) of all clubs AND HAS HELD IT EVER SINCE. Transient leads do
 * not count, so this scans backwards from the latest matchday.
 *
 * @param {Array<{matchday:number, probabilities:Record<string,number>}>} history
 * @returns {{clubId:string, sinceMatchday:number}|null}
 */
export function favouriteSince(history) {
  if (!history.length) return null;
  const ordered = history.slice().sort((a, b) => a.matchday - b.matchday);
  const leaderAt = (entry) => {
    let best = null;
    let bestP = -Infinity;
    let tie = false;
    for (const [club, p] of Object.entries(entry.probabilities)) {
      if (p > bestP) { bestP = p; best = club; tie = false; }
      else if (p === bestP) tie = true;
    }
    return tie ? null : best; // a shared lead is not a lead
  };

  const current = leaderAt(ordered[ordered.length - 1]);
  if (!current) return null;
  let since = ordered[ordered.length - 1].matchday;
  for (let i = ordered.length - 2; i >= 0; i--) {
    if (leaderAt(ordered[i]) !== current) break;
    since = ordered[i].matchday;
  }
  return { clubId: current, sinceMatchday: since };
}

// ---------------------------------------------------------------------------
// Wichtigstes kommendes Spiel
// ---------------------------------------------------------------------------

/**
 * Expected shift of a target distribution caused by one fixture:
 *
 *   Σ_o q_o · ½ Σ_clubs |P_o(club) − P_now(club)|
 *
 * i.e. the expected total-variation distance, with `q_o` the fixture's outcome
 * probabilities and `P_o` the target distribution CONDITIONED on that outcome.
 *
 * `P_o` must come from FILTERING the canonical artefact's runs on the fixture's
 * simulated outcome — never from a separate forced-outcome resimulation (§4).
 *
 * NORMALISATION IS MANDATORY for multi-place targets. Total-variation distance
 * presupposes vectors summing to 1. A k-place target sums to k in every run and
 * in every conditional, so both `P_o` and `P_now` are divided by k first —
 * otherwise the relegation reading is inflated ≈ k-fold and structurally wins
 * the "larger of the two" comparison against the championship.
 *
 * WHAT THIS DOES AND DOES NOT MEASURE — binding on every caption: the real app
 * updates differently after the match (new results and table, an EXTERNAL
 * ClubElo rating, uncertainty freshly re-integrated), and the model has no
 * mechanism that reproduces the filtered posterior. This measures how strongly
 * the fixture is COUPLED to the target distribution within the current joint
 * season simulation. It is NOT a forecast of the percentage-point change the app
 * will actually display after the match, and no caption may claim it is.
 *
 * @param {Record<string, number>} pNow          club -> probability, sums to `places`
 * @param {Array<{outcome:string, q:number, conditional:Record<string,number>, sampleSize:number}>} byOutcome
 * @param {number} places
 */
export function expectedTargetShift(pNow, byOutcome, places = 1) {
  if (places <= 0) throw new Error("places must be positive");
  const clubs = Object.keys(pNow);
  let expected = 0;
  let smallestSample = Infinity;

  for (const { q, conditional, sampleSize } of byOutcome) {
    if (q === 0) continue;
    let tv = 0;
    for (const c of clubs) {
      // Divide BOTH vectors by `places` so each sums to 1 before the distance.
      tv += Math.abs((conditional[c] ?? 0) / places - pNow[c] / places);
    }
    expected += q * (tv / 2);
    if (sampleSize !== undefined) smallestSample = Math.min(smallestSample, sampleSize);
  }

  return {
    value: expected,
    // Rare outcomes stay in the expectation — they carry weight q_o — but the
    // card must state the smallest conditional sample it rests on (§4).
    smallestConditionalSample: Number.isFinite(smallestSample) ? smallestSample : null,
    places,
  };
}

/**
 * Check that the q-weighted conditionals recombine to P_now. They must, because
 * the conditionals are filtered from the same artefact — a V1.2 acceptance test
 * asserts exactly this.
 */
export function conditionalsRecombine(pNow, byOutcome, tolerance = 1e-9) {
  const clubs = Object.keys(pNow);
  let worst = 0;
  for (const c of clubs) {
    let recombined = 0;
    for (const { q, conditional } of byOutcome) recombined += q * (conditional[c] ?? 0);
    worst = Math.max(worst, Math.abs(recombined - pNow[c]));
  }
  return { ok: worst <= tolerance, worstDeviation: worst };
}

// ---------------------------------------------------------------------------
// Delta reporting
// ---------------------------------------------------------------------------

/**
 * SE of a paired difference, estimated EMPIRICALLY from paired batches (§3).
 *
 * Split the runs into B equal batches. With common random numbers batch `b` uses
 * the same random stream in both data states, so Δ_b = p_new,b − p_old,b is a
 * PAIRED difference. Then:
 *
 *   SE(Δ) = SD(Δ_b) / √B
 *
 * The division by √B is the point: SD(Δ_b) alone is the spread of a SINGLE
 * batch, not the standard error of the overall estimate. At B = 20 omitting it
 * makes the noise floor ≈ 4.5× too large and hides genuine movement as
 * „unverändert".
 */
export function pairedBatchStandardError(batchDeltas) {
  const B = batchDeltas.length;
  if (B < 2) throw new Error("need at least two batches");
  const mean = sum(batchDeltas) / B;
  const variance = sum(batchDeltas.map((d) => (d - mean) ** 2)) / (B - 1);
  return { delta: mean, se: Math.sqrt(variance) / Math.sqrt(B), batches: B };
}

/**
 * Suppress changes below 2·SE(Δ) and report them as „unverändert" (§3).
 *
 * How much CRN shrinks the floor depends on the correlation between the two data
 * states and MUST BE MEASURED, not assumed — CRN guarantees no fixed reduction.
 * That is why the floor is derived from the measured batch spread here rather
 * than from any constant.
 */
export function reportDelta(batchDeltas) {
  const { delta, se, batches } = pairedBatchStandardError(batchDeltas);
  const floor = 2 * se;
  // A zero delta is never a change, even when the floor is also zero (every
  // paired batch cancelled exactly — pure CRN). Without this guard 0 ≥ 0 would
  // report „significant" and the what-if would show „0,0 Pp." where it should
  // say „unverändert".
  const significant = floor > 0 ? Math.abs(delta) >= floor : delta !== 0;
  return {
    delta,
    se,
    batches,
    floor,
    significant,
    display: significant ? delta : null, // null renders as „unverändert"
  };
}
