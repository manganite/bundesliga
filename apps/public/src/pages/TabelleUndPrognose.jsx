import { useMemo, useState } from "react";
import { Card, Empty, ExpertToggle } from "../components/ui.jsx";
import Chart from "../components/Chart.jsx";
import DirekteDuelle from "../components/DirekteDuelle.jsx";
import { currentTable, orderWithinSharedRanks, scheduleStrength, duels, rulesFrom, targetList } from "../lib/season.js";
import { zoneOfRank, zoneColor, ZONE_TOKEN } from "../lib/zones.js";
import Relegation from "../components/Relegation.jsx";
import { percent, number, integer, signedInt, rating } from "../lib/format.js";
import { remainingFixtures } from "../lib/data.js";
import { carriedRatingNote } from "../../../../packages/engine/src/dataState.mjs";
import { effectiveParams } from "../../../../packages/engine/src/model.mjs";

const HEAT_STEPS = ["--heat-0", "--heat-1", "--heat-2", "--heat-3", "--heat-4", "--heat-5"];

function heatColour(p) {
  if (p <= 0) return `var(${HEAT_STEPS[0]})`;
  // Perceptual steps: most cells of an 18×18 placement matrix are tiny, so a
  // linear scale would render the whole grid as one flat colour.
  const idx = p >= 0.5 ? 5 : p >= 0.25 ? 4 : p >= 0.1 ? 3 : p >= 0.03 ? 2 : 1;
  return `var(${HEAT_STEPS[idx]})`;
}

