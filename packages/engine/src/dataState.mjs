// ============================================================================
//  Data age and staleness (§5.1).
//
//  DATA AGE AND WORKFLOW HEALTH ARE TWO DIFFERENT QUESTIONS — one timestamp
//  cannot answer both.
//
//  Under "commit only on change", a successful check that finds nothing new
//  commits nothing, so any committed timestamp goes stale whenever there is
//  simply no football. Updating it on every check would force a commit and a
//  deployment every two hours and break that contract.
//
//  Therefore:
//   - `dataUpdatedAt` is the moment of the last SUBSTANTIVE data change. The app
//     shows it neutrally as „Datenstand: <Zeitpunkt>" and MUST NOT infer a
//     workflow failure from its age. An old value is normal during an
//     international break and all off-season.
//   - Workflow health is monitored EXCLUSIVELY through GitHub Actions failure
//     notifications. The app has no access to job status and does not pretend to.
//   - The one staleness claim the committed data can support is SCHEDULE-AWARE:
//     a fixture whose kickoff is more than the grace period in the past with no
//     result committed. That statement is true regardless of WHY the result is
//     missing — postponement, source outage, workflow failure — which is exactly
//     what makes it honest.
// ============================================================================

/** Default grace period after kickoff before a missing result is worth saying. */
export const DEFAULT_GRACE_HOURS = 6;

/** „Datenstand: <Zeitpunkt>" — neutral, with no health claim attached. */
export function formatDataUpdatedAt(dataUpdatedAt, locale = "de-DE") {
  if (!dataUpdatedAt) return "Datenstand: unbekannt";
  const d = new Date(dataUpdatedAt);
  if (Number.isNaN(d.getTime())) return "Datenstand: unbekannt";
  const formatted = d.toLocaleString(locale, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return `Datenstand: ${formatted}`;
}

/**
 * Fixtures whose result is overdue.
 *
 * A fixture qualifies when its scheduled kickoff lies more than `graceHours` in
 * the past and no result is committed. Nothing here looks at `dataUpdatedAt`:
 * the age of the last data change is not evidence of anything.
 *
 * @param {Array} fixtures  each with { id, kickoff, gh?, ga?, homeName?, awayName? }
 * @param {Date|string|number} now
 * @param {number} graceHours
 */
export function overdueResults(fixtures, now = new Date(), graceHours = DEFAULT_GRACE_HOURS) {
  const nowMs = new Date(now).getTime();
  const cutoff = nowMs - graceHours * 3600 * 1000;
  return fixtures
    .filter((f) => {
      if (f.gh !== undefined && f.ga !== undefined) return false;
      const k = new Date(f.kickoff).getTime();
      return Number.isFinite(k) && k < cutoff;
    })
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

/**
 * The header's staleness line, or null when there is nothing honest to say.
 *
 * Deliberately never mentions the workflow, the pipeline, or a failure: the
 * committed data cannot distinguish a postponement from an outage, so the
 * wording claims only what is actually observable.
 */
export function stalenessWarning(fixtures, now = new Date(), graceHours = DEFAULT_GRACE_HOURS) {
  const overdue = overdueResults(fixtures, now, graceHours);
  if (overdue.length === 0) return null;

  const first = overdue[0];
  const label = first.homeName && first.awayName
    ? `${first.homeName} – ${first.awayName}`
    : first.id;
  const text = overdue.length === 1
    ? `Ergebnis vom Spiel ${label} steht noch aus — Daten möglicherweise veraltet`
    : `Ergebnis vom Spiel ${label} und ${overdue.length - 1} weiteren steht noch aus — Daten möglicherweise veraltet`;

  return { text, fixtures: overdue, count: overdue.length, graceHours };
}

/**
 * Season phase, so the app never breaks between seasons (§5.5).
 *
 *   preSeason  — fixtures published, nothing played yet
 *   inSeason   — some but not all fixtures played
 *   finished   — every fixture played; show the completed season with a clear
 *                „Saison beendet" state until new fixtures appear
 */
export function seasonPhase(fixtures) {
  if (!fixtures.length) return "noFixtures";
  const played = fixtures.filter((f) => f.gh !== undefined && f.ga !== undefined).length;
  if (played === 0) return "preSeason";
  if (played === fixtures.length) return "finished";
  return "inSeason";
}

export const SEASON_PHASE_LABEL = {
  noFixtures: "Spielplan noch nicht veröffentlicht",
  preSeason: "Saison beginnt in Kürze — Prognose vor dem 1. Spieltag",
  inSeason: null,
  finished: "Saison beendet",
};

/**
 * Does the season-stamped configuration match the season the data is for?
 *
 * §5.5 requires a VISIBLE warning on a mismatch: European slot mapping and every
 * rule change live in one stamped file, and running last season's slots against
 * this season's table would be wrong in a way nobody would notice.
 */
export function configStampWarning(config, detectedSeason) {
  if (config?.season === undefined || config.season === null) {
    return "Saisonkonfiguration trägt keinen Saisonstempel — Regeln und Europapokalplätze sind nicht überprüfbar";
  }
  if (Number(config.season) !== Number(detectedSeason)) {
    return `Saisonkonfiguration ist für ${config.season}, die Daten sind für ${detectedSeason} — `
      + "Regeln, Plätze und Zielzonen können falsch sein";
  }
  return null;
}
