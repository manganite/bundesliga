import { Card } from "./ui.jsx";
import { percent, number, signed, pp } from "../lib/format.js";
import { HALBSERIE_ERWARTUNG_NOTE } from "../lib/archive.js";
import { anchorSource, halfBoundary, halfComplete, scoredInHalf, performanceByHalf } from "../lib/halbserie.js";
import { perfColor } from "../lib/colors.js";
import { accuracy, brierScore, logLoss } from "../../../../packages/engine/src/metrics.mjs";

// ============================================================================
//  Halbzeitbilanz (HALBSERIEN §4) — three blocks on Modellgüte, and one gate.
//
//  THE GATE is the completeness rule, not the calendar: the section appears
//  exactly when every fixture up to the half-season boundary is played, which is
//  the same question the timeline asks before it grows a point (Brief 31). A
//  postponed fixture from matchday 12 keeps the Hinrunde open in January, and
//  the half-season verdict waits — a „Bilanz der Hinrunde" over sixteen and a
//  half matchdays would be wrong in exactly the way that rule exists to prevent.
//
//  Nothing here is a new metric. Accuracy, Brier and log-loss are the engine's,
//  the surprise list is the existing surprisal, and the anchor comparison reads
//  two timeline points. Only the match set is filtered.
// ============================================================================

const TENDENCY_LABEL = { homeWin: "Heimsieg", draw: "Remis", awayWin: "Auswärtssieg" };

/**
 * @param {object} p
 * @param {object} p.ctx
 * @param {Array}  p.scored  rows from `scoredMatches`
 */
export default function Halbzeitbilanz({ ctx, scored }) {
  const { season, leagueConfig, nameOf, timeline, timelineLive } = ctx;
  const boundary = halfBoundary(leagueConfig);
  if (!boundary || !halfComplete(season, leagueConfig)) return null;

  const hin = scoredInHalf(scored, "hin", boundary);
  if (!hin.length) return null;

  return (
    <>
      <h3 className="section-heading">Halbzeitbilanz</h3>
      <GueteJeHalbserie scored={scored} boundary={boundary} />
      <UeberraschungenHinrunde scored={hin} nameOf={nameOf} boundary={boundary} />
      <AnkerVergleich
        source={anchorSource(timeline, timelineLive)}
        leagueConfig={leagueConfig}
        nameOf={nameOf}
        boundary={boundary}
      />
      <EntwicklungJeHalbserie scored={scored} leagueConfig={leagueConfig} nameOf={nameOf} />
    </>
  );
}

// ---------------------------------------------------------------------------
//  §4.1 — model quality per half.
// ---------------------------------------------------------------------------

/**
 * Carried-forward ratings are held out of every quality figure here, exactly as
 * they are in the season-wide ones (§CHART_AUSBAU): a score computed partly on
 * a frozen rating is not a score of the model. Filtering per half rather than
 * once keeps the two halves comparable — one half carrying a rating outage and
 * the other not would otherwise be silently pooled.
 */
const scoreable = (rows) => rows.filter((s) => s.provenance !== "carried-forward");

