import { Card } from "./ui.jsx";
import { integer, points } from "../lib/format.js";
import { fixtureImpact } from "../lib/season.js";

// ============================================================================
//  „Wichtigstes kommendes Spiel" (§4).
//
//  ONE component for both pages, over ONE pipeline computation. The metric is
//  tallied during the canonical 20 000-run simulation by FILTERING those runs on
//  each fixture's simulated outcome — never by a separate forced-outcome
//  resimulation, which would answer a different question and would need the
//  artefact key extended by (fixtureId, outcome).
//
//  THE CAPTION IS A CONSTRAINT, NOT DECORATION, and it is SPLIT (§10): the two
//  visible sentences carry the honesty core — this measures coupling, NOT a
//  forecast of the displayed post-match change — while the „Wie gerechnet?"
//  disclosure holds the method (distribution distance, weighting, multi-place
//  normalisation, run count, smallest conditional sample). Nothing honest is
//  dropped; the §4 obligations are covered across the two parts.
//
//  Deliberately NOT coloured: a large shift on „Abstieg" is not „bad", it is
//  just coupling, so a green/red valence would mislead. The values stay neutral.
// ============================================================================

export default function WichtigstesSpiel({
  outlook, season, leagueConfig, nameOf, matchday = null, limit = 5, title,
}) {
  const rows = fixtureImpact(outlook, season, leagueConfig, { matchday });
  if (!rows.length) return null;

  const shown = rows.slice(0, limit);
  const smallest = Math.min(...shown.map((r) => r.smallestConditionalRuns));

  return (
    <Card
      title={title ?? (matchday === null ? "Wichtigstes kommendes Spiel" : `Einfluss der Spiele am ${matchday}. Spieltag`)}
      caption={
        "Misst, wie eng ein Spiel mit diesem Zielrennen zusammenhängt — nicht, um wie viele Punkte "
        + "sich die Anzeige nach dem Spiel ändert. Je größer die Verschiebung, desto mehr hängt an "
        + "diesem Spiel."
      }
    >
      {/* Row layout, no table → no horizontal scroll on a phone (§2.2). The
          club SHORT names (the clubId) keep each line to two clauses. */}
      <ul className="impact-list">
        {shown.map((r) => (
          <li key={r.fixtureId} className="impact-row">
            <span className="impact-fixture">
              {matchday === null ? <span className="impact-md">{r.matchday}. Sp. · </span> : null}
              {r.home} – {r.away}
            </span>
            <span className="impact-effect">{r.leading.label} · {points(r.leading.value)}</span>
          </li>
        ))}
      </ul>

      <details className="method-disclosure">
        <summary>Wie gerechnet?</summary>
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Erwartete Verschiebung der Zielverteilung, wenn dieses Spiel gespielt ist — gemessen als
          mittlerer Abstand zwischen der Verteilung vorher und der Verteilung unter den einzelnen
          Ausgängen, gewichtet mit deren Wahrscheinlichkeit. Gezeigt ist je Spiel die größere der
          beiden Zielverteilungen und welche das ist. Mehrplatz-Ziele werden vorher durch die Zahl
          ihrer Plätze geteilt, sonst gewönnen sie den Vergleich allein durch ihre Größe. Die Zahlen
          stammen aus der laufenden Simulation dieses Datenstands ({integer(outlook?.runs)} Läufe);
          die kleinste bedingte Stichprobe hier umfasst {integer(smallest)} Läufe. Das ist ein Maß
          dafür, wie stark ein Spiel mit dem Ziel zusammenhängt — und ausdrücklich keine Prognose,
          um wie viele Prozentpunkte sich die Anzeige nach dem Spiel tatsächlich ändert.
        </p>
      </details>
    </Card>
  );
}
