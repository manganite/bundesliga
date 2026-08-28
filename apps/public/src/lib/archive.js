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
  `Retrospektive Modellrechnung mit den heutigen Parametern${paramVersion ? ` (Parameterversion ${paramVersion})` : ""} — nicht die damalige Vorhersage.`;

/**
 * §4.1 — the in-sample obligation, shown wherever a historical season's model
 * quality or accuracy is displayed. 2011/12–2025/26 IS the training window, so a
 * backward look inside it is not an independent test of the model.
 */
export const IN_SAMPLE_NOTE =
  "2011/12–2025/26 ist das Trainingsfenster der heutigen Parameter — Rückblicke in diesem Fenster sind keine unabhängige Prüfung des Modells.";

/**
 * §ARCHIV_DUELLE §2.3 — the duel caption. On an archive season it names the §8
 * subtlety: the „both ≥ 10 % on the same goal" test rests on the RETROSPECTIVE
 * model run with today's parameters, not on the assessment made at the time. The
 * live caption is passed through unchanged.
 */
export const DUEL_ARCHIVE_CAPTION =
  "Spiele, bei denen beide Klubs vor dem Spieltag mindestens 10 % Chance auf dasselbe Ziel hatten — nach der retrospektiven Modellrechnung mit den heutigen Parametern, nicht nach damaliger Einschätzung.";

/**
 * The sentence the LIVE duel caption gains when the card also shows PLAYED duels
 * (§DUELLE_ERGEBNISSE §2): what was at stake before the matchday, beside how it
 * ended.
 */
export const DUEL_PLAYED_NOTE =
  "Gespielte Duelle sind nach dem Rechnungsstand vor ihrem jeweiligen Spieltag bestimmt; die Prozente sind die von damals, das Ergebnis das echte.";

/**
 * §HALBSERIEN §5 — the honesty anchor of the half-season package, required
 * verbatim wherever over/under performance is split into Hinrunde and
 * Rückrunde.
 *
 * Without it the view tells regression to the mean as a collapse in form. The
 * Rückrunde forecasts already know the Hinrunde — they run on live ratings that
 * moved with those results — so a club that overachieved in the first half and
 * then merely meets its RAISED expectation shows a smaller number here without
 * having played worse. What is measured is performance relative to the
 * expectation of the moment, never points form.
 *
 * The word „Form" is deliberately absent from every UI string of this package
 * for the same reason; a source scan enforces it.
 */
export const HALBSERIE_ERWARTUNG_NOTE =
  "Die Erwartung lernt mit: Die Rückrunden-Prognosen kennen die Hinrunde bereits (Live-Ratings). "
  + "Ein Klub, der in der Hinrunde überraschte und in der Rückrunde seine neue Erwartung erfüllt, "
  + "zeigt hier keinen Einbruch — gemessen wird Leistung relativ zur jeweils aktuellen Erwartung, "
  + "nicht Punkteform.";