function GueteJeHalbserie({ scored, boundary }) {
  // The engine's metrics return { value, n, baseline, direction }, never a bare
  // number — `direction` is the half that keeps „0,21 Brier" from being read as
  // a bad score. Unwrapping to `.value` here and naming the direction in the
  // method text is the same contract the season-wide cards keep.
  const measure = (rows) => ({
    rows,
    accuracy: accuracy(rows).value,
    brier: brierScore(rows).value,
    logLoss: logLoss(rows).value,
  });
  const halves = [
    { id: "hin", label: "Hinrunde", ...measure(scoreable(scoredInHalf(scored, "hin", boundary))) },
    { id: "rueck", label: "Rückrunde", ...measure(scoreable(scoredInHalf(scored, "rueck", boundary))) },
  ].filter((h) => h.rows.length);
  if (!halves.length) return null;

  return (
    <Card
      title="Modellgüte je Halbserie"
      caption="Dieselben drei Maße wie oben, getrennt für Hin- und Rückrunde."
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Treffsicherheit ist der Anteil der Spiele, deren tatsächliche Tendenz das Modell vorher
          am höchsten bewertet hatte. Brier und Log-Loss messen die Güte der Wahrscheinlichkeiten
          selbst — bei Treffsicherheit ist <em>größer besser</em>, bei Brier und Log-Loss
          <em>kleiner besser</em>. „Unterschied“ ist immer Rückrunde minus Hinrunde; ob ein
          positiver Wert gut ist, hängt daher an der Spalte. Spiele, die auf einem übertragenen
          Rating rechneten, bleiben draußen: eine Zahl, die teils auf einem eingefrorenen Rating
          beruht, misst nicht das Modell.
        </p>
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Zeitraum</th>
              <th scope="col">Spiele</th>
              <th scope="col">Treffsicherheit</th>
              <th scope="col">Brier</th>
              <th scope="col">Log-Loss</th>
            </tr>
          </thead>
          <tbody>
            {halves.map((h) => (
              <tr key={h.id}>
                <th scope="row" className="left" style={{ fontWeight: 400 }}>{h.label}</th>
                <td>{h.rows.length}</td>
                <td>{percent(h.accuracy)}</td>
                <td>{number(h.brier, 3)}</td>
                <td>{number(h.logLoss, 3)}</td>
              </tr>
            ))}
            {halves.length === 2 ? (
              <tr>
                <th scope="row" className="left">Unterschied</th>
                <td />
                <td>{pp(halves[1].accuracy - halves[0].accuracy)}</td>
                {/* Signed differences go through format.js, like every other
                    signed number here — it is the one path that prints a real
                    „−" rather than a hyphen (§ZAHLENFORMAT). */}
                <td>{signed(halves[1].brier - halves[0].brier, 3)}</td>
                <td>{signed(halves[1].logLoss - halves[0].logLoss, 3)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  §4.2 — the biggest surprises of the first half.
// ---------------------------------------------------------------------------

function UeberraschungenHinrunde({ scored, nameOf, boundary }) {
  const top = scored.slice().sort((a, b) => b.surprisal - a.surprisal).slice(0, 5);
  if (!top.length) return null;
  return (
    <Card
      title="Größte Überraschungen der Hinrunde"
      caption={`Die Spieltage 1–${boundary}, sortiert danach, wie unwahrscheinlich der Ausgang vorher war.`}
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Gemessen als Surprisal: der negative Logarithmus (Basis 2) der Wahrscheinlichkeit, die
          das Modell der tatsächlich eingetretenen Tendenz vor dem Spiel gab. Ein Wert von 2 bit
          heißt, das Modell hielt diesen Ausgang für etwa einen von vier. Die Kennzahl bewertet
          die Tendenz, nicht das genaue Ergebnis.
        </p>
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Sp</th>
              <th scope="col" className="left">Partie</th>
              <th scope="col">Ergebnis</th>
              <th scope="col" className="left">vorher erwartet</th>
              <th scope="col">Surprisal</th>
            </tr>
          </thead>
          <tbody>
            {top.map((s) => {
              const best = Object.entries(s.prediction).sort((a, b) => b[1] - a[1])[0];
              return (
                <tr key={s.fixture.id}>
                  <td>{s.fixture.matchday}.</td>
                  <th scope="row" className="left" style={{ fontWeight: 400 }}>
                    {nameOf(s.fixture.homeClubId)} – {nameOf(s.fixture.awayClubId)}
                  </th>
                  <td>{s.fixture.gh}:{s.fixture.ga}</td>
                  <td className="left">{TENDENCY_LABEL[best[0]]} {percent(best[1])}</td>
                  <td>{number(s.surprisal, 1)} bit</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  §4.3 — the two anchors side by side.
// ---------------------------------------------------------------------------

/**
 * Point 0 against point `boundary`, per club and per target.
 *
 * The caption is DESCRIPTIVE and follows the DATA SOURCE (`anchorSource`): on
 * the live-rating curve it is the §0 v5 wording verbatim; on the frozen curve —
 * which every archive season has and nothing else — that wording would name
 * rating updates the curve does not contain. Either way it says THAT the
 * forecast moved, never which share of the movement belongs to what.
 */
function AnkerVergleich({ source, leagueConfig, nameOf, boundary }) {
  const points = source?.points ?? [];
  const start = points.find((p) => p.matchday === 0);
  const half = points.find((p) => p.matchday === boundary);
  if (!start || !half) return null;

  const targets = Object.entries(leagueConfig.targets ?? {});
  const rows = [];
  for (const [id, t] of targets) {
    const a = start.probabilities?.[id];
    const b = half.probabilities?.[id];
    if (!a || !b) continue;
    for (const clubId of Object.keys(b)) {
      rows.push({ targetId: id, label: t.label, clubId, start: a[clubId] ?? 0, half: b[clubId] ?? 0 });
    }
  }
  // The movers, not the alphabet: eight rows of „0,0 % → 0,0 %" would bury the
  // three that actually changed.
  const movers = rows
    .map((r) => ({ ...r, delta: r.half - r.start }))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 8);
  if (!movers.length) return null;

  return (
    <Card
      title="Prognose: Saisonstart gegen nach der Hinrunde"
      caption={source.note}
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Zwei Punkte derselben Kurve: die Prognose vor dem 1. Spieltag und die nach dem{" "}
          {boundary}. Spieltag. Gezeigt sind die acht Klub-Ziel-Paare mit der größten Verschiebung.
          Die Gegenüberstellung ist beschreibend — sie sagt, dass sich etwas verändert hat.
          {source.live
            ? " Welcher Anteil davon auf Ergebnisse und welcher auf veränderte Ratings entfällt,"
              + " sagt sie nicht; diese Zerlegung gibt die Rechnung nicht her."
            : " Die Ratings sind über die ganze Saison eingefroren, die Verschiebung stammt also"
              + " aus den Ergebnissen — das ist eine Eigenschaft dieser Kurve, keine Messung"
              + " daran, wie viel Ratings sonst bewirkt hätten."}
        </p>
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Klub</th>
              <th scope="col" className="left">Ziel</th>
              <th scope="col">Saisonstart</th>
              <th scope="col">nach dem {boundary}.</th>
              <th scope="col">Veränderung</th>
            </tr>
          </thead>
          <tbody>
            {movers.map((r) => (
              <tr key={`${r.clubId}|${r.targetId}`}>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                <td className="left">{r.label}</td>
                <td>{percent(r.start)}</td>
                <td>{percent(r.half)}</td>
                {/* No sign colour here. A rise of thirty points on ABSTIEG is not
                    good news, and a green plus would say it is — sign colour is
                    only for quantities where more is objectively better
                    (§FARBEN_UNTERTITEL §2.2). */}
                <td>{pp(r.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  §5 — the league-wide half-season development.
// ---------------------------------------------------------------------------

function EntwicklungJeHalbserie({ scored, leagueConfig, nameOf }) {
  const byClub = performanceByHalf(scored, leagueConfig);
  const rows = [...byClub.values()]
    .filter((r) => r.hin && r.rueck)
    .sort((a, b) => b.entwicklung - a.entwicklung);
  if (!rows.length) return null;

  return (
    <Card
      title="Über die Halbserien, je Klub"
      caption={HALBSERIE_ERWARTUNG_NOTE}
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Je Halbserie: tatsächliche Punkte minus erwartete Punkte aus der Prognose vor jedem
          Spiel, geteilt durch die Spiele dieser Halbserie. „Entwicklung“ ist die Differenz der
          beiden Werte. Sie misst die Veränderung gegenüber der jeweils aktuellen Erwartung —
          ein Klub kann in der Rückrunde mehr Punkte holen und hier trotzdem fallen, wenn die
          Erwartung stärker gestiegen ist als die Ausbeute.
        </p>
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Klub</th>
              <th scope="col">Hinrunde</th>
              <th scope="col">Rückrunde</th>
              <th scope="col">Entwicklung</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clubId}>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                <td style={{ color: perfColor(r.hin.perMatch) }}>{signed(r.hin.perMatch, 2)}</td>
                <td style={{ color: perfColor(r.rueck.perMatch) }}>{signed(r.rueck.perMatch, 2)}</td>
                <td style={{ color: perfColor(r.entwicklung) }}>{signed(r.entwicklung, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
