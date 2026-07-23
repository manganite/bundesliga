// ============================================================================
//  The comparative gates (§5.5).
//
//  THESE APPLY IN PROCESS B, AND ONLY THERE. Process A has no comparative gate:
//  the incumbent and a fresh fit on the same window come from identical data and
//  identical code, so comparing them tests nothing.
//
//    decision metric — fold-mean held-out LOG-LOSS, may not worsen by more than
//                      0.5 % relative
//    guardrails      — fold-mean Brier and RPS at 1 % relative, ECE at 1 pp
//
//  ANY GUARDRAIL BREACH BLOCKS THE DEFAULT MERGE REGARDLESS OF LOG-LOSS.
//
//  The gates ORDER EVIDENCE, they do not replace judgement. A single season is
//  ~306 matches and even the 10-fold mean carries substantial noise — which is
//  why a human may merge against a failing gate, but only with a written
//  justification recorded in the PR. Silent overrides are prohibited.
// ============================================================================

export class GateError extends Error {}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Fold-mean metrics from per-fold results.
 *
 * @param {Array<{season:number, logLoss:number, brier:number, rps:number, ece:number}>} folds
 */
export function foldMeans(folds) {
  if (!folds.length) throw new GateError("no folds — the rolling-origin backtest produced nothing");
  for (const key of ["logLoss", "brier", "rps", "ece"]) {
    if (folds.some((f) => !Number.isFinite(f[key]))) throw new GateError(`fold missing a finite ${key}`);
  }
  return {
    logLoss: mean(folds.map((f) => f.logLoss)),
    brier: mean(folds.map((f) => f.brier)),
    rps: mean(folds.map((f) => f.rps)),
    ece: mean(folds.map((f) => f.ece)),
    folds: folds.length,
  };
}

/**
 * Apply the Process B gates.
 *
 * All four metrics are LOWER-IS-BETTER, so "worsening" means the candidate's
 * value rose.
 *
 * @param {object} incumbent  fold means of the incumbent procedure
 * @param {object} candidate  fold means of the new procedure
 * @param {object} config     `comparativeGates` from data/refit-tolerances.json
 */
export function applyGates(incumbent, candidate, config) {
  const rel = (a, b) => (a === 0 ? (b === 0 ? 0 : Infinity) : (b - a) / Math.abs(a));

  const minFolds = config.rollingOrigin.foldsMinimum;
  if (candidate.folds < minFolds || incumbent.folds < minFolds) {
    throw new GateError(
      `the backtest needs at least ${minFolds} folds; got ${Math.min(candidate.folds, incumbent.folds)}`,
    );
  }
  if (candidate.folds !== incumbent.folds) {
    // Same folds, same data, per-fold paired differences — otherwise the
    // comparison is not the one §5.5 specifies.
    throw new GateError("both procedures must be evaluated on the SAME folds");
  }

  const logLossWorsening = rel(incumbent.logLoss, candidate.logLoss);
  const decision = {
    metric: "foldMeanHeldOutLogLoss",
    incumbent: incumbent.logLoss,
    candidate: candidate.logLoss,
    relativeWorsening: logLossWorsening,
    limit: config.logLossMaxRelativeWorsening,
    passes: logLossWorsening <= config.logLossMaxRelativeWorsening,
  };

  const guardrails = [
    {
      metric: "brier",
      incumbent: incumbent.brier,
      candidate: candidate.brier,
      relativeWorsening: rel(incumbent.brier, candidate.brier),
      limit: config.guardrails.brierMaxRelativeWorsening,
      kind: "relative",
    },
    {
      metric: "rps",
      incumbent: incumbent.rps,
      candidate: candidate.rps,
      relativeWorsening: rel(incumbent.rps, candidate.rps),
      limit: config.guardrails.rpsMaxRelativeWorsening,
      kind: "relative",
    },
    {
      metric: "ece",
      incumbent: incumbent.ece,
      candidate: candidate.ece,
      // ECE is already in percentage points; its guardrail is absolute.
      absoluteWorsening: candidate.ece - incumbent.ece,
      limit: config.guardrails.eceMaxAbsoluteWorseningPercentagePoints,
      kind: "absolute",
    },
  ].map((g) => ({
    ...g,
    passes: g.kind === "relative" ? g.relativeWorsening <= g.limit : g.absoluteWorsening <= g.limit,
  }));

  const breached = guardrails.filter((g) => !g.passes);

  return {
    decision,
    guardrails,
    breached,
    // A guardrail breach blocks the default merge REGARDLESS of log-loss.
    passes: decision.passes && breached.length === 0,
    blockedByGuardrail: breached.length > 0,
  };
}

/**
 * The override rule, shared by both processes (§5.5).
 *
 * The gate (B) and the review (A) are DEFAULTS, NOT LOCKS — a human may merge
 * against them or refuse despite them, but only with a written justification
 * recorded in the PR. A human merges only when the report is present. Silent
 * overrides are prohibited, and this function is what makes that structural.
 */
export function mergeDecision({ gates, reportPresent, override = null }) {
  if (!reportPresent) {
    return { mayMerge: false, reason: "no report — a human merges only when the report is present" };
  }
  if (gates && gates.passes) {
    return { mayMerge: true, reason: "gates passed" };
  }
  if (!override) {
    return {
      mayMerge: false,
      reason: gates?.blockedByGuardrail
        ? "a guardrail was breached, which blocks the default merge regardless of log-loss"
        : "the decision metric failed its gate",
    };
  }
  if (!override.justification || override.justification.trim().length < 40) {
    return {
      mayMerge: false,
      reason: "an override requires a WRITTEN justification recorded in the PR; silent overrides are prohibited",
    };
  }
  return {
    mayMerge: true,
    reason: "merged against the gate with a written justification",
    override: { ...override, recorded: true },
  };
}
