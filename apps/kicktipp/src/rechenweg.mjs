// ============================================================================
//  The „Wie gerechnet?" data per fixture (§KICKTIPP_TRANSPARENZ §2).
//
//  PURE and SURFACING ONLY: no new optimisation or scoring. Everything here is
//  either a value the app already computes (impliedProbabilities, the model
//  region masses, expectedPoints' bonus decomposition) or a plain rearrangement
//  of them. The UI renders these as text; a test pins the decomposition to the
//  optimiser's own expected value.
// ============================================================================

import { impliedProbabilities } from "./market.mjs";
import { bestTipWithinTendency } from "./optimise.mjs";
import { EXACT_BONUS, GOAL_DIFFERENCE_BONUS } from "./scoring.mjs";

export const TENDENCIES = ["homeWin", "draw", "awayWin"];
export const DEVIATION_THRESHOLD = 0.10; // 10 percentage points

// A margin at or above this reads as a real bookmaker line; below it the odds
// are margin-free and (very likely) computed from the pool's tipping behaviour
// rather than posted by a bookmaker. 2 Pp. sits comfortably between the ~5 %
// overround of the Oddset lines and the ~0 % of the computed ones (§2).
export const BOOKMAKER_MARGIN_THRESHOLD = 0.02;

const pctText = (v) => `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v * 100)} %`;

/**
 * What the odds ARE, from their margin — the app says what it sees, no more (§2).
 * The „vermutlich" is deliberate: the source of the margin-free odds is plausibly
 * inferred (the pool's tipping behaviour), not documented.
 */
export function oddsSourceLabel(margin) {
  if (margin == null) return null;
  return margin >= BOOKMAKER_MARGIN_THRESHOLD
    ? `Buchmacherquoten (Marge ${pctText(margin)})`
    : "rechnerische Quoten ohne Marge — vermutlich aus dem Tippverhalten der Runde, nicht von einem Buchmacher";
}

/** The short tag for the check table: „Buchmacher" / „rechnerisch" / null. */
export function oddsSourceShort(margin) {
  if (margin == null) return null;
  return margin >= BOOKMAKER_MARGIN_THRESHOLD ? "Buchmacher" : "rechnerisch";
}

// The honest, anchored caption for the model basis (§3). Model deviations are
// interesting, not automatically better — margin-free market odds are expected
// to be the better single-match estimate over the long run.
export const MODEL_BASIS_CAPTION =
  "Modell-Grundlage dient dem Vergleich und quotenlosen Runden. Auf lange Sicht ist zu erwarten, "
  + "dass margenfreie Marktquoten die bessere Einzelspiel-Schätzung sind — Abweichungen des Modells "
  + "sind interessant, nicht automatisch besser.";

/**
 * The market's 1X2 probabilities with the overround removed, and the margin
 * itself. Null when the fixture carried no odds (model-only round).
 */
export function marketPercent(odds) {
  if (!odds) return null;
  const p = impliedProbabilities({ home: odds.home, draw: odds.draw, away: odds.away });
  return { homeWin: p.homeWin, draw: p.draw, awayWin: p.awayWin, margin: p.overround };
}

/**
 * For each tendency, the best selectable tip and its expected value split into
 * the three tiers — quota (Tendenz), goal-difference (Differenz), exact (exakt).
 * The three parts sum EXACTLY to the tip's expected points (identity test).
 * Sorted best-first; `[0]` is the winner.
 */
export function tendencyBreakdown(matrix, maxGoals, quotas) {
  const rows = TENDENCIES.map((tendency) => {
    const best = bestTipWithinTendency(matrix, maxGoals, quotas, tendency);
    return {
      tendency,
      tip: { home: best.home, away: best.away },
      expected: best.expected,
      parts: {
        tendenz: best.pTendency * best.quota,
        differenz: best.pGoalDiff * GOAL_DIFFERENCE_BONUS,
        exakt: best.pExact * EXACT_BONUS,
      },
    };
  });
  rows.sort((a, b) => b.expected - a.expected);
  return rows;
}

/** Per tendency: does the model differ from the market by ≥ the threshold? */
export function deviation(market, model, threshold = DEVIATION_THRESHOLD) {
  if (!market) return {};
  const out = {};
  for (const t of TENDENCIES) out[t] = Math.abs(market[t] - model[t]) >= threshold;
  return out;
}

/**
 * One decision sentence: the winner beats the runner-up by this many expected
 * points. `basisTendency` is the market/model favourite for the chosen basis; a
 * winner that is NOT the favourite is the „Abweichung" case.
 */
export function decisionSentence(breakdown, basisTendency, label) {
  const winner = breakdown[0];
  const runnerUp = breakdown[1];
  const margin = winner.expected - runnerUp.expected;
  const dm = margin.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (winner.tendency === basisTendency) {
    return `Kein Abweichen: ${label(winner.tendency)} schlägt ${label(runnerUp.tendency)} um ${dm} erwartete Punkte.`;
  }
  return `Abweichung: ${label(winner.tendency)} bringt ${dm} erwartete Punkte mehr als der Favorit ${label(basisTendency)} — trotz geringerer Trefferchance.`;
}
