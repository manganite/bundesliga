import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import Chart from "../components/Chart.jsx";
import { currentTable, scoredMatches } from "../lib/season.js";
import { performanceVsExpectation } from "../../../../packages/engine/src/metrics.mjs";
import { percent, number, signed, weekdayDate } from "../lib/format.js";
import { remainingFixtures } from "../lib/data.js";

export default function Teams({ ctx }) {
  const { season, outlook, timeline, leagueConfig, nameOf, prematch, params, league } = ctx;

  const table = useMemo(() => currentTable(season, leagueConfig), [season, leagueConfig]);
  const [clubId, setClubId] = useState(() => table[0]?.clubId ?? season.clubs[0]?.clubId);

  const scored = useMemo(
    () => scoredMatches(season, prematch, params, league),
    [season, prematch, params, league],
  );

  const perf = useMemo(() => {
    const rules = { pointsForWin: leagueConfig.pointsForWin, pointsForDraw: leagueConfig.pointsForDraw };
    const mine = scored.filter((s) => s.fixture.homeClubId === clubId || s.fixture.awayClubId === clubId);
    if (!mine.length) return null;
    const rows = mine.map((s) => {
      const atHome = s.fixture.homeClubId === clubId;
      const gf = atHome ? s.fixture.gh : s.fixture.ga;
      const ga = atHome ? s.fixture.ga : s.fixture.gh;
      const points = gf > ga ? rules.pointsForWin : gf === ga ? rules.pointsForDraw : 0;
      return {
        points,
        pWin: atHome ? s.prediction.homeWin : s.prediction.awayWin,
        pDraw: s.prediction.draw,
      };
    });
    // Normalised by this club's OWN matches played — clubs do not all have the
    // same number during a matchday or after a postponement (§7).
    return performanceVsExpectation(rows, rules);
  }, [scored, clubId, leagueConfig]);

  const provenance = useMemo(() => {
    const mine = scored.filter((s) => s.fixture.homeClubId === clubId || s.fixture.awayClubId === clubId);
    const backfilled = mine.filter((s) => s.provenance === "backfilled").length;
    return { total: mine.length, backfilled };
  }, [scored, clubId]);

  const remaining = remainingFixtures(season.fixtures)
    .filter((f) => f.homeClubId === clubId || f.awayClubId === clubId);

  const positions = outlook?.positionDistribution?.[clubId] ?? null;

  const timelineSeries = useMemo(() => {
    if (!timeline?.points?.length) return null;
    const targetId = leagueConfig.targets.meister ? "meister" : Object.keys(leagueConfig.targets)[0];
    return timeline.points.map((p) => ({
      matchday: p.matchday,
      value: p.probabilities?.[targetId]?.[clubId] ?? 0,
    }));
  }, [timeline, clubId, leagueConfig]);

  return (
    <>
      <h2>Teams</h2>
      <p className="page-intro">Ein Klub im Detail: Aussichten, Restprogramm und Leistung gegenüber der Erwartung.</p>

      <div className="controls">
        <label htmlFor="club">Klub</label>
        <select id="club" value={clubId} onChange={(e) => setClubId(e.target.value)}>
          {table.map((r) => <option key={r.clubId} value={r.clubId}>{nameOf(r.clubId)}</option>)}
        </select>
      </div>

      <div className="stack">
        <Card
          title="Wo die Saison endet"
          when={Boolean(positions)}
          caption="Verteilung der Endplatzierung über alle simulierten Saisons."
        >
          {positions ? <PositionBars positions={positions} clubName={nameOf(clubId)} /> : null}
        </Card>

        <Card
          title="Leistung gegenüber der Erwartung"
          when={Boolean(perf)}
          caption={
            "Tatsächliche Punkte minus erwartete Punkte aus der Vorhersage vor jedem Spiel, geteilt durch die "
            + "eigenen absolvierten Spiele."
            + (provenance.backfilled === provenance.total && provenance.total > 0
              ? " Diese Werte beruhen vollständig auf nachträglich rekonstruierten Ratings — sie sind eine rückblickende Modellrechnung, nicht das, was die App damals gesagt hätte."
              : provenance.backfilled > 0
                ? ` ${provenance.backfilled} von ${provenance.total} Spielen beruhen auf nachträglich rekonstruierten Ratings.`
                : "")
          }
        >
          {perf ? (
            <div className="table-scroll"><table className="data">
              <tbody>
                <tr><th scope="row" className="left">Punkte tatsächlich</th><td>{number(perf.actual, 0)}</td></tr>
                <tr><th scope="row" className="left">Punkte erwartet</th><td>{number(perf.expected, 1)}</td></tr>
                <tr>
                  <th scope="row" className="left">Differenz je Spiel</th>
                  <td style={{ color: perf.perMatch > 0 ? "var(--good)" : perf.perMatch < 0 ? "var(--bad)" : undefined }}>
                    {signed(perf.perMatch, 2)}
                  </td>
                </tr>
                <tr><th scope="row" className="left">Spiele</th><td>{perf.played}</td></tr>
              </tbody>
            </table></div>
          ) : null}
        </Card>

        <Card
          title="Titelchance im Saisonverlauf"
          when={Boolean(timelineSeries)}
          caption={timeline?.label?.label ?? undefined}
        >
          {timelineSeries ? (
            <LineChart
              series={timelineSeries}
              clubName={nameOf(clubId)}
              label={timeline.label?.label ?? "Eingefrorene Saisonstart-Stärke"}
            />
          ) : null}
        </Card>

        <Card title="Restprogramm" when={remaining.length > 0}>
          <div className="table-scroll"><table className="data">
            <tbody>
              {remaining.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="left" style={{ fontWeight: 400 }}>
                    {f.homeClubId === clubId ? `gegen ${nameOf(f.awayClubId)}` : `bei ${nameOf(f.homeClubId)}`}
                  </th>
                  <td>{f.homeClubId === clubId ? "Heim" : "Auswärts"}</td>
                  <td style={{ color: "var(--text-muted)" }}>{weekdayDate(f.kickoff)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        {remaining.length === 0 && !positions ? <Empty>Für diesen Klub liegt nichts vor.</Empty> : null}
      </div>
    </>
  );
}

function PositionBars({ positions, clubName }) {
  const n = positions.length;
  const w = 720;
  const h = 200;
  const pad = { l: 34, r: 8, t: 8, b: 26 };
  const bw = (w - pad.l - pad.r) / n;
  const max = Math.max(...positions, 0.01);

  return (
    <Chart
      title={`Endplatzierung von ${clubName}`}
      ariaLabel={`Balkendiagramm: Wahrscheinlichkeit für jeden Tabellenplatz von 1 bis ${n} für ${clubName}.`}
      width={w}
      height={h}
      table={{
        columns: ["Platz", "Wahrscheinlichkeit"],
        rows: positions.map((p, i) => [`Platz ${i + 1}`, percent(p)]),
      }}
    >
      {positions.map((p, i) => {
        const barH = (p / max) * (h - pad.t - pad.b);
        return (
          <rect
            key={i}
            x={pad.l + i * bw + 1}
            y={h - pad.b - barH}
            width={Math.max(1, bw - 2)}
            height={barH}
            fill="var(--accent)"
            opacity="0.8"
            rx="2"
          />
        );
      })}
      <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} className="grid-line" />
      {positions.map((_, i) => (
        (i === 0 || (i + 1) % 3 === 0) ? (
          <text key={`t${i}`} x={pad.l + i * bw + bw / 2} y={h - 8} textAnchor="middle" className="axis-label">
            {i + 1}
          </text>
        ) : null
      ))}
    </Chart>
  );
}

function LineChart({ series, clubName, label }) {
  const w = 720;
  const h = 240;
  const pad = { l: 42, r: 12, t: 12, b: 30 };
  const xs = series.map((p) => p.matchday);
  const maxX = Math.max(...xs, 1);
  const x = (md) => pad.l + (md / maxX) * (w - pad.l - pad.r);
  const y = (v) => h - pad.b - v * (h - pad.t - pad.b);
  const d = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.matchday).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  return (
    <Chart
      title={`Titelchance von ${clubName} im Saisonverlauf`}
      ariaLabel={
        `Liniendiagramm der Titelwahrscheinlichkeit von ${clubName} über die Spieltage, `
        + `von ${percent(series[0]?.value)} vor dem 1. Spieltag auf ${percent(series[series.length - 1]?.value)}.`
      }
      width={w}
      height={h}
      caption={`${label}. Die Kurve enthält keine Rating-Aktualisierungen — sie zeigt, was allein die Ergebnisse bewirkt haben.`}
      table={{
        columns: ["Spieltag", "Wahrscheinlichkeit"],
        rows: series.map((p) => [p.matchday === 0 ? "vor dem 1." : `${p.matchday}.`, percent(p.value)]),
      }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} y1={y(v)} x2={w - pad.r} y2={y(v)} className="grid-line" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">{Math.round(v * 100)} %</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      <text x={w - pad.r} y={h - 8} textAnchor="end" className="axis-label">Spieltag</text>
    </Chart>
  );
}
