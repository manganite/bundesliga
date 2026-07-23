// ============================================================================
//  Process A or Process B? (§5.5)
//
//  The annual refit is TWO DISTINCT PROCESSES, not one. v5.4's single design
//  had a vacuous gate: in a normal year the "validation fit" and the incumbent
//  arise from IDENTICAL data and IDENTICAL code, so comparing them tests
//  nothing. Splitting them fixes that.
//
//    Process A — yearly monitoring and window refresh. NO comparative gate:
//      there is nothing independent to compare against. The incumbent is
//      evaluated on the newly completed season S, which is a genuine
//      out-of-sample result because the incumbent never saw S. A human reads
//      the report; then the unchanged procedure is refitted on the newest 15
//      completed seasons, now including S.
//
//    Process B — methodological change (fit code, model form or hyperparameters
//      differ). Rolling-origin backtest and the comparative gates apply HERE,
//      AND ONLY HERE.
//
//  WHICH ONE IS DECIDED BY THE PINNED LAB COMMIT HASH AND THE HYPERPARAMETER
//  SET. Any difference means Process B — with one cheap escape hatch: a changed
//  hash may still count as Process A if the new code, fitted on the incumbent's
//  EXACT window, reproduces the incumbent parameters.
//
//  Bit-identical reproduction is preferred and is the default expectation.
//  Where numerical noise makes that unattainable, the fallback bounds are fixed
//  EX ANTE in data/refit-tolerances.json — never chosen after seeing the result.
//  A reproduction outside the bounds means Process B, with NO DISCRETION at this
//  step; discretion lives in the override rule, which requires a written
//  justification in the PR.
// ============================================================================

export const PROCESS_A = "A";
export const PROCESS_B = "B";

export class RefitError extends Error {}

/** The class a parameter belongs to, from the checked-in tolerance config. */
export function classOf(tolerances, parameter) {
  for (const [name, cls] of Object.entries(tolerances.parameterClasses)) {
    if (name === "_comment") continue;
    if (cls.parameters?.includes(parameter)) return { name, ...cls };
  }
  return null;
}

/**
 * Does a candidate fit reproduce the incumbent parameters?
 *
 * Reports pass/fail against the PRE-COMMITTED bounds and nothing else. A
 * parameter passes if it is within EITHER the absolute or the relative
 * tolerance of its class: absolute alone is meaningless across scales two orders
 * of magnitude apart, relative alone is meaningless near zero.
 *
 * A parameter with no class is a FAILURE, not a pass — an unrecognised
 * parameter means the procedure grew something the tolerance file has never
 * seen, which is exactly a methodological change.
 */
export function checkReproduction(incumbent, candidate, tolerances) {
  const keys = [...new Set([...Object.keys(incumbent), ...Object.keys(candidate)])].sort();
  const details = [];
  let bitIdentical = true;
  let passes = true;

  for (const key of keys) {
    const a = incumbent[key];
    const b = candidate[key];

    if (a === undefined || b === undefined) {
      details.push({ parameter: key, ok: false, reason: a === undefined ? "not in incumbent" : "not in candidate" });
      passes = false;
      bitIdentical = false;
      continue;
    }

    const identical = Object.is(a, b);
    if (!identical) bitIdentical = false;

    const cls = classOf(tolerances, key);
    if (!cls) {
      details.push({ parameter: key, ok: false, reason: "no tolerance class — the tolerance file has never seen this parameter" });
      passes = false;
      continue;
    }

    const absDiff = Math.abs(b - a);
    const relDiff = a === 0 ? (b === 0 ? 0 : Infinity) : absDiff / Math.abs(a);
    const ok = identical || absDiff <= cls.absolute || relDiff <= cls.relative;
    if (!ok) passes = false;

    details.push({
      parameter: key, ok, class: cls.name, incumbent: a, candidate: b,
      absDiff, relDiff, absoluteBound: cls.absolute, relativeBound: cls.relative,
    });
  }

  return { passes, bitIdentical, details, failed: details.filter((d) => !d.ok) };
}

/**
 * Decide which process this summer's refit is.
 *
 * @param {object} input
 * @param {string} input.incumbentCommit      pinned lab commit of the shipped fit
 * @param {string} input.candidateCommit      pinned lab commit of this run
 * @param {object} input.incumbentHyper       hyperparameter set of the shipped fit
 * @param {object} input.candidateHyper       hyperparameter set of this run
 * @param {object} [input.reproduction]       result of checkReproduction, when run
 */
export function decideProcess({
  incumbentCommit, candidateCommit, incumbentHyper, candidateHyper, reproduction = null,
}) {
  if (!incumbentCommit || !candidateCommit) {
    throw new RefitError("both the incumbent and candidate lab commit hashes are required — code provenance is not optional");
  }

  const hyperSame = JSON.stringify(sortKeys(incumbentHyper)) === JSON.stringify(sortKeys(candidateHyper));
  const hashSame = incumbentCommit === candidateCommit;

  if (hashSame && hyperSame) {
    return { process: PROCESS_A, reason: "same pinned lab commit and same hyperparameters" };
  }

  if (!hyperSame) {
    // The escape hatch is for a changed HASH only. Different hyperparameters
    // are a methodological change by definition.
    return { process: PROCESS_B, reason: "hyperparameters differ" };
  }

  // Changed hash, same hyperparameters — the escape hatch applies.
  if (!reproduction) {
    return {
      process: PROCESS_B,
      reason: "lab commit changed and no reproduction check was supplied. "
        + "The reproduction check is part of the PR; without it, Process B applies.",
    };
  }
  if (reproduction.passes) {
    return {
      process: PROCESS_A,
      reason: reproduction.bitIdentical
        ? "lab commit changed but the new code reproduces the incumbent parameters bit-identically"
        : "lab commit changed but the new code reproduces the incumbent parameters within the pre-committed bounds",
      escapeHatch: true,
      bitIdentical: reproduction.bitIdentical,
    };
  }
  return {
    process: PROCESS_B,
    reason: `lab commit changed and reproduction failed for ${reproduction.failed.length} parameter(s) `
      + "against the pre-committed bounds. There is no discretion at this step.",
    escapeHatch: false,
  };
}

const sortKeys = (o) => (o && typeof o === "object"
  ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
  : o);