export default function TabelleUndPrognose({ ctx }) {
  const { season, outlook, leagueConfig, nameOf, carried = [], league, leagueLabel, playoff, params } = ctx;
  const carriedByClub = new Map(carried.map((c) => [c.clubId, c]));
  const [expert, setExpert] = useState(false);

  const ranked = useMemo(() => currentTable(season, leagueConfig), [season, leagueConfig]);
  // Presentation order only, and only inside a block the table itself declares
  // indistinguishable. Before the first matchday that is the whole table.
  const table = useMemo(
    () => orderWithinSharedRanks(ranked, outlook?.points),
    [ranked, outlook],
  );
  const reordered = useMemo(
    () => table.some((r, i) => r.clubId !== ranked[i].clubId),
    [table, ranked],
  );
  const rules = rulesFrom(leagueConfig);
  const remaining = remainingFixtures(season.fixtures);
  // Zones present in this league's targets, in config order — for the stripe
  // and the legend under the projected table (§FARBEN_UNTERTITEL §2.3).
  const zoneTargets = targetList(leagueConfig);
  const legendZones = zoneTargets.filter((t) => ZONE_TOKEN[t.id]);

  // The ratings the canonical artefact was computed from. Taking them from the
  // artefact rather than deriving them separately is what keeps this figure and
  // the simulation talking about the same strengths.
  const strength = useMemo(
    () => (outlook?.ratings ? scheduleStrength(season, outlook.ratings) : new Map()),
    [season, outlook],
  );

  // Restprogramm-Schwere as PRESENTATION derived from the engine's means:
  //   - the deviation from the league mean opponent rating, so 10–30-point gaps
  //     around ~1670 become legible (+12 = a harder run than average);
  //   - sorted by that severity, not alphabetically;
  //   - and HIDDEN until it carries schedule information. Before the first match
  //     every club still has its full double round, so home and away remaining
  //     counts are equal for all — the only differences left are the arithmetic
  //     of self-exclusion, not the fixture list. The card appears with the first
  //     played match (§7: nothing to say → say nothing).
  // The home advantage in Elo points, league-effective and rounded — it makes
  // the Restprogramm caption concrete and follows the annual refit automatically,
  // never hard-coded (§UEBERSICHT_HEADER_FOOTER §1).
  const homeAdv = params?.params ? Math.round(effectiveParams(params.params, { league }).HOME_ADV) : null;

  const scheduleRows = useMemo(() => {
    const rows = [...strength.entries()].map(([clubId, s]) => ({ clubId, ...s }));
    if (!rows.length) return { rows: [], informative: false };
    const informative = rows.some((r) => r.counts.home !== r.counts.away);
    const leagueMean = rows.reduce((acc, r) => acc + (r.overall ?? 0), 0) / rows.length;
    const withDeviation = rows
      .map((r) => ({ ...r, deviation: r.overall != null ? r.overall - leagueMean : null }))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
    return { rows: withDeviation, informative };
  }, [strength]);

  const duelList = useMemo(
    () => duels(season, outlook, leagueConfig),
    [season, outlook, leagueConfig],
  );

  const anyShared = table.some((r) => r.sharedRank);
  const sharedNote = anyShared
    ? "Klubs auf einem geteilten Tabellenplatz sind nach der Spielordnung nicht getrennt: vor absolviertem "
      + "Hin- und Rückspiel entscheiden nur Tordifferenz und Tore, und was danach gleich bleibt, teilt sich "
      + "den Platz."
      + (reordered
        ? " Innerhalb eines geteilten Platzes stehen die Klubs hier nach erwarteten Punkten — das ist die "
          + "Reihenfolge der Prognose, nicht die der Tabelle."
        : "")
    : "";

  return (
    <>
      <h2>Tabelle &amp; Prognose — {leagueLabel}</h2>
      <p className="page-intro">
        Links der Stand, rechts das simulierte Saisonende. Die Prognose stammt aus derselben
        Simulation wie jede andere Seite.
      </p>

      <div className="stack">
        <Card
          title="Tabelle und erwartetes Saisonende"
          caption={
            carried.length
              ? `Klubs mit ⚑ rechnen mit einem älteren Rating, weil clubelo sie derzeit nicht fortführt. ${sharedNote}`
              : anyShared
              ? sharedNote
              : "Erwartete Punkte und der Bereich, in dem 80 % der simulierten Saisons enden (10.–90. Perzentil)."
          }
        >
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col" className="left">Klub</th>
                  <th scope="col">Sp</th>
                  <th scope="col">Tore</th>
                  <th scope="col">Diff</th>
                  <th scope="col">Pkt</th>
                  {outlook ? <th scope="col">erw. Pkt</th> : null}
                  {outlook ? <th scope="col">10–90 %</th> : null}
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => {
                  const pts = outlook?.points?.[r.clubId];
                  // Zone accent by PROJECTED final position (the display order,
                  // by expected points within a shared rank) — a left stripe, not
                  // a fill; the label and rank stay the primary signal.
                  const zone = zoneOfRank(i + 1, zoneTargets);
                  return (
                    <tr key={r.clubId}>
                      <td
                        className={r.sharedRank ? "shared-rank zone-stripe" : "zone-stripe"}
                        style={zone ? { borderLeftColor: zone.color } : undefined}
                      >
                        {r.rank}{r.sharedRank ? "." : "."}
                        {r.sharedRank ? <span className="visually-hidden"> geteilter Platz</span> : null}
                      </td>
                      <th scope="row" className="left" style={{ fontWeight: 500 }}>
                        {nameOf(r.clubId)}
                        {carriedByClub.has(r.clubId) ? (
                          <span className="carried" title={carriedRatingNote(carriedByClub.get(r.clubId))}>
                            {" "}⚑<span className="visually-hidden">
                              {" "}{carriedRatingNote(carriedByClub.get(r.clubId))}
                            </span>
                          </span>
                        ) : null}
                      </th>
                      <td>{r.played}</td>
                      <td>{r.gf}:{r.ga}</td>
                      <td>{signedInt(r.gd)}</td>
                      <td><strong>{r.pts}</strong></td>
                      {outlook ? <td>{number(pts?.expected, 1)}</td> : null}
                      {outlook ? <td>{pts ? `${integer(pts.p10)}–${integer(pts.p90)}` : "–"}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="zone-legend">
            {legendZones.map((t) => (
              <span key={t.id}>
                <span className="zone-dot" style={{ background: zoneColor(t.id) }} aria-hidden="true" />
                {t.label}
              </span>
            ))}
          </div>
        </Card>

        {outlook ? <Heatmap outlook={outlook} table={table} nameOf={nameOf} /> : null}

        <Relegation playoff={playoff} league={league} nameOf={nameOf} />

        <DirekteDuelle duelList={duelList} leagueConfig={leagueConfig} nameOf={nameOf} />

        <Card
          title="Restprogramm-Schwere"
          when={remaining.length > 0 && scheduleRows.informative}
          caption="Mittleres Gegner-Rating der verbleibenden Spiele, als Abweichung vom Durchschnitt: positiv = schwereres Restprogramm."
          method={
            <p className="caption" style={{ marginTop: "0.5rem" }}>
              Heim und auswärts getrennt, weil dasselbe Gegner-Rating auswärts um rund {homeAdv}{" "}
              Elo-Punkte schwerer wiegt. Der Sortierschlüssel ist das mittlere Gegner-Rating über
              alle verbleibenden Spiele; die Abweichung ist die Differenz zum Ligamittel dieser Werte.
            </p>
          }
        >
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col" className="left">Klub</th>
                  <th scope="col">Abweichung</th>
                  <th scope="col">Heim</th>
                  <th scope="col">Auswärts</th>
                  <th scope="col">Spiele</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.rows.map((r) => (
                  <tr key={r.clubId}>
                    <th scope="row" className="left" style={{ fontWeight: 400 }}>{nameOf(r.clubId)}</th>
                    <td>{signedInt(r.deviation == null ? null : Math.round(r.deviation))}</td>
                    <td>{rating(r.home)}</td>
                    <td>{rating(r.away)}</td>
                    <td>{r.counts.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {remaining.length === 0 ? (
          <Card title="Restprogramm-Schwere">
            <Empty>
              Die Saison ist gespielt — es steht kein Restprogramm mehr aus.
            </Empty>
          </Card>
        ) : null}
      </div>

      <div className="controls">
        <ExpertToggle expert={expert} onChange={setExpert} />
      </div>
      {expert ? (
        <Card title="Simulationsdetails">
          <table className="data">
            <tbody>
              <tr><th scope="row" className="left">Läufe</th><td>{integer(outlook?.runs)}</td></tr>
              <tr><th scope="row" className="left">Batches für SE(Δ)</th><td>{integer(outlook?.batches)}</td></tr>
              <tr><th scope="row" className="left">Engine-Version</th><td>{outlook?.engineVersion}</td></tr>
              <tr><th scope="row" className="left">Simulationsprotokoll</th><td>{outlook?.simulationProtocolVersion}</td></tr>
              <tr><th scope="row" className="left">Punkte je Sieg</th><td>{rules.pointsForWin}</td></tr>
              <tr>
                <th scope="row" className="left">Tiebreak-Reihenfolge</th>
                <td className="left">{(rules.criteria ?? []).join(" → ")}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}

/** The 18×18 placement heatmap. */
function Heatmap({ outlook, table, nameOf }) {
  const clubs = table.map((r) => r.clubId);
  const n = clubs.length;
  const cell = 26;
  const labelW = 132;
  const headerH = 26;
  const width = labelW + n * cell + 8;
  const height = headerH + n * cell + 8;

  const rows = clubs.map((clubId) => [
    nameOf(clubId),
    ...(outlook.positionDistribution[clubId] ?? []).map((p) => percent(p, 1)),
  ]);

  return (
    <Card title="Platzierungs-Heatmap">
      <div className="table-scroll">
        <Chart
          title="Platzierungswahrscheinlichkeiten je Klub"
          ariaLabel={
            `Matrix mit ${n} Klubs und ${n} Plätzen. Je dunkler eine Zelle, desto wahrscheinlicher `
            + "beendet der Klub die Saison auf diesem Platz. Die vollständigen Zahlen stehen in der Tabelle darunter."
          }
          width={width}
          height={height}
          caption="Jede Zeile ist ein Klub, jede Spalte ein Tabellenplatz. Die Zeilen summieren sich auf 100 %."
          table={{
            columns: ["Klub", ...Array.from({ length: n }, (_, i) => `Platz ${i + 1}`)],
            rows,
          }}
        >
          {clubs.map((clubId, r) => (
            <text
              key={`l-${clubId}`}
              x={labelW - 6}
              y={headerH + r * cell + cell * 0.68}
              textAnchor="end"
              className="axis-label"
            >
              {nameOf(clubId).length > 18 ? `${nameOf(clubId).slice(0, 17)}…` : nameOf(clubId)}
            </text>
          ))}
          {Array.from({ length: n }, (_, c) => (
            <text
              key={`h-${c}`}
              x={labelW + c * cell + cell / 2}
              y={headerH - 8}
              textAnchor="middle"
              className="axis-label"
            >
              {c + 1}
            </text>
          ))}
          {clubs.map((clubId, r) => (
            (outlook.positionDistribution[clubId] ?? []).map((p, c) => (
              <rect
                key={`${clubId}-${c}`}
                x={labelW + c * cell}
                y={headerH + r * cell}
                width={cell - 1.5}
                height={cell - 1.5}
                rx="2"
                fill={heatColour(p)}
              />
            ))
          ))}
        </Chart>
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--heat-1)" }} /> unter 3 %</span>
        <span><i style={{ background: "var(--heat-2)" }} /> 3–10 %</span>
        <span><i style={{ background: "var(--heat-3)" }} /> 10–25 %</span>
        <span><i style={{ background: "var(--heat-4)" }} /> 25–50 %</span>
        <span><i style={{ background: "var(--heat-5)" }} /> über 50 %</span>
      </div>
    </Card>
  );
}
