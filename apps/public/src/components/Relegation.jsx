import { Card, Empty } from "./ui.jsx";
import { percent } from "../lib/format.js";
import { leagueLabel, otherLeague } from "../../../../packages/engine/src/leagues.mjs";

// ============================================================================
//  The relegation play-off (§6), shown from whichever side the toggle is on.
//
//  BOTH VIEWS READ THE SAME FILE. The Bundesliga page shows P(i schlägt j), the
//  2.-Liga page shows its complement — there is no second computation, so the
//  two pages can never disagree about a pairing.
//
//  Every caption here has to carry three things, because leaving any of them out
//  turns an honest number into a misleading one:
//    * which league is which — „Relegationsplatz" means 16th on one page and 3rd
//      on the other;
//    * that the opponent is not yet known, so the figure is an average over the
//      possible opponents weighted by how likely each is to reach the play-off;
//    * that this is a marginal approximation, not a joint two-league simulation.
// ============================================================================

/** Clubs below this are left out of the table; the caption says so. */
const SHOW_THRESHOLD = 0.01;
/** How many possible opponents are named per club. */
const OPPONENTS_SHOWN = 3;

export default function Relegation({ playoff, league, nameOf }) {
  if (!playoff) return null;

  if (!playoff.exists) {
    return (
      <Card title="Relegation">
        <Empty>{playoff.reason ?? "Diese Saison kennt keine Relegation."}</Empty>
      </Card>
    );
  }

  const isBl1 = league === "bl1";
  const other = otherLeague(league);
  const rows = Object.entries(playoff[league] ?? {})
    .map(([clubId, v]) => ({
      clubId,
      pPlace: isBl1 ? v.pRelegationPlayoff : v.pPlayoffPlace,
      pWin: v.pWinsPlayoff,
      pBefore: isBl1 ? v.pSafe : v.pDirect,
      pTotal: isBl1 ? v.pKlassenerhalt : v.pAufstieg,
    }))
    .filter((r) => r.pPlace >= SHOW_THRESHOLD)
    .sort((a, b) => b.pPlace - a.pPlace);

  // The opponents, most likely first — named with THEIR league, never bare.
  const opponentOrder = Object.entries(playoff.placeProbability?.[other] ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, OPPONENTS_SHOWN);

  const pairFor = (clubId, opponentId) => {
    const key = isBl1 ? { bl1Club: clubId, bl2Club: opponentId } : { bl1Club: opponentId, bl2Club: clubId };
    const p = playoff.pairings.find((x) => x.bl1Club === key.bl1Club && x.bl2Club === key.bl2Club);
    if (!p) return null;
    return isBl1 ? p.pBl1Wins : p.pBl2Wins;
  };

  const title = isBl1 ? "Relegation — Klassenerhalt über den 16. Platz" : "Relegation — Aufstieg über den 3. Platz";
  const placeLabel = isBl1 ? "Relegationsplatz (16.)" : "Relegationsplatz (3.)";
  const totalLabel = isBl1 ? "Klassenerhalt gesamt" : "Aufstieg gesamt";
  const beforeLabel = isBl1 ? "direkt gehalten (1.–15.)" : "direkt aufgestiegen (1.–2.)";

  const mixedNote = playoff.homeOrder?.mixedPairings === playoff.homeOrder?.totalPairings
    ? "Die Spieltermine der Relegation stehen noch nicht fest, deshalb wird das Heimrecht im Rückspiel "
      + "zur Hälfte für die eine und zur Hälfte für die andere Seite simuliert."
    : playoff.homeOrder?.mixedPairings > 0
      ? `Bei ${playoff.homeOrder.mixedPairings} von ${playoff.homeOrder.totalPairings} möglichen Paarungen `
        + "ist das Heimrecht noch offen und wird je zur Hälfte für beide Reihenfolgen simuliert."
      : "Das Heimrecht im Rückspiel steht fest und ist aus den Spielterminen abgeleitet.";

  return (
    <>
      <Card
        title={title}
        when={rows.length > 0}
        caption={
          `Der Gegner kommt aus der ${leagueLabel(other)} und steht noch nicht fest. `
          + `„Sieg in der Relegation“ ist deshalb der Mittelwert über alle möglichen Gegner, `
          + `gewichtet damit, wie wahrscheinlich jeder von ihnen den ${isBl1 ? "3." : "16."} Platz `
          + `der ${leagueLabel(other)} erreicht. ${mixedNote} `
          + `Gezeigt sind Klubs mit mindestens ${percent(SHOW_THRESHOLD, 0)} Chance auf den ${placeLabel}.`
        }
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col" className="left">Klub ({leagueLabel(league)})</th>
                <th scope="col">{beforeLabel}</th>
                <th scope="col">{placeLabel}</th>
                <th scope="col">Sieg in der Relegation</th>
                <th scope="col">{totalLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clubId}>
                  <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                  <td>{percent(r.pBefore)}</td>
                  <td>{percent(r.pPlace)}</td>
                  <td>{percent(r.pWin)}</td>
                  <td><strong>{percent(r.pTotal)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`Mögliche Gegner aus der ${leagueLabel(other)}`}
        when={rows.length > 0 && opponentOrder.length > 0}
        caption={
          `Die ${OPPONENTS_SHOWN} wahrscheinlichsten Gegner. Jede Zahl ist die Siegwahrscheinlichkeit `
          + `des Klubs aus der ${leagueLabel(league)} in genau dieser Paarung — dieselbe Simulation, die `
          + `die ${leagueLabel(other)}-Ansicht von der anderen Seite liest.`
        }
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col" className="left">Klub ({leagueLabel(league)})</th>
                {opponentOrder.map(([id, p]) => (
                  <th scope="col" key={id}>
                    {nameOf(id)}
                    <span className="th-sub">{percent(p)} auf {isBl1 ? "3." : "16."}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clubId}>
                  <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                  {opponentOrder.map(([id]) => {
                    const p = pairFor(r.clubId, id);
                    return <td key={id}>{p === null ? "–" : percent(p)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Wie diese Zahlen entstehen" when={rows.length > 0}>
        <p className="caption">{playoff.approximation}</p>
        <p className="caption">
          Die Relegation ist eine eigene Simulation mit eigenen Läufen
          ({playoff.runs.toLocaleString("de-DE")} je Paarung) und einem eigenen Zufallsraum — sie teilt
          keine Ziehung mit der Ligasimulation. Beide Beine werden mit demselben Modell gespielt,
          Verlängerung als zusätzliche Poisson-Phase über ein Drittel der Spielzeit, danach ein
          Elfmeterschießen mit {percent(0.5, 0)}.
          {playoff.awayGoalsApply
            ? " Die Auswärtstorregel gilt in dieser Saison."
            : " Die Auswärtstorregel gilt seit 2021/22 nicht mehr und wird deshalb nicht angewandt."}
        </p>
        {!isBl1 ? <p className="caption">{playoff.notComputed?.bl2Relegation}</p> : null}
      </Card>
    </>
  );
}
