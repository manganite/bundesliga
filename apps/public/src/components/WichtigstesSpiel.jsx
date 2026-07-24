import { Card } from "./ui.jsx";
import { percent, number, integer, points } from "../lib/format.js";
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
//  THE CAPTION IS A CONSTRAINT, NOT DECORATION. The metric measures how strongly
//  a fixture is COUPLED to a target distribution inside the model's own joint
//  simulation. It is NOT a forecast of the percentage points the app will
//  actually move after the match: the real update brings a new table, an
//  external clubelo rating and freshly re-integrated uncertainty, and the model
//  has no mechanism that reproduces the filtered posterior. No caption here may
//  claim otherwise.
// ============================================================================

export default function WichtigstesSpiel({
  outlook, season, leagueConfig, nameOf, matchday = null, limit = 5, title,
}) {
  const rows = fixtureImpact(outlook, season, leagueConfig, { matchday });
  if (!rows.length) return null;

  const shown = rows.slice(0, limit);
  const top = shown[0];
  const smallest = Math.min(...shown.map((r) => r.smallestConditionalRuns));

  return (
    <Card
      title={title ?? (matchday === null ? "Wichtigstes kommendes Spiel" : `Einfluss der Spiele am ${matchday}. Spieltag`)}
      caption={
        `Erwartete Verschiebung der Zielverteilung, wenn dieses Spiel gespielt ist — gemessen als `
        + `mittlerer Abstand zwischen der Verteilung vorher und der Verteilung unter den einzelnen `
        + `Ausgängen, gewichtet mit deren Wahrscheinlichkeit. Gezeigt ist je Spiel die größere der `
        + `beiden Zielverteilungen und welche das ist. `
        + `Mehrplatz-Ziele werden vorher durch die Zahl ihrer Plätze geteilt, sonst gewönnen sie den `
        + `Vergleich allein durch ihre Größe. `
        + `Die Zahlen stammen aus der laufenden Simulation dieses Datenstands (${integer(outlook?.runs)} Läufe); `
        + `die kleinste bedingte Stichprobe hier umfasst ${integer(smallest)} Läufe. `
        + `Das ist ein Maß dafür, wie stark ein Spiel mit dem Ziel zusammenhängt — und ausdrücklich `
        + `keine Prognose, um wie viele Prozentpunkte sich die Anzeige nach dem Spiel tatsächlich ändert.`
      }
    >
      <p className="lead-sentence">
        {nameOf(top.home)} – {nameOf(top.away)}
        {matchday === null ? ` (${top.matchday}. Spieltag)` : null} — {top.leading.label}
      </p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Spiel</th>
              {matchday === null ? <th scope="col">Sp.</th> : null}
              <th scope="col" className="left">größter Einfluss auf</th>
              <th scope="col">Verschiebung</th>
              <th scope="col">1 / X / 2</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.fixtureId}>
                <th scope="row" className="left" style={{ fontWeight: 400 }}>
                  {nameOf(r.home)} – {nameOf(r.away)}
                </th>
                {matchday === null ? <td>{r.matchday}.</td> : null}
                <td className="left">{r.leading.label}</td>
                <td>{points(r.leading.value)}</td>
                <td>
                  {percent(r.outcomeProbabilities.homeWin, 0)} / {percent(r.outcomeProbabilities.draw, 0)}
                  {" / "}{percent(r.outcomeProbabilities.awayWin, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
