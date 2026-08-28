import { ProbList } from "./ui.jsx";
import { percent } from "../lib/format.js";

// ============================================================================
//  The Herbstmeister line (HALBSERIEN §3) — ONE implementation, two call sites:
//  the Titelrennen card on Übersicht and the archive Saisonbilanz. The brief
//  says „die Karte bleibt eine Karte", so this renders a fragment, never a Card
//  of its own.
//
//  Two states, and the artefact decides which — never the calendar:
//    open     → P(Herbstmeister) for the leader, the rest behind the detail
//    decided  → the fact, no probability
//
//  A geteilter Tabellenplatz at the anchor is a real state and is named as one.
//  Inside the Hinrunde no pair has met twice, so the Spielordnung stops after
//  goal difference and goals scored and criterion 6 never applies during a
//  running season: two clubs level there ARE level, and the line says „geteilt"
//  instead of picking one.
//
//  The word „Herbstmeister" is used in both leagues (§7b) — established usage,
//  not a Bundesliga-only term.
// ============================================================================

/**
 * @param {object} p
 * @param {object|null} p.forecast  from `herbstmeisterForecast(artefact)`
 * @param {object|null} p.fact      from `herbstmeisterFact(season, leagueConfig)`
 * @param {(id:string)=>string} p.nameOf
 * @param {object} [p.startProbabilities]  clubId → P at timeline point 0, for
 *   the archive's „war das absehbar?" reading. Omitted on the live page.
 */
export default function Herbstmeister({ forecast, fact, nameOf, startProbabilities = null }) {
  if (fact) {
    const names = fact.clubIds.map(nameOf).join(" und ");
    const atStart = startProbabilities
      ? fact.clubIds.map((id) => startProbabilities[id]).filter((v) => v !== undefined)
      : [];
    return (
      <p className="herbstmeister">
        <strong>Herbstmeister{fact.shared ? " (geteilt)" : ""}:</strong>{" "}
        {names}
        {atStart.length ? (
          <>
            {" "}
            <span className="caption">
              — zum Saisonstart mit {atStart.map((v) => percent(v)).join(" bzw. ")} erwartet
            </span>
          </>
        ) : null}
      </p>
    );
  }

  if (!forecast?.rows?.length) return null;
  const leader = forecast.rows[0];
  if (!(leader.p > 0)) return null;
  return (
    <p className="herbstmeister">
      <strong>Herbstmeister:</strong>{" "}
      {nameOf(leader.clubId)} {percent(leader.p)}
      <span className="caption">
        {" "}— Führung nach dem {forecast.untilMatchday}. Spieltag
      </span>
    </p>
  );
}

/**
 * The per-club detail, for the „Wie gerechnet?" disclosure beside the line.
 * Kept out of the line itself: the card is about the title, and the anchor is a
 * second question on it, not a second table.
 */
export function HerbstmeisterDetail({ forecast, nameOf, limit = 5 }) {
  if (!forecast?.rows?.length) return null;
  const shown = forecast.rows.filter((r) => r.p > 0).slice(0, limit);
  if (!shown.length) return null;
  return (
    <>
      <p className="caption" style={{ marginTop: "0.5rem" }}>
        Wahrscheinlichkeit, nach dem {forecast.untilMatchday}. Spieltag die Tabelle anzuführen —
        aus derselben Simulation wie die Meisterschaft, nur an einem früheren Punkt derselben Läufe
        ausgewertet. Deshalb ist sie keine zweite Rechnung und kann der Titelchance nicht
        widersprechen.
      </p>
      <ProbList entries={shown.map((r) => ({ clubId: r.clubId, value: r.p }))} nameOf={nameOf} limit={limit} />
      {forecast.sharedProbability > 0.001 ? (
        <p className="caption">
          In {percent(forecast.sharedProbability)} der Läufe teilen sich mehrere Klubs den ersten
          Platz — vor absolviertem Hin- und Rückspiel trennt die Spielordnung sie nicht, und ein
          Entscheidungsspiel gibt es während der Saison nicht. Solche Läufe zählen für jeden
          beteiligten Klub, weshalb die Werte oben zusammen etwas über 100 % ergeben können.
        </p>
      ) : null}
    </>
  );
}
