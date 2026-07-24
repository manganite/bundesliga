import { useMemo, useState } from "react";
import { Card, Empty, ExpertToggle } from "../components/ui.jsx";
import Chart from "../components/Chart.jsx";
import { currentTable, scoredMatches, scoredMatchesFrozen, ratingAgeEntries, rulesFrom } from "../lib/season.js";
import { percent, number, integer, signedInt, signed, pp, points } from "../lib/format.js";
import { outcomeColor, perfColor } from "../lib/colors.js";
import { tendencyOf } from "../../../../packages/engine/src/model.mjs";
import { playedFixtures } from "../lib/data.js";
import {
  qualityByProvenance, ratingFreshness, placementVsExpectation,
  PROVENANCE_ORDER, PROVENANCE_LABEL,
} from "../../../../packages/engine/src/modelQuality.mjs";
import {
  accuracy, brierScore, logLoss, calibration, calibrationSentence, performanceVsExpectation,
  RANDOM_BASELINE,
} from "../../../../packages/engine/src/metrics.mjs";

/**
 * Modellgüte (§7, V1.2).
 *
 * Two rules shape every card here.
 *
 * THE THREE PROVENANCES ARE NEVER SILENTLY POOLED. §5.3 wrote that rule for two
 * values; the carried-forward group added by Addendum A falls under it just as
 * much. Where a figure mixes groups, the note from the engine is printed with
 * it — not as decoration, as the condition under which the number may be shown.
 *
 * EMPTY IS THE NORMAL STATE, not a defect. Before the first matchday there is
 * nothing to evaluate, and a page that improvises in that situation is worse
 * than one that says so. Cards hide (§7); the page keeps one honest sentence.
 */
