// ============================================================================
//  Archive-season honesty text (§V2b.1 §4). Two sentences the brief requires,
//  in ONE place so a render anchor test pins each and it cannot drift.
// ============================================================================

/**
 * §4.2 — the retrospective label on every historical timeline (§11). It says
 * plainly that the curve is a replay with today's parameters, not the forecast
 * that was actually made at the time; the parameter version is named so the
 * reader can see which model produced it.
 */
export const retrospectiveLabel = (paramVersion) =>
  `Retrospektive Modellrechnung mit den heutigen Parametern (Parameterversion ${paramVersion}) — nicht die damalige Vorhersage.`;

/**
 * §4.1 — the in-sample obligation, shown wherever a historical season's model
 * quality or accuracy is displayed. 2011/12–2025/26 IS the training window, so a
 * backward look inside it is not an independent test of the model.
 */
export const IN_SAMPLE_NOTE =
  "2011/12–2025/26 ist das Trainingsfenster der heutigen Parameter — Rückblicke in diesem Fenster sind keine unabhängige Prüfung des Modells.";
