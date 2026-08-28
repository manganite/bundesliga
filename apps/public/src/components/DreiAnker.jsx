import { Card } from "./ui.jsx";
import { percent } from "../lib/format.js";
import { retrospectiveLabel } from "../lib/archive.js";
import { anchorSource, halfBoundary } from "../lib/halbserie.js";
import { currentTable } from "../lib/season.js";
import { remainingFixtures } from "../lib/data.js";

// ============================================================================
//  Drei-Anker-Vergleich (HALBSERIEN §6) — what the model said before a ball was
//  kicked, what it said at the half, and what actually happened.
//
//  It lives on Verlauf because all three are timeline anchors, and it uses that
//  page's existing target selector rather than growing one of its own.
//
//  The gate is a COMPLETE season: for an archive that is every season, for the
//  live one it appears with the final matchday. A two-anchor comparison against
//  „the outcome" while the outcome is still open would be a forecast dressed as
//  a result.
//
//  What it is NOT: a decomposition. On the live-rating curve the two forecasts
//  differ by results AND by updated ratings, and nothing here says which share
//  is which — the same refusal the frozen/live contrast on this page makes. On
//  the frozen curve (every archive season has only that one) the ratings never
//  move at all, so the wording says THAT instead of naming a cause the data
//  excludes. `anchorSource` picks the curve and the sentence together, because
//  getting one without the other is exactly how a false claim gets shipped.
// ============================================================================

/**
 * @param {object} p
 * @param {object} p.ctx
 * @param {object} p.target  the selected target from `targetList(leagueConfig)`
 */
export default function DreiAnker({ ctx, target }) {
  const { season, leagueConfig, nameOf, timeline, timelineLive, isArchive, params } = ctx;
  if (!target) return null;
  // The season must be over. `remainingFixtures` asks the season file, not the
  // calendar — a postponed final fixture keeps the season open, and so does this.
  if (remainingFixtures(season.fixtures).length) return null;

  const boundary = halfBoundary(leagueConfig);
  // The same source rule as the Halbzeitbilanz: the live curve where there is
  // one, otherwise the frozen curve — and the wording follows whichever it is.
  const source = anchorSource(timeline, timelineLive);
  const start = source?.points.find((p) => p.matchday === 0);
  const half = boundary ? source?.points.find((p) => p.matchday === boundary) : null;
  if (!start || !half) return null;

  const table = currentTable(season, leagueConfig);
  const rank = new Map(table.map((r) => [r.clubId, r]));
  const reached = (clubId) => {
    const r = rank.get(clubId);
    if (!r || target.from == null) return null;
    return r.rank >= target.from && r.rank <= target.to;
  };

  const startProbs = start.probabilities?.[target.id] ?? {};
  const halfProbs = half.probabilities?.[target.id] ?? {};
  const rows = table
    .map((r) => ({
      clubId: r.clubId,
      rank: r.rank,
      start: startProbs[r.clubId] ?? 0,
      half: halfProbs[r.clubId] ?? 0,
      reached: reached(r.clubId),
    }))
    // Everyone who ever had a real chance, plus everyone who got there. A club
    // at 0,0 % at both anchors that also missed says nothing; one that got there
    // from 0,0 % is the most interesting row on the page.
    .filter((r) => r.start > 0.005 || r.half > 0.005 || r.reached);
  if (!rows.length) return null;

  return (
    <Card
      title={`${target.label}: Saisonstart, Halbzeit, Ausgang`}
      caption={
        `Was das Modell vor dem 1. Spieltag erwartete, was nach dem ${boundary}. Spieltag davon `
        + "übrig war, und wie es ausging."
      }
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Beide Prozentwerte stammen aus derselben Kurve wie oben — {timeline?.label?.label
            ?? "Prognose mit eingefrorener Saisonstart-Stärke"}. {source.live
            ? "Zwischen den beiden Ankern haben sich Ergebnisse und Ratings verändert; welcher "
              + "Anteil der Verschiebung auf welches entfällt, sagt die Gegenüberstellung nicht — "
              + "diese Zerlegung gibt die Rechnung nicht her."
            : "Die Ratings sind über die ganze Saison eingefroren; die Verschiebung zwischen den "
              + "Ankern stammt damit aus den Ergebnissen. Was aktuelle Ratings zusätzlich bewirkt "
              + "hätten, misst diese Kurve nicht."}
          {isArchive ? ` ${retrospectiveLabel(params?.version)}` : ""}
        </p>
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="left">Klub</th>
              <th scope="col">Saisonstart</th>
              <th scope="col">nach dem {boundary}.</th>
              <th scope="col" className="left">Ausgang</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clubId}>
                <td>{r.rank}.</td>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                <td>{percent(r.start)}</td>
                <td>{percent(r.half)}</td>
                {/* Text, never a colour alone: „erreicht" is the whole signal
                    (§FARBEN_UNTERTITEL — colour is never the sole carrier). */}
                <td className="left">{r.reached ? "erreicht" : "nicht erreicht"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