export default function Modellguete({ ctx }) {
  const { season, outlook, timeline, prematch, params, league, leagueLabel, leagueConfig, nameOf } = ctx;
  const [expert, setExpert] = useState(false);

  const played = useMemo(() => playedFixtures(season.fixtures), [season]);
  const scored = useMemo(
    () => scoredMatches(season, prematch, params, league),
    [season, prematch, params, league],
  );
  const quality = useMemo(() => (scored.length ? qualityByProvenance(scored) : null), [scored]);

  if (!played.length) {
    return (
      <>
        <h2>Modellgüte — {leagueLabel}</h2>
        <Empty>
          In dieser Saison ist noch kein Spiel gespielt. Modellgüte misst Vorhersagen an
          Ergebnissen — solange es keine gibt, gibt es hier nichts zu zeigen. Die Seite füllt
          sich ab dem 1. Spieltag von selbst.
        </Empty>
      </>
    );
  }

  return (
    <>
      <h2>Modellgüte — {leagueLabel}</h2>
      <p className="page-intro">
        Wie gut die Vorhersagen dieser Saison waren, gemessen an den Ergebnissen. Jede Zahl
        beruht auf der Prognose <em>vor</em> dem jeweiligen Spiel.
      </p>

      <div className="stack">
        <Kalibrierung scored={scored} quality={quality} expert={expert} />
        <TreffsicherheitUeberZeit scored={scored} season={season} />
        <LiveVsEingefroren
          scored={scored}
          frozen={scoredMatchesFrozen(season, timeline, params, league)}
          timeline={timeline}
        />
        <RatingAktualitaet entries={ratingAgeEntries(season, prematch)} />
        <LeistungVsErwartung ctx={ctx} scored={scored} />
        <PlatzierungVsErwartung season={season} outlook={outlook} leagueConfig={leagueConfig} nameOf={nameOf} />
        <SpielZeugnis scored={scored} nameOf={nameOf} />
      </div>

      <div className="controls">
        <ExpertToggle expert={expert} onChange={setExpert} />
      </div>
      {expert ? <ProvenanceDetail quality={quality} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
//  Kalibrierung — §8: lead with the plain question, bars by default.
// ---------------------------------------------------------------------------

function Kalibrierung({ scored, quality, expert }) {
  const cal = calibration(scored);
  const sentence = calibrationSentence(cal, 0.7);
  // The bucket the sentence is drawn from. §4 marks a bucket unreliable below
  // ten, but ten is a floor, not a guarantee: a class with 17 probabilities can
  // still read „73 % → 94 %" purely on noise. The sentence therefore carries its
  // own sample size, so nobody reads one class as the model's verdict.
  const sentenceBucket = cal.buckets.find((b) => 0.7 >= b.from && 0.7 < b.to);
  if (!cal.buckets.length) return null;

  const width = 520;
  const height = 240;
  const pad = { left: 44, right: 12, top: 12, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (v) => pad.left + v * plotW;
  const y = (v) => pad.top + (1 - v) * plotH;

  return (
    <Card
      title="Kalibrierung — wenn die App 70 % sagt, tritt es dann auch in 70 % der Fälle ein?"
      caption={`Erwarteter Kalibrierungsfehler: ${number(cal.ecePercentagePoints, 1)} Prozentpunkte — der mittlere Abstand zwischen gesagt und eingetreten.`}
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Basiert auf {cal.matches} Spielen ({cal.probabilities} Wahrscheinlichkeiten): je Spiel
          gehen alle drei Ausgänge ein, und die drei sind nicht unabhängig, weil sie sich zu 1
          addieren. Balken mit weniger als 10 Wahrscheinlichkeiten sind blass — sie tragen zu wenig,
          um etwas zu belegen.{quality?.note ? ` ${quality.note}` : ""}
        </p>
      }
    >
      {sentence ? (
        <p className="lead-sentence">
          {sentence}
          {sentenceBucket ? (
            <span className="lead-qualifier">
              {" "}Diese eine Klasse umfasst {sentenceBucket.n} Wahrscheinlichkeiten — genug, um sie zu
              zeigen, zu wenig, um sie für sich zu nehmen. Der Gesamtfehler unten ist die belastbarere Zahl.
            </span>
          ) : null}
        </p>
      ) : null}

      {expert ? (
        <Chart
          title="Kalibrierung als Streudiagramm"
          ariaLabel={
            `Streudiagramm mit ${cal.buckets.length} Punkten. Die Waagerechte ist die gesagte `
            + "Wahrscheinlichkeit, die Senkrechte die tatsächlich eingetretene. Auf der Diagonalen wäre die "
            + "Vorhersage perfekt kalibriert. Die Zahlen stehen in der Tabelle darunter."
          }
          width={width}
          height={height}
          caption="Punkte auf der Diagonalen bedeuten: gesagt und eingetreten stimmen überein."
          table={calTable(cal)}
        >
          <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="grid-line" />
          {cal.buckets.map((b) => (
            <circle
              key={b.from}
              cx={x(b.meanPredicted)}
              cy={y(b.observedFrequency)}
              r={b.reliable ? 5 : 3}
              fill={b.reliable ? "var(--accent)" : "var(--border)"}
            />
          ))}
          <text x={pad.left} y={height - 8} className="axis-label">0 %</text>
          <text x={x(1) - 24} y={height - 8} className="axis-label">100 %</text>
        </Chart>
      ) : (
        <Chart
          title="Kalibrierung als Balken"
          ariaLabel={
            `Balkendiagramm mit ${cal.buckets.length} Klassen. Je Klasse steht der hellere Balken für die `
            + "gesagte Wahrscheinlichkeit und der dunklere für den tatsächlich eingetretenen Anteil. "
            + "Gleich hohe Balken bedeuten eine gut kalibrierte Vorhersage."
          }
          width={width}
          height={height}
          caption="Je Klasse: links gesagt, rechts eingetreten. Gleich hoch heißt gut kalibriert."
          table={calTable(cal)}
        >
          {cal.buckets.map((b, i) => {
            const slot = plotW / cal.buckets.length;
            const bx = pad.left + i * slot;
            const w = slot / 2 - 3;
            return (
              <g key={b.from} opacity={b.reliable ? 1 : 0.4}>
                <rect x={bx + 2} y={y(b.meanPredicted)} width={w} height={y(0) - y(b.meanPredicted)} fill="var(--heat-2)" />
                <rect x={bx + 4 + w} y={y(b.observedFrequency)} width={w} height={y(0) - y(b.observedFrequency)} fill="var(--accent)" />
                <text x={bx + slot / 2} y={height - 8} textAnchor="middle" className="axis-label">
                  {Math.round(b.from * 100)}
                </text>
              </g>
            );
          })}
        </Chart>
      )}
    </Card>
  );
}

const calTable = (cal) => ({
  columns: ["Klasse", "gesagt", "eingetreten", "Anzahl", "belastbar"],
  rows: cal.buckets.map((b) => [
    `${Math.round(b.from * 100)}–${Math.round(b.to * 100)} %`,
    percent(b.meanPredicted, 1),
    percent(b.observedFrequency, 1),
    String(b.n),
    b.reliable ? "ja" : "nein",
  ]),
});

// ---------------------------------------------------------------------------
//  Treffsicherheit über die Zeit — §8: the direction differs per chart.
// ---------------------------------------------------------------------------

function TreffsicherheitUeberZeit({ scored, season }) {
  const byMatchday = useMemo(() => {
    const md = new Map(season.fixtures.map((f) => [f.id, f.matchday]));
    const grouped = new Map();
    for (const s of scored) {
      const m = md.get(s.fixture.id);
      if (!grouped.has(m)) grouped.set(m, []);
      grouped.get(m).push(s);
    }
    const days = [...grouped.keys()].sort((a, b) => a - b);
    const running = [];
    let acc = [];
    for (const d of days) {
      acc = acc.concat(grouped.get(d));
      running.push({
        matchday: d,
        accuracy: accuracy(acc).value,
        logLoss: logLoss(acc).value,
        brier: brierScore(acc).value,
        n: acc.length,
      });
    }
    return running;
  }, [scored, season]);

  if (byMatchday.length < 2) return null;

  const width = 520;
  const height = 220;
  const pad = { left: 44, right: 12, top: 12, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (i / Math.max(1, byMatchday.length - 1)) * plotW;
  const yAcc = (v) => pad.top + (1 - v) * plotH;

  return (
    <Card
      title="Treffsicherheit über die Zeit"
      caption={
        "Laufender Anteil der Spiele, deren wahrscheinlichster Ausgang auch eingetreten ist. "
        + `Höher ist besser; blind geraten wären ${percent(RANDOM_BASELINE.accuracy, 1)}. `
        + "Das Modell lernt während der Saison nichts dazu — die Parameter bleiben fest. "
        + "Eine steigende Kurve heißt also nicht, dass das Modell besser wird, sondern dass die "
        + "Ratings aktueller werden und spätere Spiele berechenbarer sind. Diese beiden Gründe sind "
        + "nicht dasselbe und werden hier nicht zusammengeworfen."
      }
    >
      <Chart
        title="Treffsicherheit je Spieltag, laufend"
        ariaLabel={
          `Liniendiagramm über ${byMatchday.length} Spieltage. Die Linie ist der laufende Anteil `
          + `richtig vorhergesagter Ausgänge; die waagerechte Linie bei ${percent(RANDOM_BASELINE.accuracy, 0)} `
          + "markiert blindes Raten. Die Zahlen stehen in der Tabelle darunter."
        }
        width={width}
        height={height}
        caption="Höher ist besser. Die waagerechte Linie ist der Zufallswert von einem Drittel."
        table={{
          columns: ["Spieltag", "Treffsicherheit", "Log-Loss", "Brier", "Spiele"],
          rows: byMatchday.map((r) => [
            String(r.matchday), percent(r.accuracy, 1), number(r.logLoss, 3), number(r.brier, 3), String(r.n),
          ]),
        }}
      >
        <line
          x1={pad.left} y1={yAcc(RANDOM_BASELINE.accuracy)}
          x2={pad.left + plotW} y2={yAcc(RANDOM_BASELINE.accuracy)}
          className="grid-line" strokeDasharray="4 3"
        />
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          points={byMatchday.map((r, i) => `${x(i)},${yAcc(r.accuracy)}`).join(" ")}
        />
        <text x={pad.left - 6} y={yAcc(RANDOM_BASELINE.accuracy) + 4} textAnchor="end" className="axis-label">33 %</text>
        <text x={pad.left - 6} y={yAcc(1) + 4} textAnchor="end" className="axis-label">100 %</text>
      </Chart>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  Trefferquote live vs eingefroren
// ---------------------------------------------------------------------------

function LiveVsEingefroren({ scored, frozen, timeline }) {
  if (!frozen.length) return null;
  const live = accuracy(scored);
  const froz = accuracy(frozen);
  const liveLoss = logLoss(scored);
  const frozLoss = logLoss(frozen);

  return (
    <Card
      title="Trefferquote live vs eingefroren"
      caption={
        "Dieselben Spiele, einmal mit dem Rating vor dem jeweiligen Spiel und einmal mit der "
        + `eingefrorenen Saisonstart-Stärke${timeline?.frozenEffectiveAt ? ` vom ${timeline.frozenEffectiveAt}` : ""}. `
        + "Das ist eine beschreibende Gegenüberstellung, keine Zerlegung: der Unterschied ist nicht "
        + "der „Effekt der Ratingaktualisierung“, weil sich zwischen beiden Rechnungen mehr "
        + "unterscheidet als nur das Rating. Höher ist besser bei der Treffsicherheit, niedriger beim Log-Loss."
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Grundlage</th>
              <th scope="col">Treffsicherheit</th>
              <th scope="col">Log-Loss</th>
              <th scope="col">Spiele</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="left">Rating vor dem Spiel</th>
              <td>{percent(live.value, 1)}</td>
              <td>{number(liveLoss.value, 3)}</td>
              <td>{live.n}</td>
            </tr>
            <tr>
              <th scope="row" className="left">eingefrorene Saisonstart-Stärke</th>
              <td>{percent(froz.value, 1)}</td>
              <td>{number(frozLoss.value, 3)}</td>
              <td>{froz.n}</td>
            </tr>
            <tr>
              <th scope="row" className="left">Unterschied</th>
              <td>{live.value !== null && froz.value !== null ? pp(live.value - froz.value) : "–"}</td>
              <td>{liveLoss.value !== null && frozLoss.value !== null ? number(liveLoss.value - frozLoss.value, 3) : "–"}</td>
              <td>–</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  Rating-Aktualität (§4 addendum) — renamed from „Rating-Verzögerung".
// ---------------------------------------------------------------------------

function RatingAktualitaet({ entries }) {
  if (!entries.length) return null;
  const f = ratingFreshness(entries);
  const present = PROVENANCE_ORDER.filter((p) => f.byProvenance[p].n > 0);
  if (!present.length) return null;

  return (
    <Card
      title="Rating-Aktualität"
      caption="Wie alt war das Rating, auf dem eine Prognose stand — Tage zwischen dem Stichtag des Ratings und dem Anstoß, je Spiel und Klub."
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Das ist eine Betriebszahl über den Datenstand der Eingaben. Sie sagt nichts darüber, ob
          oder wie stark ein Rating der wahren Stärke nachläuft; diese Messung findet hier nicht
          statt.{f.note ? ` ${f.note}` : ""}
        </p>
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Herkunft des Ratings</th>
              <th scope="col">Median</th>
              <th scope="col">10–90 %</th>
              <th scope="col">max</th>
              <th scope="col">Klub-Spiele</th>
            </tr>
          </thead>
          <tbody>
            {present.map((p) => {
              const s = f.byProvenance[p];
              return (
                <tr key={p}>
                  <th scope="row" className="left">{PROVENANCE_LABEL[p]}</th>
                  <td>{s.median} T</td>
                  <td>{s.p10}–{s.p90} T</td>
                  <td>{s.max} T</td>
                  <td>{s.n}</td>
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
//  Leistung vs Erwartung · Platzierung vs Erwartung
// ---------------------------------------------------------------------------

function LeistungVsErwartung({ ctx, scored }) {
  const { season, leagueConfig, nameOf } = ctx;
  const rules = rulesFrom(leagueConfig);
  const rows = useMemo(() => {
    const byClub = new Map();
    for (const s of scored) {
      const { homeClubId: h, awayClubId: a, gh, ga } = s.fixture;
      const add = (clubId, points, pWin, pDraw) => {
        if (!byClub.has(clubId)) byClub.set(clubId, []);
        byClub.get(clubId).push({ points, pWin, pDraw });
      };
      const hp = gh > ga ? rules.pointsForWin : gh === ga ? rules.pointsForDraw : 0;
      const ap = ga > gh ? rules.pointsForWin : gh === ga ? rules.pointsForDraw : 0;
      add(h, hp, s.prediction.homeWin, s.prediction.draw);
      add(a, ap, s.prediction.awayWin, s.prediction.draw);
    }
    return [...byClub.entries()]
      .map(([clubId, matches]) => ({ clubId, ...performanceVsExpectation(matches, rules) }))
      .sort((x, y) => y.difference - x.difference);
  }, [scored, rules]);

  if (!rows.length) return null;
  return (
    <Card
      title="Leistung vs Erwartung"
      caption={
        "Tatsächliche Punkte minus erwartete Punkte aus der Prognose vor jedem Spiel, geteilt durch "
        + "die Spiele des jeweiligen Klubs. Nicht alle Klubs haben gleich viele gespielt — während "
        + "eines Spieltags und nach Verlegungen stimmt das nie —, deshalb wird je Klub normiert."
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Klub</th>
              <th scope="col">Punkte</th>
              <th scope="col">erwartet</th>
              <th scope="col">Differenz</th>
              <th scope="col">je Spiel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clubId}>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                <td>{r.actual}</td>
                <td>{number(r.expected, 1)}</td>
                <td style={{ color: perfColor(r.difference) }}>{signedInt(Math.round(r.difference))}</td>
                <td style={{ color: perfColor(r.perMatch) }}>{signed(r.perMatch, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlatzierungVsErwartung({ season, outlook, leagueConfig, nameOf }) {
  const rows = useMemo(() => {
    if (!outlook?.positionDistribution) return [];
    const table = currentTable(season, leagueConfig);
    return placementVsExpectation(
      table.map((r) => ({ ...r, positionDistribution: outlook.positionDistribution[r.clubId] })),
    ).sort((a, b) => (a.difference ?? 0) - (b.difference ?? 0));
  }, [season, outlook, leagueConfig]);

  if (!rows.length) return null;
  return (
    <Card
      title="Platzierung vs Erwartung"
      caption={
        "Der heutige Tabellenplatz gegen den Platz, auf dem die Simulation den Klub am Saisonende "
        + "erwartet (Mittelwert über alle Läufe). Ein negativer Wert heißt: der Klub steht "
        + "besser, als die Simulation ihn enden sieht. Das ist kein Widerspruch — die Simulation "
        + "rechnet das Restprogramm mit."
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="left">Klub</th>
              <th scope="col">erwartet</th>
              <th scope="col">Differenz</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clubId}>
                <td className={r.sharedRank ? "shared-rank" : undefined}>{r.rank}.</td>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                <td>{number(r.expectedRank, 1)}</td>
                <td>{signed(r.difference, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  Spiel-Zeugnis — matchday selector plus the season's Top-20 surprises.
// ---------------------------------------------------------------------------

const TOP_SURPRISES = 20;

function SpielZeugnis({ scored, nameOf }) {
  const matchdays = useMemo(
    () => [...new Set(scored.map((s) => s.fixture.matchday))].sort((a, b) => a - b),
    [scored],
  );
  const [selected, setSelected] = useState(() => matchdays[matchdays.length - 1] ?? null);
  if (!matchdays.length) return null;

  const day = scored.filter((s) => s.fixture.matchday === selected)
    .sort((a, b) => b.surprisal - a.surprisal);
  const top = [...scored].sort((a, b) => b.surprisal - a.surprisal).slice(0, TOP_SURPRISES);

  const row = (s) => (
    <tr key={s.fixture.id}>
      <th scope="row" className="left" style={{ fontWeight: 400 }}>
        {nameOf(s.fixture.homeClubId)} – {nameOf(s.fixture.awayClubId)}
      </th>
      <td style={{ color: outcomeColor(tendencyOf(s.fixture.gh, s.fixture.ga)), fontWeight: 600 }}>
        {s.fixture.gh}:{s.fixture.ga}
      </td>
      <td>{percent(s.prediction[s.actual], 1)}</td>
      <td>{number(s.surprisal, 1)}</td>
    </tr>
  );

  return (
    <>
      <Card
        title="Spiel-Zeugnis"
        caption={
          "Je Spiel: wie wahrscheinlich der tatsächliche Ausgang vor dem Anpfiff war, und der "
          + "Überraschungswert in Bit — je unwahrscheinlicher der Ausgang, desto höher. Ein hoher "
          + "Wert ist kein Fehler des Modells: bei einer 20-%-Vorhersage müssen in einem von fünf "
          + "Fällen genau diese 20 % eintreten."
        }
      >
        <div className="controls" style={{ marginBottom: "0.6rem" }}>
          <label>
            Spieltag{" "}
            <select value={selected ?? ""} onChange={(e) => setSelected(Number(e.target.value))}>
              {matchdays.map((m) => <option key={m} value={m}>{m}.</option>)}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col" className="left">Spiel</th>
                <th scope="col">Ergebnis</th>
                <th scope="col">vorher</th>
                <th scope="col">Bit</th>
              </tr>
            </thead>
            <tbody>{day.map(row)}</tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`Die ${Math.min(TOP_SURPRISES, top.length)} größten Überraschungen der Saison`}
        when={top.length > 0}
        caption="Über alle bisher gespielten Spieltage, nach Überraschungswert sortiert."
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col" className="left">Spiel</th>
                <th scope="col">Ergebnis</th>
                <th scope="col">vorher</th>
                <th scope="col">Bit</th>
              </tr>
            </thead>
            <tbody>{top.map(row)}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Expert detail: the figures per provenance, side by side.
// ---------------------------------------------------------------------------

function ProvenanceDetail({ quality }) {
  if (!quality) return null;
  const present = PROVENANCE_ORDER.filter((p) => quality.byProvenance[p].n > 0);
  return (
    <Card
      title="Modellgüte je Herkunft des Ratings"
      caption={
        "Getrennt statt gepoolt. Nur die vor Anstoß geholten Ratings sind das, was die App damals "
        + "gezeigt hätte; nachträglich rekonstruierte und übertragene Werte gelten ausschließlich "
        + "rückblickend und werden hier nie in eine gemeinsame Zahl gerechnet, ohne dass es dabeisteht."
      }
    >
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Herkunft</th>
              <th scope="col">Spiele</th>
              <th scope="col">Treffsicherheit</th>
              <th scope="col">Brier</th>
              <th scope="col">Log-Loss</th>
              <th scope="col">ECE</th>
            </tr>
          </thead>
          <tbody>
            {present.map((p) => {
              const g = quality.byProvenance[p];
              return (
                <tr key={p}>
                  <th scope="row" className="left">{PROVENANCE_LABEL[p]}</th>
                  <td>{g.n}</td>
                  <td>{percent(g.accuracy.value, 1)}</td>
                  <td>{number(g.brier.value, 3)}</td>
                  <td>{number(g.logLoss.value, 3)}</td>
                  <td>{points(g.calibration.ece)}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="left"><strong>zusammen</strong></th>
              <td>{quality.pooled.n}</td>
              <td>{percent(quality.pooled.accuracy.value, 1)}</td>
              <td>{number(quality.pooled.brier.value, 3)}</td>
              <td>{number(quality.pooled.logLoss.value, 3)}</td>
              <td>{points(quality.pooled.calibration.ece)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="caption">
        Zufallswerte zum Vergleich: Treffsicherheit {percent(RANDOM_BASELINE.accuracy, 1)},
        Brier {number(RANDOM_BASELINE.brier, 3)}, Log-Loss {number(RANDOM_BASELINE.logLoss, 3)}.
      </p>
      {quality.note ? <p className="caption"><strong>{quality.note}</strong></p> : null}
    </Card>
  );
}
